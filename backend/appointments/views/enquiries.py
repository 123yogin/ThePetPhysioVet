"""Leads from the public marketing form, and converting one into a real
owner + pet + appointment.

Split out of a single 1674-line views.py. Import from `appointments.views`
as before -- every public name is re-exported by the package.
"""

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from ..models import (
    UserProfile, Pet, Appointment, DiagnosticReport,
    TreatmentPlan, ProgressNote, Invoice, LineItem, Payment, Package,
    Notification, NotificationPref, QueryThread, QueryMessage, QueryAttachment,
    PasswordResetToken, Enquiry,
)
from ..permissions import IsDoctor, IsOwner, IsObjectOwner
from ..serializers import (
    UserProfileSerializer, SignupSerializer, PetSerializer, AppointmentSerializer,
    DiagnosticReportSerializer, TreatmentPlanSerializer, ProgressNoteSerializer,
    InvoiceSerializer, LineItemSerializer, PaymentSerializer, PackageSerializer,
    NotificationSerializer, NotificationPrefSerializer,
    QueryThreadSerializer, QueryMessageSerializer, QueryAttachmentSerializer,
    OwnerPetHistorySerializer, PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
    EnquiryCreateSerializer, EnquirySerializer,
)

from ._shared import _client_ip, _first_error_detail, _rate_limited, _unique_owner_username, problem

# Same rationale/shape as the password-reset rate limits above: two
# independent fixed windows (IP, email) so neither a targeted spam run
# against one address nor a spray of distinct addresses from one source can
# grow the enquiry inbox without bound. Tighter than password-reset because
# this endpoint can also mint database rows with attacker-chosen free text,
# not just send an email.
ENQUIRY_WINDOW_SECONDS = 60 * 60


ENQUIRY_IP_LIMIT = 10


ENQUIRY_EMAIL_LIMIT = 3


def _guess_species(species_breed_text):
    """Best-effort species guess from the marketing form's single free-text
    `speciesBreed` field, for picking the right patient-list icon. `Pet`
    has no separate structured species input from this flow, so this is
    deliberately conservative: match `"cat"`/`"dog"` and otherwise fall back
    to `Pet.species`'s own model default ("Dog") rather than guess further —
    see API_CONTRACT.md's `pet_type`/`species`/`breed` redundancy note for
    why a cleverer heuristic here isn't worth it.
    """
    text = (species_breed_text or "").lower()
    if "cat" in text:
        return "Cat"
    return "Dog"


def _enquiry_create(request):
    """POST /api/v1/enquiries — PUBLIC. See `Enquiry`'s model docstring."""
    ip = _client_ip(request)
    if _rate_limited(f"enquiry:ip:{ip}", ENQUIRY_IP_LIMIT, ENQUIRY_WINDOW_SECONDS):
        return problem(429, "Too many requests", "Too many enquiries submitted. Please try again later.")

    serializer = EnquiryCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return problem(400, "Invalid input", _first_error_detail(serializer.errors))

    email = serializer.validated_data["email"]
    if _rate_limited(f"enquiry:email:{email}", ENQUIRY_EMAIL_LIMIT, ENQUIRY_WINDOW_SECONDS):
        return problem(429, "Too many requests", "Too many enquiries submitted. Please try again later.")

    enquiry = serializer.save()
    reference = f"ENQ-{str(enquiry.id)[:8].upper()}"
    return Response(
        {
            "id": str(enquiry.id),
            "reference": reference,
            "detail": (
                f"Thanks, {enquiry.first_name}! We've received your enquiry "
                f"(reference {reference}) and will be in touch shortly."
            ),
        },
        status=status.HTTP_201_CREATED,
    )


def _enquiries_list(request):
    """GET /api/v1/enquiries — doctor-facing inbox, newest first,
    filterable by `?status=`. `new_count` is always the *unfiltered* count
    of NEW enquiries, so the UI can badge it regardless of which status
    filter is currently applied. Caller must already be an authenticated
    DOCTOR — see `enquiries_view`.
    """
    enquiries = Enquiry.objects.select_related("converted_appointment", "converted_appointment__pet")
    enquiries = enquiries.order_by("-created_at")
    status_filter = request.query_params.get("status")
    if status_filter:
        enquiries = enquiries.filter(status=status_filter)
    new_count = Enquiry.objects.filter(status="NEW").count()
    return Response({
        "results": EnquirySerializer(enquiries, many=True).data,
        "new_count": new_count,
    })


@api_view(["GET", "POST"])
# Load-bearing, not tidiness (same as the password-reset routes above): DRF
# applies JWTAuthentication globally, and SimpleJWT RAISES on a stale or
# malformed bearer token, producing a 401 before AllowAny is ever consulted.
# A random website visitor filling out the marketing-site's booking form may
# well have unrelated/expired junk sitting in localStorage, so the POST half
# of this endpoint must not require a clean slate.
#
# One route serves both an unauthenticated PUBLIC write (POST — the
# enquiry-inbox intake) and an authenticated DOCTOR-only read (GET — the
# triage list), which is the one pair in this file where the two methods on
# the same path need genuinely different authentication postures rather
# than a uniform `permission_classes`. `authentication_classes([])` above
# opts the whole view out of DRF's normal pipeline, so GET performs its own
# JWT authentication + IsDoctor check below instead of relying on the
# decorator.
@authentication_classes([])
@permission_classes([AllowAny])
def enquiries_view(request):
    if request.method == "POST":
        return _enquiry_create(request)

    # GET: doctor-only. Authenticate by hand since @authentication_classes([])
    # above means nothing has populated request.user yet.
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework.exceptions import AuthenticationFailed

    try:
        auth_result = JWTAuthentication().authenticate(request)
    except AuthenticationFailed as exc:
        return problem(401, "Not signed in", str(exc.detail) if exc.detail else "Invalid or expired token.")
    if auth_result is None:
        return problem(401, "Not signed in", "Authentication credentials were not provided.")
    user, _token = auth_result
    if getattr(user, "role", None) != "DOCTOR":
        return problem(403, "Not allowed", "This action requires a doctor account.")
    request.user = user
    return _enquiries_list(request)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def enquiry_convert_view(request, pk):
    """POST /api/v1/enquiries/:id/convert — doctor-only. Finds-or-creates
    the owner (by email) and the pet (by name, scoped to that owner), then
    books a `Pending` appointment for the converting doctor. See the task
    write-up / `Enquiry` docstring for the full rationale.

    Idempotent: converting an already-CONVERTED enquiry returns the
    existing owner/pet/appointment rather than creating a second set — both
    the pre-lock check (fast path, no transaction) and the post-lock
    re-check (closes the race between two concurrent converts of the same
    row) return the same representation.
    """
    enquiry = get_object_or_404(Enquiry, pk=pk)

    if enquiry.status == "CONVERTED":
        return Response(EnquirySerializer(enquiry).data)
    if enquiry.status == "DISMISSED":
        return problem(400, "This enquiry has already been dismissed.")

    date = request.data.get("date")
    time = request.data.get("time")
    visit_type = request.data.get("visit_type")
    if not date or not time or not visit_type:
        return problem(400, "date, time and visit_type are required.")

    # Never a new hardcoded vocabulary — see Appointment.VISIT_TYPES'
    # docstring (B1/B2) for the history of why three independent hardcoded
    # lists is exactly the bug this codebase already paid for once.
    visit_type_labels = dict(Appointment.VISIT_TYPES)
    if visit_type not in visit_type_labels:
        return problem(
            400, "Invalid visit_type.",
            f"visit_type must be one of: {', '.join(visit_type_labels)}.",
        )

    with transaction.atomic():
        # Row-lock and re-check: a half-converted enquiry (owner created,
        # appointment not) is worse than a failed request, and two
        # concurrent converts of the same enquiry must not both pass the
        # unlocked check above and each create their own owner/pet/appointment.
        enquiry = Enquiry.objects.select_for_update().get(pk=pk)
        if enquiry.status == "CONVERTED":
            return Response(EnquirySerializer(enquiry).data)
        if enquiry.status == "DISMISSED":
            return problem(400, "This enquiry has already been dismissed.")

        email = enquiry.email.strip().lower()
        owner_name = f"{enquiry.first_name} {enquiry.last_name}".strip()

        owner = UserProfile.objects.filter(email__iexact=email, role="OWNER").first()
        if owner is None:
            owner = UserProfile(
                username=_unique_owner_username(email),
                email=email,
                role="OWNER",
                first_name=enquiry.first_name,
                last_name=enquiry.last_name,
                phone=enquiry.phone,
            )
            # Never invent a password for someone who never chose one — they
            # set their own via the existing password-reset flow.
            owner.set_unusable_password()
            owner.save()

        # Do not duplicate a pet that already exists for this owner by name.
        pet = Pet.objects.filter(owner=owner, name__iexact=enquiry.pet_name).first()
        if pet is None:
            pet = Pet.objects.create(
                owner=owner,
                doctor=request.user,
                name=enquiry.pet_name,
                species=_guess_species(enquiry.species_breed),
                breed=enquiry.species_breed,
                owner_name=owner_name,
                owner_phone=enquiry.phone,
                owner_email=email,
            )

        appt = Appointment.objects.create(
            pet=pet,
            doctor=request.user,
            pet_name=pet.name,
            owner_name=owner_name or pet.owner_name,
            owner_phone=enquiry.phone,
            date=date,
            time=time,
            visit_type=visit_type,
            visit_type_display=visit_type_labels[visit_type],
            status="Pending",
            reason_notes=enquiry.reason,
        )

        enquiry.status = "CONVERTED"
        enquiry.converted_appointment = appt
        enquiry.actioned_by = request.user
        enquiry.actioned_at = timezone.now()
        enquiry.save()

    return Response(EnquirySerializer(enquiry).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def enquiry_dismiss_view(request, pk):
    """POST /api/v1/enquiries/:id/dismiss — doctor-only. Marks the enquiry
    DISMISSED and keeps the row (audit trail; no delete). Idempotent for a
    repeat dismiss (no-op, returns current state). An already-CONVERTED
    enquiry cannot be dismissed — a real appointment exists for it by then.
    """
    enquiry = get_object_or_404(Enquiry, pk=pk)
    if enquiry.status == "CONVERTED":
        return problem(400, "This enquiry has already been converted and cannot be dismissed.")
    if enquiry.status != "DISMISSED":
        enquiry.status = "DISMISSED"
        enquiry.actioned_by = request.user
        enquiry.actioned_at = timezone.now()
        enquiry.save()
    return Response(EnquirySerializer(enquiry).data)
