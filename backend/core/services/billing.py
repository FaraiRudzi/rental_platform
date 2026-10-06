import secrets
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from core.exceptions import WorkflowError
from core.models import AuditLog, FeeAdjustment, Invoice, LedgerEntry, Payment, Placement
from core.services.notifications import notify
from core.services.workflow import fmt_money, refresh_payment_status


def initiate_payment(invoice, user, method):
    """Creates a pending payment and returns what the client needs to complete it.

    Replace the marked block with your gateway SDK call (mobile money / card). The
    gateway must then call POST /api/webhooks/payments/ with the same reference."""
    if invoice.payer_id != user.id:
        raise WorkflowError("This is not your invoice.")
    if invoice.status != "unpaid":
        raise WorkflowError("This invoice is not payable.")
    if invoice.placement.status == "cancelled":
        raise WorkflowError("This placement was cancelled.")
    reference = f"{invoice.invoice_no}-{secrets.token_hex(4)}"
    payment = Payment.objects.create(
        invoice=invoice, amount=invoice.amount, currency=invoice.currency, method=method,
        gateway="manual", gateway_reference=reference, status="pending")
    # --- gateway integration point -------------------------------------------------
    instructions = {
        "reference": reference,
        "amount": str(invoice.amount),
        "currency": invoice.currency,
        "redirect_url": None,  # set to the gateway checkout URL when integrated
        "message": "Pay using this reference. Your payment is confirmed automatically once the provider notifies us.",
    }
    # -------------------------------------------------------------------------------
    return payment, instructions


def record_payment_success(payment, payload=None):
    """Idempotent: safe to call again if the gateway repeats the webhook."""
    with transaction.atomic():
        payment = Payment.objects.select_for_update().get(pk=payment.pk)
        if payment.status == "succeeded":
            return payment
        invoice = Invoice.objects.select_for_update().get(pk=payment.invoice_id)
        now = timezone.now()
        payment.status, payment.paid_at = "succeeded", now
        if payload is not None:
            payment.gateway_payload = payload
        if invoice.status != "unpaid":
            # Money arrived for an invoice that was already settled or voided: flag for refund.
            payment.gateway_payload = {**(payment.gateway_payload or {}), "needs_refund": True}
            payment.save()
            AuditLog.objects.create(action="payment.needs_refund", entity_type="payment", entity_id=payment.id)
            return payment
        payment.save()
        invoice.status, invoice.paid_at = "paid", now
        invoice.save(update_fields=["status", "paid_at"])
        LedgerEntry.objects.create(
            placement=invoice.placement, invoice=invoice, payment=payment, party=invoice.payer_role,
            entry_type="payment", direction="credit", amount=payment.amount, currency=payment.currency,
            note=f"Payment {payment.gateway_reference}")
        placement = Placement.objects.select_for_update().get(pk=invoice.placement_id)
        refresh_payment_status(placement)
    notify(invoice.payer, "payment_received", "Payment received",
           f"We received {fmt_money(payment.amount, payment.currency)} for {invoice.invoice_no}.",
           "invoice", invoice.id)
    return payment


def record_payment_failure(payment, payload=None):
    if payment.status == "pending":
        payment.status = "failed"
        if payload is not None:
            payment.gateway_payload = payload
        payment.save(update_fields=["status", "gateway_payload"])
    return payment


def admin_record_payment(invoice, admin, method="cash", note=""):
    """For cash / bank transfers confirmed by an admin."""
    if invoice.status != "unpaid":
        raise WorkflowError("This invoice is not payable.")
    payment = Payment.objects.create(
        invoice=invoice, amount=invoice.amount, currency=invoice.currency, method=method,
        gateway="admin", gateway_reference=f"ADMIN-{invoice.invoice_no}-{secrets.token_hex(3)}", status="pending")
    AuditLog.objects.create(user=admin, action="payment.manual", entity_type="invoice", entity_id=invoice.id,
                            new_values={"method": method, "note": note})
    return record_payment_success(payment, {"recorded_by": admin.id, "note": note})


def waive_invoice(invoice, admin, reason):
    with transaction.atomic():
        invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
        if invoice.status != "unpaid":
            raise WorkflowError("Only unpaid invoices can be waived.")
        invoice.status = "waived"
        invoice.save(update_fields=["status"])
        FeeAdjustment.objects.create(
            placement=invoice.placement, party=invoice.payer_role, type="waiver",
            amount=invoice.amount, reason=reason[:255], approved_by=admin)
        LedgerEntry.objects.create(
            placement=invoice.placement, invoice=invoice, party=invoice.payer_role, entry_type="waiver",
            direction="credit", amount=invoice.amount, currency=invoice.currency, note=reason[:255], created_by=admin)
        placement = Placement.objects.select_for_update().get(pk=invoice.placement_id)
        refresh_payment_status(placement)
    return invoice
