from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Application, Placement
from core.services import workflow


class Command(BaseCommand):
    help = "Expire unanswered acceptances, cancel unpaid placements, activate paid ones on move-in day."

    def handle(self, *args, **opts):
        now = timezone.now()
        expired = cancelled = activated = 0

        for app in Application.objects.filter(status="accepted", respond_by__lt=now).select_related("tenant", "landlord", "listing"):
            workflow.expire_application(app)
            expired += 1

        for pl in Placement.objects.filter(status__in=["awaiting_payment", "part_paid"], payment_deadline__lt=now):
            workflow.cancel_placement(pl, "Payment deadline passed")
            cancelled += 1

        activated = Placement.objects.filter(status="paid", move_in_date__lte=timezone.localdate()).update(status="active")

        self.stdout.write(f"expired={expired} cancelled={cancelled} activated={activated}")
