from django.core.management.base import BaseCommand, CommandError

from core.models import User
from core.services.otp import normalize_phone


class Command(BaseCommand):
    help = "Create an admin account: manage.py create_admin +263771234567 'Full Name' --password '...'"

    def add_arguments(self, parser):
        parser.add_argument("phone")
        parser.add_argument("full_name")
        parser.add_argument("--password", required=True)

    def handle(self, *args, **o):
        phone = normalize_phone(o["phone"])
        if User.objects.filter(phone=phone).exists():
            raise CommandError("A user with that phone number already exists.")
        User.objects.create_superuser(phone=phone, password=o["password"], full_name=o["full_name"])
        self.stdout.write(self.style.SUCCESS(f"Admin created: {phone}"))
