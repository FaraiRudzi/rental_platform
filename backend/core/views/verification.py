"""Document upload for tenants and landlords (the review side lives in views/admin.py)."""
import io
import uuid

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from core.exceptions import WorkflowError
from core.models import Notification, User, VerificationDoc
from core.permissions import IsTenantOrLandlord
from core.services import verification as vs
from core.services.notifications import notify, resolve_alerts

MAX_BYTES = 5 * 1024 * 1024
MAX_DOCS = 15
SIGNATURES = ((b"\xff\xd8\xff", "jpg"), (b"\x89PNG", "png"), (b"%PDF", "pdf"))


def _kind(path):
    return "pdf" if path.lower().endswith(".pdf") else "image"


def doc_dict(d):
    return {"id": d.id, "doc_type": d.doc_type, "doc_label": vs.DOC_LABELS.get(d.doc_type, d.doc_type),
            "status": d.status, "review_note": d.review_note, "created_at": d.created_at,
            "reviewed_at": d.reviewed_at, "kind": _kind(d.file_path)}


def summary(user):
    docs = list(user.verification_docs.all().order_by("-id"))
    checks = vs.summarize(user, docs)
    return {"status": user.verification_status, "role": user.role, "complete": vs.is_complete(checks),
            "checks": checks, "badges": [c["badge"] for c in checks if c["status"] == "approved"],
            "docs": [doc_dict(d) for d in docs]}


def serve_doc(doc):
    """Streams a private document. Callers must already have checked who is allowed to see it."""
    if not default_storage.exists(doc.file_path):
        raise Http404()
    resp = FileResponse(default_storage.open(doc.file_path, "rb"),
                        content_type="application/pdf" if _kind(doc.file_path) == "pdf" else "image/jpeg")
    resp["X-Content-Type-Options"] = "nosniff"
    resp["Cache-Control"] = "private, no-store"
    return resp


def _shrink(upload):
    """Phone photos are large. Fix rotation, cap at 2200 px, save as JPEG (still easily readable)."""
    from PIL import Image, ImageOps
    try:
        img = Image.open(upload)
        img.load()
    except Exception:
        raise WorkflowError("That image could not be read. Try taking the photo again.")
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((2200, 2200))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85, optimize=True)
    return buf.getvalue()


def _alert_admins(user):
    for admin_user in User.objects.filter(role="admin", status="active"):
        already = Notification.objects.filter(user=admin_user, event="verification_pending",
                                              related_id=user.id, read_at__isnull=True).exists()
        if not already:
            notify(admin_user, "verification_pending", "Documents awaiting review",
                   f"{user.full_name} ({user.role}) uploaded a document.", "user", user.id, external=False)


@api_view(["GET"])
@permission_classes([IsTenantOrLandlord])
def my_verification(request):
    return Response(summary(request.user))


@api_view(["GET", "POST"])
@permission_classes([IsTenantOrLandlord])
@parser_classes([MultiPartParser, FormParser])
def verification_docs(request):
    user = request.user
    if request.method == "GET":
        return Response(summary(user)["docs"])

    f = request.FILES.get("file")
    doc_type = request.data.get("doc_type")
    if doc_type not in vs.ALLOWED_TYPES.get(user.role, []):
        raise WorkflowError("Choose a document type that applies to your account.")
    if not f:
        raise WorkflowError("Choose a file to upload.")
    if f.size > MAX_BYTES:
        raise WorkflowError("That file is too large. The maximum is 5 MB.")
    if VerificationDoc.objects.filter(user=user).count() >= MAX_DOCS:
        raise WorkflowError("You have reached the document limit. Remove an old document first.")

    head = f.read(8)
    f.seek(0)
    kind = next((ext for sig, ext in SIGNATURES if head.startswith(sig)), None)
    if kind is None:  # checks the file's real content, not just its name
        raise WorkflowError("Upload a JPG, PNG or PDF file. (iPhone HEIC photos are not supported: "
                            "take a screenshot of the photo instead.)")
    if kind == "pdf":
        data, ext = f.read(), "pdf"
    else:
        data, ext = _shrink(f), "jpg"

    path = default_storage.save(f"private/docs/{user.id}/{uuid.uuid4().hex}.{ext}", ContentFile(data))
    VerificationDoc.objects.create(user=user, doc_type=doc_type, file_path=path)
    if user.verification_status in ("unverified", "rejected"):
        user.verification_status = "pending"
        user.save(update_fields=["verification_status"])
    _alert_admins(user)
    return Response(summary(user), status=201)


@api_view(["DELETE"])
@permission_classes([IsTenantOrLandlord])
def delete_doc(request, pk):
    doc = get_object_or_404(VerificationDoc, pk=pk, user=request.user)
    if doc.status == "approved":
        raise WorkflowError("An approved document cannot be removed.")
    default_storage.delete(doc.file_path)
    doc.delete()
    vs.recompute_status(request.user)
    if not VerificationDoc.objects.filter(user=request.user, status="pending").exists():
        resolve_alerts("user", request.user.id, ["verification_pending"])
    return Response(summary(request.user))


@api_view(["GET"])
@permission_classes([IsTenantOrLandlord])
def my_doc_file(request, pk):
    return serve_doc(get_object_or_404(VerificationDoc, pk=pk, user=request.user))
