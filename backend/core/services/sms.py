import logging

import requests
from django.conf import settings

from core.exceptions import SmsDeliveryError

log = logging.getLogger(__name__)


def send_sms(phone: str, message: str) -> str:
    cfg = settings.RENTAL["SMS"]
    if cfg["DRIVER"] == "twilio":
        account_sid = cfg["TWILIO_ACCOUNT_SID"]
        auth_token = cfg["TWILIO_AUTH_TOKEN"]
        sender = cfg["TWILIO_FROM"]
        if not account_sid or not auth_token or not sender:
            raise SmsDeliveryError(
                "Twilio SMS is not fully configured. Set TWILIO_ACCOUNT_SID, "
                "TWILIO_AUTH_TOKEN, and TWILIO_FROM.")
        try:
            response = requests.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
                data={"To": phone, "From": sender, "Body": message},
                auth=(account_sid, auth_token),
                timeout=15,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            log.warning("Twilio SMS request failed: %s", exc.__class__.__name__)
            raise SmsDeliveryError("Twilio could not deliver your code. Check its console and try again.") from exc
        return "sent"

    if cfg["DRIVER"] == "http":
        if not cfg["URL"]:
            raise SmsDeliveryError("SMS is set to HTTP delivery, but SMS_HTTP_URL is not configured.")
        # Generic JSON provider. Adapt the payload to your SMS provider's API.
        resp = requests.post(
            cfg["URL"],
            json={"to": phone, "from": cfg["SENDER"], "message": message},
            headers={"Authorization": f"Bearer {cfg['TOKEN']}"},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.text[:150]
    if cfg["DRIVER"] == "log":
        log.warning("[SMS to %s] %s", phone, message)
        print(f"[SMS to {phone}] {message}")
        return "logged"
    raise SmsDeliveryError(f"Unsupported SMS_DRIVER value: {cfg['DRIVER']!r}. Use 'log' or 'http'.")
