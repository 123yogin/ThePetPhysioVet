"""Indoor-facility (day-care) slot bookings.

Three surfaces:

  GET  /api/v1/facility/availability?date=  PUBLIC  -- beds left per slot
  POST /api/v1/facility/bookings            PUBLIC  -- hold 1-3 slots
  GET  /api/v1/facility/bookings            DOCTOR  -- the day's bookings
  POST /api/v1/facility/bookings/<ref>/status  DOCTOR -- confirm / cancel

The public write mirrors the enquiry intake exactly (honeypot + two rate-limit
windows + RFC-7807 problems), because it is the same threat: an unauthenticated
endpoint that mints rows. It differs in one way that matters -- these rows are
*inventory*, so the write is transactional and re-checks capacity under a lock
before committing.
"""
from datetime import date as date_cls

from django.db import transaction
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status as http_status

from ..models import (
    FacilityBooking, FACILITY_BEDS, FACILITY_MAX_SLOTS_PER_BOOKING,
    FACILITY_SLOTS, FACILITY_SLOT_INDEXES, slot_label,
)
from ..serializers import FacilityBookingCreateSerializer, FacilityBookingSerializer
from ._shared import _client_ip, _first_error_detail, _rate_limited, problem

# Same two-window rationale as the enquiry intake: one window per IP, one per
# phone, so neither a spray from one source nor a targeted run against one
# number can exhaust the six beds without bound.
FACILITY_WINDOW_SECONDS = 60 * 60
FACILITY_IP_LIMIT = 15
FACILITY_PHONE_LIMIT = 6


def _slot_counts(date_value, slots=None):
    """Active (bed-occupying) booking count per slot for a date.

    Returns {slot_index: count}. Only ACTIVE_STATUSES occupy a bed, so a
    cancelled row frees its slot immediately.
    """
    qs = FacilityBooking.objects.filter(
        date=date_value, status__in=FacilityBooking.ACTIVE_STATUSES,
    )
    if slots is not None:
        qs = qs.filter(slot__in=slots)
    counts = {}
    for row in qs.values_list("slot", flat=True):
        counts[row] = counts.get(row, 0) + 1
    return counts


def _availability_payload(date_value):
    counts = _slot_counts(date_value)
    return {
        "date": date_value.isoformat(),
        "beds_total": FACILITY_BEDS,
        "max_slots_per_booking": FACILITY_MAX_SLOTS_PER_BOOKING,
        "slots": [
            {
                "slot": s["slot"],
                "start": s["start"],
                "end": s["end"],
                "label": slot_label(s["slot"]),
                "beds_total": FACILITY_BEDS,
                "beds_available": max(0, FACILITY_BEDS - counts.get(s["slot"], 0)),
            }
            for s in FACILITY_SLOTS
        ],
    }


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def facility_availability_view(request):
    """GET /api/v1/facility/availability?date=YYYY-MM-DD -- PUBLIC.

    Beds left in each slot for one day. Past dates are allowed to be queried
    (they simply read zero-ish); the *booking* endpoint is where a past date
    is refused, so the calendar can grey a day out without a second contract.
    """
    raw = request.query_params.get("date")
    if not raw:
        return problem(400, "Missing date", "A ?date=YYYY-MM-DD query parameter is required.")
    try:
        date_value = date_cls.fromisoformat(raw)
    except ValueError:
        return problem(400, "Invalid date", "date must be in YYYY-MM-DD format.")
    return Response(_availability_payload(date_value))


def _facility_create(request):
    ip = _client_ip(request)
    if _rate_limited(f"facility:ip:{ip}", FACILITY_IP_LIMIT, FACILITY_WINDOW_SECONDS):
        return problem(429, "Too many requests", "Too many booking attempts. Please try again later.")

    # Honeypot: a normal-looking success, nothing written. Same reasoning as the
    # enquiry form -- telling a bot it was caught tells it what to change.
    if str(request.data.get("website", "")).strip():
        return Response(
            {"reference": "FAC-RECEIVED", "detail": "Thanks! Your booking request has been received."},
            status=http_status.HTTP_201_CREATED,
        )

    serializer = FacilityBookingCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return problem(400, "Invalid input", _first_error_detail(serializer.errors))
    data = serializer.validated_data

    # De-duplicate and validate the requested slots against the fixed menu and
    # the per-booking cap, before touching the database.
    slots = sorted(set(data["slots"]))
    if not slots:
        return problem(400, "No slot chosen", "Choose at least one time slot.")
    if len(slots) > FACILITY_MAX_SLOTS_PER_BOOKING:
        return problem(
            400, "Too many slots",
            f"You can book at most {FACILITY_MAX_SLOTS_PER_BOOKING} slots in one request.",
        )
    unknown = [s for s in slots if s not in FACILITY_SLOT_INDEXES]
    if unknown:
        return problem(400, "Unknown slot", "One or more chosen slots are not offered.")

    if data["date"] < date_cls.today():
        return problem(400, "Date in the past", "Choose today or a future date.")

    phone = data["owner_phone"]
    if _rate_limited(f"facility:phone:{phone}", FACILITY_PHONE_LIMIT, FACILITY_WINDOW_SECONDS):
        return problem(429, "Too many requests", "Too many booking attempts. Please try again later.")

    import uuid as _uuid
    reference = f"FAC-{_uuid.uuid4().hex[:6].upper()}"

    # The capacity check and the insert are one transaction, and the existing
    # active rows for these (date, slot)s are locked first, so two requests for
    # the last bed cannot both pass the check.
    #
    # DEV NOTE: select_for_update locks *existing* rows, not the empty space a
    # new row would take, so on Postgres two concurrent transactions could still
    # both see five and both insert a sixth-and-seventh. SQLite (dev) serialises
    # writes at the database level, so this is correct here. Production must add
    # a real guard -- a per-(date,slot) counter row locked FOR UPDATE, or a
    # Postgres check via a bed index + partial unique constraint. Called out so
    # it is not mistaken for production-ready.
    try:
        with transaction.atomic():
            list(
                FacilityBooking.objects.select_for_update().filter(
                    date=data["date"], slot__in=slots,
                    status__in=FacilityBooking.ACTIVE_STATUSES,
                )
            )
            counts = _slot_counts(data["date"], slots)
            full = [s for s in slots if counts.get(s, 0) >= FACILITY_BEDS]
            if full:
                labels = ", ".join(slot_label(s) for s in full)
                return problem(
                    409, "Slot full",
                    f"These slots just filled up: {labels}. Please pick another time.",
                )
            FacilityBooking.objects.bulk_create([
                FacilityBooking(
                    reference=reference, date=data["date"], slot=s,
                    pet_name=data["pet_name"], owner_name=data["owner_name"],
                    owner_phone=phone, owner_email=data.get("owner_email", ""),
                    note=data.get("note", ""), status="PENDING",
                )
                for s in slots
            ])
    except Exception:  # pragma: no cover - defensive; surfaced as a clean 409
        return problem(409, "Could not book", "Those slots could not be held. Please try again.")

    return Response(
        {
            "reference": reference,
            "date": data["date"].isoformat(),
            "slots": [{"slot": s, "label": slot_label(s)} for s in slots],
            "status": "PENDING",
            "detail": (
                f"Thanks, {data['owner_name']}! We've held "
                f"{len(slots)} slot(s) for {data['pet_name']} on {data['date'].isoformat()} "
                f"(reference {reference}). The clinic will confirm shortly."
            ),
        },
        status=http_status.HTTP_201_CREATED,
    )


def _facility_list(request):
    """GET /api/v1/facility/bookings -- doctor inbox. `?date=` and `?status=`
    filter; results are grouped by reference so the portal shows one card per
    visitor request rather than one row per slot. Caller is already a DOCTOR.
    """
    qs = FacilityBooking.objects.all()
    date_filter = request.query_params.get("date")
    if date_filter:
        try:
            qs = qs.filter(date=date_cls.fromisoformat(date_filter))
        except ValueError:
            return problem(400, "Invalid date", "date must be in YYYY-MM-DD format.")
    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status=status_filter)

    rows = FacilityBookingSerializer(qs, many=True).data
    groups = {}
    for row in rows:
        g = groups.setdefault(row["reference"], {
            "reference": row["reference"],
            "date": row["date"],
            "pet_name": row["pet_name"],
            "owner_name": row["owner_name"],
            "owner_phone": row["owner_phone"],
            "owner_email": row["owner_email"],
            "note": row["note"],
            "status": row["status"],
            "created_at": row["created_at"],
            "slots": [],
        })
        g["slots"].append({"slot": row["slot"], "label": row["slot_label"], "status": row["status"]})
    results = sorted(groups.values(), key=lambda g: (g["date"], g["created_at"]))
    pending_count = FacilityBooking.objects.filter(status="PENDING").values("reference").distinct().count()
    return Response({"results": results, "pending_count": pending_count})


@api_view(["GET", "POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def facility_bookings_view(request):
    """POST is the PUBLIC intake; GET is the DOCTOR inbox. Same split-posture
    pattern as `enquiries_view`: `authentication_classes([])` opts out of the
    global JWT pipeline (which raises on a stale token a random visitor may
    carry) and GET authenticates by hand.
    """
    if request.method == "POST":
        return _facility_create(request)

    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework.exceptions import AuthenticationFailed
    try:
        auth_result = JWTAuthentication().authenticate(request)
    except AuthenticationFailed as exc:
        return problem(401, "Not signed in", str(exc.detail) if exc.detail else "Invalid or expired token.")
    if auth_result is None:
        return problem(401, "Not signed in", "Authentication credentials were not provided.")
    user, _token = auth_result
    if getattr(user, "role", None) != "DOCTOR":
        return problem(403, "Not allowed", "This action requires a doctor account.")
    request.user = user
    return _facility_list(request)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def facility_booking_status_view(request, reference):
    """POST /api/v1/facility/bookings/<reference>/status -- DOCTOR only.

    Confirms or cancels every slot in a booking group at once. Cancelling frees
    the beds (they stop counting against capacity the instant the status flips).
    """
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework.exceptions import AuthenticationFailed
    try:
        auth_result = JWTAuthentication().authenticate(request)
    except AuthenticationFailed as exc:
        return problem(401, "Not signed in", str(exc.detail) if exc.detail else "Invalid or expired token.")
    if auth_result is None:
        return problem(401, "Not signed in", "Authentication credentials were not provided.")
    user, _token = auth_result
    if getattr(user, "role", None) != "DOCTOR":
        return problem(403, "Not allowed", "This action requires a doctor account.")

    new_status = str(request.data.get("status", "")).upper()
    allowed = {"CONFIRMED", "CANCELLED", "COMPLETED"}
    if new_status not in allowed:
        return problem(400, "Invalid status", f"status must be one of {', '.join(sorted(allowed))}.")

    updated = FacilityBooking.objects.filter(reference=reference).update(status=new_status)
    if updated == 0:
        return problem(404, "Not found", "That booking does not exist, or has been removed.")
    return Response({"reference": reference, "status": new_status, "slots_updated": updated})
