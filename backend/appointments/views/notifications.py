"""The notification feed and the per-owner SMS opt-out.

Nothing in the app writes a Notification yet -- see the open debt list in
CLAUDE.md.

Split out of a single 1674-line views.py. Import from `appointments.views`
as before -- every public name is re-exported by the package.
"""

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
