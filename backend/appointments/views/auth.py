"""Sign in, sign up, sign out, refresh, profile, and password reset.

login_view calls authenticate() and 401s on failure -- it once skipped
password verification entirely and fell back to the first user of a role.
Both reset views set authentication_classes([]) deliberately: DRF applies
JWTAuthentication globally and SimpleJWT raises on an expired bearer token,
so without it the route 401'd exactly the locked-out users who needed it.

Split out of a single 1674-line views.py. Import from `appointments.views`
as before -- every public name is re-exported by the package.
"""

import hashlib
import secrets
from datetime import timedelta
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from ..models import (
    UserProfile, Pet, Appointment, DiagnosticReport,
    TreatmentPlan, ProgressNote, Invoice, LineItem, Payment, Package,
    Notification, NotificationPref, QueryThread, QueryMessage, QueryAttachment,
    PasswordResetToken, Enquiry,
)
from ..serializers import (
    UserProfileSerializer, SignupSerializer, PetSerializer, AppointmentSerializer,
    DiagnosticReportSerializer, TreatmentPlanSerializer, ProgressNoteSerializer,
    InvoiceSerializer, LineItemSerializer, PaymentSerializer, PackageSerializer,
    NotificationSerializer, NotificationPrefSerializer,
    QueryThreadSerializer, QueryMessageSerializer, QueryAttachmentSerializer,
    OwnerPetHistorySerializer, PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
    EnquiryCreateSerializer, EnquirySerializer,
)
from django.contrib.auth import authenticate

from ._shared import _client_ip, _first_error_detail, _rate_limited, problem

def _issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def current_user_view(request):
    return Response(UserProfileSerializer(request.user).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get("username")
    password = request.data.get("password")

    if not username or not password:
        return problem(400, "username and password are required.")

    # django.contrib.auth.authenticate() — the actual credential check.
    # No username-only lookup, no role-based fallback, no anonymous default.
    user = authenticate(request, username=username, password=password)
    if user is None:
        return problem(401, "Invalid credentials", "Incorrect username or password.")

    access, refresh = _issue_tokens(user)
    data = UserProfileSerializer(user).data
    data["access"] = access
    data["refresh"] = refresh
    return Response(data)


@api_view(["POST"])
@permission_classes([AllowAny])
def signup_view(request):
    serializer = SignupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()

    access, refresh = _issue_tokens(user)
    data = UserProfileSerializer(user).data
    data["access"] = access
    data["refresh"] = refresh
    return Response(data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    # The SPA (frontend/src/api/auth.ts) calls this with no body at all, so
    # a missing `refresh` is not an error — it just means there is nothing
    # to blacklist server-side. Logout still succeeds from the caller's
    # point of view either way.
    refresh_token = request.data.get("refresh")
    if refresh_token:
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            # Already invalid/expired/blacklisted — logout is still
            # successful from the caller's point of view.
            pass
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([AllowAny])
def refresh_view(request):
    """POST /auth/refresh — {refresh} -> {access, refresh} (API_CONTRACT.md
    §3, amendment 4, 2026-08-20). Deliberately AllowAny: the whole point is
    to mint a new access token once the old one has expired, so the caller
    cannot be expected to hold a currently-valid access token — but AllowAny
    at the permission layer never means unauthenticated token issuance: the
    refresh token itself is fully verified (signature, expiry, `token_type`
    claim, blacklist status) before anything is minted.

    Rotates: settings.py sets ROTATE_REFRESH_TOKENS/BLACKLIST_AFTER_ROTATION,
    which used to be dead configuration because this view minted an access
    token without touching the presented refresh token at all — leaving a
    stolen refresh token replayable for its full 7-day life. It now
    blacklists the presented token and mints a fresh one (same rotation
    sequence SimpleJWT's own TokenRefreshSerializer uses: blacklist under the
    old jti, then rotate jti/exp/iat and record the new token as
    outstanding) so a given refresh token is good for exactly one use.
    """
    refresh_token = request.data.get("refresh")
    if not refresh_token:
        return problem(400, "refresh token is required.")
    try:
        token = RefreshToken(refresh_token)
        access = str(token.access_token)
        token.blacklist()
        token.set_jti()
        token.set_exp()
        token.set_iat()
        token.outstand()
        new_refresh = str(token)
    except TokenError:
        return problem(401, "Invalid or expired refresh token.")
    return Response({"access": access, "refresh": new_refresh})


# Fixed-window rate limits (CLAUDE.md: "Redis is not deployed" — Django's
# default LocMemCache is enough for a single-process deployment; swap the
# CACHES backend for a shared one before running >1 web process). Two
# independent windows — per-email and per-IP — so neither a targeted attack
# on one address nor a spray across many addresses from one source can
# email-bomb this endpoint into the ground.
PASSWORD_RESET_WINDOW_SECONDS = 15 * 60


PASSWORD_RESET_EMAIL_LIMIT = 5


PASSWORD_RESET_IP_LIMIT = 20


def _issue_password_reset(user):
    """Create (and email) a fresh reset token for `user`, invalidating any
    earlier unused ones first — "requesting a second token invalidates the
    first" (task spec). Marking old rows `used_at` rather than deleting them
    keeps a full audit trail of every token ever issued.
    """
    now = timezone.now()
    PasswordResetToken.objects.filter(user=user, used_at__isnull=True).update(used_at=now)

    raw_token = secrets.token_urlsafe(32)
    # SHA-256, not bcrypt/PBKDF2 — see PasswordResetToken's docstring: the
    # raw value is 256 bits of CSPRNG entropy, not a human-chosen password,
    # so a slow hash defends against nothing and only costs CPU.
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    PasswordResetToken.objects.create(
        user=user, token_hash=token_hash, expires_at=now + timedelta(minutes=30),
    )

    reset_url = f"{settings.FRONTEND_BASE_URL}/reset-password?token={raw_token}"
    send_mail(
        subject="Reset your Pet Physio Vet password",
        message=(
            "We received a request to reset the password for your Pet Physio "
            "Vet account.\n\n"
            f"Reset your password (link valid for 30 minutes): {reset_url}\n\n"
            "If you did not request this, no action is needed — your password "
            "has not been changed."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


@api_view(["POST"])
# authentication_classes([]) is load-bearing, not tidiness. DRF applies
# JWTAuthentication globally, and SimpleJWT RAISES on an expired or malformed
# bearer token -- producing a 401 before AllowAny is ever consulted. A
# locked-out user is exactly the person most likely to still have a stale
# token in localStorage, so without this the password-reset route 401s the
# only people who need it. Verified: junk bearer -> 401, no header -> 400.
@authentication_classes([])
@permission_classes([AllowAny])
def password_reset_request_view(request):
    """POST /auth/password-reset/request — {email} -> 200 always.

    Deliberately returns the identical 200 body regardless of whether
    `email` belongs to an account: a different status/shape/body for a
    known vs unknown address is a user-enumeration oracle, and this app
    holds clinical records (API_CONTRACT.md §3).
    """
    serializer = PasswordResetRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return problem(400, "Invalid input", _first_error_detail(serializer.errors))
    email = serializer.validated_data["email"].strip().lower()

    generic_response = Response(
        {"detail": "If an account exists for that email, a password reset link has been sent."},
        status=status.HTTP_200_OK,
    )

    # Rate-limit BEFORE the DB lookup and on the raw email string / IP only
    # — never conditioned on whether the address actually matches a user,
    # so a 429 here leaks nothing about existence either.
    ip = _client_ip(request)
    if _rate_limited(f"pwreset:ip:{ip}", PASSWORD_RESET_IP_LIMIT, PASSWORD_RESET_WINDOW_SECONDS):
        return problem(429, "Too many requests", "Too many password reset requests. Try again later.")
    if _rate_limited(f"pwreset:email:{email}", PASSWORD_RESET_EMAIL_LIMIT, PASSWORD_RESET_WINDOW_SECONDS):
        return problem(429, "Too many requests", "Too many password reset requests. Try again later.")

    user = UserProfile.objects.filter(email__iexact=email, is_active=True).first()
    if user is not None:
        _issue_password_reset(user)

    return generic_response


@api_view(["POST"])
# authentication_classes([]) is load-bearing, not tidiness. DRF applies
# JWTAuthentication globally, and SimpleJWT RAISES on an expired or malformed
# bearer token -- producing a 401 before AllowAny is ever consulted. A
# locked-out user is exactly the person most likely to still have a stale
# token in localStorage, so without this the password-reset route 401s the
# only people who need it. Verified: junk bearer -> 401, no header -> 400.
@authentication_classes([])
@permission_classes([AllowAny])
def password_reset_confirm_view(request):
    """POST /auth/password-reset/confirm — {token, new_password} -> 200.

    400 (RFC-7807, real `detail`) on invalid input, an invalid/garbage
    token, an expired token, or an already-used token — same generic detail
    for all three token failure modes so the response itself never signals
    which one occurred.
    """
    serializer = PasswordResetConfirmSerializer(data=request.data)
    if not serializer.is_valid():
        return problem(400, "Invalid input", _first_error_detail(serializer.errors))

    raw_token = serializer.validated_data["token"]
    new_password = serializer.validated_data["new_password"]
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    invalid_detail = "This password reset link is invalid or has expired."
    try:
        # Looked up by hash, not iterated — see PasswordResetToken's
        # docstring for why this is also the "constant time" comparison
        # the task calls for: the app never compares the raw token to
        # anything itself, only an indexed hash-equality lookup.
        reset_token = PasswordResetToken.objects.select_related("user").get(token_hash=token_hash)
    except PasswordResetToken.DoesNotExist:
        return problem(400, "Invalid token", invalid_detail)

    now = timezone.now()
    if reset_token.used_at is not None or reset_token.expires_at <= now:
        return problem(400, "Invalid token", invalid_detail)

    user = reset_token.user
    user.set_password(new_password)
    user.save(update_fields=["password"])

    reset_token.used_at = now
    reset_token.save(update_fields=["used_at"])

    # A password reset must end sessions an attacker may hold — blacklist
    # every outstanding refresh token for this user (same blacklist path
    # /auth/logout already uses).
    for outstanding in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=outstanding)

    return Response({"detail": "Password has been reset successfully."}, status=status.HTTP_200_OK)


@api_view(["PATCH", "PUT"])
@permission_classes([IsAuthenticated])
def update_profile_view(request):
    serializer = UserProfileSerializer(request.user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)
