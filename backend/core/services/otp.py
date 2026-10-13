import hashlib
import hmac
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from core.exceptions import WorkflowError
from core.models import OtpCode
from core.services.sms import send_sms

R = settings.RENTAL


def normalize_phone(raw: str) -> str:
    phone = re.sub(r"[\s\-()]", "", raw or "")
    if not re.fullmatch(r"\+\d{8,15}", phone):
        raise WorkflowError("Enter your phone number in international format, e.g. +263771234567.")
    return phone


def _hash(phone: str, code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def request_otp(phone: str, purpose: str = "login") -> None:
    phone = normalize_phone(phone)
    recent = OtpCode.objects.filter(phone=phone, created_at__gte=timezone.now() - timedelta(seconds=45)).exists()
    if recent:
        raise WorkflowError("Please wait a moment before requesting another code.")
    code = f"{secrets.randbelow(10**6):06d}"
    OtpCode.objects.create(
        phone=phone, code_hash=_hash(phone, code), purpose=purpose,
        expires_at=timezone.now() + timedelta(minutes=R["OTP_TTL_MINUTES"]))
    send_sms(phone, f"Your Rental Platform code is {code}. It expires in {R['OTP_TTL_MINUTES']} minutes.")


def verify_otp(phone: str, code: str) -> str:
    phone = normalize_phone(phone)
    otp = (OtpCode.objects.filter(phone=phone, consumed_at__isnull=True, expires_at__gt=timezone.now())
           .order_by("-id").first())
    if not otp or otp.attempts >= R["OTP_MAX_ATTEMPTS"]:
        raise WorkflowError("That code has expired. Request a new one.")
    if not hmac.compare_digest(otp.code_hash, _hash(phone, (code or "").strip())):
        OtpCode.objects.filter(pk=otp.pk).update(attempts=otp.attempts + 1)
        raise WorkflowError("Incorrect code.")
    OtpCode.objects.filter(pk=otp.pk).update(consumed_at=timezone.now())
    return phone
