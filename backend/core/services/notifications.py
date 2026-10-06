"""Notification orchestration.

notify() always writes an in-app row, then (after the DB transaction commits) queues
delivery to push, WhatsApp and, if neither is confirmed in time, an SMS fallback.
"""
from django.db import transaction
from django.utils import timezone

from core.models import Notification


def notify(user, event, title, body, related_type=None, related_id=None, payload=None,
           template=None, params=None, quick_replies=None):
    row = Notification.objects.create(
        user=user, event=event, channel="in_app", related_type=related_type, related_id=related_id,
        title=title, body=body, payload=payload or {}, status="delivered", delivered_at=timezone.now(),
    )
    ext = {"template": template, "params": params or [], "quick_replies": quick_replies or []}

    def _queue():
        from core.tasks import deliver_external
        deliver_external.delay(row.id, ext)

    transaction.on_commit(_queue)
    return row
