"""Owner-to-doctor threads, for both sides.

Both the doctor and owner entry points are here because they share the
message-creation helper. Viewing a patient once created an empty thread,
which filled the inbox with every patient ever opened.

Split out of a single 1674-line views.py. Import from `appointments.views`
as before -- every public name is re-exported by the package.
"""

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

MAX_QUERY_ATTACHMENTS = 5


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
