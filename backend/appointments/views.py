"""API views for the Pet Physio Vet backend.

Implements API_CONTRACT.md §3 exactly: doctor-facing routes (top level) and
owner-portal routes (`/owner/*`). See §4 for the authZ rules enforced here:

- Default permission is IsAuthenticated; AllowAny only on /auth/login and
  /auth/signup.
- Doctor routes require role == DOCTOR (`IsDoctor`).
- Owner routes require role == OWNER (`IsOwner`) *and* re-verify object
  ownership in the view via `IsObjectOwner` (raises 404, never 403, so a
  cross-owner request can't be used to probe for existence).
- No anonymous fallback user anywhere.
"""

import hashlib
import re
import secrets
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from urllib.parse import quote

from django.conf import settings
from django.core.cache import cache
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.db.models import Max, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    UserProfile, Pet, Appointment, DiagnosticReport,
    TreatmentPlan, ProgressNote, Invoice, LineItem, Payment, Package,
    Notification, NotificationPref, QueryThread, QueryMessage, QueryAttachment,
    PasswordResetToken,
)
from .permissions import IsDoctor, IsOwner, IsObjectOwner
from .serializers import (
    UserProfileSerializer, SignupSerializer, PetSerializer, AppointmentSerializer,
    DiagnosticReportSerializer, TreatmentPlanSerializer, ProgressNoteSerializer,
    InvoiceSerializer, LineItemSerializer, PaymentSerializer, PackageSerializer,
    NotificationSerializer, NotificationPrefSerializer,
    QueryThreadSerializer, QueryMessageSerializer, QueryAttachmentSerializer,
    OwnerPetHistorySerializer, PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
)

from django.contrib.auth import authenticate


MAX_QUERY_ATTACHMENTS = 5


def problem(status_code, title, detail=None):
    """A minimal RFC-7807 problem-details body for hand-rolled errors.

    (Serializer validation errors still go through DRF's default exception
    handler, which is configured in settings.py — out of scope for this
    file's ownership.)

    Known-issue #12: `detail` used to be omitted whenever the caller didn't
    pass one explicitly. `frontend/src/lib/http.ts` reads
    `detail || message || statusText`, so every hand-rolled 400 without an
    explicit detail rendered as a bare "Bad Request". `detail` now always
    falls back to `title` so the SPA always has something real to show.
    """
    body = {"type": "about:blank", "title": title, "status": status_code, "detail": detail or title}
    return Response(body, status=status_code)


def _first_error_detail(errors):
    """Flatten a DRF serializer `.errors` dict into one human-readable
    string for a `problem()` `detail` — see `problem()`'s docstring:
    without this, a serializer-validation 400 has no `detail` key at all
    and the SPA falls through to the literal words "Bad Request".
    """
    for field, msgs in errors.items():
        first = msgs[0] if isinstance(msgs, (list, tuple)) and msgs else msgs
        return f"{field}: {first}"
    return "Invalid input."


def _issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


def _doctor_scoped(model, request, lookup="doctor"):
    """Doctor object-level scoping (CLAUDE.md rule 4 / API_CONTRACT.md §4.6).

    A row whose `lookup` FK resolves to a DIFFERENT doctor must never be
    reachable at all — not just hidden from list endpoints. This is used as
    the base queryset for BOTH `GET`-many views and `get_object_or_404` on
    single-object routes, so list and detail scoping can never drift apart
    again (that drift is exactly how the first L1 pass left every
    detail/action route reachable by ID while the list endpoints were
    fixed — a second doctor could read/reschedule/complete/invoice another
    practice's patient by guessing or enumerating IDs).

    Rows where `lookup` is NULL are a CLAIMABLE POOL: visible to ANY doctor,
    not hidden from all of them. A brand-new owner's first pet has
    `doctor = null` until a doctor's practice can be inferred (see
    `owner_pets_view`), and nothing else in this codebase lets a doctor
    claim a patient after the fact — treating NULL as "nobody's" would make
    that pet (and anything hanging off it: appointments, diagnostic
    reports, treatment plans, invoices) permanently unreachable by any
    doctor. This mirrors the "doctor-visible to all, never owner-visible"
    posture already used for orphan (`pet=null`) invoices.

    `lookup` is a Django `__`-lookup path to the doctor FK: `"doctor"` for
    models with a direct FK (Pet, Appointment), `"pet__doctor"` for models
    reached only through their pet (DiagnosticReport, TreatmentPlan,
    Invoice — Invoice.pet is itself nullable, and `pet__doctor__isnull=True`
    correctly matches both "pet has no doctor" and "no pet at all" through
    the same LEFT OUTER JOIN), `"invoice__pet__doctor"` for Payment.
    """
    return model.objects.filter(
        Q(**{lookup: request.user}) | Q(**{f"{lookup}__isnull": True})
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

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


# --- Password reset ---------------------------------------------------------
#
# API_CONTRACT.md §3 Auth / §4.1 (amended): AllowAny on exactly five routes
# now — /auth/login, /auth/signup, /auth/refresh, and these two — all for the
# same underlying reason as /auth/refresh: the caller is, by construction,
# not holding a valid access token yet. Neither view ever mints a session
# token itself; `confirm` only ever changes a password and ends existing
# sessions.

# Fixed-window rate limits (CLAUDE.md: "Redis is not deployed" — Django's
# default LocMemCache is enough for a single-process deployment; swap the
# CACHES backend for a shared one before running >1 web process). Two
# independent windows — per-email and per-IP — so neither a targeted attack
# on one address nor a spray across many addresses from one source can
# email-bomb this endpoint into the ground.
PASSWORD_RESET_WINDOW_SECONDS = 15 * 60
PASSWORD_RESET_EMAIL_LIMIT = 5
PASSWORD_RESET_IP_LIMIT = 20


def _rate_limited(key, limit, window_seconds):
    """Fixed-window counter. Returns True once `limit` requests have
    already landed for `key` within the current window (and leaves the
    counter alone past that point, i.e. never resets early from being
    hammered).
    """
    try:
        count = cache.incr(key)
    except ValueError:
        # First request in a fresh window — cache.incr() raises ValueError
        # when the key doesn't exist yet (rather than starting at 0).
        cache.set(key, 1, timeout=window_seconds)
        return False
    return count > limit


def _client_ip(request):
    return request.META.get("REMOTE_ADDR") or "unknown"


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


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDoctor])
def dashboard_stats_view(request):
    today = timezone.localdate()

    todays_appts = Appointment.objects.filter(doctor=request.user, date=today).order_by("time")
    today_appointments = []
    for appt in todays_appts:
        pet_type = (appt.pet.pet_type or appt.pet.species) if appt.pet_id else ""
        today_appointments.append({
            "id": appt.id,
            "pet_name": appt.pet_name,
            "owner_name": appt.owner_name,
            "time": appt.time.strftime("%H:%M"),
            "pet_type": pet_type,
            "visit_type": appt.visit_type,
            "visit_type_display": appt.visit_type_display,
            "status": appt.status,
        })

    completed_count = todays_appts.filter(status="Completed").count()
    active_treatments = TreatmentPlan.objects.filter(status="ACTIVE").count()

    # L1 fix: today's visits already filtered by `doctor=request.user` above,
    # but the money tiles summed every invoice/payment in the clinic — an
    # inconsistency within this same view. Scoped the same way as
    # invoices_view/revenue_view via `_doctor_scoped` (see its docstring for
    # the NULL-doctor "claimable pool" posture).
    doctor_invoices = _doctor_scoped(Invoice, request, lookup="pet__doctor")
    doctor_payments = _doctor_scoped(Payment, request, lookup="invoice__pet__doctor")

    pending_payments = sum(
        (inv.balance_due for inv in doctor_invoices if inv.payment_status != "PAID"),
        Decimal("0.00"),
    )

    month_start = today.replace(day=1)
    today_revenue = sum(
        (p.amount_paid for p in doctor_payments.filter(
            status="SUCCESS", paid_at__date=today,
        )),
        Decimal("0.00"),
    )
    monthly_revenue = sum(
        (p.amount_paid for p in doctor_payments.filter(
            status="SUCCESS",
            paid_at__date__gte=month_start, paid_at__date__lte=today,
        )),
        Decimal("0.00"),
    )

    return Response({
        "today": today.isoformat(),
        "today_display": today.strftime("%A, %d %B %Y"),
        "today_appointments": today_appointments,
        "completed_count": completed_count,
        "active_treatments": active_treatments,
        "pending_payments": float(pending_payments),
        "today_revenue": float(today_revenue),
        "monthly_revenue": float(monthly_revenue),
        "currency": "INR",
    })


# ---------------------------------------------------------------------------
# Pets (doctor-facing)
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def pets_view(request):
    if request.method == "GET":
        # L1 fix (2026-08-21): this used to return every pet in the clinic
        # regardless of who was asking. Seed data is single-doctor, so this
        # was invisible until a second doctor existed — then it leaked every
        # other doctor's patients. Scoped via `_doctor_scoped` (see its
        # docstring for the NULL-doctor "claimable pool" posture).
        q = request.query_params.get("q", "").strip()
        pets = _doctor_scoped(Pet, request).select_related("doctor").order_by("-created_at")
        if q:
            pets = pets.filter(
                Q(name__icontains=q) | Q(breed__icontains=q) |
                Q(owner_name__icontains=q) | Q(owner_phone__icontains=q)
            )
        return Response(PetSerializer(pets, many=True, context={"request": request}).data)

    serializer = PetSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    # `doctor` is not a serializer field (client cannot set it), so assign it
    # explicitly. The caller is guaranteed DOCTOR role by IsDoctor above, so
    # attributing the pet to the creating doctor is unambiguous.
    pet = serializer.save(doctor=request.user)
    # B4 fix: a doctor-created pet never had `owner` set, so it never
    # appeared in that pet owner's portal (`GET /owner/pets`) even when the
    # doctor entered the owner's exact phone number. Link it now when the
    # entered `owner_phone` unambiguously matches exactly one OWNER account.
    # `UserProfile.phone` is not unique, so 0 or >1 matches are left NULL
    # rather than guessed.
    if pet.owner_phone:
        matches = list(UserProfile.objects.filter(role="OWNER", phone=pet.owner_phone)[:2])
        if len(matches) == 1:
            pet.owner = matches[0]
            pet.save(update_fields=["owner"])
    photo = request.FILES.get("photo")
    if photo:
        pet.photo = photo
        pet.save()
    return Response(
        PetSerializer(pet, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated, IsDoctor])
def pet_detail_view(request, pk):
    # Follow-up L1 fix (2026-08-21): this detail route was left reachable by
    # ID for any doctor even after the list endpoint was scoped — see
    # `_doctor_scoped`.
    pet = get_object_or_404(_doctor_scoped(Pet, request), pk=pk)
    if request.method == "GET":
        return Response(PetSerializer(pet, context={"request": request}).data)

    serializer = PetSerializer(pet, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    pet = serializer.save()
    photo = request.FILES.get("photo")
    if photo:
        pet.photo = photo
        pet.save()
    return Response(PetSerializer(pet, context={"request": request}).data)


# ---------------------------------------------------------------------------
# Diagnostic reports (doctor-facing)
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def pet_diagnoses_view(request, pk):
    # Follow-up L1 fix (2026-08-21) — see `_doctor_scoped`.
    pet = get_object_or_404(_doctor_scoped(Pet, request), pk=pk)
    if request.method == "GET":
        reports = pet.diagnostic_reports.all()
        return Response(
            DiagnosticReportSerializer(reports, many=True, context={"request": request}).data
        )

    serializer = DiagnosticReportSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    report = serializer.save(pet=pet)
    return Response(
        DiagnosticReportSerializer(report, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated, IsDoctor])
def diagnostic_report_detail_view(request, pk):
    # Follow-up L1 fix (2026-08-21): reached only via its pet — see
    # `_doctor_scoped`.
    report = get_object_or_404(
        _doctor_scoped(DiagnosticReport, request, lookup="pet__doctor"), pk=pk,
    )
    report.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Treatment plans (doctor-facing)
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def pet_treatment_plans_view(request, pk):
    # Follow-up L1 fix (2026-08-21) — see `_doctor_scoped`.
    pet = get_object_or_404(_doctor_scoped(Pet, request), pk=pk)
    if request.method == "GET":
        plans = pet.treatment_plans.all()
        return Response(TreatmentPlanSerializer(plans, many=True).data)

    serializer = TreatmentPlanSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    plan = serializer.save(pet=pet)
    return Response(TreatmentPlanSerializer(plan).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDoctor])
def treatment_plan_detail_view(request, pk):
    # Follow-up L1 fix (2026-08-21): reached only via its pet — see
    # `_doctor_scoped`.
    plan = get_object_or_404(
        _doctor_scoped(TreatmentPlan, request, lookup="pet__doctor"), pk=pk,
    )
    return Response(TreatmentPlanSerializer(plan).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def treatment_plan_progress_notes_view(request, pk):
    # Follow-up L1 fix (2026-08-21) — see `_doctor_scoped`.
    plan = get_object_or_404(
        _doctor_scoped(TreatmentPlan, request, lookup="pet__doctor"), pk=pk,
    )
    data = dict(request.data)
    # dict(QueryDict) turns list-valued items into single-item lists; flatten.
    data = {k: (v[0] if isinstance(v, list) and len(v) == 1 else v) for k, v in data.items()}
    if not data.get("session_no"):
        data["session_no"] = plan.progress_notes.count() + 1

    serializer = ProgressNoteSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    note = serializer.save(plan=plan)
    return Response(ProgressNoteSerializer(note).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Appointments (doctor-facing)
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def appointments_view(request):
    if request.method == "GET":
        # L1 fix: scoped to the requesting doctor (was every appointment in
        # the clinic, leaking across doctors in a multi-doctor practice).
        # See `_doctor_scoped` for the NULL-doctor "claimable pool" posture.
        # select_related("pet"): AppointmentSerializer's `species`/`pet_type`
        # fields are derived from the linked Pet — without this, serializing
        # N appointments issues N extra queries. See
        # AppointmentListQueryCountTests in test_contract.py.
        appts = _doctor_scoped(Appointment, request).select_related("pet").order_by("date", "time")
        pet_id = request.query_params.get("pet")
        owner = request.query_params.get("owner")
        date = request.query_params.get("date")
        if pet_id:
            appts = appts.filter(pet_id=pet_id)
        if owner:
            appts = appts.filter(Q(owner_name__icontains=owner) | Q(owner_phone__icontains=owner))
        if date:
            appts = appts.filter(date=date)
        return Response(AppointmentSerializer(appts, many=True).data)

    serializer = AppointmentSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    appt = serializer.save(doctor=request.user)
    return Response(AppointmentSerializer(appt).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDoctor])
def appointment_detail_view(request, pk):
    # Follow-up L1 fix (2026-08-21) — see `_doctor_scoped`.
    appt = get_object_or_404(_doctor_scoped(Appointment, request), pk=pk)
    return Response(AppointmentSerializer(appt).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def appointment_reschedule_view(request, pk):
    """B3 fix (2026-08-21): this route is doctor-only, so a POST here is
    always the doctor directly moving the appointment — it must actually
    reschedule, not enqueue a request. It previously only recorded
    `requested_date`/`requested_time` and flipped `status` to
    "Reschedule Requested", which is the OWNER-facing pending-approval
    state; the doctor then had to approve their own edit from
    `/appointments/:id/reschedule-approve` — a queue explicitly for
    requests *from* pet owners. Now it moves `date`/`time` directly and
    clears any stale pending-request fields. The owner's own request flow
    (`owner_appointment_reschedule_request_view`) is unchanged.

    Follow-up L1 fix (2026-08-21): scoped via `_doctor_scoped` — this was
    left reachable by ID for any doctor even after the list endpoint was
    scoped, which is worse than being uniformly unscoped: a second doctor
    could actually reschedule another practice's appointment by ID.
    """
    appt = get_object_or_404(_doctor_scoped(Appointment, request), pk=pk)
    date = request.data.get("date")
    time = request.data.get("time")
    if not date or not time:
        return problem(400, "date and time are required.")

    appt.date = date
    appt.time = time
    appt.requested_date = None
    appt.requested_time = None
    appt.status = "Rescheduled"
    appt.save()
    return Response(AppointmentSerializer(appt).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def appointment_complete_view(request, pk):
    # Follow-up L1 fix (2026-08-21) — see `_doctor_scoped`.
    appt = get_object_or_404(_doctor_scoped(Appointment, request), pk=pk)
    appt.status = "Completed"
    appt.save()
    return Response(AppointmentSerializer(appt).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def appointment_confirm_view(request, pk):
    """G1 (new feature): owner-created bookings start life as `Pending` with
    no route to move them forward, so they stayed Pending forever. Scoped via
    `_doctor_scoped` — a mismatch 404s rather than 403ing, consistent with
    this codebase's "existence must not leak" posture (API_CONTRACT.md
    §4.3), even though this is a doctor route rather than an owner one. A
    `Pending` appointment created for a not-yet-claimed pet inherits that
    pet's `doctor = null` (see `owner_appointments_view`), so it must stay in
    the claimable pool here too — otherwise it could never be confirmed by
    anyone.
    """
    appt = get_object_or_404(_doctor_scoped(Appointment, request), pk=pk)
    if appt.status != "Pending":
        return problem(
            400,
            "Only a Pending appointment can be confirmed.",
            f"Appointment {appt.id} has status '{appt.status}', not 'Pending'.",
        )
    appt.status = "Confirmed"
    appt.save()
    return Response(AppointmentSerializer(appt).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def appointment_reschedule_approve_view(request, pk):
    # Follow-up L1 fix (2026-08-21) — see `_doctor_scoped`.
    appt = get_object_or_404(_doctor_scoped(Appointment, request), pk=pk)
    if appt.requested_date:
        appt.date = appt.requested_date
    if appt.requested_time:
        appt.time = appt.requested_time
    appt.requested_date = None
    appt.requested_time = None
    appt.reschedule_reason = ""
    appt.status = "Confirmed"
    appt.save()
    return Response(AppointmentSerializer(appt).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def appointment_reschedule_reject_view(request, pk):
    # D8 fix: `reschedule_reason` used to be wiped here, destroying the only
    # record of what the owner had asked for. It is preserved as a record of
    # the declined request; only the pending date/time fields are cleared.
    # Follow-up L1 fix (2026-08-21) — see `_doctor_scoped`.
    appt = get_object_or_404(_doctor_scoped(Appointment, request), pk=pk)
    appt.requested_date = None
    appt.requested_time = None
    appt.status = "Confirmed"
    appt.save()
    return Response(AppointmentSerializer(appt).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDoctor])
def appointment_share_view(request, pk):
    # Follow-up L1 fix (2026-08-21) — see `_doctor_scoped`.
    appt = get_object_or_404(_doctor_scoped(Appointment, request), pk=pk)
    message = (
        f"Hi {appt.owner_name}, this is a reminder for {appt.pet_name}'s appointment "
        f"on {appt.date.strftime('%d %b %Y')} at {appt.time.strftime('%I:%M %p')}."
    )
    digits = re.sub(r"\D", "", appt.owner_phone or "")
    whatsapp_url = f"https://wa.me/{digits}?text={quote(message)}"
    sms_url = f"sms:{appt.owner_phone}?body={quote(message)}"
    return Response({
        "whatsapp_url": whatsapp_url,
        "sms_url": sms_url,
        "pet_name": appt.pet_name,
        "owner_name": appt.owner_name,
        "owner_phone": appt.owner_phone,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def appointment_options_view(request):
    """B1/B2 fix: the actual root cause of every 400 on booking was three
    frontend forms each hardcoding their own vocabulary for `visit_type`.
    Exposing the canonical list here means the frontend never has to
    hardcode (or drift from) it again. Open to both roles — doctors and
    owners both book appointments.
    """
    return Response({
        "visit_types": [
            {"value": value, "label": label} for value, label in Appointment.VISIT_TYPES
        ],
    })


# ---------------------------------------------------------------------------
# Billing (doctor-facing)
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def invoices_view(request):
    if request.method == "GET":
        # L1 fix: scoped to the requesting doctor via the invoice's pet —
        # see `_doctor_scoped` (invoices with no pet at all are in the same
        # NULL-doctor "claimable pool" as invoices whose pet has no doctor).
        invoices = _doctor_scoped(Invoice, request, lookup="pet__doctor").order_by("-created_at")
        pet_id = request.query_params.get("pet")
        if pet_id:
            invoices = invoices.filter(pet_id=pet_id)
        return Response(InvoiceSerializer(invoices, many=True).data)

    pet_id = request.data.get("pet_id") or request.data.get("pet")
    if not pet_id:
        return problem(400, "pet_id is required.")
    # Follow-up L1 fix (2026-08-21): a doctor could otherwise invoice another
    # practice's patient by ID — see `_doctor_scoped`.
    pet = get_object_or_404(_doctor_scoped(Pet, request), pk=pet_id)

    line_items_data = request.data.get("line_items") or []
    if not isinstance(line_items_data, list) or not line_items_data:
        return problem(400, "At least one line item is required.")

    try:
        tax = Decimal(str(request.data.get("tax") or "0"))
    except InvalidOperation:
        return problem(400, "tax must be a number.")

    payment_mode = request.data.get("payment_mode") or "post_treatment"
    if payment_mode not in dict(Invoice.PAYMENT_MODE_CHOICES):
        return problem(400, "invalid payment_mode.")

    # Validate all line items up front, before touching the DB, so a bad
    # item can't leave a half-created invoice behind.
    item_serializers = []
    for item in line_items_data:
        item_serializer = LineItemSerializer(data=item)
        item_serializer.is_valid(raise_exception=True)
        item_serializers.append(item_serializer)

    total_sessions = request.data.get("total_sessions")
    if payment_mode == "package" and total_sessions:
        try:
            total_sessions = int(total_sessions)
        except (TypeError, ValueError):
            total_sessions = 0
    else:
        total_sessions = 0

    # Server computes subtotal/total from line items — never trust a
    # client-supplied total (API_CONTRACT.md §3 Billing).
    #
    # Known-issue #5: invoice_no used to be derived from COUNT(), which
    # collides after any delete and races under concurrent POSTs (both
    # return 500). Derived from Max(invoice_no) inside select_for_update()
    # instead, so concurrent requests serialize on the same lock and always
    # see each other's latest number.
    year = timezone.now().year
    prefix = f"INV-{year}-"
    with transaction.atomic():
        locked = Invoice.objects.select_for_update().filter(invoice_no__startswith=prefix)
        max_no = locked.aggregate(max_no=Max("invoice_no"))["max_no"]
        last_seq = 0
        if max_no:
            try:
                last_seq = int(max_no.rsplit("-", 1)[-1])
            except (TypeError, ValueError):
                last_seq = 0
        invoice_no = f"{prefix}{last_seq + 1:03d}"

        invoice = Invoice.objects.create(
            invoice_no=invoice_no, pet=pet, owner=pet.owner, tax=tax, payment_mode=payment_mode,
        )

        for item_serializer in item_serializers:
            LineItem.objects.create(invoice=invoice, **item_serializer.validated_data)

        if total_sessions > 0:
            Package.objects.create(invoice=invoice, total_sessions=total_sessions, used_sessions=0)

    return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDoctor])
def invoice_detail_view(request, pk):
    # Follow-up L1 fix (2026-08-21) — see `_doctor_scoped`.
    invoice = get_object_or_404(_doctor_scoped(Invoice, request, lookup="pet__doctor"), pk=pk)
    return Response(InvoiceSerializer(invoice).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def invoice_payments_view(request, pk):
    # Follow-up L1 fix (2026-08-21): this is a money-touching mutation — a
    # second doctor could otherwise take payment against another practice's
    # invoice by ID. See `_doctor_scoped`.
    invoice = get_object_or_404(_doctor_scoped(Invoice, request, lookup="pet__doctor"), pk=pk)
    idempotency_key = request.data.get("idempotency_key") or None

    # Idempotency (CLAUDE.md rule 6): a repeat POST with the same key returns
    # the original Payment and never double-credits the invoice.
    if idempotency_key:
        existing = Payment.objects.filter(idempotency_key=idempotency_key).first()
        if existing:
            return Response(PaymentSerializer(existing).data, status=status.HTTP_200_OK)

    amount_paid = request.data.get("amount_paid")
    if amount_paid is None:
        return problem(400, "amount_paid is required.")
    try:
        amount_paid = Decimal(str(amount_paid))
    except InvalidOperation:
        return problem(400, "amount_paid must be a number.")
    if amount_paid <= 0:
        return problem(400, "amount_paid must be a positive amount.")

    # Known-issue #3: overpayment used to be accepted, driving balance_due
    # (and the dashboard's pending_payments sum) negative.
    if amount_paid > invoice.balance_due:
        return problem(
            400,
            "amount_paid exceeds the invoice's balance due.",
            f"amount_paid ({amount_paid}) exceeds balance_due ({invoice.balance_due}).",
        )

    try:
        payment = Payment.objects.create(
            invoice=invoice,
            amount_paid=amount_paid,
            gateway_ref=request.data.get("gateway_ref", ""),
            status="SUCCESS",
            idempotency_key=idempotency_key,
        )
    except IntegrityError:
        # Race: another request with the same idempotency_key committed first.
        existing = Payment.objects.filter(idempotency_key=idempotency_key).first()
        if not existing:
            raise
        return Response(PaymentSerializer(existing).data, status=status.HTTP_200_OK)

    return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDoctor])
def revenue_view(request):
    range_param = request.query_params.get("range", "month")
    today = timezone.localdate()

    if range_param == "today":
        start = today
    elif range_param == "year":
        start = today.replace(month=1, day=1)
    else:
        range_param = "month"
        start = today.replace(day=1)
    end = today

    # L1 fix: scoped to the requesting doctor via `_doctor_scoped` (see
    # invoices_view for the same NULL-doctor "claimable pool" posture).
    invoices = _doctor_scoped(Invoice, request, lookup="pet__doctor").filter(
        created_at__date__gte=start, created_at__date__lte=end,
    )
    total_revenue = sum((inv.total for inv in invoices), Decimal("0.00"))

    def _collected(gte, lte):
        payments = _doctor_scoped(Payment, request, lookup="invoice__pet__doctor").filter(
            status="SUCCESS", paid_at__date__gte=gte, paid_at__date__lte=lte,
        )
        return sum((p.amount_paid for p in payments), Decimal("0.00"))

    collected = _collected(start, end)
    pending = total_revenue - collected
    if pending < 0:
        pending = Decimal("0.00")

    series = []
    if range_param == "year":
        for month in range(1, today.month + 1):
            month_start = today.replace(month=month, day=1)
            if month == 12:
                month_end = today.replace(month=12, day=31)
            else:
                month_end = today.replace(month=month + 1, day=1) - timedelta(days=1)
            month_end = min(month_end, today)
            series.append({
                "label": month_start.strftime("%b"),
                "amount": float(_collected(month_start, month_end)),
            })
    else:
        day = start
        while day <= end:
            series.append({"label": day.isoformat(), "amount": float(_collected(day, day))})
            day += timedelta(days=1)

    return Response({
        "range": range_param,
        "total_revenue": float(total_revenue),
        "collected": float(collected),
        "pending": float(pending),
        "currency": "INR",
        "series": series,
    })


# ---------------------------------------------------------------------------
# Notifications (any authenticated user, scoped to themselves)
# ---------------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notifications_view(request):
    qs = Notification.objects.filter(user=request.user)
    unread_count = qs.filter(is_read=False).count()
    return Response({
        "results": NotificationSerializer(qs, many=True).data,
        "unread_count": unread_count,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def notifications_mark_all_read_view(request):
    Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def notification_prefs_view(request):
    phone = (
        request.data.get("owner_phone") if request.method == "PUT"
        else request.query_params.get("owner_phone")
    )

    # An owner may only ever read/write their own prefs.
    if getattr(request.user, "role", None) == "OWNER":
        if phone and phone != request.user.phone:
            return problem(404, "Not found.")
        phone = request.user.phone

    if not phone:
        return problem(400, "owner_phone is required.")

    if request.method == "GET":
        pref, _ = NotificationPref.objects.get_or_create(owner_phone=phone)
        return Response(NotificationPrefSerializer(pref).data)

    opt_out = request.data.get("sms_opt_out", False)
    pref, _ = NotificationPref.objects.get_or_create(owner_phone=phone)
    pref.sms_opt_out = bool(opt_out)
    pref.save()
    return Response(NotificationPrefSerializer(pref).data)


# ---------------------------------------------------------------------------
# Queries (doctor-facing) — append-only threads
# ---------------------------------------------------------------------------

def _create_query_message(request, thread, sender_role):
    message_text = (request.data.get("message") or "").strip()
    if not message_text:
        return problem(400, "message is required.")

    files = request.FILES.getlist("attachments")
    if len(files) > MAX_QUERY_ATTACHMENTS:
        return problem(400, f"A maximum of {MAX_QUERY_ATTACHMENTS} attachments are allowed per message.")

    validated_files = []
    for f in files:
        att_serializer = QueryAttachmentSerializer(data={"file": f})
        att_serializer.is_valid(raise_exception=True)
        validated_files.append(f)

    # sender_name/sender_role are derived from request.user — never from the
    # request body (API_CONTRACT.md §3 Queries).
    sender_name = request.user.get_full_name() or request.user.username
    msg = QueryMessage.objects.create(
        thread=thread,
        sender=request.user,
        sender_role=sender_role,
        sender_name=sender_name,
        message=message_text,
    )
    for f in validated_files:
        QueryAttachment.objects.create(
            message=msg,
            file=f,
            original_filename=getattr(f, "name", ""),
            mime=getattr(f, "content_type", "") or "",
            size=getattr(f, "size", 0),
        )
    return Response(
        QueryMessageSerializer(msg, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


def _empty_thread_payload(pet):
    """D3 fix: a plain GET on a pet's query thread used to call
    `get_or_create`, so merely *viewing* a patient created a permanent empty
    QueryThread row that then showed up in the doctor's inbox forever. GET
    handlers now read without creating; when no thread exists yet, this
    returns the same shape `QueryThreadSerializer` would, without persisting
    anything.
    """
    return {
        "pet": {
            "id": pet.id,
            "name": pet.name,
            "species": pet.species,
            "pet_type": pet.pet_type or pet.species,
            "owner_name": pet.owner_name,
        },
        "messages": [],
        "last_message": None,
        "awaiting_reply": False,
        "message_count": 0,
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDoctor])
def queries_inbox_view(request):
    # D3 fix: only threads with at least one message belong in the inbox —
    # a bare GET on a patient's thread must not manufacture a phantom entry
    # that lingers forever. L1 fix: scoped to the requesting doctor's own
    # patients (was every thread in the clinic) via `_doctor_scoped`.
    threads = (
        _doctor_scoped(QueryThread, request, lookup="pet__doctor")
        .filter(messages__isnull=False)
        .distinct()
        .annotate(latest=Max("messages__sent_at"))
        .order_by("-latest")
    )
    return Response({"results": QueryThreadSerializer(threads, many=True, context={"request": request}).data})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def pet_queries_view(request, pk):
    # Follow-up L1 fix (2026-08-21): a second doctor could otherwise read
    # and post into another practice's patient conversation by ID — see
    # `_doctor_scoped`.
    pet = get_object_or_404(_doctor_scoped(Pet, request), pk=pk)
    if request.method == "GET":
        thread = QueryThread.objects.filter(pet=pet).first()
        if thread is None:
            return Response(_empty_thread_payload(pet))
        return Response(QueryThreadSerializer(thread, context={"request": request}).data)
    thread, _ = QueryThread.objects.get_or_create(pet=pet)
    return _create_query_message(request, thread, sender_role="DOCTOR")


# ---------------------------------------------------------------------------
# Owner portal — every handler filters by request.user; cross-owner access
# to a specific object returns 404, never 403 (API_CONTRACT.md §4.3).
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsOwner])
def owner_pets_view(request):
    if request.method == "GET":
        pets = Pet.objects.filter(owner=request.user).select_related("doctor").order_by("-created_at")
        return Response(PetSerializer(pets, many=True, context={"request": request}).data)

    data = request.data.copy()
    if hasattr(data, "setdefault"):
        data.setdefault("owner_name", request.user.get_full_name() or request.user.username)
        data.setdefault("owner_phone", request.user.phone)
        data.setdefault("owner_email", request.user.email)
    serializer = PetSerializer(data=data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    # An owner is never a DOCTOR, so there is no "creating doctor" to assign
    # (unlike pets_view). Rather than leaving every owner-created pet
    # perpetually unassigned, inherit the doctor from the owner's existing
    # pets ONLY when that is unambiguous (all of the owner's other pets share
    # exactly one doctor). This covers the common case (an owner adding a
    # second pet to the same clinic) without guessing across multiple
    # doctors or clinics. We deliberately do NOT default to "the first doctor
    # in the table" — that is the anti-pattern this codebase removed during
    # the 2026-08-20 auth remediation (CLAUDE.md); it would silently attach a
    # new patient to a random practice. If the owner has no pets yet, or
    # their existing pets are split across more than one doctor, `doctor`
    # stays NULL and must be assigned later (e.g. at first appointment
    # confirmation).
    existing_doctor_ids = set(
        Pet.objects.filter(owner=request.user)
        .exclude(doctor__isnull=True)
        .values_list("doctor_id", flat=True)
        .distinct()
    )
    inherited_doctor_id = existing_doctor_ids.pop() if len(existing_doctor_ids) == 1 else None
    pet = serializer.save(owner=request.user, doctor_id=inherited_doctor_id)
    photo = request.FILES.get("photo")
    if photo:
        pet.photo = photo
        pet.save()
    return Response(
        PetSerializer(pet, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsOwner])
def owner_pet_detail_view(request, pk):
    pet = get_object_or_404(Pet, pk=pk)
    IsObjectOwner().has_object_permission(request, None, pet)

    data = PetSerializer(pet, context={"request": request}).data
    data["diagnoses"] = DiagnosticReportSerializer(
        pet.diagnostic_reports.all(), many=True, context={"request": request},
    ).data
    data["treatment_plans"] = TreatmentPlanSerializer(pet.treatment_plans.all(), many=True).data
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwner])
def owner_pet_diagnoses_view(request, pk):
    pet = get_object_or_404(Pet, pk=pk)
    IsObjectOwner().has_object_permission(request, None, pet)

    serializer = DiagnosticReportSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    report = serializer.save(pet=pet)
    return Response(
        DiagnosticReportSerializer(report, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwner])
def owner_pet_history_view(request, pk):
    pet = get_object_or_404(Pet, pk=pk)
    IsObjectOwner().has_object_permission(request, None, pet)

    # Known-issue #10: this used to be raw setattr()+save() with no
    # validation — a 5000-char string into a max_length=50 column (Pet.age)
    # returned 200 on SQLite and would be a 500 DataError on PostgreSQL.
    serializer = OwnerPetHistorySerializer(pet, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(PetSerializer(pet, context={"request": request}).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsOwner])
def owner_appointments_view(request):
    if request.method == "GET":
        # select_related("pet"): see appointments_view for why this matters
        # now that AppointmentSerializer derives species/pet_type from Pet.
        appts = Appointment.objects.filter(pet__owner=request.user).select_related("pet").order_by("date", "time")
        return Response(AppointmentSerializer(appts, many=True).data)

    pet_id = request.data.get("pet_id") or request.data.get("pet")
    if not pet_id:
        return problem(400, "pet_id is required.")
    pet = get_object_or_404(Pet, pk=pet_id)
    IsObjectOwner().has_object_permission(request, None, pet)

    data = {
        "pet": pet.id,
        "date": request.data.get("date"),
        "time": request.data.get("time"),
        "visit_type": request.data.get("visit_type", "Initial"),
        "reason_notes": request.data.get("reason_notes", ""),
    }
    serializer = AppointmentSerializer(data=data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    appt = serializer.save(doctor=pet.doctor, status="Pending")
    return Response(AppointmentSerializer(appt).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwner])
def owner_appointment_accept_view(request, pk):
    appt = get_object_or_404(Appointment, pk=pk)
    IsObjectOwner().has_object_permission(request, None, appt)

    if appt.requested_date:
        appt.date = appt.requested_date
    if appt.requested_time:
        appt.time = appt.requested_time
    appt.requested_date = None
    appt.requested_time = None
    appt.status = "Confirmed"
    appt.save()
    return Response(AppointmentSerializer(appt).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwner])
def owner_appointment_reschedule_request_view(request, pk):
    appt = get_object_or_404(Appointment, pk=pk)
    IsObjectOwner().has_object_permission(request, None, appt)

    date = request.data.get("date")
    time = request.data.get("time")
    if not date or not time:
        return problem(400, "date and time are required.")

    appt.requested_date = date
    appt.requested_time = time
    appt.reschedule_reason = request.data.get("reason", "")
    appt.status = "Reschedule Requested"
    appt.save()
    return Response(AppointmentSerializer(appt).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwner])
def owner_appointment_cancel_view(request, pk):
    """G2 (new feature): owners previously had no way to cancel an
    appointment outright, only to request a reschedule. A past or already
    resolved (Completed/Cancelled) appointment cannot be cancelled — there is
    nothing left to undo, and silently "cancelling" a visit that already
    happened would corrupt the clinical/billing record.
    """
    appt = get_object_or_404(Appointment, pk=pk)
    IsObjectOwner().has_object_permission(request, None, appt)

    if appt.status in ("Completed", "Cancelled"):
        return problem(
            400,
            f"An appointment that is already {appt.status} cannot be cancelled.",
        )
    if appt.date < timezone.localdate():
        return problem(400, "A past appointment cannot be cancelled.")

    appt.status = "Cancelled"
    appt.save()
    return Response(AppointmentSerializer(appt).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsOwner])
def owner_invoices_view(request):
    invoices = Invoice.objects.filter(owner=request.user).order_by("-created_at")
    return Response(InvoiceSerializer(invoices, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsOwner])
def owner_invoice_detail_view(request, pk):
    """G3 (new feature): owners could list their invoices but not see the
    detail of any one of them (line items / amount paid / balance due) —
    `invoice_detail_view` is doctor-only. Read-only; no payment here.
    """
    invoice = get_object_or_404(Invoice, pk=pk)
    IsObjectOwner().has_object_permission(request, None, invoice)
    return Response(InvoiceSerializer(invoice).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsOwner])
def owner_pet_queries_view(request, pk):
    pet = get_object_or_404(Pet, pk=pk)
    IsObjectOwner().has_object_permission(request, None, pet)

    if request.method == "GET":
        # D3 fix: same posture as the doctor-facing pet_queries_view — a
        # plain GET must not manufacture a phantom thread.
        thread = QueryThread.objects.filter(pet=pet).first()
        if thread is None:
            return Response(_empty_thread_payload(pet))
        return Response(QueryThreadSerializer(thread, context={"request": request}).data)
    thread, _ = QueryThread.objects.get_or_create(pet=pet)
    return _create_query_message(request, thread, sender_role="OWNER")
