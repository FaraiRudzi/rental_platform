"""Towns and suburbs typed in by landlords. Names are matched ignoring case, so 'avondale' and 'Avondale'
become one place instead of two, and a new place is created only when nothing matches."""
import re

from core.exceptions import WorkflowError
from core.models import Location


def _clean(name, what):
    value = re.sub(r"\s+", " ", (name or "").strip())
    if len(value) < 2:
        raise WorkflowError(f"Enter the {what}.")
    if len(value) > 80:
        raise WorkflowError(f"The {what} is too long (80 characters at most).")
    if not re.search(r"[A-Za-z]", value):
        raise WorkflowError(f"The {what} must contain letters.")
    return value.title() if (value.islower() or value.isupper()) else value


def ensure_location(city_name, suburb_name):
    """Returns the suburb Location (creating the city and suburb if they do not exist yet)."""
    city_name = _clean(city_name, "town or city")
    suburb_name = _clean(suburb_name, "location (suburb or area)")
    city = Location.objects.filter(type="city", name__iexact=city_name).first()
    if not city:
        city = Location.objects.create(parent=None, name=city_name, type="city", is_active=True)
    suburb = Location.objects.filter(type="suburb", parent=city, name__iexact=suburb_name).first()
    if not suburb:
        suburb = Location.objects.create(parent=city, name=suburb_name, type="suburb", is_active=True)
    return suburb
