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
    "django.contrib.admin",
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",  # DRF views are exempt; this protects the admin site
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
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

STATIC_URL = "/static/"
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
    "DEFAULT_THROTTLE_RATES": {"search": "120/min", "auth": "20/min", "register": "20/hour", "forgot": "5/hour"},
    "NUM_PROXIES": 1,  # the website server forwards the visitor's IP, so limits apply per visitor
    "EXCEPTION_HANDLER": "core.exceptions.api_exception_handler",
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
PASSWORD_RESET_TIMEOUT = 3600  # reset links work for one hour

# Email (password reset). The default prints the email in the backend window, which is handy while testing.
EMAIL_BACKEND = env("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", "")
EMAIL_PORT = int(env("EMAIL_PORT", 587))
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "no-reply@example.com")

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
    "REQUIRE_VERIFIED_LANDLORD": env_bool("REQUIRE_VERIFIED_LANDLORD", False),
    "GOOGLE_CLIENT_ID": env("GOOGLE_CLIENT_ID", ""),
    "FACEBOOK_APP_ID": env("FACEBOOK_APP_ID", ""),
    "FACEBOOK_APP_SECRET": env("FACEBOOK_APP_SECRET", ""),
    "SMS": {
        "DRIVER": env("SMS_DRIVER", "log"),
        "URL": env("SMS_HTTP_URL"),
        "TOKEN": env("SMS_HTTP_TOKEN"),
        "SENDER": env("SMS_SENDER", "RentalApp"),
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
