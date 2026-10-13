"""Application -> acceptance -> confirmation -> placement lifecycle.

Every state change happens here (not in views) so the website, the Android app and the
WhatsApp bot all follow exactly the same rules.
"""
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from core.exceptions import WorkflowError
from core.models import Application, Invoice, LedgerEntry, Listing, Placement
from core.services import commission
from core.services.notifications import notify, resolve_alerts

R = settings.RENTAL


def fmt_money(amount, currency):
    return f"{currency} {commission.money(amount)}"


def fmt_dt(dt):
    return timezone.localtime(dt).strftime("%d %b %H:%M")


# ------------------------------------------------------------ applications


def apply_for_listing(tenant, listing, message="", household_size=None, desired_move_in=None):
    if tenant.role != "tenant":
        raise WorkflowError("Only tenants can apply for a house.")
    if listing.status != "published":
        raise WorkflowError("This listing is no longer available.")
    with transaction.atomic():
        existing = Application.objects.select_for_update().filter(listing=listing, tenant=tenant).first()
        if existing and existing.status not in ("withdrawn", "declined", "expired"):
            raise WorkflowError("You have already applied for this listing.")
        fields = dict(message=message or "", household_size=household_size, desired_move_in=desired_move_in,
                      status="submitted", accepted_at=None, respond_by=None, decided_at=None, decline_reason=None)
        if existing:
            for k, v in fields.items():
                setattr(existing, k, v)
            existing.save()
            app = existing
        else:
            app = Application.objects.create(listing=listing, tenant=tenant, landlord_id=listing.landlord_id, **fields)

    landlord = listing.landlord
    notify(landlord, "application_received", "New application",
           f"{tenant.full_name} applied for {listing.title}.", "application", app.id,
           template="application_received", params=[landlord.full_name, tenant.full_name, listing.title],
           quick_replies=[f"acc:{app.id}", f"rej:{app.id}"])
    return app


def withdraw_application(tenant, app):
    if app.tenant_id != tenant.id:
        raise WorkflowError("This is not your application.")
    if app.status not in ("submitted", "under_review"):
        raise WorkflowError("This application can no longer be withdrawn.")
    app.status = "withdrawn"
    app.save(update_fields=["status", "updated_at"])
    resolve_alerts("application", app.id, ["application_received"])
    return app


def accept_application(landlord, app_id):
    with transaction.atomic():
        app = Application.objects.select_for_update().get(pk=app_id)
        if app.landlord_id != landlord.id:
            raise WorkflowError("This is not your listing.")
        if app.status not in ("submitted", "under_review"):
            raise WorkflowError("This application can no longer be accepted.")
        listing = Listing.objects.select_for_update().get(pk=app.listing_id)
        if listing.status != "published":
            raise WorkflowError("This listing already has an accepted tenant or is not open.")
        now = timezone.now()
        app.status, app.accepted_at, app.decided_at = "accepted", now, now
        app.respond_by = now + timedelta(hours=R["CONFIRM_HOURS"])
        app.save()
        listing.status = "reserved"
        listing.save(update_fields=["status", "updated_at"])

    resolve_alerts("application", app.id, ["application_received"])
    est = commission.estimate_for_listing(listing)
    fee_txt = f" Your fee share would be {fmt_money(est['tenant_fee'], est['currency'])}." if est else ""
    notify(app.tenant, "application_accepted", "Application accepted",
           f"Your application for {listing.title} was accepted. Confirm by {fmt_dt(app.respond_by)}.{fee_txt}",
           "application", app.id,
           template="application_accepted",
           params=[app.tenant.full_name, listing.title, fmt_dt(app.respond_by)],
           quick_replies=[f"conf:{app.id}", f"decl:{app.id}"])
    return app


def reject_application(landlord, app_id, reason=""):
    app = Application.objects.select_related("listing", "tenant").get(pk=app_id)
    if app.landlord_id != landlord.id:
        raise WorkflowError("This is not your listing.")
    if app.status not in ("submitted", "under_review"):
        raise WorkflowError("This application can no longer be rejected.")
    app.status, app.decided_at, app.decline_reason = "rejected", timezone.now(), reason[:255] or None
    app.save()
    resolve_alerts("application", app.id, ["application_received"])
    notify(app.tenant, "application_rejected", "Application update",
           f"Your application for {app.listing.title} was not successful.", "application", app.id)
    return app


def decline_acceptance(tenant, app_id, reason=""):
    with transaction.atomic():
        app = Application.objects.select_for_update().get(pk=app_id)
        if app.tenant_id != tenant.id:
            raise WorkflowError("This is not your application.")
        if app.status != "accepted":
            raise WorkflowError("There is nothing to decline.")
        app.status, app.decline_reason = "declined", reason[:255] or None
        app.save()
        Listing.objects.filter(pk=app.listing_id, status="reserved").update(status="published")
    resolve_alerts("application", app.id, ["application_accepted"])
    notify(app.landlord, "acceptance_declined", "Tenant declined",
           f"The tenant declined {app.listing.title}. The listing is open again.", "application", app.id)
    return app


def expire_application(app):
    with transaction.atomic():
        app = Application.objects.select_for_update().get(pk=app.pk)
        if app.status != "accepted":
            return
        app.status = "expired"
        app.save()
        Listing.objects.filter(pk=app.listing_id, status="reserved").update(status="published")
    resolve_alerts("application", app.id, ["application_accepted", "application_received"])
    notify(app.tenant, "acceptance_expired", "Offer expired",
           "You did not confirm in time, so the offer has lapsed.", "application", app.id)
    notify(app.landlord, "acceptance_expired", "Offer expired",
           "The tenant did not confirm in time. Your listing is open again.", "application", app.id)


# -------------------------------------------------------------- placements


def confirm_acceptance(tenant, app_id):
    """The tenant says yes. The fee is calculated, snapshotted and invoiced here."""
    with transaction.atomic():
        app = Application.objects.select_for_update().get(pk=app_id)
        if app.tenant_id != tenant.id:
            raise WorkflowError("This is not your application.")
        if app.status != "accepted":
            raise WorkflowError("This application is not waiting for confirmation.")
        if app.respond_by and app.respond_by < timezone.now():
            raise WorkflowError("The confirmation deadline has passed.")

        listing = app.listing
        rule = commission.resolve_rule(listing)
        if rule is None:
            raise WorkflowError("No commission rule is configured for this listing. Contact support.")
        calc = commission.calculate(rule, listing.rent)
        now = timezone.now()

        placement = Placement.objects.create(
            application=app, listing=listing, landlord=app.landlord, tenant=app.tenant, rule=rule,
            rule_snapshot=commission.snapshot(rule, listing.rent, calc), currency=listing.currency,
            first_rent=commission.money(listing.rent), total_fee=calc["total"],
            landlord_fee=calc["landlord"], tenant_fee=calc["tenant"], status="awaiting_payment",
            confirmed_at=now, payment_deadline=now + timedelta(hours=R["PAYMENT_DEADLINE_HOURS"]),
            move_in_date=app.desired_move_in or listing.available_from,
        )
        due = placement.payment_deadline.date()
        for role, payer, amount in (("landlord", app.landlord, calc["landlord"]), ("tenant", app.tenant, calc["tenant"])):
            inv = Invoice.objects.create(
                placement=placement, payer=payer, payer_role=role, amount=amount, currency=listing.currency,
                invoice_no=f"RP-{now:%Y%m%d}-{placement.id:06d}-{role[0].upper()}", due_date=due,
                status="paid" if amount == 0 else "unpaid", paid_at=now if amount == 0 else None,
            )
            if amount > 0:
                LedgerEntry.objects.create(
                    placement=placement, invoice=inv, party=role, entry_type="charge", direction="debit",
                    amount=amount, currency=listing.currency, note="Placement fee share")
        app.status = "confirmed"
        app.save()

    resolve_alerts("application", app.id, ["application_accepted"])
    for user, amount in ((app.tenant, calc["tenant"]), (app.landlord, calc["landlord"])):
        notify(user, "placement_confirmed", "Placement confirmed",
               f"{listing.title} is confirmed. Your fee share is {fmt_money(amount, listing.currency)}, "
               f"due by {fmt_dt(placement.payment_deadline)}.",
               "placement", placement.id, template="placement_confirmed",
               params=[user.full_name, listing.title, fmt_money(amount, listing.currency), fmt_dt(placement.payment_deadline)])

    with transaction.atomic():
        placement = Placement.objects.select_for_update().get(pk=placement.pk)
        refresh_payment_status(placement)
        if R["RELEASE_CONTACTS_WHEN"] == "confirmed":
            release_contacts(placement)
    return placement


def release_contacts(placement):
    if placement.contacts_released_at:
        return
    placement.contacts_released_at = timezone.now()
    placement.save(update_fields=["contacts_released_at", "updated_at"])
    for user in (placement.tenant, placement.landlord):
        notify(user, "contacts_released", "Contact details available",
               f"Contact details for {placement.listing.title} are now available in the app.",
               "placement", placement.id, template="contacts_released",
               params=[user.full_name, placement.listing.title])


def refresh_payment_status(placement):
    """Call inside a transaction after any invoice changes."""
    if placement.status in ("cancelled", "active", "disputed"):
        return
    invoices = list(placement.invoices.all())
    settled = [i for i in invoices if i.status in ("paid", "waived")]
    if invoices and len(settled) == len(invoices):
        if placement.status != "paid":
            placement.status = "paid"
            placement.save(update_fields=["status", "updated_at"])
            Listing.objects.filter(pk=placement.listing_id, status="reserved").update(status="let")
            release_contacts(placement)
    else:
        new_status = "part_paid" if settled else "awaiting_payment"
        if placement.status != new_status:
            placement.status = new_status
            placement.save(update_fields=["status", "updated_at"])


def cancel_placement(placement, reason, by=None):
    """Void unpaid invoices, mark paid ones refunded (the money itself must be returned
    through your payment provider by an admin), and reopen the listing."""
    with transaction.atomic():
        placement = Placement.objects.select_for_update().get(pk=placement.pk)
        if placement.status in ("cancelled", "active"):
            return placement
        for inv in placement.invoices.select_for_update():
            if inv.status == "paid" and inv.amount > 0:
                inv.status = "refunded"
                inv.save(update_fields=["status"])
                inv.payments.filter(status="succeeded").update(status="refunded")
                LedgerEntry.objects.create(
                    placement=placement, invoice=inv, party=inv.payer_role, entry_type="refund",
                    direction="credit", amount=inv.amount, currency=inv.currency, note=reason[:255], created_by=by)
            elif inv.status == "unpaid":
                inv.status = "void"
                inv.save(update_fields=["status"])
        placement.status, placement.cancelled_at, placement.cancel_reason = "cancelled", timezone.now(), reason[:255]
        placement.save()
        Listing.objects.filter(pk=placement.listing_id, status__in=["reserved", "let"]).update(status="published")
        Application.objects.filter(pk=placement.application_id).update(status="expired")

    resolve_alerts("placement", placement.id, ["placement_confirmed", "contacts_released"])
    for user in (placement.tenant, placement.landlord):
        notify(user, "placement_cancelled", "Placement cancelled",
               f"The placement for {placement.listing.title} was cancelled: {reason}. "
               "Any amount you paid will be refunded.", "placement", placement.id)
    return placement
