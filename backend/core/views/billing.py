from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from core.exceptions import WorkflowError
from core.models import Invoice, Placement
from core.permissions import IsTenantOrLandlord
from core.serializers import InvoiceSerializer, PlacementSerializer
from core.services import billing


def _placements(user):
    return (Placement.objects.filter(Q(tenant=user) | Q(landlord=user))
            .select_related("listing__property", "tenant", "landlord").prefetch_related("invoices"))


@api_view(["GET"])
@permission_classes([IsTenantOrLandlord])
def placements(request):
    return Response(PlacementSerializer(_placements(request.user).order_by("-id")[:100],
                                        many=True, context={"request": request}).data)


@api_view(["GET"])
@permission_classes([IsTenantOrLandlord])
def placement_detail(request, pk):
    p = get_object_or_404(_placements(request.user), pk=pk)
    return Response(PlacementSerializer(p, context={"request": request}).data)


@api_view(["GET"])
@permission_classes([IsTenantOrLandlord])
def invoices(request):
    return Response(InvoiceSerializer(Invoice.objects.filter(payer=request.user).order_by("-id")[:100], many=True).data)


@api_view(["POST"])
@permission_classes([IsTenantOrLandlord])
def pay_invoice(request, pk):
    invoice = get_object_or_404(Invoice.objects.select_related("placement"), pk=pk, payer=request.user)
    method = request.data.get("method", "mobile_money")
    if method not in ("mobile_money", "card", "bank_transfer"):
        raise WorkflowError("Unsupported payment method.")
    _, instructions = billing.initiate_payment(invoice, request.user, method)
    return Response(instructions, status=201)
