"""Listing search filters, shared by the website, Android app, saved-search alerts
and the WhatsApp bot, so search logic lives in exactly one place."""
from django.db.models import Q
from django.db.models.expressions import RawSQL

from core.models import Location

TRUTHY = ("1", "true", "yes", "on", 1, True)


def _val(p, key):
    v = p.get(key)
    return None if v in (None, "") else v


def _num(p, key, cast=float):
    v = _val(p, key)
    try:
        return cast(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def descendant_ids(root_id):
    ids, frontier = {root_id}, [root_id]
    while frontier:
        children = list(Location.objects.filter(parent_id__in=frontier).values_list("id", flat=True))
        frontier = [c for c in children if c not in ids]
        ids.update(frontier)
    return list(ids)


def apply_listing_filters(qs, p):
    """qs is a Listing queryset (caller restricts to status='published')."""
    loc = _num(p, "location", int)
    if loc:
        qs = qs.filter(location_id__in=descendant_ids(loc))
    if (v := _num(p, "min_rent")) is not None:
        qs = qs.filter(rent__gte=v)
    if (v := _num(p, "max_rent")) is not None:
        qs = qs.filter(rent__lte=v)
    if (v := _num(p, "bedrooms", int)) is not None:
        qs = qs.filter(bedrooms__gte=v)
    if (v := _num(p, "bathrooms", int)) is not None:
        qs = qs.filter(bathrooms__gte=v)
    if v := _val(p, "type"):
        qs = qs.filter(property_type=v)
    if v := _val(p, "furnishing"):
        qs = qs.filter(furnishing=v)
    if v := _val(p, "available_by"):
        qs = qs.filter(Q(available_from__lte=v) | Q(available_from__isnull=True))
    for slug in [s.strip() for s in str(_val(p, "amenities") or "").split(",") if s.strip()]:
        qs = qs.filter(listing_amenities__amenity__slug=slug)  # chained = must have ALL
    if _val(p, "verified") in TRUTHY:
        qs = qs.filter(landlord__verification_status="verified")
    if v := _val(p, "q"):
        qs = qs.filter(Q(title__icontains=v) | Q(description__icontains=v))

    lat, lng, radius = _num(p, "lat"), _num(p, "lng"), _num(p, "radius_km")
    geo = lat is not None and lng is not None
    if geo:
        dist = RawSQL(
            "(6371 * ACOS(LEAST(1, COS(RADIANS(%s)) * COS(RADIANS(listings.latitude)) * "
            "COS(RADIANS(listings.longitude) - RADIANS(%s)) + SIN(RADIANS(%s)) * SIN(RADIANS(listings.latitude)))))",
            (lat, lng, lat),
        )
        qs = qs.filter(latitude__isnull=False, longitude__isnull=False).annotate(distance_km=dist)
        if radius:
            qs = qs.filter(distance_km__lte=radius)

    sort = _val(p, "sort") or "newest"
    order = {
        "price_asc": ["rent", "-id"],
        "price_desc": ["-rent", "-id"],
        "nearest": ["distance_km", "-id"] if geo else ["-published_at", "-id"],
    }.get(sort, ["-published_at", "-id"])
    return qs.order_by(*order)
