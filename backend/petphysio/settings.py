import os
from pathlib import Path
from datetime import timedelta

import dj_database_url
import warnings

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def _env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _env_list(name, default=()):
    value = os.environ.get(name)
    if not value:
        return list(default)
    return [item.strip() for item in value.split(",") if item.strip()]


# --- Config (API_CONTRACT.md §5, CLAUDE.md rule 1) --------------------------
# SECRET_KEY, DEBUG, ALLOWED_HOSTS, CORS_ALLOWED_ORIGINS, DATABASE_URL all come
# from the environment. DEBUG defaults to False. There is no baked-in secret
# fallback: if DEBUG is False and SECRET_KEY is unset, fail fast.

DEBUG = _env_bool("DEBUG", default=False)

SECRET_KEY = os.environ.get("SECRET_KEY", "")
if not SECRET_KEY:
    if DEBUG:
        # Convenience only for local dev with DEBUG=true — never used in
        # anything resembling production because DEBUG=False always requires
        # a real, explicit SECRET_KEY (see the raise below).
        SECRET_KEY = "django-insecure-local-dev-only-do-not-deploy"
    else:
        raise ImproperlyConfigured(
            "SECRET_KEY environment variable is required when DEBUG is not set "
            "(i.e. in any non-local environment). Set it via OCI Vault / env, "
            "never bake it into source."
        )

ALLOWED_HOSTS = _env_list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"] if DEBUG else [])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party apps
    "rest_framework",
    "corsheaders",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    # Local apps
    "appointments.apps.AppointmentsConfig",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # WhiteNoise serves collected static files directly from the WSGI app
    # (admin CSS/JS, DRF browsable-API assets) so the container needs no
    # separate static-file host. Must sit directly after SecurityMiddleware
    # per WhiteNoise's own install docs (it wraps the response before any
    # other middleware can touch it).
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "petphysio.urls"

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
            ],
        },
    },
]

WSGI_APPLICATION = "petphysio.wsgi.application"

# DATABASE_URL, e.g. postgres://user:pass@host:5432/dbname. Falls back to the
# local sqlite file only for local dev convenience (not a secret).
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{BASE_DIR / 'db.sqlite3'}")
DATABASES = {
    "default": dj_database_url.parse(DATABASE_URL, conn_max_age=600)
}

AUTH_USER_MODEL = "appointments.UserProfile"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# bcrypt (cost >= 12) first — CLAUDE.md rule "JWT: ... bcrypt cost >= 12 for
# passwords." BCryptSHA256PasswordHasher pre-hashes with SHA256 before bcrypt
# to avoid bcrypt's 72-byte password truncation, and rounds default to 12.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
# Collected by `collectstatic` at deploy time (Dockerfile entrypoint) into a
# location WhiteNoise serves from. Not used in local dev (runserver serves
# static files itself when DEBUG=True and nothing has run collectstatic).
STATIC_ROOT = BASE_DIR / "staticfiles"

# --- Single-container deployment (SPA served by Django) -------------------
#
# The normal topology is two containers: nginx serves the built React bundle
# and proxies /api to gunicorn (see frontend/nginx.conf). Some hosts —
# Hugging Face Spaces, Fly machines, anything that runs exactly one process —
# cannot do that, so Django optionally serves the SPA and media itself.
#
# Off by default: turning it on unconditionally would mean the nginx
# deployment has two things serving the same files, and Django serving media
# in production is precisely what petphysio/urls.py documents as belonging in
# the proxy layer. This is an explicit deployment choice, not a fallback.
SERVE_SPA = _env_bool("SERVE_SPA", default=False)

# Where the built bundle lands in the image. `index.html` is served by the
# catch-all in urls.py; everything beside it is collected into STATIC_ROOT and
# served by WhiteNoise with hashed filenames and long cache headers.
SPA_DIST_DIR = Path(os.environ.get("SPA_DIST_DIR", BASE_DIR / "spa"))

if SERVE_SPA and SPA_DIST_DIR.is_dir():
    STATICFILES_DIRS = [SPA_DIST_DIR]
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# Compressed + hashed filenames (cache-busting) with a manifest, gzip/br
# pre-compression, and long-lived cache headers — the standard WhiteNoise
# production storage backend. `default` (media/uploads) storage is left as
# the plain filesystem backend; media is never served by Django in
# production (see petphysio/urls.py) so it doesn't need cache-busting here.
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        # Manifest storage hashes filenames and REQUIRES a manifest produced by
        # `collectstatic`; any {% static %} lookup with no manifest entry raises,
        # which takes the Django admin down with it. Platforms that cannot run
        # collectstatic during the build — serverless runtimes, where the build
        # step only compiles the frontend — set STATIC_MANIFEST=false and get
        # the same compression without the hashed-filename manifest.
        "BACKEND": (
            "whitenoise.storage.CompressedManifestStaticFilesStorage"
            if _env_bool("STATIC_MANIFEST", default=True)
            else "whitenoise.storage.CompressedStaticFilesStorage"
        ),
    },
}

# Every model in `appointments` now declares an explicit UUID primary key
# (`id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)`)
# per the target-architecture LLD (opaque, non-enumerable ids; safe cross-
# service references once the service split happens). DEFAULT_AUTO_FIELD is
# left as BigAutoField — Django has no built-in "UUID auto field" class for
# this setting, and it is inert here anyway: it only supplies a PK for a
# model that doesn't declare one, and every model in this project now does.
# It still governs any future model that omits an explicit `id` (and any
# third-party app that relies on the default, e.g. django.contrib.admin's
# own models keep their own BigAutoField ids — this project owns and
# UUID-keys only its own `appointments` schema, never another app's).
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Password reset email/link config (API_CONTRACT.md §3 Auth) ------------
# No SMTP provider exists yet and none is invented here. Locally
# (DEBUG=true) the reset email is printed to the runserver console via
# Django's console backend. In any non-DEBUG environment a real
# EMAIL_BACKEND/DEFAULT_FROM_EMAIL must be supplied via env — same
# fail-fast posture as SECRET_KEY above (CLAUDE.md rule 1): a silently
# no-op or misconfigured mailer would look like "reset email sent" while
# never reaching the user.
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "")
if not EMAIL_BACKEND:
    if DEBUG:
        EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
    else:
        raise ImproperlyConfigured(
            "EMAIL_BACKEND environment variable is required when DEBUG is not "
            "set (i.e. in any non-local environment)."
        )

# SMTP connection details. Django's defaults are localhost:25 with no auth,
# so setting EMAIL_BACKEND to the SMTP backend without these silently fails to
# deliver — the request still returns 200 (deliberately, to avoid leaking
# whether an account exists) so nobody notices until a user reports they never
# got their reset link. Only required when actually using the SMTP backend.
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = _env_bool("EMAIL_USE_TLS", default=True)
EMAIL_TIMEOUT = int(os.environ.get("EMAIL_TIMEOUT", "10"))

if EMAIL_BACKEND.endswith("smtp.EmailBackend") and not EMAIL_HOST:
    raise ImproperlyConfigured(
        "EMAIL_BACKEND is set to the SMTP backend but EMAIL_HOST is empty. "
        "Django would fall back to localhost:25 and silently drop every "
        "password-reset email, while the API still returns 200."
    )

DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "")
if not DEFAULT_FROM_EMAIL:
    if DEBUG:
        DEFAULT_FROM_EMAIL = "noreply@petphysiovet.local"
    else:
        raise ImproperlyConfigured(
            "DEFAULT_FROM_EMAIL environment variable is required when DEBUG is "
            "not set (i.e. in any non-local environment)."
        )

# Base URL of the React SPA — password reset links point at
# `{FRONTEND_BASE_URL}/reset-password?token=...`. Required in any
# non-DEBUG environment for the same reason as EMAIL_BACKEND above: a wrong
# or missing value would silently email working-looking links that 404.
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "")
if not FRONTEND_BASE_URL:
    if DEBUG:
        FRONTEND_BASE_URL = "http://localhost:5173"
    else:
        raise ImproperlyConfigured(
            "FRONTEND_BASE_URL environment variable is required when DEBUG is "
            "not set (i.e. in any non-local environment)."
        )

# --- Cache ---------------------------------------------------------------
#
# There was no CACHES setting at all, so Django fell back to LocMemCache —
# which is PER PROCESS. The Dockerfile runs `gunicorn --workers 3`, so the
# password-reset rate limit of "5 per email per 15 minutes" was really up to
# 15, depending which worker a request happened to land on, and reset on every
# restart. A security control that silently degrades under the deployment's
# own default worker count is not a control.
#
# The fix is a shared cache, chosen by environment rather than assumed:
#   REDIS_URL set  -> Redis (preferred; also what the target architecture uses)
#   otherwise      -> the database, which every deployment already has
#   DEBUG          -> local memory, since there is only one process
#
# DatabaseCache needs its table created; `docker/entrypoint.sh` runs
# `createcachetable` (idempotent) before gunicorn binds.
REDIS_URL = os.environ.get("REDIS_URL", "")

if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
        }
    }
elif DEBUG:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.db.DatabaseCache",
            "LOCATION": "django_cache",
        }
    }

# Belt and braces: if anything ever reintroduces a per-process or no-op cache
# in a deployed environment, fail at boot rather than degrade a rate limiter
# into decoration. This is the check that would have caught the original bug.
_UNSHARED_CACHE_BACKENDS = (
    "django.core.cache.backends.locmem.LocMemCache",
    "django.core.cache.backends.dummy.DummyCache",
)
if not DEBUG and CACHES["default"]["BACKEND"] in _UNSHARED_CACHE_BACKENDS:
    raise ImproperlyConfigured(
        "The configured cache backend is per-process, but this deployment runs "
        "multiple worker processes. Rate limiting and idempotency guards would "
        "silently stop working. Set REDIS_URL, or leave it unset to use the "
        "database-backed cache."
    )

# --- CORS --------------------------------------------------------------
# CORS_ALLOW_ALL_ORIGINS is intentionally removed. Dev origins (e.g. the Vite
# dev server) must be listed explicitly via the CORS_ALLOWED_ORIGINS env var.
CORS_ALLOWED_ORIGINS = _env_list(
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:5173", "http://127.0.0.1:5173"] if DEBUG else [],
)
CORS_ALLOW_CREDENTIALS = True

# Django REST Framework Settings
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    # Every error leaves this API as RFC-7807 problem+json with a human
    # `detail` — see petphysio/exceptions.py. Without it, DRF validation
    # failures carry no `detail` at all and the SPA renders the literal words
    # "Bad Request", and 404s leak Django's "No Pet matches the given query."
    "EXCEPTION_HANDLER": "petphysio.exceptions.rfc7807_exception_handler",
}

# SimpleJWT Settings — short-lived access token + rotating refresh tokens with
# blacklisting of used/expired refresh tokens (CLAUDE.md: "JWT: short-lived
# access + rotating refresh").
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=45),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# --- Production security headers (API_CONTRACT.md §5, added after QA -------
# round 1; AMENDED 2026-08-20 after a Tech Lead review caught a deploy
# blocker). These used to key off `not DEBUG`, which is wrong for this app's
# actual deploy target: a TLS-terminating reverse proxy (Coolify's Traefik
# -> this container's nginx -> gunicorn) in front of the Django process, and
# — at least initially — a bare IP with no domain/certificate at all.
#
# `request.is_secure()` is always False from Django's point of view unless
# it's told to trust a forwarded-proto header, so `SECURE_SSL_REDIRECT=True`
# behind a proxy that doesn't set that header causes an infinite redirect
# loop; on a bare IP with no TLS anywhere, it's worse — it 301s every
# request to an `https://` URL that doesn't exist and bricks the app. So:
#
# 1. SECURE_PROXY_SSL_HEADER tells Django to trust the proxy's
#    `X-Forwarded-Proto` header (set by Traefik, preserved through nginx —
#    see frontend/nginx.conf) instead of the raw (always-plain-HTTP-from-
#    Django's-perspective) connection.
# 2. CSRF_TRUSTED_ORIGINS is read from env — required once requests arrive
#    over HTTPS from the proxy's perspective (e.g. the Django admin login),
#    otherwise Django's CSRF check rejects them.
# 3. HTTPS is ON BY DEFAULT in any non-DEBUG environment, and turning it off
#    is a single explicitly named decision: ALLOW_INSECURE_HTTP=true.
#
#    These used to be three independent booleans defaulting to False. Two
#    problems with that, both real:
#
#      * Insecure was the default. Deploying correctly required remembering to
#        set three variables; deploying a clinic's patient records in plaintext
#        required remembering nothing. The safe path must be the default path.
#      * They can disagree. Setting SESSION_COOKIE_SECURE without
#        SECURE_SSL_REDIRECT makes the browser drop the session cookie over
#        plain HTTP, so login fails with no error anyone can see. Three flags
#        that must be set consistently are one flag wearing a disguise.
#
#    They are now derived from one switch, so they cannot contradict each
#    other, and the bare-IP deployment stays possible — it just has to say so.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

CSRF_TRUSTED_ORIGINS = _env_list("CSRF_TRUSTED_ORIGINS", default=[])

# Opting out of TLS. Only meaningful before a domain and certificate exist;
# on that deployment every password, phone number and clinical note crosses
# the network in the clear, so it is deliberately awkward to ask for.
ALLOW_INSECURE_HTTP = _env_bool("ALLOW_INSECURE_HTTP", default=False)

_HTTPS_ENFORCED = not DEBUG and not ALLOW_INSECURE_HTTP

SECURE_SSL_REDIRECT = _HTTPS_ENFORCED
SESSION_COOKIE_SECURE = _HTTPS_ENFORCED
CSRF_COOKIE_SECURE = _HTTPS_ENFORCED

if not DEBUG and ALLOW_INSECURE_HTTP:
    # Loud, once, at boot — so an "until we get the domain" decision cannot
    # quietly become the permanent configuration nobody remembers making.
    warnings.warn(
        "ALLOW_INSECURE_HTTP is set: this deployment serves plain HTTP. "
        "Credentials and patient data are transmitted unencrypted. Remove this "
        "variable as soon as a domain and certificate are in place.",
        RuntimeWarning,
        stacklevel=2,
    )

# HSTS only makes sense paired with an always-on SSL redirect (telling
# browsers to *only* ever speak HTTPS to this host is actively harmful on a
# bare-IP/no-cert deployment), so it rides on the same flag rather than its
# own.
if SECURE_SSL_REDIRECT:
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
else:
    SECURE_HSTS_SECONDS = 0
    SECURE_HSTS_INCLUDE_SUBDOMAINS = False
    SECURE_HSTS_PRELOAD = False
