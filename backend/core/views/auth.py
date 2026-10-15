"""Accounts: password-only login (email or phone), registration, Google / Facebook sign-in,
forgot / reset / change password, profile and push-token endpoints."""
import logging
import re

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.decorators import api_view
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from core.exceptions import WorkflowError
from core.models import DeviceToken, User
from core.serializers import UserSerializer
from core.services import site_settings, social
from core.services.otp import normalize_phone

log = logging.getLogger(__name__)
EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
MAX_FAILS, LOCK_SECONDS = 8, 15 * 60


def _tokens(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh), "user": UserSerializer(user).data}


def _stamp(user):
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])


def _check_password(password, user=None):
    try:
        validate_password(password or "", user)
    except ValidationError as exc:
        raise WorkflowError(" ".join(exc.messages))


def _clean_email(raw, exclude_id=None):
    email = (raw or "").strip().lower()
    if not email:
        raise WorkflowError("Enter your email address.")
    if not EMAIL_RE.fullmatch(email):
        raise WorkflowError("Enter a valid email address.")
    taken = User.objects.filter(email__iexact=email)
    if exclude_id:
        taken = taken.exclude(pk=exclude_id)
    if taken.exists():
        raise WorkflowError("That email address already has an account. Please log in instead.")
    return email


def _require_signups_open():
    if not site_settings.get_all().get("registration_open", True):
        raise WorkflowError("New sign-ups are closed at the moment. Please check back later.")


def _clean_role_and_phone(data):
    role = data.get("role")
    if role not in ("tenant", "landlord"):
        raise WorkflowError("Choose whether you are a tenant or a landlord.")
    phone = normalize_phone(data.get("phone", ""))
    if User.objects.filter(phone=phone).exists():
        raise WorkflowError("This phone number already has an account. Please log in instead.")
    return role, phone


# --------------------------------------------------------------------- register / login

class RegisterView(APIView):
    """Create an account with name, phone, email and a password (all required)."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "register"

    def post(self, request):
        _require_signups_open()
        d = request.data
        name = (d.get("full_name") or "").strip()
        if len(name) < 2:
            raise WorkflowError("Enter your full name.")
        role, phone = _clean_role_and_phone(d)
        email = _clean_email(d.get("email"))
        password = d.get("password") or ""
        _check_password(password)
        user = User.objects.create_user(phone=phone, password=password, full_name=name, role=role, email=email,
                                        whatsapp_opt_in=bool(d.get("whatsapp_opt_in")))
        _stamp(user)
        return Response(_tokens(user), status=201)


def _find_by_identifier(identifier):
    if "@" in identifier:
        return User.objects.filter(email__iexact=identifier).first()
    return User.objects.filter(phone=normalize_phone(identifier)).first()


class LoginView(APIView):
    """Log in with email OR phone number, plus the password."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "auth"

    def post(self, request):
        identifier = (request.data.get("identifier") or request.data.get("phone") or "").strip()
        password = request.data.get("password") or ""
        if not identifier or not password:
            raise WorkflowError("Enter your email or phone number, and your password.")
        if "@" not in identifier:
            normalize_phone(identifier)  # clear hint if it is neither an email nor an international phone number
        key = "login_fail:" + identifier.lower()
        if cache.get(key, 0) >= MAX_FAILS:
            raise WorkflowError("Too many failed attempts. Wait 15 minutes, or reset your password.")
        user = _find_by_identifier(identifier)
        if not user or not user.check_password(password):
            cache.set(key, cache.get(key, 0) + 1, LOCK_SECONDS)
            raise WorkflowError("Incorrect email, phone number or password.")
        if not user.is_active:
            raise WorkflowError("This account is suspended.")
        cache.delete(key)
        _stamp(user)
        return Response(_tokens(user))


# --------------------------------------------------------------------- Google / Facebook

class SocialLoginView(APIView):
    """The browser sends a Google ID token or a Facebook access token; we verify it with the provider.
    Existing accounts (matched on verified email) are logged in; new people are asked for a phone number and role."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "auth"

    def post(self, request):
        provider = request.data.get("provider")
        profile = social.verify(provider, request.data.get("token") or "")
        user = User.objects.filter(email__iexact=profile["email"]).first()
        if user:
            if user.role == "admin":
                raise WorkflowError("Administrator accounts must log in with a password.")
            if not user.is_active:
                raise WorkflowError("This account is suspended.")
            _stamp(user)
            return Response(_tokens(user))
        _require_signups_open()
        signup = signing.dumps({"email": profile["email"], "name": profile["name"], "provider": provider},
                               salt="social-signup")
        return Response({"needs_profile": True, "signup_token": signup, "email": profile["email"],
                         "name": profile["name"], "provider": provider})


class SocialCompleteView(APIView):
    """Step 2 for a new Google / Facebook user: choose tenant or landlord and give a phone number."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "register"

    def post(self, request):
        _require_signups_open()
        try:
            data = signing.loads(request.data.get("signup_token") or "", salt="social-signup", max_age=1800)
        except signing.BadSignature:
            raise WorkflowError("Your sign-in expired. Please start again.")
        if User.objects.filter(email__iexact=data["email"]).exists():
            raise WorkflowError("That email address already has an account. Please log in instead.")
        role, phone = _clean_role_and_phone(request.data)
        name = (request.data.get("full_name") or data.get("name") or "").strip() or data["email"].split("@")[0]
        user = User.objects.create_user(phone=phone, password=None, full_name=name, role=role, email=data["email"],
                                        whatsapp_opt_in=bool(request.data.get("whatsapp_opt_in")))
        _stamp(user)
        return Response(_tokens(user), status=201)


# --------------------------------------------------------------------- passwords

def _send_reset_email(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = f"{settings.RENTAL['APP_URL'].rstrip('/')}/reset-password?uid={uid}&token={token}"
    name = site_settings.get_all().get("site_name", "Rental Platform")
    send_mail(
        subject=f"Reset your {name} password",
        message=(f"Hello {user.full_name},\n\nUse this link to choose a new password. It works for one hour:\n\n{link}\n\n"
                 "If you did not ask for this, you can safely ignore this email."),
        from_email=None, recipient_list=[user.email], fail_silently=False)


class ForgotPasswordView(APIView):
    """Always answers the same way, so nobody can use it to find out who has an account."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "forgot"

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        user = User.objects.filter(email__iexact=email).first() if email else None
        if user and user.is_active:
            try:
                _send_reset_email(user)
            except Exception:
                log.exception("Could not send the password reset email")
        return Response({"detail": "If that email belongs to an account, we have sent a link to reset the password."})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "auth"

    def post(self, request):
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(request.data.get("uid") or "")))
        except Exception:
            user = None
        if not user or not default_token_generator.check_token(user, request.data.get("token") or ""):
            raise WorkflowError("This reset link is invalid or has expired. Please request a new one.")
        password = request.data.get("password") or ""
        _check_password(password, user)
        user.set_password(password)
        user.save(update_fields=["password"])
        _stamp(user)
        return Response(_tokens(user))


class ChangePasswordView(APIView):
    """Signed-in users change (or, for Google / Facebook sign-ups, first set) their password."""
    throttle_scope = "auth"

    def post(self, request):
        user = request.user
        has_password = bool(user.password) and not user.password.startswith("!")
        if has_password and not user.check_password(request.data.get("current_password") or ""):
            raise WorkflowError("Your current password is not correct.")
        new = request.data.get("new_password") or ""
        _check_password(new, user)
        user.set_password(new)
        user.save(update_fields=["password"])
        return Response({"detail": "Password updated."})


# --------------------------------------------------------------------- profile and push

class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        ser = UserSerializer(request.user, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


@api_view(["POST", "DELETE"])
def device_token(request):
    token = (request.data.get("fcm_token") or "").strip()
    if not token:
        raise WorkflowError("fcm_token is required.")
    if request.method == "DELETE":
        DeviceToken.objects.filter(user=request.user, fcm_token=token).delete()
        return Response(status=204)
    DeviceToken.objects.filter(fcm_token=token).exclude(user=request.user).delete()  # token moved accounts
    obj, _ = DeviceToken.objects.get_or_create(
        user=request.user, fcm_token=token, defaults={"platform": request.data.get("platform", "android")})
    obj.last_seen_at = timezone.now()
    obj.save(update_fields=["last_seen_at"])
    return Response({"detail": "Registered."})
