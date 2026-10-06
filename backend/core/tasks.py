from celery import shared_task
from django.conf import settings
from django.core.management import call_command
from django.db.models import Q
from django.utils import timezone

from core.models import DeviceToken, Notification


def _row(base, channel, **extra):
    return Notification.objects.create(
        user=base.user, event=base.event, channel=channel, related_type=base.related_type,
        related_id=base.related_id, title=base.title, body=base.body, payload=base.payload,
        status="queued", attempts=1, **extra,
    )


@shared_task
def deliver_external(notification_id, ext):
    from core.services import fcm, whatsapp
    from core.services.sms import send_sms  # noqa: F401  (imported for fallback task)

    base = Notification.objects.select_related("user").get(pk=notification_id)
    user = base.user

    if fcm.enabled():
        for dt in DeviceToken.objects.filter(user=user):
            row = _row(base, "push")
            try:
                ok = fcm.send(dt.fcm_token, base.title, base.body,
                              {"event": base.event, "related_type": base.related_type, "related_id": base.related_id})
                if not ok:
                    dt.delete()
                row.status, row.sent_at = ("sent" if ok else "failed"), timezone.now()
                if not ok:
                    row.error = "token unregistered"
            except Exception as exc:  # network / auth problems must not break the flow
                row.status, row.error = "failed", str(exc)[:255]
            row.save(update_fields=["status", "sent_at", "error"])

    if user.whatsapp_opt_in and whatsapp.enabled() and ext.get("template"):
        row = _row(base, "whatsapp")
        try:
            row.provider_message_id = whatsapp.send_template(
                user.phone, ext["template"], ext.get("params"), ext.get("quick_replies"))
            row.status, row.sent_at = "sent", timezone.now()
        except Exception as exc:
            row.status, row.error = "failed", str(exc)[:255]
        row.save(update_fields=["status", "sent_at", "error", "provider_message_id"])

    # SMS is the safety net if no push was sent and no WhatsApp delivery is confirmed.
    if not settings.CELERY_TASK_ALWAYS_EAGER:
        sms_fallback.apply_async(args=[notification_id],
                                 countdown=settings.RENTAL["SMS_FALLBACK_MINUTES"] * 60)


@shared_task
def sms_fallback(notification_id):
    from core.services.sms import send_sms

    base = Notification.objects.select_related("user").get(pk=notification_id)
    confirmed = Notification.objects.filter(
        user=base.user, event=base.event, related_type=base.related_type,
        related_id=base.related_id, created_at__gte=base.created_at,
    ).filter(
        Q(channel="push", status__in=["sent", "delivered", "read"])
        | Q(channel="whatsapp", status__in=["delivered", "read"])
    ).exists()
    if confirmed or not base.user.phone:
        return
    row = _row(base, "sms")
    try:
        send_sms(base.user.phone, f"{base.title}: {base.body}"[:300])
        row.status, row.sent_at = "sent", timezone.now()
    except Exception as exc:
        row.status, row.error = "failed", str(exc)[:255]
    row.save(update_fields=["status", "sent_at", "error"])


@shared_task
def process_deadlines_task():
    call_command("process_deadlines")
