import hashlib
import io
import uuid

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from core.exceptions import WorkflowError
from core.models import Application, Enquiry, Listing, ListingImage, User, Viewing
from core.permissions import IsLandlord
from core.serializers import (ApplicationSerializer, EnquirySerializer, LandlordListingReadSerializer,
                              LandlordListingWriteSerializer, ViewingSerializer)
from core.services import workflow
from core.services.notifications import notify, resolve_alerts
from core.views.public import listing_queryset

MAX_IMAGES = 12


def _own_listing(request, pk):
    return get_object_or_404(listing_queryset(), pk=pk, landlord=request.user)


class LandlordListings(APIView):
    permission_classes = [IsLandlord]

    def get(self, request):
        qs = listing_queryset().filter(landlord=request.user).select_related("property").order_by("-id")
        return Response(LandlordListingReadSerializer(qs, many=True, context={"request": request}).data)

    def post(self, request):
        ser = LandlordListingWriteSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        listing = ser.save()
        return Response(LandlordListingReadSerializer(_own_listing(request, listing.id),
                                                      context={"request": request}).data, status=201)


class LandlordListingDetail(APIView):
    permission_classes = [IsLandlord]

    def get(self, request, pk):
        return Response(LandlordListingReadSerializer(_own_listing(request, pk), context={"request": request}).data)

    def patch(self, request, pk):
        listing = _own_listing(request, pk)
        if listing.status not in ("draft", "rejected"):
            raise WorkflowError("Only draft or rejected listings can be edited.")
        ser = LandlordListingWriteSerializer(listing, data=request.data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(LandlordListingReadSerializer(_own_listing(request, pk), context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsLandlord])
def submit_listing(request, pk):
    listing = _own_listing(request, pk)
    if listing.status not in ("draft", "rejected"):
        raise WorkflowError("This listing has already been submitted.")
    if not listing.images.exists():
        raise WorkflowError("Add at least one photo before submitting.")
    listing.status, listing.rejection_reason = "pending_review", None
    listing.save(update_fields=["status", "rejection_reason", "updated_at"])
    for admin_user in User.objects.filter(role="admin", status="active"):
        notify(admin_user, "listing_pending_review", "Listing awaiting review",
               f"{listing.title} by {request.user.full_name}", "listing", listing.id, external=False)
    return Response({"detail": "Submitted for review."})


@api_view(["POST"])
@permission_classes([IsLandlord])
def archive_listing(request, pk):
    listing = _own_listing(request, pk)
    if listing.status in ("reserved", "let"):
        raise WorkflowError("This listing is part of an active placement.")
    listing.status = "archived"
    listing.save(update_fields=["status", "updated_at"])
    return Response({"detail": "Archived."})


def _compress(upload):
    """Resize to max 1600px and re-encode as JPEG (smaller downloads on slow connections)."""
    from PIL import Image

    try:
        img = Image.open(upload)
        img.load()
    except Exception:
        raise WorkflowError("That file is not a valid image.")
    img = img.convert("RGB")
    img.thumbnail((1600, 1600))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=80, optimize=True)
    return buf.getvalue()


@api_view(["POST"])
@permission_classes([IsLandlord])
@parser_classes([MultiPartParser, FormParser])
def upload_images(request, pk):
    listing = _own_listing(request, pk)
    files = request.FILES.getlist("images")
    if not files:
        raise WorkflowError("Attach one or more files in the 'images' field.")
    existing = listing.images.count()
    if existing + len(files) > MAX_IMAGES:
        raise WorkflowError(f"A listing can have at most {MAX_IMAGES} photos.")
    created, warnings = [], []
    for i, f in enumerate(files):
        if f.size > 8 * 1024 * 1024:
            raise WorkflowError("Each photo must be under 8 MB.")
        data = _compress(f)
        digest = hashlib.sha256(data).hexdigest()
        if ListingImage.objects.filter(file_hash=digest).exclude(listing__landlord=request.user).exists():
            warnings.append(f"{f.name}: this photo already appears on another landlord's listing.")
        path = default_storage.save(f"listings/{listing.id}/{uuid.uuid4().hex}.jpg", ContentFile(data))
        img = ListingImage.objects.create(listing=listing, file_path=path, sort_order=existing + i, file_hash=digest)
        created.append(img.id)
    return Response({"uploaded": created, "warnings": warnings}, status=http.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([IsLandlord])
def delete_image(request, pk, image_id):
    listing = _own_listing(request, pk)
    if listing.status not in ("draft", "rejected"):
        raise WorkflowError("Photos can only be changed on draft or rejected listings.")
    img = get_object_or_404(ListingImage, pk=image_id, listing=listing)
    default_storage.delete(img.file_path)
    img.delete()
    return Response(status=204)


# ------------------------------------------------------------ inbox


@api_view(["GET"])
@permission_classes([IsLandlord])
def applications(request):
    qs = Application.objects.filter(landlord=request.user).select_related("listing", "tenant", "placement")
    if s := request.query_params.get("status"):
        qs = qs.filter(status=s)
    return Response(ApplicationSerializer(qs.order_by("-id")[:200], many=True).data)


@api_view(["POST"])
@permission_classes([IsLandlord])
def accept_application(request, pk):
    app = workflow.accept_application(request.user, pk)
    return Response(ApplicationSerializer(app).data)


@api_view(["POST"])
@permission_classes([IsLandlord])
def reject_application(request, pk):
    app = workflow.reject_application(request.user, pk, request.data.get("reason", ""))
    return Response(ApplicationSerializer(app).data)


@api_view(["GET"])
@permission_classes([IsLandlord])
def enquiries(request):
    qs = Enquiry.objects.filter(landlord=request.user).select_related("listing", "tenant").order_by("-id")[:200]
    return Response(EnquirySerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsLandlord])
def reply_enquiry(request, pk):
    enq = get_object_or_404(Enquiry.objects.select_related("tenant", "listing"), pk=pk, landlord=request.user)
    reply = (request.data.get("reply") or "").strip()
    if not reply:
        raise WorkflowError("Write a reply.")
    enq.reply, enq.status = reply[:2000], "replied"
    enq.save(update_fields=["reply", "status"])
    resolve_alerts("enquiry", enq.id, ["enquiry_received"])
    notify(enq.tenant, "enquiry_replied", "The landlord replied", reply[:140], "enquiry", enq.id)
    return Response(EnquirySerializer(enq).data)


@api_view(["GET"])
@permission_classes([IsLandlord])
def viewings(request):
    qs = Viewing.objects.filter(landlord=request.user).select_related("listing", "tenant").order_by("-proposed_at")[:200]
    return Response(ViewingSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsLandlord])
def update_viewing(request, pk):
    v = get_object_or_404(Viewing.objects.select_related("tenant", "listing"), pk=pk, landlord=request.user)
    new_status = request.data.get("status")
    if new_status not in ("confirmed", "cancelled", "completed", "no_show"):
        raise WorkflowError("status must be confirmed, cancelled, completed or no_show.")
    v.status = new_status
    if new_status == "confirmed":
        v.confirmed_at = timezone.now()
    v.save(update_fields=["status", "confirmed_at"])
    resolve_alerts("viewing", v.id, ["viewing_requested"])
    notify(v.tenant, "viewing_updated", "Viewing update",
           f"Your viewing of {v.listing.title} is now {new_status}.", "viewing", v.id)
    return Response(ViewingSerializer(v).data)
