import uuid

from django.conf import settings
from django.core.files.storage import default_storage
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from core.exceptions import WorkflowError
from core.models import DeviceToken, User, VerificationDoc
from core.serializers import UserSerializer
from core.services import otp


def _tokens(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh), "user": UserSerializer(user).data}


class OtpRequestView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "otp"

    def post(self, request):
        development_code = otp.request_otp(request.data.get("phone", ""))
        if development_code:
            return Response({
                "detail": "SMS is not configured. Use this development-only code to continue.",
                "development_code": development_code,
            })
        return Response({"detail": "Code sent."})


class OtpVerifyView(APIView):
    """Log in, or register on first use (needs full_name and role)."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "auth"

    def post(self, request):
        phone = otp.normalize_phone(request.data.get("phone", ""))
        user = User.objects.filter(phone=phone).first()
        name = (request.data.get("full_name") or "").strip()
        role = request.data.get("role")
        # Check registration details BEFORE consuming the code, so a new user is not
        # forced to request a second code just to type their name.
        if not user and (not name or role not in ("tenant", "landlord")):
            return Response({"detail": "New account: send full_name and role (tenant or landlord).",
                             "needs_registration": True}, status=400)
        otp.verify_otp(phone, request.data.get("code", ""))
        if user:
            if not user.is_active:
                raise WorkflowError("This account is suspended.")
            if not user.phone_verified_at:
                user.phone_verified_at = timezone.now()
        else:
            user = User.objects.create_user(phone=phone, full_name=name, role=role,
                                            phone_verified_at=timezone.now())
        user.last_login = timezone.now()
        user.save(update_fields=["last_login", "phone_verified_at"])
        return Response(_tokens(user))


class PasswordLoginView(APIView):
    """For admins (and anyone who set a password)."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "auth"

    def post(self, request):
        phone = otp.normalize_phone(request.data.get("phone", ""))
        user = User.objects.filter(phone=phone).first()
        if not user or not user.check_password(request.data.get("password", "")) or not user.is_active:
            raise WorkflowError("Invalid phone number or password.")
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])
        return Response(_tokens(user))


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


@api_view(["GET", "POST"])
@parser_classes([MultiPartParser, FormParser])
def verification_docs(request):
    if request.method == "GET":
        docs = VerificationDoc.objects.filter(user=request.user).order_by("-id")
        return Response([{"id": d.id, "doc_type": d.doc_type, "status": d.status, "review_note": d.review_note}
                         for d in docs])
    f = request.FILES.get("file")
    doc_type = request.data.get("doc_type")
    allowed = ["national_id", "passport", "proof_of_ownership", "authority_to_let",
               "proof_of_address", "employer_letter", "payslip", "other"]
    if not f or doc_type not in allowed:
        raise WorkflowError("Send a file and a valid doc_type.")
    if f.size > 5 * 1024 * 1024:
        raise WorkflowError("File too large (max 5 MB).")
    ext = f.name.rsplit(".", 1)[-1].lower() if "." in f.name else "bin"
    if ext not in ("jpg", "jpeg", "png", "pdf"):
        raise WorkflowError("Only JPG, PNG or PDF files are accepted.")
    # Stored under a private folder name. In production serve these through an
    # authenticated view or private bucket, never as public media.
    path = default_storage.save(f"private/docs/{request.user.id}/{uuid.uuid4().hex}.{ext}", f)
    doc = VerificationDoc.objects.create(user=request.user, doc_type=doc_type, file_path=path)
    if request.user.verification_status in ("unverified", "rejected"):
        request.user.verification_status = "pending"
        request.user.save(update_fields=["verification_status"])
    return Response({"id": doc.id, "status": doc.status}, status=201)
