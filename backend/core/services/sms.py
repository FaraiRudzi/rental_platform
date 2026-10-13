import logging

import requests
from django.conf import settings

log = logging.getLogger(__name__)


def send_sms(phone: str, message: str) -> str:
    cfg = settings.RENTAL["SMS"]
    if cfg["DRIVER"] == "http" and cfg["URL"]:
        # Generic JSON provider. Adapt the payload to your SMS provider's API.
        resp = requests.post(
            cfg["URL"],
            json={"to": phone, "from": cfg["SENDER"], "message": message},
            headers={"Authorization": f"Bearer {cfg['TOKEN']}"},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.text[:150]
    log.warning("[SMS to %s] %s", phone, message)
    print(f"[SMS to {phone}] {message}")
    return "logged"
