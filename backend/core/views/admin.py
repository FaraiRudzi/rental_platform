import json
from datetime import timedelta

from django.core.files.storage import default_storage
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import Count, Q, Sum
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from core.exceptions import WorkflowError
from core.models import (Application, AuditLog, CommissionRule, CommissionRuleAudit, Invoice, Listing, ListingImage,
                         Notification, Placement, SearchLog, User, VerificationDoc)
from core.permissions import IsAdmin
from core.serializers import (CommissionRuleSerializer, InvoiceSerializer, LandlordListingReadSerializer,
                              PlacementSerializer, UserSerializer)
from core.services import billing, workflow
from core.services.alerts import match_saved_searches
from core.services.notifications import notify
from core.views.public import listing_queryset


def _plain(data):
    return json.loads(json.dumps(data, cls=DjangoJSONEncoder))


class CommissionRuleViewSet(viewsets.ModelViewSet):
    """Admin-controlled fee rules. Changes only affect FUTURE placements."""
    serializer_class = CommissionRuleSerializer
    permission_classes = [IsAdmin]
    queryset = CommissionRule.objects.all().order_by("-is_active", "scope_type", "-id")

    def perform_create(self, serializer):
        rule = serializer.save(created_by=self.request.user)
        CommissionRuleAudit.objects.create(rule=rule, action="create", changed_by=self.request.user,
                                           new_values=_plain(self.get_serializer(rule).data))

    def perform_update(self, serializer):
        old = _plain(self.get_serializer(serializer.instance).data)
        rule = serializer.save()
        CommissionRuleAudit.objects.create(rule=rule, action="update", changed_by=self.request.user,
                                           old_values=old, new_values=_plain(self.get_serializer(rule).data))

    def perform_destroy(self, instance):  # rules are never hard-deleted, only deactivated
        old = _plain(self.get_serializer(instance).data)
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
        CommissionRuleAudit.objects.create(rule=instance, action="deactivate", changed_by=self.request.user,
                                           old_values=old, new_values={"is_active": False})


@api_view(["GET"])
@permission_classes([IsAdmin])
def rule_audit(request, pk):
    rows = CommissionRuleAudit.objects.filter(rule_id=pk).select_related("changed_by").order_by("-id")[:100]
    return Response([{"id": r.id, "action": r.action, "by": r.changed_by.full_name if r.changed_by else None,
                      "old": r.old_values, "new": r.new_values, "at": r.changed_at} for r in rows])


# ------------------------------------------------------------- users


@api_view(["GET"])
@permission_classes([IsAdmin])
def users(request):
    qs = User.objects.all().order_by("-id")
    for key in ("role", "verification_status", "status"):
        if v := request.query_params.get(key):
            qs = qs.filter(**{key: v})
    if q := request.query_params.get("q"):
        qs = qs.filter(Q(full_name__icontains=q) | Q(phone__icontains=q))
    return Response(UserSerializer(qs[:200], many=True).data)


@api_view(["POST"])
@permission_classes([IsAdmin])
def set_user_verification(request, pk):
    user = get_object_or_404(User, pk=pk)
    new = request.data.get("status")
    if new not in ("verified", "rejected", "pending", "unverified"):
        raise WorkflowError("Invalid status.")
    old, user.verification_status = user.verification_status, new
    user.save(update_fields=["verification_status"])
    AuditLog.objects.create(user=request.user, action="user.verification", entity_type="user", entity_id=user.id,
                            old_values={"status": old}, new_values={"status": new})
    notify(user, "verification_updated", "Verification update", f"Your verification status is now: {new}.", "user", user.id)
    return Response(UserSerializer(user).data)


@api_view(["POST"])
@permission_classes([IsAdmin])
def set_user_status(request, pk):
    user = get_object_or_404(User, pk=pk)
    new = request.data.get("status")
    if new not in ("active", "suspended"):
        raise WorkflowError("Status must be active or suspended.")
    if user.id == request.user.id:
        raise WorkflowError("You cannot suspend yourself.")
    user.status = new
    user.save(update_fields=["status"])
    AuditLog.objects.create(user=request.user, action="user.status", entity_type="user", entity_id=user.id,
                            new_values={"status": new})
    return Response(UserSerializer(user).data)


@api_view(["GET"])
@permission_classes([IsAdmin])
def verification_docs(request):
    qs = VerificationDoc.objects.filter(status=request.query_params.get("status", "pending")).select_related("user")
    return Response([{"id": d.id, "user": {"id": d.user_id, "name": d.user.full_name, "role": d.user.role},
                     "doc_type": d.doc_type, "status": d.status, "created_at": d.created_at} for d in qs[:200]])


@api_view(["GET"])
@permission_classes([IsAdmin])
def verification_doc_file(request, pk):
    """Documents are private: only admins can open them, through this view."""
    doc = get_object_or_404(VerificationDoc, pk=pk)
    if not default_storage.exists(doc.file_path):
        raise Http404()
    return FileResponse(default_storage.open(doc.file_path, "rb"))


@api_view(["POST"])
@permission_classes([IsAdmin])
def review_doc(request, pk):
    doc = get_object_or_404(VerificationDoc, pk=pk)
    new = request.data.get("status")
    if new not in ("approved", "rejected"):
        raise WorkflowError("Status must be approved or rejected.")
    doc.status, doc.reviewed_by, doc.reviewed_at = new, request.user, timezone.now()
    doc.review_note = (request.data.get("note") or "")[:255] or None
    doc.save()
    return Response({"detail": "Saved."})


# ---------------------------------------------------------- listings


@api_view(["GET"])
@permission_classes([IsAdmin])
def listings_for_review(request):
    status = request.query_params.get("status", "pending_review")
    qs = listing_queryset().select_related("property").filter(status=status).order_by("id")[:100]
    data = LandlordListingReadSerializer(qs, many=True, context={"request": request}).data
    for row, listing in zip(data, qs):
        hashes = list(ListingImage.objects.filter(listing=listing).values_list("file_hash", flat=True))
        row["duplicate_photo"] = ListingImage.objects.filter(file_hash__in=hashes).exclude(
            listing__landlord=listing.landlord).exists()
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAdmin])
def review_listing(request, pk):
    listing = get_object_or_404(Listing.objects.select_related("landlord", "location"), pk=pk)
    if listing.status != "pending_review":
        raise WorkflowError("This listing is not waiting for review.")
    action = request.data.get("action")
    if action == "approve":
        listing.status, listing.published_at, listing.rejection_reason = "published", timezone.now(), None
        listing.reviewed_by = request.user
        listing.save()
        notify(listing.landlord, "listing_approved", "Listing approved", f"{listing.title} is now live.", "listing", listing.id)
        match_saved_searches(listing)
    elif action == "reject":
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise WorkflowError("Give the landlord a reason.")
        listing.status, listing.rejection_reason, listing.reviewed_by = "rejected", reason[:255], request.user
        listing.save()
        notify(listing.landlord, "listing_rejected", "Listing needs changes", reason, "listing", listing.id)
    else:
        raise WorkflowError("action must be approve or reject.")
    AuditLog.objects.create(user=request.user, action=f"listing.{action}", entity_type="listing", entity_id=listing.id)
    # The listing has been dealt with, so its alert disappears for every admin.
    Notification.objects.filter(event="listing_pending_review", related_type="listing", related_id=listing.id,
                                read_at__isnull=True).update(read_at=timezone.now(), status="read")
    return Response({"detail": f"Listing {action}d."})


@api_view(["GET"])
@permission_classes([IsAdmin])
def alerts(request):
    """Counts for the admin badge. Also creates alerts for any pending listing this admin has not
    been told about yet (listings submitted before this feature existed, or before this admin joined)."""
    pending = Listing.objects.filter(status="pending_review")
    pending_ids = set(pending.values_list("id", flat=True))
    known = set(Notification.objects.filter(user=request.user, event="listing_pending_review",
                                            related_id__in=pending_ids).values_list("related_id", flat=True))
    for listing in pending.filter(id__in=pending_ids - known).select_related("landlord"):
        notify(request.user, "listing_pending_review", "Listing awaiting review",
               f"{listing.title} by {listing.landlord.full_name}", "listing", listing.id, external=False)
    unread = Notification.objects.filter(user=request.user, channel="in_app", event="listing_pending_review",
                                         read_at__isnull=True).count()
    return Response({"listing_review_unread": unread, "listing_review_pending": len(pending_ids)})


@api_view(["POST"])
@permission_classes([IsAdmin])
def mark_listing_alerts_read(request):
    n = Notification.objects.filter(user=request.user, channel="in_app", event="listing_pending_review",
                                    read_at__isnull=True).update(read_at=timezone.now(), status="read")
    return Response({"marked": n})


# ------------------------------------------------ placements and money


@api_view(["GET"])
@permission_classes([IsAdmin])
def placements(request):
    qs = Placement.objects.select_related("listing__property", "tenant", "landlord").prefetch_related("invoices")
    if s := request.query_params.get("status"):
        qs = qs.filter(status=s)
    return Response(PlacementSerializer(qs.order_by("-id")[:200], many=True, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAdmin])
def cancel_placement(request, pk):
    p = get_object_or_404(Placement, pk=pk)
    reason = (request.data.get("reason") or "Cancelled by admin").strip()
    workflow.cancel_placement(p, reason, by=request.user)
    AuditLog.objects.create(user=request.user, action="placement.cancel", entity_type="placement", entity_id=p.id,
                            new_values={"reason": reason})
    return Response({"detail": "Cancelled. Refund any paid amounts through your payment provider."})


@api_view(["POST"])
@permission_classes([IsAdmin])
def record_payment(request, pk):
    inv = get_object_or_404(Invoice, pk=pk)
    billing.admin_record_payment(inv, request.user, request.data.get("method", "cash"), request.data.get("note", ""))
    return Response({"detail": "Payment recorded."})


@api_view(["POST"])
@permission_classes([IsAdmin])
def waive_invoice(request, pk):
    inv = get_object_or_404(Invoice, pk=pk)
    reason = (request.data.get("reason") or "").strip()
    if not reason:
        raise WorkflowError("A reason is required.")
    return Response(InvoiceSerializer(billing.waive_invoice(inv, request.user, reason)).data)


@api_view(["GET"])
@permission_classes([IsAdmin])
def stats(request):
    since = timezone.now() - timedelta(days=30)
    funnel = {
        "published_listings": Listing.objects.filter(status="published").count(),
        "applications": Application.objects.count(),
        "accepted": Application.objects.filter(accepted_at__isnull=False).count(),
        "confirmed_placements": Placement.objects.exclude(status="cancelled").count(),
        "fully_paid": Placement.objects.filter(status__in=["paid", "active"]).count(),
    }
    revenue = list(Invoice.objects.filter(status="paid").values("currency").annotate(total=Sum("amount")))
    zero = SearchLog.objects.filter(result_count=0, created_at__gte=since).order_by("-id")[:50]

    # Possible leakage: landlords who accept many applicants but rarely confirm a placement.
    accepted = {r["landlord_id"]: r["n"] for r in Application.objects.filter(accepted_at__isnull=False)
                .values("landlord_id").annotate(n=Count("id"))}
    placed = {r["landlord_id"]: r["n"] for r in Placement.objects.values("landlord_id").annotate(n=Count("id"))}
    names = dict(User.objects.filter(id__in=accepted.keys()).values_list("id", "full_name"))
    leakage = [{"landlord_id": lid, "name": names.get(lid), "accepted": n, "placements": placed.get(lid, 0)}
               for lid, n in accepted.items() if n >= 3 and placed.get(lid, 0) / n < 0.34]
    return Response({
        "funnel": funnel, "revenue_collected": revenue,
        "users": list(User.objects.values("role").annotate(n=Count("id"))),
        "zero_result_searches": [{"filters": s.filters, "channel": s.channel, "at": s.created_at} for s in zero],
        "possible_leakage": leakage,
    })
