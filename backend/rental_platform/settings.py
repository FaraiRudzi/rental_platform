import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env(key, default=None):
    return os.environ.get(key, default)


def env_bool(key, default=False):
    return str(os.environ.get(key, str(default))).strip().lower() in ("1", "true", "yes", "on")


SECRET_KEY = env("SECRET_KEY", "dev-insecure-change-me")
DEBUG = env_bool("DEBUG", True)
ALLOWED_HOSTS = [h.strip() for h in env("ALLOWED_HOSTS", "*").split(",")]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "corsheaders",
    "rest_framework",
    "core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "rental_platform.urls"
WSGI_APPLICATION = "rental_platform.wsgi.application"
AUTH_USER_MODEL = "core.User"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Tables already exist (created from rental_platform_schema.sql) and every model is
# declared managed = False, so Django never alters them.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": env("DB_NAME", "rental_platform"),
        "USER": env("DB_USER", "root"),
        "PASSWORD": env("DB_PASSWORD", ""),
        "HOST": env("DB_HOST", "127.0.0.1"),
        "PORT": env("DB_PORT", "3306"),
        "OPTIONS": {"charset": "utf8mb4", "init_command": "SET sql_mode='STRICT_TRANS_TABLES'"},
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_TZ = True

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

SILENCED_SYSTEM_CHECKS = ["fields.W342"]  # composite-key link tables, see core/models.py

CORS_ALLOWED_ORIGINS = [o.strip() for o in env("CORS_ORIGINS", "http://localhost:5173").split(",")]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework_simplejwt.authentication.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"otp": "5/min", "search": "120/min", "auth": "20/min"},
    "EXCEPTION_HANDLER": "core.exceptions.api_exception_handler",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=2),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
}

CELERY_BROKER_URL = env("REDIS_URL", "redis://localhost:6379/0")
CELERY_TASK_ALWAYS_EAGER = env_bool("CELERY_EAGER", True)
CELERY_BEAT_SCHEDULE = {
    "process-deadlines": {"task": "core.tasks.process_deadlines_task", "schedule": 15 * 60},
}

RENTAL = {
    "APP_URL": env("APP_URL", "http://localhost:5173"),
    "CONFIRM_HOURS": int(env("RENTAL_CONFIRM_HOURS", 48)),
    "PAYMENT_DEADLINE_HOURS": int(env("RENTAL_PAYMENT_DEADLINE_HOURS", 72)),
    "RELEASE_CONTACTS_WHEN": env("RENTAL_RELEASE_CONTACTS_WHEN", "both_paid"),
    "SMS_FALLBACK_MINUTES": int(env("RENTAL_SMS_FALLBACK_MINUTES", 10)),
    "OTP_TTL_MINUTES": 10,
    "OTP_MAX_ATTEMPTS": 5,
    "SMS": {
        "DRIVER": env("SMS_DRIVER", "log"),
        "URL": env("SMS_HTTP_URL"),
        "TOKEN": env("SMS_HTTP_TOKEN"),
        "SENDER": env("SMS_SENDER", "RentalApp"),
        "TWILIO_ACCOUNT_SID": env("TWILIO_ACCOUNT_SID"),
        "TWILIO_AUTH_TOKEN": env("TWILIO_AUTH_TOKEN"),
        "TWILIO_FROM": env("TWILIO_FROM"),
    },
    "WHATSAPP": {
        "ENABLED": env_bool("WHATSAPP_ENABLED", False),
        "TOKEN": env("WHATSAPP_TOKEN"),
        "PHONE_NUMBER_ID": env("WHATSAPP_PHONE_NUMBER_ID"),
        "VERIFY_TOKEN": env("WHATSAPP_VERIFY_TOKEN"),
        "APP_SECRET": env("WHATSAPP_APP_SECRET"),
        "API_VERSION": "v20.0",
        "LANGUAGE": "en",
        # Names must match templates approved in Meta Business Manager.
        "TEMPLATES": {
            "application_received": "application_received",
            "application_accepted": "application_accepted",
            "placement_confirmed": "placement_confirmed",
            "contacts_released": "contacts_released",
            "saved_search_match": "saved_search_match",
        },
    },
    "FCM": {
        "ENABLED": env_bool("FCM_ENABLED", False),
        "PROJECT_ID": env("FCM_PROJECT_ID"),
        "CREDENTIALS_PATH": env("FCM_CREDENTIALS_PATH", "firebase-credentials.json"),
    },
    "PAYMENT_WEBHOOK_SECRET": env("PAYMENT_WEBHOOK_SECRET", "change-me"),
}
