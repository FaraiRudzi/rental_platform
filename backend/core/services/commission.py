"""Commission rule lookup and fee maths. Nothing about fees is hard-coded: it all
comes from the commission_rules table, which admins edit."""
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Case, IntegerField, Q, When
from django.utils import timezone

from core.models import CommissionRule

TWO = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(value).quantize(TWO, rounding=ROUND_HALF_UP)


def resolve_rule(listing, on_date=None):
    """Best matching active rule: suburb beats city beats global, then priority, then newest."""
    on_date = on_date or timezone.localdate()
    loc = listing.location
    suburb_id = loc.id if loc.type == "suburb" else None
    city_id = loc.id if loc.type == "city" else loc.parent_id

    scope_q = Q(scope_type="global")
    if suburb_id:
        scope_q |= Q(scope_type="suburb", scope_id=suburb_id)
    if city_id:
        scope_q |= Q(scope_type="city", scope_id=city_id)

    return (
        CommissionRule.objects.filter(is_active=True, currency=listing.currency, effective_from__lte=on_date)
        .filter(Q(effective_to__isnull=True) | Q(effective_to__gte=on_date))
        .filter(Q(rent_min__isnull=True) | Q(rent_min__lte=listing.rent))
        .filter(Q(rent_max__isnull=True) | Q(rent_max__gte=listing.rent))
        .filter(scope_q)
        .annotate(
            specificity=Case(
                When(scope_type="suburb", then=3),
                When(scope_type="city", then=2),
                default=1,
                output_field=IntegerField(),
            )
        )
        .order_by("-specificity", "-priority", "-id")
        .first()
    )


def calculate(rule, rent) -> dict:
    """total = rent x % (or flat), clamped to min/max. Tenant share is rounded and the
    landlord share is the remainder, so the two always add up exactly to the total."""
    rent = Decimal(rent)
    if rule.fee_type == "percentage":
        total = rent * Decimal(rule.value) / Decimal(100)
    else:
        total = Decimal(rule.value)
    total = money(total)
    if rule.min_fee is not None:
        total = max(total, money(rule.min_fee))
    if rule.max_fee is not None:
        total = min(total, money(rule.max_fee))
    tenant = money(total * Decimal(rule.tenant_share_pct) / Decimal(100))
    landlord = total - tenant
    return {"total": total, "tenant": tenant, "landlord": landlord}


def snapshot(rule, rent, calc) -> dict:
    """Exact terms copied onto the placement so later rule edits never change it."""
    return {
        "rule_id": rule.id,
        "name": rule.name,
        "fee_type": rule.fee_type,
        "value": str(rule.value),
        "min_fee": str(rule.min_fee) if rule.min_fee is not None else None,
        "max_fee": str(rule.max_fee) if rule.max_fee is not None else None,
        "landlord_share_pct": str(rule.landlord_share_pct),
        "tenant_share_pct": str(rule.tenant_share_pct),
        "scope_type": rule.scope_type,
        "currency": rule.currency,
        "first_rent": str(money(rent)),
        "total_fee": str(calc["total"]),
        "landlord_fee": str(calc["landlord"]),
        "tenant_fee": str(calc["tenant"]),
        "calculated_at": timezone.now().isoformat(),
    }


def estimate_for_listing(listing):
    """Fee preview shown to users before they apply. Returns None if no rule applies."""
    rule = resolve_rule(listing)
    if not rule:
        return None
    calc = calculate(rule, listing.rent)
    return {
        "currency": listing.currency,
        "first_rent": str(money(listing.rent)),
        "total_fee": str(calc["total"]),
        "tenant_fee": str(calc["tenant"]),
        "landlord_fee": str(calc["landlord"]),
    }
