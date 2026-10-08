"""Diagnostic report uploads, rehab plans, and per-session progress notes.

Split out of a single 1674-line views.py. Import from `appointments.views`
as before -- every public name is re-exported by the package.
"""

from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from ..models import (
    Pet, DiagnosticReport, TreatmentPlan, RehabSession,
)
from ..permissions import IsDoctor
from ..serializers import (
    DiagnosticReportSerializer, TreatmentPlanSerializer, ProgressNoteSerializer,
    RehabSessionSerializer,
)
from .. import rehab

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
        plans = pet.treatment_plans.prefetch_related("sessions__done_by")
        return Response(TreatmentPlanSerializer(plans, many=True).data)

    serializer = TreatmentPlanSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    with transaction.atomic():
        plan = serializer.save(pet=pet)
    return Response(TreatmentPlanSerializer(plan).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated, IsDoctor])
def treatment_plan_detail_view(request, pk):
    # Follow-up L1 fix (2026-08-21): reached only via its pet — see
    # `_doctor_scoped`.
    base = _doctor_scoped(TreatmentPlan, request, lookup="pet__doctor")
    if request.method == "PATCH":
        # Row lock so a PATCH and an extend on the same plan serialise.
        with transaction.atomic():
            plan = get_object_or_404(base.select_for_update(of=("self",)), pk=pk)
            serializer = TreatmentPlanSerializer(plan, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            plan = serializer.save()
        return Response(TreatmentPlanSerializer(plan).data)
    plan = get_object_or_404(base, pk=pk)
    return Response(TreatmentPlanSerializer(plan).data)


class _ExtendSerializer(serializers.Serializer):
    days = serializers.IntegerField(min_value=1, max_value=rehab.MAX_PLAN_DAYS, default=7)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def treatment_plan_extend_view(request, pk):
    base = _doctor_scoped(TreatmentPlan, request, lookup="pet__doctor")
    with transaction.atomic():
        plan = get_object_or_404(base.select_for_update(of=("self",)), pk=pk)
        serializer = _ExtendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        old_end = plan.end_date or (plan.start_date + timedelta(days=rehab.DEFAULT_PLAN_DAYS - 1))
        # A lapsed plan extends from yesterday, not from its stale end date, so
        # the new window never starts in the past (no instantly-MISSED rows).
        today = timezone.localdate()
        base = max(old_end, today - timedelta(days=1))
        new_end = base + timedelta(days=serializer.validated_data["days"])
        if (new_end - plan.start_date).days + 1 > rehab.MAX_PLAN_DAYS:
            raise serializers.ValidationError({"days": "A plan can span at most 366 days."})
        plan.end_date = new_end
        plan.save(update_fields=["end_date", "updated_at"])
        rehab.sync_sessions(
            plan, timezone.localdate(), backfill_from=base + timedelta(days=1),
        )
    return Response(TreatmentPlanSerializer(plan).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def rehab_therapies_view(request):
    return Response({"groups": rehab.THERAPY_GROUPS, "frequencies": rehab.FREQUENCIES})


def _session_with_context(session):
    data = RehabSessionSerializer(session).data
    plan = session.plan
    data["pet"] = {"id": str(plan.pet_id), "name": plan.pet.name}
    data["plan"] = {"id": str(plan.id), "start_date": plan.start_date, "end_date": plan.end_date}
    return data


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDoctor])
def rehab_today_view(request):
    today = timezone.localdate()
    qs = (
        _doctor_scoped(RehabSession, request, lookup="plan__pet__doctor")
        .filter(plan__status="ACTIVE")
        .select_related("plan__pet", "done_by")
    )
    # Everything planned for today (any status, so a ticked row stays visible
    # as done) and every still-DUE session from earlier days.
    due = qs.filter(planned_date=today).order_by("plan__pet__name", "therapy")
    pending = qs.filter(status="DUE", planned_date__lt=today).order_by(
        "planned_date", "plan__pet__name", "therapy",
    )
    return Response({
        "today": today,
        "due": [_session_with_context(s) for s in due],
        "pending": [_session_with_context(s) for s in pending],
    })


class _DoneSerializer(serializers.Serializer):
    done_on = serializers.DateField(required=False)
    note = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class _SkipSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=2000)


def _locked_session(request, pk):
    """Doctor-scoped (404 for another practice's) row, locked for the update."""
    base = _doctor_scoped(RehabSession, request, lookup="plan__pet__doctor")
    return get_object_or_404(base.select_related("plan__pet").select_for_update(of=("self",)), pk=pk)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def rehab_session_done_view(request, pk):
    serializer = _DoneSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    today = timezone.localdate()
    with transaction.atomic():
        session = _locked_session(request, pk)
        done_on = serializer.validated_data.get("done_on", today)
        if done_on > today:
            raise serializers.ValidationError({"done_on": "Cannot be in the future."})
        if done_on < session.planned_date:
            raise serializers.ValidationError({"done_on": "Cannot be before the planned date."})
        session.status = "DONE"
        session.done_on = done_on
        session.done_by = request.user
        session.skip_reason = ""
        if "note" in serializer.validated_data:
            session.note = serializer.validated_data["note"]
        session.save()
    return Response(RehabSessionSerializer(session).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def rehab_session_skip_view(request, pk):
    serializer = _SkipSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    with transaction.atomic():
        session = _locked_session(request, pk)
        session.status = "SKIPPED"
        session.done_on = None
        session.done_by = request.user
        session.skip_reason = serializer.validated_data.get("reason", "")
        session.save()
    return Response(RehabSessionSerializer(session).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def rehab_session_undo_view(request, pk):
    with transaction.atomic():
        session = _locked_session(request, pk)
        session.status = "DUE"
        session.done_on = None
        session.done_by = None
        session.skip_reason = ""
        session.save()
    return Response(RehabSessionSerializer(session).data)


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
