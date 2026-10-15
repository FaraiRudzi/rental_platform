from django.conf import settings
from rest_framework.decorators import api_view, authentication_classes, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.exceptions import WorkflowError
from core.models import AuditLog
from core.permissions import IsAdmin
from core.services import site_settings as ss


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def public_site(request):
    """Branding and public options, read by every page of the website."""
    return Response(ss.public_payload())


def _admin_payload():
    s, pub, cfg = ss.get_all(), ss.public_payload(), settings.RENTAL
    return {
        "values": {k: s[k] for k in ss.EDITABLE_KEYS},
        "defaults": {k: ss.DEFAULTS[k] for k in ss.EDITABLE_KEYS},
        "images": {k: pub[f"{k}_url"] for k in ss.IMAGE_KEYS},
        "logo_white_custom": bool(s["logo_white_custom"]),
        "providers": {"google": bool(cfg["GOOGLE_CLIENT_ID"]),
                      "facebook": bool(cfg["FACEBOOK_APP_ID"] and cfg["FACEBOOK_APP_SECRET"])},
    }


@api_view(["GET", "PATCH"])
@permission_classes([IsAdmin])
def admin_settings(request):
    if request.method == "PATCH":
        changed = ss.update_values(request.data, request.user)
        if changed:
            AuditLog.objects.create(user=request.user, action="settings.update", entity_type="site_settings",
                                    new_values={k: request.data.get(k) for k in changed})
    return Response(_admin_payload())


@api_view(["POST", "DELETE"])
@permission_classes([IsAdmin])
@parser_classes([MultiPartParser, FormParser])
def admin_setting_image(request, key):
    if request.method == "DELETE":
        ss.clear_image(key, request.user)
    else:
        upload = request.FILES.get("file")
        if not upload:
            raise WorkflowError("Choose an image to upload.")
        ss.save_image(key, upload, request.user)
    AuditLog.objects.create(user=request.user, action=f"settings.image.{request.method.lower()}",
                            entity_type="site_settings", new_values={"image": key})
    return Response(_admin_payload())
