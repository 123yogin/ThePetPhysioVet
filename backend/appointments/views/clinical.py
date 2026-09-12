"""Diagnostic report uploads, rehab plans, and per-session progress notes.

Split out of a single 1674-line views.py. Import from `appointments.views`
as before -- every public name is re-exported by the package.
"""

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

from ._shared import _doctor_scoped

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
