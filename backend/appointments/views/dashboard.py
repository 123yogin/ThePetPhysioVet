"""The clinic dashboard tiles.

Split out of a single 1674-line views.py. Import from `appointments.views`
as before -- every public name is re-exported by the package.
"""

from decimal import Decimal, InvalidOperation
from django.utils import timezone
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

from ._shared import _doctor_scoped

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
