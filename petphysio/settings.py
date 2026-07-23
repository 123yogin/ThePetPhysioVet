"""
Django settings for petphysio project.
"""

import datetime
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Base directory
BASE_DIR = Path(__file__).resolve().parent.parent


# =========================
# SECURITY SETTINGS
# =========================

SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "django-insecure-change-this-in-production"
)

DEBUG = os.getenv("DEBUG", "False").lower() == "true"

ALLOWED_HOSTS = os.getenv(
    "ALLOWED_HOSTS",
    ".onrender.com,127.0.0.1,localhost"
).split(",")


# =========================
# APPLICATIONS
# =========================

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party
    'rest_framework',
    # SimpleJWT blacklist app — stores OutstandingToken (every issued refresh)
    # and BlacklistedToken (rotated-out / revoked refresh). With
    # ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION this gives server-side
    # revocation on logout and reuse-detection for free (SRS §3.1).
    'rest_framework_simplejwt.token_blacklist',

    # Your apps
    'appointments',
]


# =========================
# DJANGO REST FRAMEWORK
# =========================
# Auth-hardening sprint (SRS §3.1 + §4): the SPA authenticates a short-lived
# JWT access token FIRST, falling back to the existing Django session + CSRF
# stack (kept so template pages and the existing client.login() tests work).
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "appointments.authentication.JWTAccessAuthentication",
        "appointments.authentication.CsrfSessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
    "UNAUTHENTICATED_USER": None,
}


# =========================
# MIDDLEWARE
# =========================

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # Audit trail (SRS §4) — runs LAST so it sees the final response status and
    # the authenticated user resolved during view dispatch.
    'appointments.audit.AuditMiddleware',
]


# =========================
# ROOT URLS
# =========================

ROOT_URLCONF = 'petphysio.urls'


# =========================
# TEMPLATES
# =========================

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]


# =========================
# WSGI
# =========================

WSGI_APPLICATION = 'petphysio.wsgi.application'


# =========================
# DATABASE
# =========================

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


# =========================
# AUTHENTICATION
# =========================

AUTHENTICATION_BACKENDS = [
    "appointments.backends.EmailOrUsernameBackend",
    "django.contrib.auth.backends.ModelBackend",
]

LOGIN_REDIRECT_URL = "/dashboard/"
LOGIN_URL = "/login/"


# =========================
# PASSWORD VALIDATION
# =========================

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# =========================
# PASSWORD HASHING (SRS §3.1 / §4)
# =========================
# bcrypt (cost>=12) is listed FIRST -> all new/changed passwords are stored as
# bcrypt, and Django transparently upgrades a legacy PBKDF2 hash to bcrypt on
# the user's next successful login (check_password re-hashes when the stored
# algorithm isn't the preferred one). PBKDF2 stays SECOND so existing hashes
# still verify — no forced reset. See appointments/hashers.py.
PASSWORD_HASHERS = [
    "appointments.hashers.BCrypt12PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
]


# =========================
# JWT (SRS §3.1) — SimpleJWT
# =========================
# Short-lived access + rotating refresh with server-side revocation. Each
# refresh rotates the token and blacklists the prior one (BLACKLIST_AFTER_
# ROTATION), so logout revocation and refresh-reuse detection come for free via
# the token_blacklist app. SIGNING_KEY reuses SECRET_KEY (HS256 default).
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": datetime.timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": datetime.timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
}


# =========================
# INTERNATIONALIZATION
# =========================

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Asia/Kolkata'

USE_I18N = True

USE_TZ = True


# =========================
# STATIC FILES
# =========================

STATIC_URL = '/static/'

STATIC_ROOT = BASE_DIR / 'staticfiles'

STATICFILES_DIRS = []


# =========================
# MEDIA FILES
# =========================

MEDIA_URL = '/media/'

MEDIA_ROOT = BASE_DIR / 'media'

# Diagnostic-report uploads may be up to 20MB (SRS §3.4). Raise the request /
# file in-memory thresholds above that so large uploads are accepted (streamed
# to a temp file) instead of triggering a 413 / RequestDataTooBig.
DATA_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024


# =========================
# DEFAULT PRIMARY KEY
# =========================

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# =========================
# CLINIC DEFAULTS
# =========================

DEFAULT_CLINIC_NAME = os.getenv(
    "DEFAULT_CLINIC_NAME",
    "ThePetPhysioVet Clinic"
)

DEFAULT_CLINIC_ADDRESS = os.getenv(
    "DEFAULT_CLINIC_ADDRESS",
    ""
)


# =========================
# PAYMENTS — RAZORPAY (SRS §3.8)
# =========================
# Keys are read from env with EMPTY defaults — no credential is ever committed
# (CLAUDE.md rule 1). In dev/CI RAZORPAY_MOCK defaults truthy, so the payments
# code uses a deterministic in-process mock (razorpay_client.py) and needs no
# network and no real keys. Set RAZORPAY_MOCK=false + supply TEST keys to hit
# the real gateway. We store NO raw card data (PCI-DSS §4).
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
RAZORPAY_MOCK = os.getenv("RAZORPAY_MOCK", "true").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)


# =========================
# NOTIFICATIONS & REMINDERS (SRS §3.7, §7) — Sprint 5
# =========================
# Delivery channels sit behind a provider abstraction (appointments/delivery/).
# Provider classes are resolved by dotted path and default to the in-process dev
# MOCK, so the whole notification path is testable offline with no real keys and
# no network. NOTIFY_MOCK mirrors RAZORPAY_MOCK: truthy-by-default (fail-safe to
# mock). Real Twilio/MSG91 + FCM credentials are read from env with EMPTY
# defaults — no secret is ever committed (CLAUDE.md rule 1).
NOTIFY_SMS_PROVIDER = os.getenv(
    "NOTIFY_SMS_PROVIDER",
    "appointments.delivery.mock.MockSmsProvider",
)
NOTIFY_FCM_PROVIDER = os.getenv(
    "NOTIFY_FCM_PROVIDER",
    "appointments.delivery.mock.MockFcmProvider",
)
NOTIFY_MOCK = os.getenv("NOTIFY_MOCK", "true").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)

# Real SMS provider credentials (Twilio / MSG91) — EMPTY defaults.
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")
MSG91_AUTH_KEY = os.getenv("MSG91_AUTH_KEY", "")
MSG91_SENDER_ID = os.getenv("MSG91_SENDER_ID", "")

# Real FCM (web push) credentials — EMPTY defaults.
FCM_SERVER_KEY = os.getenv("FCM_SERVER_KEY", "")
FCM_PROJECT_ID = os.getenv("FCM_PROJECT_ID", "")

# Reminders fire 24h / 1h / 30min before an appointment, within a ±2 min window
# (PRODUCT_PLAN Phase 4). The cron-able `manage.py send_due_reminders` command
# reads these to decide which reminders are due.
REMINDER_OFFSETS = [
    datetime.timedelta(hours=24),
    datetime.timedelta(hours=1),
    datetime.timedelta(minutes=30),
]
REMINDER_WINDOW_SECONDS = 120


# =========================
# UI-PARITY MODE (test-only, no-op in production)
# =========================
# When running the Playwright parity check we pin "today" to a fixed date so the
# seeded dataset (manage.py seed_parity) and the React fixture render the same
# "today's visits". Both are OFF unless the env vars are set, so production and
# normal dev behaviour are completely unchanged.
#
# PARITY_TODAY : ISO date (e.g. 2026-07-22). When set, the dashboard uses this
#                as "today" instead of the real clock. Unset -> None (real date).
# PARITY_MODE  : truthy -> registers the parity-only /__parity__/shell/ route.
_parity_today_raw = os.getenv("PARITY_TODAY", "").strip()
try:
    PARITY_TODAY = datetime.date.fromisoformat(_parity_today_raw) if _parity_today_raw else None
except ValueError:
    PARITY_TODAY = None

PARITY_MODE = os.getenv("PARITY_MODE", "").strip().lower() in ("1", "true", "yes", "on")


# =========================
# PRODUCTION SECURITY
# =========================

if not DEBUG:
    # Force HTTPS (§4: HTTPS only). Default ON in prod now (was False). Behind the
    # OCI load balancer, trust its X-Forwarded-Proto so redirect detection is correct.
    SECURE_SSL_REDIRECT = os.getenv("SECURE_SSL_REDIRECT", "True").lower() == "true"
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

    # HSTS — 1 year, subdomains + preload (was unset).
    SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

    # Secure, HTTP-only cookies.
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True

    # Response-header hardening.
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = "same-origin"
    X_FRAME_OPTIONS = "DENY"

    CSRF_TRUSTED_ORIGINS = [
        origin.strip()
        for origin in os.getenv(
            "CSRF_TRUSTED_ORIGINS",
            ""
        ).split(",")
        if origin.strip()
    ]