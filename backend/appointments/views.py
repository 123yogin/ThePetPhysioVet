"""API views for the Pet Physio Vet backend.

Implements API_CONTRACT.md §3 exactly: doctor-facing routes (top level) and
owner-portal routes (`/owner/*`). See §4 for the authZ rules enforced here:

- Default permission is IsAuthenticated; AllowAny only on /auth/login and
  /auth/signup.
- Doctor routes require role == DOCTOR (`IsDoctor`).
- Owner routes require role == OWNER (`IsOwner`) *and* re-verify object
  ownership in the view via `IsObjectOwner` (raises 404, never 403, so a
  cross-owner request can't be used to probe for existence).
- No anonymous fallback user anywhere.
"""

import re
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from urllib.parse import quote

from django.db import IntegrityError, transaction
from django.db.models import Max, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    UserProfile, Pet, Appointment, DiagnosticReport,
    TreatmentPlan, ProgressNote, Invoice, LineItem, Payment, Package,
    Notification, NotificationPref, QueryThread, QueryMessage, QueryAttachment,
)
from .permissions import IsDoctor, IsOwner, IsObjectOwner
from .serializers import (
    UserProfileSerializer, SignupSerializer, PetSerializer, AppointmentSerializer,
    DiagnosticReportSerializer, TreatmentPlanSerializer, ProgressNoteSerializer,
    InvoiceSerializer, LineItemSerializer, PaymentSerializer, PackageSerializer,
    NotificationSerializer, NotificationPrefSerializer,
    QueryThreadSerializer, QueryMessageSerializer, QueryAttachmentSerializer,
    OwnerPetHistorySerializer,
)

from django.contrib.auth import authenticate


MAX_QUERY_ATTACHMENTS = 5


def problem(status_code, title, detail=None):
    """A minimal RFC-7807 problem-details body for hand-rolled errors.

    (Serializer validation errors still go through DRF's default exception
    handler, which is configured in settings.py — out of scope for this
    file's ownership.)

    Known-issue #12: `detail` used to be omitted whenever the caller didn't
    pass one explicitly. `frontend/src/lib/http.ts` reads
    `detail || message || statusText`, so every hand-rolled 400 without an
    explicit detail rendered as a bare "Bad Request". `detail` now always
    falls back to `title` so the SPA always has something real to show.
    """
    body = {"type": "about:blank", "title": title, "status": status_code, "detail": detail or title}
    return Response(body, status=status_code)


def _issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def current_user_view(request):
    return Response(UserProfileSerializer(request.user).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get("username")
    password = request.data.get("password")

    if not username or not password:
        return problem(400, "username and password are required.")

    # django.contrib.auth.authenticate() — the actual credential check.
    # No username-only lookup, no role-based fallback, no anonymous default.
    user = authenticate(request, username=username, password=password)
    if user is None:
        return problem(401, "Invalid credentials", "Incorrect username or password.")

    access, refresh = _issue_tokens(user)
    data = UserProfileSerializer(user).data
    data["access"] = access
    data["refresh"] = refresh
    return Response(data)


@api_view(["POST"])
@permission_classes([AllowAny])
def signup_view(request):
    serializer = SignupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()

    access, refresh = _issue_tokens(user)
    data = UserProfileSerializer(user).data
    data["access"] = access
    data["refresh"] = refresh
    return Response(data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    # The SPA (frontend/src/api/auth.ts) calls this with no body at all, so
    # a missing `refresh` is not an error — it just means there is nothing
    # to blacklist server-side. Logout still succeeds from the caller's
    # point of view either way.
    refresh_token = request.data.get("refresh")
    if refresh_token:
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            # Already invalid/expired/blacklisted — logout is still
            # successful from the caller's point of view.
            pass
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([AllowAny])
def refresh_view(request):
    """POST /auth/refresh — {refresh} -> {access, refresh} (API_CONTRACT.md
    §3, amendment 4, 2026-08-20). Deliberately AllowAny: the whole point is
    to mint a new access token once the old one has expired, so the caller
    cannot be expected to hold a currently-valid access token — but AllowAny
    at the permission layer never means unauthenticated token issuance: the
    refresh token itself is fully verified (signature, expiry, `token_type`
    claim, blacklist status) before anything is minted.

    Rotates: settings.py sets ROTATE_REFRESH_TOKENS/BLACKLIST_AFTER_ROTATION,
    which used to be dead configuration because this view minted an access
    token without touching the presented refresh token at all — leaving a
    stolen refresh token replayable for its full 7-day life. It now
    blacklists the presented token and mints a fresh one (same rotation
    sequence SimpleJWT's own TokenRefreshSerializer uses: blacklist under the
    old jti, then rotate jti/exp/iat and record the new token as
    outstanding) so a given refresh token is good for exactly one use.
    """
    refresh_token = request.data.get("refresh")
    if not refresh_token:
        return problem(400, "refresh token is required.")
    try:
        token = RefreshToken(refresh_token)
        access = str(token.access_token)
        token.blacklist()
        token.set_jti()
        token.set_exp()
        token.set_iat()
        token.outstand()
        new_refresh = str(token)
    except TokenError:
        return problem(401, "Invalid or expired refresh token.")
    return Response({"access": access, "refresh": new_refresh})


@api_view(["PATCH", "PUT"])
@permission_classes([IsAuthenticated])
def update_profile_view(request):
    serializer = UserProfileSerializer(request.user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

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

    pending_payments = sum(
        (inv.balance_due for inv in Invoice.objects.all() if inv.payment_status != "PAID"),
        Decimal("0.00"),
    )

    month_start = today.replace(day=1)
    today_revenue = sum(
        (p.amount_paid for p in Payment.objects.filter(status="SUCCESS", paid_at__date=today)),
        Decimal("0.00"),
    )
    monthly_revenue = sum(
        (p.amount_paid for p in Payment.objects.filter(
            status="SUCCESS", paid_at__date__gte=month_start, paid_at__date__lte=today,
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


# ---------------------------------------------------------------------------
# Pets (doctor-facing)
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def pets_view(request):
    if request.method == "GET":
        q = request.query_params.get("q", "").strip()
        pets = Pet.objects.select_related("doctor").order_by("-created_at")
        if q:
            pets = pets.filter(
                Q(name__icontains=q) | Q(breed__icontains=q) |
                Q(owner_name__icontains=q) | Q(owner_phone__icontains=q)
            )
        return Response(PetSerializer(pets, many=True, context={"request": request}).data)

    serializer = PetSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    # `doctor` is not a serializer field (client cannot set it), so assign it
    # explicitly. The caller is guaranteed DOCTOR role by IsDoctor above, so
    # attributing the pet to the creating doctor is unambiguous.
    pet = serializer.save(doctor=request.user)
    photo = request.FILES.get("photo")
    if photo:
        pet.photo = photo
        pet.save()
    return Response(
        PetSerializer(pet, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated, IsDoctor])
def pet_detail_view(request, pk):
    pet = get_object_or_404(Pet, pk=pk)
    if request.method == "GET":
        return Response(PetSerializer(pet, context={"request": request}).data)

    serializer = PetSerializer(pet, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    pet = serializer.save()
    photo = request.FILES.get("photo")
    if photo:
        pet.photo = photo
        pet.save()
    return Response(PetSerializer(pet, context={"request": request}).data)


# ---------------------------------------------------------------------------
# Diagnostic reports (doctor-facing)
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def pet_diagnoses_view(request, pk):
    pet = get_object_or_404(Pet, pk=pk)
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
    report = get_object_or_404(DiagnosticReport, pk=pk)
    report.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Treatment plans (doctor-facing)
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def pet_treatment_plans_view(request, pk):
    pet = get_object_or_404(Pet, pk=pk)
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
    plan = get_object_or_404(TreatmentPlan, pk=pk)
    return Response(TreatmentPlanSerializer(plan).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def treatment_plan_progress_notes_view(request, pk):
    plan = get_object_or_404(TreatmentPlan, pk=pk)
    data = dict(request.data)
    # dict(QueryDict) turns list-valued items into single-item lists; flatten.
    data = {k: (v[0] if isinstance(v, list) and len(v) == 1 else v) for k, v in data.items()}
    if not data.get("session_no"):
        data["session_no"] = plan.progress_notes.count() + 1

    serializer = ProgressNoteSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    note = serializer.save(plan=plan)
    return Response(ProgressNoteSerializer(note).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Appointments (doctor-facing)
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def appointments_view(request):
    if request.method == "GET":
        appts = Appointment.objects.all().order_by("date", "time")
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

    serializer = AppointmentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    appt = serializer.save(doctor=request.user)
    return Response(AppointmentSerializer(appt).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDoctor])
def appointment_detail_view(request, pk):
    appt = get_object_or_404(Appointment, pk=pk)
    return Response(AppointmentSerializer(appt).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def appointment_reschedule_view(request, pk):
    appt = get_object_or_404(Appointment, pk=pk)
    date = request.data.get("date")
    time = request.data.get("time")
    if not date or not time:
        return problem(400, "date and time are required.")

    appt.requested_date = date
    appt.requested_time = time
    appt.status = "Reschedule Requested"
    appt.save()
    return Response(AppointmentSerializer(appt).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def appointment_complete_view(request, pk):
    appt = get_object_or_404(Appointment, pk=pk)
    appt.status = "Completed"
    appt.save()
    return Response(AppointmentSerializer(appt).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def appointment_reschedule_approve_view(request, pk):
    appt = get_object_or_404(Appointment, pk=pk)
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
    appt = get_object_or_404(Appointment, pk=pk)
    appt.requested_date = None
    appt.requested_time = None
    appt.reschedule_reason = ""
    appt.status = "Confirmed"
    appt.save()
    return Response(AppointmentSerializer(appt).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDoctor])
def appointment_share_view(request, pk):
    appt = get_object_or_404(Appointment, pk=pk)
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


# ---------------------------------------------------------------------------
# Billing (doctor-facing)
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def invoices_view(request):
    if request.method == "GET":
        invoices = Invoice.objects.all().order_by("-created_at")
        pet_id = request.query_params.get("pet")
        if pet_id:
            invoices = invoices.filter(pet_id=pet_id)
        return Response(InvoiceSerializer(invoices, many=True).data)

    pet_id = request.data.get("pet_id") or request.data.get("pet")
    if not pet_id:
        return problem(400, "pet_id is required.")
    pet = get_object_or_404(Pet, pk=pet_id)

    line_items_data = request.data.get("line_items") or []
    if not isinstance(line_items_data, list) or not line_items_data:
        return problem(400, "At least one line item is required.")

    try:
        tax = Decimal(str(request.data.get("tax") or "0"))
    except InvalidOperation:
        return problem(400, "tax must be a number.")

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
            invoice_no=invoice_no, pet=pet, owner=pet.owner, tax=tax, payment_mode=payment_mode,
        )

        for item_serializer in item_serializers:
            LineItem.objects.create(invoice=invoice, **item_serializer.validated_data)

        if total_sessions > 0:
            Package.objects.create(invoice=invoice, total_sessions=total_sessions, used_sessions=0)

    return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDoctor])
def invoice_detail_view(request, pk):
    invoice = get_object_or_404(Invoice, pk=pk)
    return Response(InvoiceSerializer(invoice).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def invoice_payments_view(request, pk):
    invoice = get_object_or_404(Invoice, pk=pk)
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

    invoices = Invoice.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    total_revenue = sum((inv.total for inv in invoices), Decimal("0.00"))

    def _collected(gte, lte):
        payments = Payment.objects.filter(status="SUCCESS", paid_at__date__gte=gte, paid_at__date__lte=lte)
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


# ---------------------------------------------------------------------------
# Notifications (any authenticated user, scoped to themselves)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Queries (doctor-facing) — append-only threads
# ---------------------------------------------------------------------------

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


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDoctor])
def queries_inbox_view(request):
    threads = QueryThread.objects.annotate(latest=Max("messages__sent_at")).order_by("-latest")
    return Response({"results": QueryThreadSerializer(threads, many=True, context={"request": request}).data})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def pet_queries_view(request, pk):
    pet = get_object_or_404(Pet, pk=pk)
    thread, _ = QueryThread.objects.get_or_create(pet=pet)
    if request.method == "GET":
        return Response(QueryThreadSerializer(thread, context={"request": request}).data)
    return _create_query_message(request, thread, sender_role="DOCTOR")


# ---------------------------------------------------------------------------
# Owner portal — every handler filters by request.user; cross-owner access
# to a specific object returns 404, never 403 (API_CONTRACT.md §4.3).
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsOwner])
def owner_pets_view(request):
    if request.method == "GET":
        pets = Pet.objects.filter(owner=request.user).select_related("doctor").order_by("-created_at")
        return Response(PetSerializer(pets, many=True, context={"request": request}).data)

    data = request.data.copy()
    if hasattr(data, "setdefault"):
        data.setdefault("owner_name", request.user.get_full_name() or request.user.username)
        data.setdefault("owner_phone", request.user.phone)
        data.setdefault("owner_email", request.user.email)
    serializer = PetSerializer(data=data, context={"request": request})
    serializer.is_valid(raise_exception=True)
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
        appts = Appointment.objects.filter(pet__owner=request.user).order_by("date", "time")
        return Response(AppointmentSerializer(appts, many=True).data)

    pet_id = request.data.get("pet_id") or request.data.get("pet")
    if not pet_id:
        return problem(400, "pet_id is required.")
    pet = get_object_or_404(Pet, pk=pet_id)
    IsObjectOwner().has_object_permission(request, None, pet)

    data = {
        "pet": pet.id,
        "date": request.data.get("date"),
        "time": request.data.get("time"),
        "visit_type": request.data.get("visit_type", "Initial"),
        "reason_notes": request.data.get("reason_notes", ""),
    }
    serializer = AppointmentSerializer(data=data)
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


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsOwner])
def owner_invoices_view(request):
    invoices = Invoice.objects.filter(owner=request.user).order_by("-created_at")
    return Response(InvoiceSerializer(invoices, many=True).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsOwner])
def owner_pet_queries_view(request, pk):
    pet = get_object_or_404(Pet, pk=pk)
    IsObjectOwner().has_object_permission(request, None, pet)

    thread, _ = QueryThread.objects.get_or_create(pet=pet)
    if request.method == "GET":
        return Response(QueryThreadSerializer(thread, context={"request": request}).data)
    return _create_query_message(request, thread, sender_role="OWNER")
