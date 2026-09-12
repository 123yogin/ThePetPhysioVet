"""Invoices, payments and the revenue report.

invoices_view rejects a client-supplied tax: GST is computed per line item
server-side. Payments require an idempotency_key (rule 6).

Split out of a single 1674-line views.py. Import from `appointments.views`
as before -- every public name is re-exported by the package.
"""

from datetime import timedelta
from decimal import Decimal, InvalidOperation
from django.db import IntegrityError, transaction
from django.db.models import Max, Q
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

from ._shared import _doctor_scoped, problem

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

    # A client-supplied `tax` is deliberately ignored now. It used to be stored
    # verbatim, so an invoice could carry whatever tax the caller stated; GST is
    # computed from each line's own rate instead.
    if "tax" in request.data:
        return problem(
            400,
            "Tax is calculated from each line item.",
            "Set `tax_rate` on each line item instead of sending an invoice-level `tax`.",
        )

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
            invoice_no=invoice_no, pet=pet, owner=pet.owner, payment_mode=payment_mode,
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
