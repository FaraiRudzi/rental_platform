import hashlib
import hmac
import json
import logging
from decimal import Decimal

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.models import Notification, Payment
from core.services import billing, whatsapp, whatsapp_bot

log = logging.getLogger(__name__)


@api_view(["GET", "POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def whatsapp_webhook(request):
    cfg = settings.RENTAL["WHATSAPP"]
    if request.method == "GET":  # Meta's one-time verification handshake
        if (request.query_params.get("hub.mode") == "subscribe"
                and request.query_params.get("hub.verify_token") == cfg["VERIFY_TOKEN"]):
            return HttpResponse(request.query_params.get("hub.challenge", ""), content_type="text/plain")
        return HttpResponse("Forbidden", status=403)

    if not whatsapp.verify_signature(request.body, request.headers.get("X-Hub-Signature-256")):
        return HttpResponse("Invalid signature", status=403)

    # Always answer 200 quickly, otherwise Meta keeps retrying.
    try:
        payload = json.loads(request.body)
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for st in value.get("statuses", []):
                    _apply_status(st)
                names = {c.get("wa_id"): c.get("profile", {}).get("name") for c in value.get("contacts", [])}
                for msg in value.get("messages", []):
                    whatsapp_bot.handle_message(msg, msg.get("from"), names.get(msg.get("from")))
    except Exception:
        log.exception("WhatsApp webhook processing failed")
    return Response({"status": "ok"})


def _apply_status(st):
    mapping = {"sent": "sent", "delivered": "delivered", "read": "read", "failed": "failed"}
    new = mapping.get(st.get("status"))
    if not new:
        return
    updates = {"status": new}
    now = timezone.now()
    if new == "delivered":
        updates["delivered_at"] = now
    elif new == "read":
        updates["read_at"] = now
    elif new == "failed":
        updates["error"] = (st.get("errors") or [{}])[0].get("title", "failed")[:255]
    Notification.objects.filter(provider_message_id=st.get("id"), channel="whatsapp").update(**updates)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def payment_webhook(request):
    """Body: {"reference": "...", "status": "success"|"failed", "amount": "8.00"}.
    Header X-Signature = hex HMAC-SHA256 of the raw body with PAYMENT_WEBHOOK_SECRET.
    Adapt the field names to your gateway's payload."""
    secret = settings.RENTAL["PAYMENT_WEBHOOK_SECRET"].encode()
    expected = hmac.new(secret, request.body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("X-Signature", "")):
        return HttpResponse("Invalid signature", status=403)

    data = json.loads(request.body or b"{}")
    payment = Payment.objects.filter(gateway_reference=data.get("reference")).first()
    if not payment:
        return Response({"detail": "Unknown reference."}, status=404)
    if data.get("status") == "success":
        try:
            paid = Decimal(str(data.get("amount")))
        except Exception:
            paid = None
        if paid is None or paid != payment.amount:
            billing.record_payment_failure(payment, {"error": "amount mismatch", "webhook": data})
            return Response({"detail": "Amount mismatch."}, status=400)
        billing.record_payment_success(payment, data)
    else:
        billing.record_payment_failure(payment, data)
    return Response({"status": "ok"})
