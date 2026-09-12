"""The owner portal (`/owner/*`).

Every route re-verifies object ownership and raises 404 rather than 403, so
a cross-owner request cannot be used to probe for existence.

Split out of a single 1674-line views.py. Import from `appointments.views`
as before -- every public name is re-exported by the package.
"""

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

from ._shared import problem

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsOwner])
def owner_pets_view(request):
    if request.method == "GET":
        pets = Pet.objects.filter(owner=request.user).select_related("doctor").order_by("-created_at")
        return Response(PetSerializer(pets, many=True, context={"request": request}).data)

    data = request.data.copy()
    if hasattr(data, "setdefault"):
        data.setdefault("owner_name", request.user.get_full_name() or request.user.username)
        data.setdefault("owner_email", request.user.email)
        # Only default from the profile when there is something there. Signup
        # now requires a phone, but accounts created before that do not have
        # one, and `setdefault` with "" was worse than omitting the key: it
        # turned a missing contact number into "owner_phone: This field may
        # not be blank", naming a field the owner's form never rendered.
        if request.user.phone:
            data.setdefault("owner_phone", request.user.phone)
    serializer = PetSerializer(data=data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    # A phone-less legacy account supplies it on the pet form instead; store it
    # on the profile so it is asked exactly once.
    submitted_phone = (serializer.validated_data.get("owner_phone") or "").strip()
    if submitted_phone and not request.user.phone:
        request.user.phone = submitted_phone
        request.user.save(update_fields=["phone"])
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

    # Defaulting this quietly put the wrong visit type on the clinic's schedule:
    # an existing patient booking a follow-up was recorded as a new consultation,
    # and nobody noticed until the appointment itself.
    visit_type = (request.data.get("visit_type") or "").strip()
    if not visit_type:
        return problem(400, "Please choose what this appointment is for.")

    data = {
        "pet": pet.id,
        "date": request.data.get("date"),
        "time": request.data.get("time"),
        "visit_type": visit_type,
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
