"""JSON API (``/api/v1``) for the React doctor SPA.

Auth decision (UI-parity sprint, see docs/adr/0001-drf-session-auth.md):
uses DRF SessionAuthentication over the existing Django session + CSRF stack
and the EmailOrUsernameBackend. Input validation reuses the Django forms so
the API and the (still-live) template pages behave identically. JWT + gateway
validation from the OCI target is deferred to a later phase.

AuthZ in depth: every endpoint requires an authenticated doctor (IsVet) and
scopes all querysets to ``request.user``; per-object endpoints 404 on records
the caller does not own.
"""

from decimal import Decimal

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db.models import Sum
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.template.defaultfilters import date as date_filter
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from ..audit import record_event
from ..forms import (
    AppointmentForm,
    DiagnosisReplaceForm,
    DiagnosisUploadForm,
    DoctorLoginForm,
    DoctorSignupForm,
    PetForm,
    RescheduleForm,
)
from ..models import (
    Appointment,
    AuditLog,
    Diagnosis,
    DoctorProfile,
    Invoice,
    Notification,
    OwnerProfile,
    Payment,
    Pet,
    TreatmentPlan,
)
from ..services.notifications import notify
from ..serializers.core import (
    AppointmentSerializer,
    DiagnosisSerializer,
    MeSerializer,
    PetSerializer,
    ProfileSerializer,
    ProgressNoteCreateSerializer,
    ProgressNoteSerializer,
    TreatmentPlanSerializer,
)
from ..services import billing as billing_service
from ..services.html import share_payload


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
DOCTOR_ROLE = "DOCTOR"
OWNER_ROLE = "OWNER"


def _role_of(user):
    """A user with a doctor_profile is a DOCTOR; one with an owner_profile is an
    OWNER. (Doctors are never auto-given an owner_profile, so DOCTOR wins.)"""
    if hasattr(user, "doctor_profile") or getattr(user, "is_superuser", False):
        return DOCTOR_ROLE
    if hasattr(user, "owner_profile"):
        return OWNER_ROLE
    return DOCTOR_ROLE


def _split_name(full_name):
    """Split a captured ``owner_name`` into (first, last). The first token is the
    first name; everything after it is the last name. Returns ("", "") for blank."""
    parts = (full_name or "").strip().split()
    if not parts:
        return "", ""
    return parts[0], " ".join(parts[1:])


def link_owner(pet):
    """SRS §3.1 (doctor-provisioned owners): if the pet carries an owner email,
    get-or-create a linked Owner account (username=email, unusable password
    until the owner claims it) + OwnerProfile, and set pet.owner. Idempotent.

    The owner's name is seeded from the doctor-entered ``pet.owner_name`` so the
    owner's profile isn't blank on first login — but only when the account has no
    name yet, so an owner who later edits their own name is never overwritten."""
    email = (pet.owner_email or "").strip().lower()
    if not email:
        return
    User = get_user_model()
    user, created = User.objects.get_or_create(
        username=email, defaults={"email": email}
    )
    if created:
        user.set_unusable_password()  # owner activates via the claim endpoint
        user.save()
    # Seed first/last name from the captured owner_name when the account has none.
    if not (user.first_name or user.last_name):
        first, last = _split_name(pet.owner_name)
        if first or last:
            user.first_name, user.last_name = first, last
            user.save(update_fields=["first_name", "last_name"])
    OwnerProfile.objects.get_or_create(
        user=user, defaults={"phone": pet.owner_phone or ""}
    )
    if pet.owner_id != user.id:
        pet.owner = user
        pet.save(update_fields=["owner"])


def form_errors(form):
    """Convert a Django form's errors into a JSON dict, mapping Django's
    ``__all__`` bucket to ``non_field_errors`` (matches DRF conventions)."""
    errors = {}
    for field, msgs in form.errors.items():
        key = "non_field_errors" if field == "__all__" else field
        errors[key] = list(msgs)
    return errors


def _tokens_for(user):
    """Mint a rotating refresh + short-lived access pair carrying the DOCTOR
    role claim. The role is set on the REFRESH token BEFORE deriving the access
    token so the access token (and every future rotated pair) inherits it."""
    refresh = RefreshToken.for_user(user)
    refresh["role"] = _role_of(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


class IsVet(BasePermission):
    """Authenticated user that owns a DoctorProfile.

    Mirrors the template-side ``vet_required`` guard, including auto-creating a
    profile for superusers. RBAC (SRS §3.1): when the request is authenticated
    by a verified JWT (``request.auth`` is the validated token), the token's
    ``role`` claim must equal ``DOCTOR`` — a valid non-DOCTOR token yields 403.
    The role is read ONLY from the verified claim, never from ``request.data``.
    Session-authenticated requests (``request.auth is None``) predate JWT and
    are unaffected, so the template pages and existing tests keep working.
    """

    message = "This portal is for registered veterinarians only."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_superuser and not hasattr(user, "doctor_profile"):
            DoctorProfile.objects.get_or_create(
                user=user,
                defaults={"clinic_name": "", "clinic_address": "", "clinic_phone": ""},
            )
        if not hasattr(user, "doctor_profile"):
            return False
        auth = getattr(request, "auth", None)
        if auth is not None:
            try:
                role = auth.get("role")
            except (AttributeError, TypeError):
                role = None
            if role != DOCTOR_ROLE:
                return False
        return True


def _owned_appointment(request, pk):
    return get_object_or_404(
        Appointment.objects.select_related("pet"), pk=pk, doctor=request.user
    )


def _owned_pet(request, pet_pk):
    return get_object_or_404(Pet, pk=pet_pk, doctor=request.user)


def _owned_diagnosis(request, pk):
    # doctor is denormalised on Diagnosis (mirrors pet.doctor), so scoping by
    # doctor=request.user is equivalent to the pet.doctor ownership rule.
    return get_object_or_404(
        Diagnosis.objects.select_related("pet"), pk=pk, doctor=request.user
    )


def _owned_plan(request, pk):
    return get_object_or_404(
        TreatmentPlan.objects.select_related("pet"), pk=pk, doctor=request.user
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@method_decorator(ensure_csrf_cookie, name="dispatch")
class LoginView(APIView):
    """POST {username,password} -> JWT {access,refresh} + session + doctor.

    Reuses DoctorLoginForm + EmailOrUsernameBackend. On success mints a JWT
    pair (role=DOCTOR) AND keeps the Django session (client.login() test
    compat), returning MeSerializer merged with {access, refresh}. Invalid
    creds return 401 {non_field_errors:[...]} (AC-01). Both outcomes are
    recorded to the audit trail (LOGIN / LOGIN_FAILED).
    """

    permission_classes = [AllowAny]

    def post(self, request):
        form = DoctorLoginForm(request, data=request.data)
        if form.is_valid():
            user = form.get_user()
            login(request, user)  # session, for template + existing-test compat
            data = MeSerializer(user).data
            data.update(_tokens_for(user))
            record_event(
                user, AuditLog.LOGIN, "auth",
                method="POST", path=request.path, status_code=200,
            )
            return Response(data)
        record_event(
            None, AuditLog.LOGIN_FAILED, "auth",
            method="POST", path=request.path, status_code=401,
        )
        return Response(form_errors(form), status=status.HTTP_401_UNAUTHORIZED)


class LogoutView(APIView):
    """POST {refresh?} -> 204. Blacklists the refresh token if supplied
    (server-side revocation) and always clears the Django session. Logout is
    idempotent: an already-invalid/blacklisted refresh is ignored."""

    permission_classes = [AllowAny]

    def post(self, request):
        refresh = None
        if hasattr(request.data, "get"):
            refresh = request.data.get("refresh")
        if refresh:
            try:
                RefreshToken(refresh).blacklist()
            except TokenError:
                pass  # already expired / blacklisted — nothing to revoke
        user = request.user if getattr(request.user, "is_authenticated", False) else None
        logout(request)
        record_event(
            user, AuditLog.LOGOUT, "auth",
            method="POST", path=request.path, status_code=204,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class MeView(APIView):
    """GET current doctor (200) or 401. Also plants the csrftoken cookie so the
    SPA can send X-CSRFToken on subsequent mutations."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)


class ProfileView(APIView):
    """GET / PATCH the signed-in user's account profile (any authenticated
    user — doctor or owner). GET returns the role-aware :class:`ProfileSerializer`
    shape. PATCH updates the editable account fields (first/last name, email)
    plus the role-specific profile fields — clinic name/address/phone for a
    DOCTOR, contact phone for an OWNER. Unknown/blank keys are ignored; a
    duplicate email (belonging to another account) returns 400."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(ProfileSerializer(request.user).data)

    def patch(self, request):
        user = request.user
        data = request.data

        # --- shared account fields -------------------------------------
        if "first_name" in data:
            user.first_name = str(data.get("first_name") or "").strip()
        if "last_name" in data:
            user.last_name = str(data.get("last_name") or "").strip()
        if "email" in data:
            email = str(data.get("email") or "").strip()
            if email:
                clash = (
                    get_user_model()
                    .objects.filter(email__iexact=email)
                    .exclude(pk=user.pk)
                    .exists()
                )
                if clash:
                    return Response(
                        {"email": ["That email is already in use."]},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                user.email = email
        user.save()

        # --- role-specific profile -------------------------------------
        doc = getattr(user, "doctor_profile", None)
        if doc is not None:
            for field, key in (
                ("clinic_name", "clinic_name"),
                ("clinic_address", "clinic_address"),
                ("clinic_phone", "clinic_phone"),
            ):
                if key in data:
                    setattr(doc, field, str(data.get(key) or "").strip())
            doc.save()

        own = getattr(user, "owner_profile", None)
        if own is not None and "phone" in data:
            own.phone = str(data.get("phone") or "").strip()
            own.save()

        return Response(ProfileSerializer(user).data)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class SignupView(APIView):
    """POST signup -> creates User + DoctorProfile, logs in, returns me + JWT.
    Reuses DoctorSignupForm (duplicate-email + password validators). A
    duplicate email returns 409 {email:[...]} (contract); other validation
    errors return 400. On success mints a JWT pair (role=DOCTOR) alongside the
    session and returns MeSerializer merged with {access, refresh} at 201."""

    permission_classes = [AllowAny]

    def post(self, request):
        form = DoctorSignupForm(request.data)
        if form.is_valid():
            user = form.save()
            auth_user = authenticate(
                request,
                username=user.get_username(),
                password=form.cleaned_data["password1"],
            )
            if auth_user is not None:
                login(request, auth_user)
                user = auth_user
            else:
                login(request, user, backend="django.contrib.auth.backends.ModelBackend")
            data = MeSerializer(user).data
            data.update(_tokens_for(user))
            return Response(data, status=status.HTTP_201_CREATED)
        errors = form_errors(form)
        # Duplicate email is a conflict (409); every other field/validation
        # failure stays a 400. DoctorSignupForm.clean_email raises the
        # "already exists" message for a taken address.
        if "email" in errors and any("already exists" in msg for msg in errors["email"]):
            return Response(errors, status=status.HTTP_409_CONFLICT)
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)


class RefreshView(TokenRefreshView):
    """POST {refresh} -> {access, refresh}.

    Wraps SimpleJWT's refresh: validates + rotates the refresh token,
    blacklisting the prior one (BLACKLIST_AFTER_ROTATION). The DOCTOR role
    claim is preserved across rotation. An expired, revoked, or reused
    (rotated-out) refresh token yields 401."""

    pass


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
def _revenue_between(doctor, start, end):
    """Sum of SUCCESS ``Payment.amount_paid`` for ``doctor`` whose ``paid_at``
    date falls within the inclusive ``[start, end]`` window (2dp Decimal).

    Mirrors ``RevenueSummaryView`` exactly (same SUCCESS-only filter, same
    ``invoice__doctor`` scoping, same inclusive date bounds) so the dashboard's
    ``today_revenue`` / ``monthly_revenue`` equal ``/revenue?range=day`` /
    ``range=month`` for the same doctor and pinned day.
    """
    agg = Payment.objects.filter(
        invoice__doctor=doctor,
        status=Payment.SUCCESS,
        paid_at__date__gte=start,
        paid_at__date__lte=end,
    ).aggregate(total=Sum("amount_paid"))
    return (agg["total"] or Decimal("0")).quantize(Decimal("0.01"))


class DashboardStatsView(APIView):
    permission_classes = [IsVet]

    def get(self, request):
        # PARITY_TODAY pins "today" during the UI-parity check; None (real clock)
        # unless the env var is set, so production behaviour is unchanged.
        today = getattr(settings, "PARITY_TODAY", None) or timezone.localdate()
        today_qs = (
            Appointment.objects.filter(doctor=request.user, date=today)
            .exclude(status=Appointment.STATUS_COMPLETED)
            .select_related("pet")
            .order_by("time", "id")
        )
        completed_count = Appointment.objects.filter(
            doctor=request.user, status=Appointment.STATUS_COMPLETED
        ).count()

        # SRS §3.2 dashboard stat tiles wired to real data (US-DASH-01), all
        # doctor-scoped (AuthZ in depth). Range bounds are computed from
        # api_revenue._range_bounds so the revenue tiles match /revenue exactly
        # (imported lazily to avoid a circular import — api_revenue imports IsVet
        # from this module). No hardcoded/placeholder numbers.
        from .revenue import _range_bounds

        active_treatments = TreatmentPlan.objects.filter(
            doctor=request.user, status=TreatmentPlan.ACTIVE
        ).count()

        day_start, day_end = _range_bounds("day", today)
        month_start, month_end = _range_bounds("month", today)
        today_revenue = _revenue_between(request.user, day_start, day_end)
        monthly_revenue = _revenue_between(request.user, month_start, month_end)

        # Outstanding balance across ALL the doctor's not-yet-settled invoices
        # (NOT windowed) — the pending-payments tile.
        pending_payments = Decimal("0.00")
        for invoice in Invoice.objects.filter(
            doctor=request.user,
            payment_status__in=(Invoice.PENDING, Invoice.PARTIALLY_PAID),
        ):
            pending_payments += billing_service.balance_due(invoice)
        pending_payments = pending_payments.quantize(Decimal("0.01"))

        return Response(
            {
                "today": today.isoformat(),
                "today_display": date_filter(today, "l, F j, Y"),
                "today_appointments": AppointmentSerializer(today_qs, many=True).data,
                "completed_count": completed_count,
                "active_treatments": active_treatments,
                "pending_payments": str(pending_payments),
                "today_revenue": str(today_revenue),
                "monthly_revenue": str(monthly_revenue),
                "currency": "INR",
            }
        )


# ---------------------------------------------------------------------------
# Appointments
# ---------------------------------------------------------------------------
class AppointmentListCreateView(APIView):
    permission_classes = [IsVet]

    def get(self, request):
        qs = Appointment.objects.filter(doctor=request.user).select_related("pet")
        pet = request.query_params.get("pet", "").strip()
        owner = request.query_params.get("owner", "").strip()
        date = request.query_params.get("date", "").strip()
        if pet:
            qs = qs.filter(pet__name__icontains=pet)
        if owner:
            qs = qs.filter(pet__owner_name__icontains=owner)
        if date:
            qs = qs.filter(date=date)
        qs = qs.order_by("-date", "-time")
        return Response(AppointmentSerializer(qs, many=True).data)

    def post(self, request):
        form = AppointmentForm(request.data, doctor=request.user)
        if form.is_valid():
            appt = form.save(commit=False)
            appt.doctor = request.user
            appt.status = Appointment.STATUS_PENDING
            appt.save()
            return Response(
                AppointmentSerializer(appt).data, status=status.HTTP_201_CREATED
            )
        return Response(form_errors(form), status=status.HTTP_400_BAD_REQUEST)


class AppointmentDetailView(APIView):
    permission_classes = [IsVet]

    def get(self, request, pk):
        appt = _owned_appointment(request, pk)
        return Response(AppointmentSerializer(appt).data)


class AppointmentRescheduleView(APIView):
    permission_classes = [IsVet]

    def post(self, request, pk):
        appt = _owned_appointment(request, pk)
        form = RescheduleForm(request.data, instance=appt)
        if form.is_valid():
            appt = form.save(commit=False)
            appt.status = Appointment.STATUS_RESCHEDULED
            appt.save()
            data = AppointmentSerializer(appt).data
            data["share"] = share_payload(request, appt)
            return Response(data)
        return Response(form_errors(form), status=status.HTTP_400_BAD_REQUEST)


class AppointmentCompleteView(APIView):
    permission_classes = [IsVet]

    def post(self, request, pk):
        appt = _owned_appointment(request, pk)
        appt.status = Appointment.STATUS_COMPLETED
        appt.save(update_fields=["status", "updated_at"])
        # Billing hook (SRS §3.8): a Completed appointment burns one session of
        # the pet's active package-mode invoice, if any. Idempotent — re-posting
        # complete on the same appointment never double-decrements (US-PAY-04).
        billing_service.consume_package_session(appt)
        return Response(AppointmentSerializer(appt).data)


class AppointmentShareView(APIView):
    permission_classes = [IsVet]

    def get(self, request, pk):
        appt = _owned_appointment(request, pk)
        return Response(share_payload(request, appt))


# ---------------------------------------------------------------------------
# Pets
# ---------------------------------------------------------------------------
class PetListCreateView(APIView):
    permission_classes = [IsVet]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        qs = Pet.objects.filter(doctor=request.user)
        q = request.query_params.get("q", "").strip()
        if q:
            qs = (qs.filter(name__icontains=q) | qs.filter(owner_name__icontains=q)).distinct()
        return Response(PetSerializer(qs, many=True, context={"request": request}).data)

    def post(self, request):
        form = PetForm(request.data, request.FILES)
        if form.is_valid():
            pet = form.save(commit=False)
            pet.doctor = request.user
            pet.save()
            link_owner(pet)  # SRS §3.1: provision/link the Owner account from owner_email
            return Response(
                PetSerializer(pet, context={"request": request}).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(form_errors(form), status=status.HTTP_400_BAD_REQUEST)


class PetDetailView(APIView):
    """GET a single owned pet — the header for the clinical-record hub."""

    permission_classes = [IsVet]

    def get(self, request, pk):
        pet = _owned_pet(request, pk)
        return Response(PetSerializer(pet, context={"request": request}).data)


# ---------------------------------------------------------------------------
# Owner portal (SRS §3.1 owner side — doctor-provisioned accounts)
# ---------------------------------------------------------------------------
class IsOwner(BasePermission):
    """Authenticated pet Owner (has owner_profile, is NOT a doctor). When the
    request is JWT-authenticated the verified token role must be OWNER."""

    message = "This area is for pet owners."

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        if hasattr(u, "doctor_profile") or getattr(u, "is_superuser", False):
            return False
        if not hasattr(u, "owner_profile"):
            return False
        auth = getattr(request, "auth", None)
        if auth is not None:
            try:
                if auth.get("role") != OWNER_ROLE:
                    return False
            except (AttributeError, TypeError):
                return False
        return True


@method_decorator(ensure_csrf_cookie, name="dispatch")
class OwnerSetPasswordView(APIView):
    """POST {email, password} -> activate a doctor-provisioned owner account by
    setting its password (the 'claim' step). Works only for an existing account
    that has an owner_profile."""

    permission_classes = [AllowAny]

    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        password = str(request.data.get("password", ""))
        if not email or len(password) < 8:
            return Response(
                {"non_field_errors": ["Email and a password (min 8 characters) are required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        User = get_user_model()
        user = User.objects.filter(username=email, owner_profile__isnull=False).first()
        if user is None:
            return Response(
                {"non_field_errors": ["No owner account for that email — ask your clinic to add your pet first."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(password)
        user.save()
        return Response({"ok": True})


class OwnerPetsView(APIView):
    """GET the owner's OWN pets (SRS §3.1 AC-04)."""

    permission_classes = [IsOwner]

    def get(self, request):
        qs = Pet.objects.filter(owner=request.user)
        return Response(PetSerializer(qs, many=True, context={"request": request}).data)


class OwnerPetDetailView(APIView):
    """GET one owned pet + its clinical record (read-only for the owner)."""

    permission_classes = [IsOwner]

    def get(self, request, pk):
        pet = get_object_or_404(Pet, pk=pk, owner=request.user)
        data = PetSerializer(pet, context={"request": request}).data
        data["diagnoses"] = DiagnosisSerializer(
            Diagnosis.objects.filter(pet=pet), many=True, context={"request": request}
        ).data
        data["treatment_plans"] = TreatmentPlanSerializer(
            TreatmentPlan.objects.filter(pet=pet), many=True, context={"request": request}
        ).data
        return Response(data)


def _owner_appointment(request, pk):
    return get_object_or_404(
        Appointment.objects.select_related("pet", "doctor"), pk=pk, pet__owner=request.user
    )


class OwnerAppointmentsView(APIView):
    """GET the owner's appointments (for their pets)."""

    permission_classes = [IsOwner]

    def get(self, request):
        qs = Appointment.objects.filter(pet__owner=request.user).select_related("pet")
        return Response(AppointmentSerializer(qs, many=True).data)


class OwnerAppointmentAcceptView(APIView):
    """POST — owner accepts a Pending appointment (SRS §3.6) → Confirmed."""

    permission_classes = [IsOwner]

    def post(self, request, pk):
        appt = _owner_appointment(request, pk)
        if appt.status != Appointment.STATUS_PENDING:
            return Response({"detail": "Only a pending appointment can be accepted."}, status=status.HTTP_409_CONFLICT)
        appt.status = Appointment.STATUS_CONFIRMED
        appt.save(update_fields=["status", "updated_at"])
        notify(appt.doctor, Notification.APPOINTMENT_ACCEPTED,
               f"{appt.pet.name}: owner accepted the {appt.date} appointment.")
        return Response(AppointmentSerializer(appt).data)


class OwnerRescheduleRequestView(APIView):
    """POST {date,time,reason} — owner requests a reschedule (SRS §3.6)."""

    permission_classes = [IsOwner]

    def post(self, request, pk):
        appt = _owner_appointment(request, pk)
        d = str(request.data.get("date", "")).strip()
        t = str(request.data.get("time", "")).strip()
        reason = str(request.data.get("reason", "")).strip()
        if not (d and t and reason):
            return Response({"non_field_errors": ["New date, time and a reason are required."]},
                            status=status.HTTP_400_BAD_REQUEST)
        appt.requested_date = d
        appt.requested_time = t
        appt.reschedule_reason = reason
        appt.status = Appointment.STATUS_RESCHEDULE_REQUESTED
        appt.save(update_fields=["requested_date", "requested_time", "reschedule_reason", "status", "updated_at"])
        notify(appt.doctor, Notification.APPOINTMENT_RESCHEDULED,
               f"{appt.pet.name}: owner requested {d} {t} — {reason}")
        return Response(AppointmentSerializer(appt).data)


class AppointmentRescheduleApproveView(APIView):
    """Doctor approves the owner's reschedule request → applies it, Confirmed."""

    permission_classes = [IsVet]

    def post(self, request, pk):
        appt = _owned_appointment(request, pk)
        if appt.status != Appointment.STATUS_RESCHEDULE_REQUESTED or not appt.requested_date:
            return Response({"detail": "No reschedule request to approve."}, status=status.HTTP_409_CONFLICT)
        appt.date = appt.requested_date
        appt.time = appt.requested_time
        appt.status = Appointment.STATUS_CONFIRMED
        appt.requested_date = None
        appt.requested_time = None
        appt.reschedule_reason = ""
        appt.save()
        if appt.pet.owner_id:
            notify(appt.pet.owner, Notification.APPOINTMENT_RESCHEDULED,
                   f"Your reschedule for {appt.pet.name} was approved: {appt.date} {appt.time}.")
        return Response(AppointmentSerializer(appt).data)


class AppointmentRescheduleRejectView(APIView):
    """Doctor rejects the owner's reschedule request → original kept, Pending."""

    permission_classes = [IsVet]

    def post(self, request, pk):
        appt = _owned_appointment(request, pk)
        appt.requested_date = None
        appt.requested_time = None
        appt.reschedule_reason = ""
        appt.status = Appointment.STATUS_PENDING
        appt.save()
        if appt.pet.owner_id:
            notify(appt.pet.owner, Notification.APPOINTMENT_RESCHEDULED,
                   f"Your reschedule request for {appt.pet.name} was declined; the original time stands.")
        return Response(AppointmentSerializer(appt).data)


# ---------------------------------------------------------------------------
# Diagnostic reports (SRS §3.4)
# ---------------------------------------------------------------------------
class PetDiagnosisListCreateView(APIView):
    """GET this pet's reports (newest first) / POST a multipart upload."""

    permission_classes = [IsVet]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, pet_pk):
        pet = _owned_pet(request, pet_pk)
        qs = pet.diagnoses.all()  # Meta.ordering -> newest first
        return Response(
            DiagnosisSerializer(qs, many=True, context={"request": request}).data
        )

    def post(self, request, pet_pk):
        pet = _owned_pet(request, pet_pk)
        form = DiagnosisUploadForm(request.data, request.FILES)
        if form.is_valid():
            uploaded = form.cleaned_data["file"]
            diagnosis = Diagnosis(
                pet=pet,
                doctor=request.user,
                report_type=form.cleaned_data["report_type"],
                notes=form.cleaned_data["notes"],
                original_filename=uploaded.name,
                mime=(getattr(uploaded, "content_type", "") or ""),
                size=uploaded.size,
            )
            diagnosis.file = uploaded
            diagnosis.save()
            return Response(
                DiagnosisSerializer(diagnosis, context={"request": request}).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(form_errors(form), status=status.HTTP_400_BAD_REQUEST)


class DiagnosisDetailView(APIView):
    """GET report detail / DELETE the report (and its file on disk)."""

    permission_classes = [IsVet]

    def get(self, request, pk):
        diagnosis = _owned_diagnosis(request, pk)
        return Response(
            DiagnosisSerializer(diagnosis, context={"request": request}).data
        )

    def delete(self, request, pk):
        diagnosis = _owned_diagnosis(request, pk)
        if diagnosis.file:
            diagnosis.file.delete(save=False)
        diagnosis.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DiagnosisReplaceFileView(APIView):
    """PUT/PATCH a replacement file onto the SAME diagnosis row.

    Same type + 20MB validation; on success the old file is removed from disk
    and file/original_filename/mime/size/uploaded_at are refreshed. On a
    validation error the original file is left untouched (400)."""

    permission_classes = [IsVet]
    parser_classes = [MultiPartParser, FormParser]

    def _replace(self, request, pk):
        diagnosis = _owned_diagnosis(request, pk)
        form = DiagnosisReplaceForm(request.data, request.FILES)
        if form.is_valid():
            uploaded = form.cleaned_data["file"]
            old_file = diagnosis.file
            if old_file:
                old_file.delete(save=False)
            diagnosis.file = uploaded
            diagnosis.original_filename = uploaded.name
            diagnosis.mime = getattr(uploaded, "content_type", "") or ""
            diagnosis.size = uploaded.size
            diagnosis.uploaded_at = timezone.now()
            diagnosis.save()
            return Response(
                DiagnosisSerializer(diagnosis, context={"request": request}).data
            )
        return Response(form_errors(form), status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, pk):
        return self._replace(request, pk)

    def patch(self, request, pk):
        return self._replace(request, pk)


# ---------------------------------------------------------------------------
# Treatment plans + progress notes (SRS §3.5)
# ---------------------------------------------------------------------------
class PetTreatmentPlanListCreateView(APIView):
    """GET this pet's plans (all statuses) / POST a new plan."""

    permission_classes = [IsVet]

    def get(self, request, pet_pk):
        pet = _owned_pet(request, pet_pk)
        qs = pet.treatment_plans.all()
        return Response(
            TreatmentPlanSerializer(qs, many=True, context={"request": request}).data
        )

    def post(self, request, pet_pk):
        pet = _owned_pet(request, pet_pk)
        serializer = TreatmentPlanSerializer(
            data=request.data, context={"request": request}
        )
        if serializer.is_valid():
            serializer.save(pet=pet, doctor=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TreatmentPlanDetailView(APIView):
    """GET plan detail (nested progress notes) / PATCH plan fields + status.

    A COMPLETED plan is archived and read-only (AC-03): further edits 400."""

    permission_classes = [IsVet]

    def get(self, request, pk):
        plan = _owned_plan(request, pk)
        return Response(
            TreatmentPlanSerializer(plan, context={"request": request}).data
        )

    def patch(self, request, pk):
        plan = _owned_plan(request, pk)
        if plan.status == TreatmentPlan.COMPLETED:
            return Response(
                {"non_field_errors": ["This plan is completed and read-only."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = TreatmentPlanSerializer(
            plan, data=request.data, partial=True, context={"request": request}
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TreatmentPlanProgressNoteListCreateView(APIView):
    """GET a plan's notes (chronological) / POST a new session note.

    Empty notes are rejected (400); notes are allowed only while the plan is
    ACTIVE or ON_HOLD (a COMPLETED plan is read-only)."""

    permission_classes = [IsVet]

    def get(self, request, pk):
        plan = _owned_plan(request, pk)
        return Response(ProgressNoteSerializer(plan.progress_notes.all(), many=True).data)

    def post(self, request, pk):
        plan = _owned_plan(request, pk)
        if plan.status == TreatmentPlan.COMPLETED:
            return Response(
                {"non_field_errors": ["Cannot add notes to a completed plan."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = ProgressNoteCreateSerializer(data=request.data)
        if serializer.is_valid():
            note = serializer.save(plan=plan)
            return Response(
                ProgressNoteSerializer(note).data, status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
