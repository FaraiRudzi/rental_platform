"""Site settings edited from Admin > Settings: logo images, colours, texts and sign-up switch.
Stored as key/value rows in the site_settings table; anything not set falls back to DEFAULTS."""
import io
import re
import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import DatabaseError

from core.exceptions import WorkflowError
from core.models import SiteSetting

DEFAULTS = {
    "site_name": "Rental Platform",
    "tagline": "Find a home you can trust",
    "company_name": "NexaSoft Technologies",
    "hero_title": "Find a home you can trust",
    "hero_subtitle": "Search verified landlords and checked listings, apply in minutes, and get updates by app, WhatsApp or SMS.",
    "support_email": "",
    "support_phone": "",
    "footer_text": "Innovation through technology",
    "color_primary": "#056be3",
    "color_dark": "#021433",
    "registration_open": True,
    "logo": None, "logo_white": None, "logo_icon": None, "login_background": None,
    "logo_white_custom": False,
}
TEXT_LIMITS = {"site_name": 60, "tagline": 120, "company_name": 80, "hero_title": 100, "hero_subtitle": 240,
               "support_email": 120, "support_phone": 40, "footer_text": 160}
REQUIRED_TEXT = {"site_name", "company_name", "hero_title"}
COLOR_KEYS = ("color_primary", "color_dark")
IMAGE_KEYS = ("logo", "logo_white", "logo_icon", "login_background")
EDITABLE_KEYS = tuple(TEXT_LIMITS) + COLOR_KEYS + ("registration_open",)


def get_all():
    values = dict(DEFAULTS)
    try:
        for row in SiteSetting.objects.all():
            if row.key in DEFAULTS:
                values[row.key] = row.value
    except DatabaseError:  # table not created yet (migrate has not been run): fall back to defaults
        pass
    return values


def _write(updates, admin):
    for key, value in updates.items():
        SiteSetting.objects.update_or_create(key=key, defaults={"value": value, "updated_by": admin.id if admin else None})


def public_payload():
    s = get_all()
    media = lambda p: (settings.MEDIA_URL + p) if p else None  # noqa: E731  (relative URL: served through the website)
    cfg = settings.RENTAL
    out = {k: s[k] for k in TEXT_LIMITS}
    out.update({k: s[k] for k in COLOR_KEYS})
    out.update({
        "registration_open": bool(s["registration_open"]),
        "logo_url": media(s["logo"]), "logo_white_url": media(s["logo_white"]),
        "logo_icon_url": media(s["logo_icon"]), "login_background_url": media(s["login_background"]),
        "google_client_id": cfg["GOOGLE_CLIENT_ID"] or None,
        "facebook_app_id": cfg["FACEBOOK_APP_ID"] or None,
    })
    return out


def update_values(data, admin):
    updates = {}
    for key, raw in data.items():
        if key in TEXT_LIMITS:
            value = str(raw if raw is not None else "").strip()
            if len(value) > TEXT_LIMITS[key]:
                raise WorkflowError(f"{key.replace('_', ' ').capitalize()} is too long (max {TEXT_LIMITS[key]} characters).")
            if key in REQUIRED_TEXT and not value:
                raise WorkflowError(f"{key.replace('_', ' ').capitalize()} cannot be empty.")
            if key == "support_email" and value and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
                raise WorkflowError("Enter a valid support email address.")
            updates[key] = value
        elif key in COLOR_KEYS:
            if not re.fullmatch(r"#[0-9a-fA-F]{6}", str(raw)):
                raise WorkflowError("Colours must look like #056be3.")
            updates[key] = str(raw).lower()
        elif key == "registration_open":
            updates[key] = bool(raw)
    if updates:
        _write(updates, admin)
    return list(updates)


# ------------------------------------------------------------------ images (Pillow only)

def _open(upload):
    from PIL import Image, ImageOps
    head = upload.read(12)
    upload.seek(0)
    ok = head.startswith(b"\xff\xd8\xff") or head.startswith(b"\x89PNG") or (head[:4] == b"RIFF" and head[8:12] == b"WEBP")
    if not ok:
        raise WorkflowError("Upload a PNG, JPG or WebP image.")
    try:
        img = Image.open(upload)
        img.load()
    except Exception:
        raise WorkflowError("That image could not be read.")
    return ImageOps.exif_transpose(img)


def _has_alpha(img):
    return img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)


def _white_to_alpha(img):
    """A logo on a white background: make the white transparent, keep the colours."""
    from PIL import ImageChops
    rgb = img.convert("RGB")
    r, g, b = rgb.split()
    darkest = ImageChops.darker(ImageChops.darker(r, g), b)
    table = []
    for v in range(256):
        d = 255 - v
        table.append(0 if d <= 12 else 255 if d >= 70 else int(255 * (d - 12) / 58))
    out = rgb.convert("RGBA")
    out.putalpha(darkest.point(table))
    return out


def _logo_rgba(img):
    out = img.convert("RGBA") if _has_alpha(img) else _white_to_alpha(img)
    out.thumbnail((1200, 1200))
    return out


def _white_version(rgba):
    from PIL import Image
    white = Image.new("RGBA", rgba.size, (255, 255, 255, 0))
    white.putalpha(rgba.getchannel("A"))
    return white


def _light_logo_rgba(img):
    """A logo supplied for dark backgrounds. If it has no transparency, treat dark pixels as background."""
    from PIL import Image
    if _has_alpha(img):
        out = img.convert("RGBA")
    else:
        lum = img.convert("L")
        alpha = lum.point([0 if v < 40 else 255 if v > 140 else int(255 * (v - 40) / 100) for v in range(256)])
        out = Image.new("RGBA", img.size, (255, 255, 255, 0))
        out.putalpha(alpha)
    out.thumbnail((1200, 1200))
    return out


def _store(data, prefix, ext):
    return default_storage.save(f"site/{prefix}-{uuid.uuid4().hex[:10]}.{ext}", ContentFile(data))


def _png_bytes(img):
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def _delete(path):
    if path:
        try:
            default_storage.delete(path)
        except Exception:
            pass


def save_image(key, upload, admin):
    if key not in IMAGE_KEYS:
        raise WorkflowError("Unknown image.")
    if upload.size > 6 * 1024 * 1024:
        raise WorkflowError("That image is too large (max 6 MB).")
    img = _open(upload)
    current = get_all()
    updates = {}
    if key == "logo":
        rgba = _logo_rgba(img)
        updates["logo"] = _store(_png_bytes(rgba), "logo", "png")
        if not current["logo_white_custom"]:  # keep the dark-background version in step automatically
            updates["logo_white"] = _store(_png_bytes(_white_version(rgba)), "logo-white", "png")
    elif key == "logo_white":
        updates["logo_white"] = _store(_png_bytes(_light_logo_rgba(img)), "logo-white", "png")
        updates["logo_white_custom"] = True
    elif key == "logo_icon":
        icon = img.convert("RGBA")
        icon.thumbnail((256, 256))
        updates["logo_icon"] = _store(_png_bytes(icon), "icon", "png")
    else:
        bg = img.convert("RGB")
        bg.thumbnail((1600, 2000))
        buf = io.BytesIO()
        bg.save(buf, "JPEG", quality=82, optimize=True)
        updates["login_background"] = _store(buf.getvalue(), "login-bg", "jpg")
    _write(updates, admin)
    for k in updates:
        if k in IMAGE_KEYS:
            _delete(current.get(k))


def clear_image(key, admin):
    if key not in IMAGE_KEYS:
        raise WorkflowError("Unknown image.")
    current = get_all()
    updates = {key: None}
    if key == "logo" and not current["logo_white_custom"]:
        updates["logo_white"] = None
    if key == "logo_white":
        updates["logo_white_custom"] = False
        if current["logo"]:  # fall back to the automatic version of the current logo
            from PIL import Image
            with default_storage.open(current["logo"], "rb") as f:
                logo = Image.open(f).convert("RGBA")
            updates["logo_white"] = _store(_png_bytes(_white_version(logo)), "logo-white", "png")
    _write(updates, admin)
    for k in updates:
        if k in IMAGE_KEYS:
            _delete(current.get(k))
