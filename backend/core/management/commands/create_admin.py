from django.core.management.base import BaseCommand, CommandError

from core.models import User
from core.services.otp import normalize_phone


class Command(BaseCommand):
    help = "Create an admin: manage.py create_admin +263771234567 'Full Name' --password '...' [--email you@example.com]"

    def add_arguments(self, parser):
        parser.add_argument("phone")
        parser.add_argument("full_name")
        parser.add_argument("--password", required=True)
        parser.add_argument("--email", default="")

    def handle(self, *args, **o):
        phone = normalize_phone(o["phone"])
        email = (o["email"] or "").strip().lower() or None
        if len(o["password"]) < 8:
            raise CommandError("Use a password of at least 8 characters.")
        if User.objects.filter(phone=phone).exists():
            raise CommandError("A user with that phone number already exists.")
        if email and User.objects.filter(email__iexact=email).exists():
            raise CommandError("A user with that email address already exists.")
        User.objects.create_superuser(phone=phone, password=o["password"], full_name=o["full_name"], email=email)
        self.stdout.write(self.style.SUCCESS(f"Admin created. Log in with {email or phone} and the password you chose."))
