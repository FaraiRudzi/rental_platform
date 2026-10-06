"""Firebase Cloud Messaging (HTTP v1) for the Android app."""
import requests
from django.conf import settings

_creds = None


def enabled() -> bool:
    return bool(settings.RENTAL["FCM"]["ENABLED"] and settings.RENTAL["FCM"]["PROJECT_ID"])


def _access_token() -> str:
    global _creds
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account

    if _creds is None:
        _creds = service_account.Credentials.from_service_account_file(
            settings.RENTAL["FCM"]["CREDENTIALS_PATH"],
            scopes=["https://www.googleapis.com/auth/firebase.messaging"],
        )
    if not _creds.valid:
        _creds.refresh(Request())
    return _creds.token


def send(token: str, title: str, body: str, data: dict | None = None) -> bool:
    """Returns False if the device token is no longer valid (caller should delete it)."""
    url = f"https://fcm.googleapis.com/v1/projects/{settings.RENTAL['FCM']['PROJECT_ID']}/messages:send"
    payload = {
        "message": {
            "token": token,
            "notification": {"title": title or "", "body": body or ""},
            "data": {k: str(v) for k, v in (data or {}).items()},
        }
    }
    resp = requests.post(url, json=payload, headers={"Authorization": f"Bearer {_access_token()}"}, timeout=15)
    if resp.status_code in (400, 404) and "UNREGISTERED" in resp.text.upper():
        return False
    resp.raise_for_status()
    return True
