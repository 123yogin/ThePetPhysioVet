"""Indoor-facility BOARDING (stays priced by duration).

Public surface:
  GET  /facility/boarding/availability?check_in=&duration=
       -> the duration menu + walk options + capacity, and (when both params are
          given) free beds / price / check-out for that selection.
  POST /facility/boarding
       -> create a PENDING stay. Owners hit this from the marketing site; a
          signed-in doctor hits the same path from the portal (source="doctor",
          no honeypot/rate-limit).

Doctor surface (same endpoints, auth by hand — the split-posture pattern used by
enquiries and facility bookings):
  GET  /facility/boarding                     the stays inbox
  POST /facility/boarding/<ref>/status        confirm / check-in / complete / cancel

Capacity is six beds counted per DATE over a stay's range (a month-long stay
holds a bed on all thirty dates). Unlike the hourly slots this is an
application-level check, not a DB constraint — acceptable because boarding is
paid and confirmed at the clinic, so there is no last-bed race to protect.
"""
import uuid as _uuid
from datetime import date as date_cls, timedelta

from django.db import transaction
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status as http_status

from ..models import (
    BoardingBooking, BOARDING_BEDS, BOARDING_DURATIONS, BOARDING_DURATION_KEYS,
    BOARDING_WALK_OPTIONS, duration_days, duration_price, duration_label,
)
from ..serializers import BoardingCreateSerializer, BoardingSerializer
from ._shared import _client_ip, _first_error_detail, _rate_limited, problem

BOARDING_WINDOW_SECONDS = 60 * 60
BOARDING_IP_LIMIT = 15
BOARDING_PHONE_LIMIT = 6


def _maybe_doctor(request):
    """Return the DOCTOR user if the request carries a valid doctor token, else
    None. Never raises — a stale/absent token just means "treat as public"."""
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework.exceptions import AuthenticationFailed
    try:
        result = JWTAuthentication().authenticate(request)
    except AuthenticationFailed:
        return None
    if result is None:
        return None
    user, _token = result
    return user if getattr(user, "role", None) == "DOCTOR" else None


def _require_doctor(request):
    """For the doctor-only reads/actions. Returns (user, None) or (None, problem)."""
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework.exceptions import AuthenticationFailed
    try:
        result = JWTAuthentication().authenticate(request)
    except AuthenticationFailed as exc:
        return None, problem(401, "Not signed in", str(exc.detail) if exc.detail else "Invalid or expired token.")
    if result is None:
        return None, problem(401, "Not signed in", "Authentication credentials were not provided.")
    user, _token = result
    if getattr(user, "role", None) != "DOCTOR":
        return None, problem(403, "Not allowed", "This action requires a doctor account.")
    return user, None


def _max_concurrent(check_in, check_out, exclude_ref=None):
    """Peak number of active stays occupying any single date in the range."""
    qs = BoardingBooking.objects.filter(
        BoardingBooking.active_q(), check_in__lte=check_out, check_out__gte=check_in,
    )
    if exclude_ref:
        qs = qs.exclude(reference=exclude_ref)
    intervals = list(qs.values_list("check_in", "check_out"))
    peak, d = 0, check_in
    while d <= check_out:
        c = sum(1 for ci, co in intervals if ci <= d <= co)
        peak = max(peak, c)
        d += timedelta(days=1)
    return peak


def _menu_payload():
    return {
        "capacity": BOARDING_BEDS,
        "durations": [
            {"key": d["key"], "label": d["label"], "days": d["days"], "price": d["price"]}
            for d in BOARDING_DURATIONS
        ],
        "walk_options": [
            {"key": w["key"], "label": w["label"], "minutes": w["minutes"]}
            for w in BOARDING_WALK_OPTIONS
        ],
    }


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def boarding_availability_view(request):
    """PUBLIC. Always returns the duration/walk menu + capacity. When
    ?check_in=YYYY-MM-DD&duration=<key> are both given, adds a `selection` with
    free beds, computed check-out and price for that choice."""
    payload = _menu_payload()
    raw = request.query_params.get("check_in")
    duration = request.query_params.get("duration")
    if raw and duration:
        try:
            check_in = date_cls.fromisoformat(raw)
        except ValueError:
            return problem(400, "Invalid date", "check_in must be in YYYY-MM-DD format.")
        if duration not in BOARDING_DURATION_KEYS:
            return problem(400, "Unknown duration", "That stay length is not offered.")
        check_out = check_in + timedelta(days=max(0, duration_days(duration) - 1))
        used = _max_concurrent(check_in, check_out)
        payload["selection"] = {
            "check_in": check_in.isoformat(),
            "duration": duration,
            "duration_label": duration_label(duration),
            "check_out": check_out.isoformat(),
            "price": duration_price(duration),
            "available": max(0, BOARDING_BEDS - used),
        }
    return Response(payload)


def _boarding_create(request):
    doctor = _maybe_doctor(request)

    if doctor is None:
        ip = _client_ip(request)
        if _rate_limited(f"boarding:ip:{ip}", BOARDING_IP_LIMIT, BOARDING_WINDOW_SECONDS):
            return problem(429, "Too many requests", "Too many booking attempts. Please try again later.")
        # Honeypot: a plausible success, nothing written.
        if str(request.data.get("website", "")).strip():
            return Response(
                {"reference": "BRD-RECEIVED", "detail": "Thanks! Your boarding request has been received."},
                status=http_status.HTTP_201_CREATED,
            )

    serializer = BoardingCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return problem(400, "Invalid input", _first_error_detail(serializer.errors))
    data = dict(serializer.validated_data)
    data.pop("website", None)

    if doctor is None:
        phone = data["owner_phone"]
        if _rate_limited(f"boarding:phone:{phone}", BOARDING_PHONE_LIMIT, BOARDING_WINDOW_SECONDS):
            return problem(429, "Too many requests", "Too many booking attempts. Please try again later.")

    check_in = data["check_in"]
    check_out = check_in + timedelta(days=max(0, duration_days(data["duration"]) - 1))

    with transaction.atomic():
        if _max_concurrent(check_in, check_out) >= BOARDING_BEDS:
            return problem(
                409, "Fully booked",
                "All beds are taken for those dates. Please choose a different date or duration.",
            )
        reference = f"BRD-{_uuid.uuid4().hex[:6].upper()}"
        booking = BoardingBooking(
            reference=reference,
            source="doctor" if doctor else "owner",
            status="CONFIRMED" if doctor else "PENDING",
            **data,
        )
        booking.save()  # derives check_out + price

    return Response(
        {
            "reference": reference,
            "check_in": check_in.isoformat(),
            "check_out": booking.check_out.isoformat(),
            "duration": data["duration"],
            "price": booking.price,
            "status": booking.status,
            "detail": (
                f"Thanks, {data['owner_name']}! {data['pet_name']}'s stay is booked "
                f"(reference {reference}, ₹{booking.price}). The clinic will confirm by phone."
            ),
        },
        status=http_status.HTTP_201_CREATED,
    )


def _boarding_list(request):
    qs = BoardingBooking.objects.all()
    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status=status_filter)
    results = BoardingSerializer(qs, many=True).data
    pending_count = BoardingBooking.objects.filter(status="PENDING").count()
    return Response({"results": results, "pending_count": pending_count})


@api_view(["GET", "POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def boarding_view(request):
    """POST = public/doctor intake; GET = doctor inbox."""
    if request.method == "POST":
        return _boarding_create(request)
    _user, err = _require_doctor(request)
    if err:
        return err
    return _boarding_list(request)


# Actions a doctor can take, and the status each moves the stay to.
_BOARDING_ACTIONS = {
    "confirm": "CONFIRMED",
    "check_in": "CHECKED_IN",
    "complete": "COMPLETED",
    "cancel": "CANCELLED",
}


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def boarding_status_view(request, reference):
    """POST /api/v1/facility/boarding/<ref>/status {action} -- DOCTOR only.
    action in confirm / check_in / complete / cancel."""
    _user, err = _require_doctor(request)
    if err:
        return err
    action = str(request.data.get("action", "")).strip()
    new_status = _BOARDING_ACTIONS.get(action)
    if new_status is None:
        return problem(400, "Unknown action", "action must be confirm, check_in, complete or cancel.")
    booking = BoardingBooking.objects.filter(reference=reference).first()
    if booking is None:
        return problem(404, "Not found", "No boarding booking with that reference.")

    # The clinic records what the owner brought here (owner vs clinic per item)
    # and any food note — this intake lives in the app only, not on the public
    # form. Any subset may be sent alongside the status change.
    updated = ["status"]
    for f in ("food_by", "utensils_by", "medicines_by", "blanket_by"):
        v = request.data.get(f)
        if v in ("clinic", "owner"):
            setattr(booking, f, v)
            updated.append(f)
    if "food_preference" in request.data:
        booking.food_preference = str(request.data.get("food_preference") or "")[:200]
        updated.append("food_preference")

    # Stamp the check-in time once, so the stay's end (check-in + duration) — and
    # therefore the "ending soon" warning — is anchored to when the pet actually
    # arrived, not when it was booked.
    if action == "check_in" and booking.checked_in_at is None:
        from django.utils import timezone
        booking.checked_in_at = timezone.now()
        updated.append("checked_in_at")

    booking.status = new_status
    booking.save(update_fields=updated)
    return Response({"reference": reference, "status": new_status})


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def boarding_ending_soon_view(request):
    """DOCTOR only. Checked-in stays that finish within the next 15 minutes, or
    are already past their end (overdue) — so the clinic can prepare the pickup
    / hand-off. Returns the list plus a count for the sidebar badge."""
    from django.utils import timezone
    from datetime import timedelta

    _user, err = _require_doctor(request)
    if err:
        return err

    LEAD_MINUTES = 15
    now = timezone.now()
    horizon = now + timedelta(minutes=LEAD_MINUTES)

    results = []
    for b in BoardingBooking.objects.filter(status="CHECKED_IN").exclude(checked_in_at=None):
        ends = b.ends_at()
        if ends is None or ends > horizon:
            continue
        minutes_left = int((ends - now).total_seconds() // 60)
        results.append({
            "reference": b.reference,
            "pet_name": b.pet_name,
            "owner_name": b.owner_name,
            "owner_phone": b.owner_phone,
            "duration_label": duration_label(b.duration),
            "ends_at": ends.isoformat(),
            "minutes_left": minutes_left,
            "overdue": minutes_left < 0,
        })

    # Soonest to end (most negative = most overdue) first.
    results.sort(key=lambda r: r["minutes_left"])
    return Response({"results": results, "count": len(results)})
