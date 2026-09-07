"""Booking, rescheduling, confirming and completing visits.

appointment_options_view is the single source of truth for visit types --
three forms once invented their own vocabulary and every option on two of
them returned HTTP 400. Never hardcode the list again.

Split out of a single 1674-line views.py. Import from `appointments.views`
as before -- every public name is re-exported by the package.
"""

import re
from urllib.parse import quote
from django.db.models import Max, Q
from django.shortcuts import get_object_or_404
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

from ._shared import _doctor_scoped, problem

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
