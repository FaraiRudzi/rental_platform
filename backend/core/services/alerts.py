from django.utils import timezone

from core.models import Listing, SavedSearch
from core.search import apply_listing_filters
from core.services.notifications import notify


def match_saved_searches(listing):
    """Called when a listing is published: alert tenants whose saved search matches it."""
    for saved in SavedSearch.objects.filter(is_active=True).exclude(alert_channel="none").select_related("user"):
        base = Listing.objects.filter(pk=listing.pk, status="published")
        try:
            hit = apply_listing_filters(base, saved.filters or {}).exists()
        except Exception:
            continue
        if hit:
            notify(saved.user, "saved_search_match", "New home matching your search",
                   f"{listing.title} ({listing.currency} {listing.rent}/month)", "listing", listing.id,
                   template="saved_search_match", params=[saved.user.full_name, listing.title, str(listing.rent)])
            saved.last_alerted_at = timezone.now()
            saved.save(update_fields=["last_alerted_at"])
