"""WhatsApp Business Cloud API client.

Business-initiated messages (outside the 24h reply window) MUST be pre-approved
templates. Free-form text, buttons and lists only work inside the 24h window,
i.e. after the user has messaged the bot.
"""
import hashlib
import hmac

import requests
from django.conf import settings


def cfg():
    return settings.RENTAL["WHATSAPP"]


def enabled() -> bool:
    c = cfg()
    return bool(c["ENABLED"] and c["TOKEN"] and c["PHONE_NUMBER_ID"])


def wa_number(phone: str) -> str:
    return phone.lstrip("+")


def _post(payload: dict) -> str:
    c = cfg()
    url = f"https://graph.facebook.com/{c['API_VERSION']}/{c['PHONE_NUMBER_ID']}/messages"
    resp = requests.post(
        url,
        json={"messaging_product": "whatsapp", **payload},
        headers={"Authorization": f"Bearer {c['TOKEN']}"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["messages"][0]["id"]


def send_template(phone, template_key, params=None, quick_replies=None) -> str:
    """params fill {{1}}, {{2}}... in the template body. quick_replies are payload
    strings for the template's quick-reply buttons, in order (e.g. ["conf:12", "decl:12"])."""
    c = cfg()
    components = []
    if params:
        components.append({"type": "body", "parameters": [{"type": "text", "text": str(p)} for p in params]})
    for i, payload in enumerate(quick_replies or []):
        components.append({
            "type": "button", "sub_type": "quick_reply", "index": str(i),
            "parameters": [{"type": "payload", "payload": payload}],
        })
    return _post({
        "to": wa_number(phone), "type": "template",
        "template": {
            "name": c["TEMPLATES"].get(template_key, template_key),
            "language": {"code": c["LANGUAGE"]},
            "components": components,
        },
    })


def send_text(phone, text) -> str:
    return _post({"to": wa_number(phone), "type": "text", "text": {"body": text[:4000]}})


def send_buttons(phone, body, buttons) -> str:
    """buttons: list of (id, title), max 3, title max 20 chars."""
    return _post({
        "to": wa_number(phone), "type": "interactive",
        "interactive": {
            "type": "button", "body": {"text": body[:1000]},
            "action": {"buttons": [{"type": "reply", "reply": {"id": i, "title": t[:20]}} for i, t in buttons[:3]]},
        },
    })


def send_list(phone, body, button_label, rows) -> str:
    """rows: list of (id, title, description), max 10."""
    return _post({
        "to": wa_number(phone), "type": "interactive",
        "interactive": {
            "type": "list", "body": {"text": body[:1000]},
            "action": {
                "button": button_label[:20],
                "sections": [{"title": "Options", "rows": [
                    {"id": i, "title": t[:24], "description": (d or "")[:72]} for i, t, d in rows[:10]
                ]}],
            },
        },
    })


def verify_signature(body: bytes, header: str | None) -> bool:
    secret = cfg()["APP_SECRET"]
    if not secret:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header or "")
