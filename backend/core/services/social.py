"""Verifies a Google or Facebook sign-in on the server. The browser sends us a token; we never trust it
until Google / Facebook confirm it was issued for OUR app. Accounts are matched on the verified email."""
import requests
from django.conf import settings

from core.exceptions import WorkflowError


def verify(provider, token):
    if not token:
        raise WorkflowError("Sign-in was cancelled.")
    if provider == "google":
        return _google(token)
    if provider == "facebook":
        return _facebook(token)
    raise WorkflowError("Unknown sign-in provider.")


def _google(token):
    client_id = settings.RENTAL["GOOGLE_CLIENT_ID"]
    if not client_id:
        raise WorkflowError("Google sign-in is not set up yet.")
    try:
        from google.auth.transport import requests as grequests
        from google.oauth2 import id_token
        info = id_token.verify_oauth2_token(token, grequests.Request(), client_id)
    except Exception:
        raise WorkflowError("Google sign-in could not be verified. Please try again.")
    if not info.get("email") or not info.get("email_verified"):
        raise WorkflowError("Your Google account has no verified email address.")
    return {"email": info["email"].strip().lower(), "name": (info.get("name") or "").strip()}


def _facebook(token):
    app_id, secret = settings.RENTAL["FACEBOOK_APP_ID"], settings.RENTAL["FACEBOOK_APP_SECRET"]
    if not (app_id and secret):
        raise WorkflowError("Facebook sign-in is not set up yet.")
    try:
        check = requests.get("https://graph.facebook.com/debug_token",
                             params={"input_token": token, "access_token": f"{app_id}|{secret}"}, timeout=10).json().get("data", {})
        if not check.get("is_valid") or str(check.get("app_id")) != str(app_id):
            raise ValueError("token was not issued for this app")
        me = requests.get("https://graph.facebook.com/me",
                          params={"fields": "id,name,email", "access_token": token}, timeout=10).json()
    except Exception:
        raise WorkflowError("Facebook sign-in could not be verified. Please try again.")
    if not me.get("email"):
        raise WorkflowError("Facebook did not share an email address. Allow email access, or sign up with your email and a password.")
    return {"email": me["email"].strip().lower(), "name": (me.get("name") or "").strip()}
