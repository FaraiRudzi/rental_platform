from django.core.management.base import BaseCommand

from core.models import Location


class Command(BaseCommand):
    help = "Add a city and its suburbs: manage.py add_location 'City' --suburbs 'A,B,C' [--parent-id N]"

    def add_arguments(self, parser):
        parser.add_argument("city")
        parser.add_argument("--suburbs", default="")
        parser.add_argument("--parent-id", type=int, default=None)

    def handle(self, *args, **o):
        city, _ = Location.objects.get_or_create(
            name=o["city"], parent_id=o["parent_id"], defaults={"type": "city", "is_active": True})
        for name in [s.strip() for s in o["suburbs"].split(",") if s.strip()]:
            Location.objects.get_or_create(name=name, parent=city, defaults={"type": "suburb", "is_active": True})
        self.stdout.write(self.style.SUCCESS(f"City id {city.id}: {city.name}"))
        for s in Location.objects.filter(parent=city).order_by("name"):
            self.stdout.write(f"  suburb id {s.id}: {s.name}")
