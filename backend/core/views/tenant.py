from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from core.exceptions import WorkflowError
from core.models import Application, Enquiry, Favourite, Listing, Notification, SavedSearch, Viewing
from core.permissions import IsTenant
from core.serializers import (ApplicationSerializer, EnquirySerializer, ListingPublicSerializer,
                              NotificationSerializer, PlacementSerializer, SavedSearchSerializer,
                              ViewingSerializer)
from core.services import workflow
from core.services.notifications import notify
from core.views.public import listing_queryset


def _published(pk):
    return get_object_or_404(Listing.objects.select_related("landlord", "location"), pk=pk, status="published")


@api_view(["POST"])
@permission_classes([IsTenant])
def apply_for_listing(request, pk):
    listing = _published(pk)
    d = request.data
    size = d.get("household_size")
    app = workflow.apply_for_listing(
        request.user, listing, message=(d.get("message") or "")[:2000],
        household_size=int(size) if str(size or "").isdigit() else None,
        desired_move_in=d.get("desired_move_in") or None)
    return Response(ApplicationSerializer(app).data, status=201)


@api_view(["POST"])
@permission_classes([IsTenant])
def create_enquiry(request, pk):
    listing = _published(pk)
    message = (request.data.get("message") or "").strip()
    if not message:
        raise WorkflowError("Write a message to the landlord.")
    enq = Enquiry.objects.create(listing=listing, tenant=request.user, landlord_id=listing.landlord_id,
                                 message=message[:2000])
    notify(listing.landlord, "enquiry_received", "New enquiry",
           f"{request.user.full_name} asked about {listing.title}.", "enquiry", enq.id)
    return Response(EnquirySerializer(enq).data, status=201)


@api_view(["POST"])
@permission_classes([IsTenant])
def create_viewing(request, pk):
    listing = _published(pk)
    when = parse_datetime(str(request.data.get("proposed_at") or ""))
    if not when or when <= timezone.now():
        raise WorkflowError("Choose a future date and time (ISO format).")
    v = Viewing.objects.create(listing=listing, tenant=request.user, landlord_id=listing.landlord_id,
                               proposed_at=when, note=(request.data.get("note") or "")[:255] or None)
    notify(listing.landlord, "viewing_requested", "Viewing requested",
           f"{request.user.full_name} wants to view {listing.title}.", "viewing", v.id)
    return Response(ViewingSerializer(v).data, status=201)


@api_view(["GET"])
@permission_classes([IsTenant])
def my_applications(request):
    qs = (Application.objects.filter(tenant=request.user)
          .select_related("listing", "tenant", "placement").prefetch_related("tenant__verification_docs").order_by("-id")[:100])
    return Response(ApplicationSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsTenant])
def withdraw_application(request, pk):
    app = get_object_or_404(Application, pk=pk)
    workflow.withdraw_application(request.user, app)
    return Response({"detail": "Application withdrawn."})


@api_view(["POST"])
@permission_classes([IsTenant])
def confirm_acceptance(request, pk):
    placement = workflow.confirm_acceptance(request.user, pk)
    return Response(PlacementSerializer(placement, context={"request": request}).data, status=201)


@api_view(["POST"])
@permission_classes([IsTenant])
def decline_acceptance(request, pk):
    workflow.decline_acceptance(request.user, pk, request.data.get("reason", ""))
    return Response({"detail": "Declined."})


@api_view(["GET"])
@permission_classes([IsTenant])
def my_enquiries(request):
    qs = Enquiry.objects.filter(tenant=request.user).select_related("listing", "tenant").order_by("-id")[:100]
    return Response(EnquirySerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsTenant])
def my_viewings(request):
    qs = Viewing.objects.filter(tenant=request.user).select_related("listing", "tenant").order_by("-id")[:100]
    return Response(ViewingSerializer(qs, many=True).data)


@api_view(["POST", "DELETE"])
@permission_classes([IsTenant])
def favourite(request, pk):
    listing = get_object_or_404(Listing, pk=pk, status="published")
    if request.method == "DELETE":
        Favourite.objects.filter(user=request.user, listing=listing).delete()
        return Response(status=204)
    if not Favourite.objects.filter(user=request.user, listing=listing).exists():
        Favourite.objects.create(user=request.user, listing=listing)
    return Response({"detail": "Saved."}, status=201)


@api_view(["GET"])
@permission_classes([IsTenant])
def my_favourites(request):
    ids = Favourite.objects.filter(user=request.user).values_list("listing_id", flat=True)
    qs = listing_queryset().filter(pk__in=list(ids))
    return Response(ListingPublicSerializer(qs, many=True, context={"request": request}).data)


class SavedSearchViewSet(viewsets.ModelViewSet):
    serializer_class = SavedSearchSerializer
    permission_classes = [IsTenant]

    def get_queryset(self):
        return SavedSearch.objects.filter(user=self.request.user).order_by("-id")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


@api_view(["GET"])
def my_notifications(request):
    """Unread alerts always come first and are never cut off; recent read ones follow."""
    base = Notification.objects.filter(user=request.user, channel="in_app")
    unread_qs = base.filter(read_at__isnull=True)
    items = list(unread_qs.order_by("-created_at")[:100]) + list(base.filter(read_at__isnull=False).order_by("-created_at")[:30])
    return Response({"unread": unread_qs.count(), "results": NotificationSerializer(items, many=True).data})


@api_view(["POST"])
def mark_all_notifications_read(request):
    n = Notification.objects.filter(user=request.user, channel="in_app", read_at__isnull=True) \
        .update(read_at=timezone.now(), status="read")
    return Response({"marked": n})


@api_view(["POST"])
def mark_notification_read(request, pk):
    Notification.objects.filter(pk=pk, user=request.user, channel="in_app", read_at__isnull=True) \
        .update(read_at=timezone.now(), status="read")
    return Response({"detail": "ok"})
