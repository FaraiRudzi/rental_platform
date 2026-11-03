"""Money handling. Payments are CASH for now: people hand cash over and an admin records it here.
Online payments (a gateway calling our webhook) are still supported but are switched off in Admin > Settings."""
import secrets
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from core.exceptions import WorkflowError
from core.models import AuditLog, FeeAdjustment, Invoice, LedgerEntry, Payment, Placement
from core.services import commission, site_settings
from core.services.notifications import notify, resolve_alerts
from core.services.workflow import fmt_money, paid_total, refresh_payment_status

money = commission.money


def _amount(value, what="amount"):
    try:
        return money(Decimal(str(value).strip()))
    except (InvalidOperation, ValueError):
        raise WorkflowError(f"Enter the {what} as a number, for example 8.00.")


def balance_of(invoice):
    return money(invoice.amount) - paid_total(invoice)


# ------------------------------------------------------------------ online payments (switched off by default)

def initiate_payment(invoice, user, method):
    """Online payment. Only available when the admin has switched it on in Settings."""
    if not site_settings.get_all().get("online_payments_enabled"):
        raise WorkflowError("Online payment is not available yet. Pay your share in cash and an admin will record it.")
    if invoice.payer_id != user.id:
        raise WorkflowError("This is not your invoice.")
    if invoice.status != "unpaid":
        raise WorkflowError("This invoice is not payable.")
    if invoice.placement.status == "cancelled":
        raise WorkflowError("This placement was cancelled.")
    balance = balance_of(invoice)
    if balance <= 0:
        raise WorkflowError("There is nothing left to pay on this invoice.")
    reference = f"{invoice.invoice_no}-{secrets.token_hex(4)}"
    payment = Payment.objects.create(
        invoice=invoice, amount=balance, currency=invoice.currency, method=method,
        gateway="manual", gateway_reference=reference, status="pending")
    # --- gateway integration point -------------------------------------------------
    instructions = {
        "reference": reference, "amount": str(balance), "currency": invoice.currency,
        "redirect_url": None,  # set to the gateway checkout URL when integrated
        "message": "Pay using this reference. Your payment is confirmed automatically once the provider notifies us.",
    }
    # -------------------------------------------------------------------------------
    return payment, instructions


def record_payment_success(payment, payload=None):
    """Gateway confirmed a payment. Idempotent: safe to call again if the gateway repeats the webhook."""
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
        LedgerEntry.objects.create(
            placement=invoice.placement, invoice=invoice, payment=payment, party=invoice.payer_role,
            entry_type="payment", direction="credit", amount=payment.amount, currency=payment.currency,
            note=f"Payment {payment.gateway_reference}")
        if paid_total(invoice) >= money(invoice.amount):
            invoice.status, invoice.paid_at = "paid", now
            invoice.save(update_fields=["status", "paid_at"])
        placement = Placement.objects.select_for_update().get(pk=invoice.placement_id)
        refresh_payment_status(placement)
    notify(invoice.payer, "payment_received", "Payment received",
           f"We received {fmt_money(payment.amount, payment.currency)} for {invoice.invoice_no}.", "invoice", invoice.id)
    return payment


def record_payment_failure(payment, payload=None):
    if payment.status == "pending":
        payment.status = "failed"
        if payload is not None:
            payment.gateway_payload = payload
        payment.save(update_fields=["status", "gateway_payload"])
    return payment


# ------------------------------------------------------------------ cash handled by an admin

def _next_receipt_no(placement):
    count = Payment.objects.filter(invoice__placement_id=placement.id).count() + 1
    return f"RCT-{timezone.localdate():%Y%m%d}-{placement.id:05d}-{count}"


def record_cash_payment(invoice, admin, amount, received_at=None, receipt_no="", note=""):
    """An admin records cash handed over for one invoice. Part payments are allowed; the invoice becomes
    paid when the receipts add up to the amount due. A receipt number is created unless one is supplied."""
    amount = _amount(amount, "amount received")
    if amount <= 0:
        raise WorkflowError("The amount received must be more than zero.")
    now = timezone.now()
    received_at = received_at or now
    if received_at > now + timedelta(minutes=5):
        raise WorkflowError("The date received cannot be in the future.")
    receipt_no = (receipt_no or "").strip()
    if len(receipt_no) > 60:
        raise WorkflowError("The receipt number is too long (60 characters at most).")
    note = (note or "").strip()[:200]

    with transaction.atomic():
        invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
        placement = Placement.objects.select_for_update().get(pk=invoice.placement_id)
        if placement.status == "cancelled":
            raise WorkflowError("This placement was cancelled, so no payment can be recorded against it.")
        if invoice.status != "unpaid":
            raise WorkflowError(f"This share is already {invoice.status}, so there is nothing to collect.")
        received = paid_total(invoice)
        balance = money(invoice.amount) - received
        if amount > balance:
            raise WorkflowError(f"Only {fmt_money(balance, invoice.currency)} is still due. Enter that amount or less.")
        receipt_no = receipt_no or _next_receipt_no(placement)
        if Payment.objects.filter(gateway="cash", gateway_reference=receipt_no).exists():
            raise WorkflowError(f"Receipt number {receipt_no} has already been used. Use a different number.")
        payment = Payment.objects.create(
            invoice=invoice, amount=amount, currency=invoice.currency, method="cash", gateway="cash",
            gateway_reference=receipt_no, status="succeeded", paid_at=received_at,
            gateway_payload={"received_by": admin.id, "received_by_name": admin.full_name, "note": note,
                             "recorded_at": now.isoformat()})
        LedgerEntry.objects.create(
            placement=placement, invoice=invoice, payment=payment, party=invoice.payer_role, entry_type="payment",
            direction="credit", amount=amount, currency=invoice.currency, note=f"Cash receipt {receipt_no}", created_by=admin)
        fully_paid = received + amount >= money(invoice.amount)
        if fully_paid:
            invoice.status, invoice.paid_at = "paid", received_at
            invoice.save(update_fields=["status", "paid_at"])
        refresh_payment_status(placement)  # releases the contact details when both sides have paid
        AuditLog.objects.create(user=admin, action="payment.cash", entity_type="invoice", entity_id=invoice.id,
                                new_values={"amount": str(amount), "receipt": receipt_no, "note": note})
    placement.refresh_from_db()
    balance_after = balance - amount

    cur = invoice.currency
    body = f"We received {fmt_money(amount, cur)} in cash for {invoice.invoice_no} (receipt {receipt_no}). "
    body += "Your fee share is now fully paid." if fully_paid else f"Balance still due: {fmt_money(balance_after, cur)}."
    notify(invoice.payer, "payment_received", "Cash payment recorded", body, "invoice", invoice.id)
    if fully_paid:
        resolve_alerts("placement", placement.id, ["placement_confirmed"], user=invoice.payer)
    return {"payment": payment, "invoice": invoice, "placement": placement, "balance": balance_after,
            "fully_paid": fully_paid, "receipt_no": receipt_no}


def reverse_payment(payment_id, admin, reason):
    """Undo a cash receipt that was recorded by mistake. The ledger is append-only, so a reversing entry is added."""
    reason = (reason or "").strip()
    if len(reason) < 5:
        raise WorkflowError("Explain why this receipt is being reversed (a few words is enough).")
    with transaction.atomic():
        payment = Payment.objects.select_for_update().get(pk=payment_id)
        invoice = Invoice.objects.select_for_update().get(pk=payment.invoice_id)
        placement = Placement.objects.select_for_update().get(pk=invoice.placement_id)
        if payment.method != "cash":
            raise WorkflowError("Only cash receipts can be reversed here.")
        if payment.status != "succeeded":
            raise WorkflowError("This receipt has already been reversed or refunded.")
        if placement.status in ("cancelled", "active") or placement.contacts_released_at:
            raise WorkflowError("The contact details have already been released (or the deal is closed), so this receipt "
                                "can no longer be reversed. If the deal is off, use Cancel placement instead.")
        payment.status = "failed"
        payment.gateway_payload = {**(payment.gateway_payload or {}), "reversed": True, "reversed_by": admin.id,
                                   "reversed_by_name": admin.full_name, "reversal_reason": reason[:200],
                                   "reversed_at": timezone.now().isoformat()}
        payment.save(update_fields=["status", "gateway_payload"])
        LedgerEntry.objects.create(
            placement=placement, invoice=invoice, payment=payment, party=invoice.payer_role, entry_type="adjustment",
            direction="debit", amount=payment.amount, currency=payment.currency,
            note=f"Reversal of receipt {payment.gateway_reference}: {reason}"[:255], created_by=admin)
        if invoice.status == "paid":
            invoice.status, invoice.paid_at = "unpaid", None
            invoice.save(update_fields=["status", "paid_at"])
        refresh_payment_status(placement)
        AuditLog.objects.create(user=admin, action="payment.reverse", entity_type="payment", entity_id=payment.id,
                                new_values={"receipt": payment.gateway_reference, "reason": reason})
    notify(invoice.payer, "payment_reversed", "A receipt was reversed",
           f"Receipt {payment.gateway_reference} for {fmt_money(payment.amount, payment.currency)} was reversed: {reason}",
           "invoice", invoice.id)
    return payment


def adjust_fee(placement, admin, party, new_amount, reason):
    """Change one side's platform fee share (a discount, or a correction) before it has been fully paid.
    The change is written to fee_adjustments, the ledger and the audit log."""
    if party not in ("landlord", "tenant"):
        raise WorkflowError("Choose the landlord or the tenant share.")
    reason = (reason or "").strip()
    if len(reason) < 5:
        raise WorkflowError("Give a reason for the change (a few words). It is kept in the record.")
    new = _amount(new_amount, "new fee")
    if new < 0:
        raise WorkflowError("The fee cannot be negative.")
    with transaction.atomic():
        placement = Placement.objects.select_for_update().get(pk=placement.pk)
        if placement.status not in ("awaiting_payment", "part_paid"):
            raise WorkflowError("The fee can only be changed while the deal is still waiting for payment.")
        invoice = Invoice.objects.select_for_update().get(placement=placement, payer_role=party)
        if invoice.status != "unpaid":
            raise WorkflowError(f"This share is already {invoice.status}, so it cannot be changed.")
        received, old, cur = paid_total(invoice), money(invoice.amount), invoice.currency
        if new == old:
            raise WorkflowError("That is the same amount as now.")
        if new < received:
            raise WorkflowError(f"{fmt_money(received, cur)} has already been received in cash, so the share cannot go "
                                "below that. If a receipt was a mistake, reverse it first.")
        diff = new - old
        invoice.amount = new
        if new == received:  # nothing more to collect
            invoice.status = "paid" if received > 0 else "waived"
            invoice.paid_at = timezone.now() if received > 0 else None
        invoice.save()
        if party == "landlord":
            placement.landlord_fee = new
        else:
            placement.tenant_fee = new
        placement.total_fee = money(placement.landlord_fee) + money(placement.tenant_fee)
        placement.save(update_fields=["landlord_fee", "tenant_fee", "total_fee", "updated_at"])
        FeeAdjustment.objects.create(placement=placement, party=party, type="discount" if diff < 0 else "correction",
                                     amount=abs(diff), reason=reason[:255], approved_by=admin)
        LedgerEntry.objects.create(
            placement=placement, invoice=invoice, party=party, entry_type="adjustment",
            direction="credit" if diff < 0 else "debit", amount=abs(diff), currency=cur,
            note=f"Fee changed from {old} to {new}: {reason}"[:255], created_by=admin)
        refresh_payment_status(placement)
        AuditLog.objects.create(user=admin, action="placement.fee_adjust", entity_type="placement", entity_id=placement.id,
                                new_values={"party": party, "from": str(old), "to": str(new), "reason": reason})
    notify(invoice.payer, "fee_adjusted", "Your fee share was changed",
           f"Your placement fee share is now {fmt_money(new, cur)} (it was {fmt_money(old, cur)}). Reason: {reason}",
           "placement", placement.id)
    return invoice


def waive_invoice(invoice, admin, reason):
    """Forgive whatever is still unpaid on one share. Any cash already received is kept."""
    reason = (reason or "").strip()
    if len(reason) < 5:
        raise WorkflowError("Give a reason for waiving the fee (a few words).")
    with transaction.atomic():
        invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
        if invoice.status != "unpaid":
            raise WorkflowError("Only an unpaid share can be waived.")
        balance = balance_of(invoice)
        if balance <= 0:
            raise WorkflowError("There is nothing left to waive.")
        invoice.status = "waived"
        invoice.save(update_fields=["status"])
        FeeAdjustment.objects.create(placement=invoice.placement, party=invoice.payer_role, type="waiver",
                                     amount=balance, reason=reason[:255], approved_by=admin)
        LedgerEntry.objects.create(
            placement=invoice.placement, invoice=invoice, party=invoice.payer_role, entry_type="waiver",
            direction="credit", amount=balance, currency=invoice.currency, note=reason[:255], created_by=admin)
        placement = Placement.objects.select_for_update().get(pk=invoice.placement_id)
        refresh_payment_status(placement)
        AuditLog.objects.create(user=admin, action="invoice.waive", entity_type="invoice", entity_id=invoice.id,
                                new_values={"amount": str(balance), "reason": reason})
    notify(invoice.payer, "fee_waived", "Part of your fee was waived",
           f"The remaining {fmt_money(balance, invoice.currency)} of your fee share was waived. Reason: {reason}",
           "invoice", invoice.id)
    return invoice
