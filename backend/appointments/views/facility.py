"""Indoor-facility (day-care) slot bookings.

Public surface:
  GET  /facility/availability?date=          beds free per slot
  POST /facility/holds                       hold 1-3 slots (BookMyShow-style)
  POST /facility/holds/<ref>/confirm         confirm a hold within its countdown
  POST /facility/bookings                    direct one-shot book (no hold step)

Doctor surface:
  GET  /facility/bookings                    the day's bookings, grouped
  POST /facility/bookings/<ref>/status       confirm / cancel / complete

The public writes mirror the enquiry intake (honeypot + rate-limit + RFC-7807),
because it is the same threat: an unauthenticated endpoint that mints rows. They
differ in that these rows are *inventory* -- overbooking is prevented at the
database by the per-(date, slot, bed_index) unique constraint, so two requests
racing for the last bed cannot both succeed on Postgres, not only on SQLite. See
_reserve_slots.
"""
import uuid as _uuid
from datetime import date as date_cls, timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status as http_status

from ..models import (
    FacilityBooking, FACILITY_BEDS, FACILITY_MAX_SLOTS_PER_BOOKING,
    FACILITY_HOLD_SECONDS, FACILITY_SLOTS, FACILITY_SLOT_INDEXES, slot_label,
)
from ..serializers import (
    FacilityBookingCreateSerializer, FacilityBookingSerializer,
    FacilityHoldSerializer, FacilityConfirmSerializer,
)
from ._shared import _client_ip, _first_error_detail, _rate_limited, problem

# Same two-window rationale as the enquiry intake: one window per IP, one per
# phone, so neither a spray from one source nor a targeted run against one
# number can exhaust the six beds without bound.
FACILITY_WINDOW_SECONDS = 60 * 60
FACILITY_IP_LIMIT = 15
FACILITY_PHONE_LIMIT = 6


def _slot_counts(date_value, slots=None):
    """Bed-occupying booking count per slot for a date.

    Returns {slot_index: count}. A bed is occupied by a CONFIRMED/PENDING
    booking OR a HELD one whose hold has not expired -- so a cancelled row and
    an expired hold both free their slot with no sweep. See
    FacilityBooking.occupies_bed_q.
    """
    qs = FacilityBooking.objects.filter(
        FacilityBooking.occupies_bed_q(timezone.now()), date=date_value,
    )
    if slots is not None:
        qs = qs.filter(slot__in=slots)
    counts = {}
    for row in qs.values_list("slot", flat=True):
        counts[row] = counts.get(row, 0) + 1
    return counts


def _validate_slots(data):
    """Shared slot validation for booking and holding. Returns (slots, error);
    error is a `problem(...)` Response or None."""
    slots = sorted(set(data["slots"]))
    if not slots:
        return None, problem(400, "No slot chosen", "Choose at least one time slot.")
    if len(slots) > FACILITY_MAX_SLOTS_PER_BOOKING:
        return None, problem(
            400, "Too many slots",
            f"You can book at most {FACILITY_MAX_SLOTS_PER_BOOKING} slots in one request.",
        )
    if [s for s in slots if s not in FACILITY_SLOT_INDEXES]:
        return None, problem(400, "Unknown slot", "One or more chosen slots are not offered.")
    if data["date"] < date_cls.today():
        return None, problem(400, "Date in the past", "Choose today or a future date.")
    return slots, None


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


def _reserve_slots(date_value, slots, make_row):
    """Atomically assign a specific bed (0-5) per slot and insert one row each.

    `make_row(slot, bed_index)` builds the FacilityBooking to create. Returns a
    `problem(...)` Response on failure (409 slot full), or None on success.
    Shared by direct booking and holding so the capacity rule lives in one place.

    Overbooking is prevented by the DATABASE, not by this code reading a count:
    the `uniq_active_bed_per_date_slot` constraint means two bookings can never
    hold the same (date, slot, bed_index). We pick the lowest free bed and
    insert; if a concurrent request took that same bed between our read and our
    write, the insert raises IntegrityError and we retry with the next free bed
    (see the retry note below). This is correct on Postgres (the production DB)
    as well as SQLite -- it does not depend on select_for_update seeing a
    not-yet-inserted row.

    Expired holds are reaped to CANCELLED first, inside the same transaction, so
    their bed frees up and the static partial-unique condition stays consistent
    with real availability (the condition cannot reference `now`).

    A bed collision is RETRIED, not reported as "slot full". `select_for_update`
    can only lock rows that already exist, so on an empty slot concurrent
    requests do not serialise: they all read "0 taken", all pick the lowest free
    bed, and all but one trip the unique constraint on insert. Returning 409 to
    every loser then refuses visitors while beds are still free -- observed under
    a 7-way race on production: five beds booked, one still free, two requests
    wrongly refused. So on IntegrityError we re-read and take the next free bed;
    only a genuinely full slot 409s. Bounded by the bed count -- after that many
    collisions every bed is taken and the slot really is full.
    """
    for _ in range(FACILITY_BEDS + 2):
        now = timezone.now()
        try:
            with transaction.atomic():
                # 1. Reap expired holds for these slots -> their beds are freed.
                FacilityBooking.objects.filter(
                    date=date_value, slot__in=slots, status="HELD", expires_at__lte=now,
                ).update(status="CANCELLED", bed_index=None)

                # 2. Lock the surviving occupiers and read which beds they hold.
                occupying = list(
                    FacilityBooking.objects.select_for_update().filter(
                        FacilityBooking.occupies_bed_q(now), date=date_value, slot__in=slots,
                    )
                )
                taken = {}
                for r in occupying:
                    taken.setdefault(r.slot, set()).add(r.bed_index)

                # 3. Assign the lowest free bed per slot; a slot with none is full.
                rows, full = [], []
                for s in slots:
                    used = taken.get(s, set())
                    free = [i for i in range(FACILITY_BEDS) if i not in used]
                    if not free:
                        full.append(s)
                    else:
                        rows.append(make_row(s, free[0]))
                if full:
                    labels = ", ".join(slot_label(s) for s in full)
                    return problem(
                        409, "Slot full",
                        f"These slots just filled up: {labels}. Please pick another time.",
                    )

                # 4. Insert. If a racing request grabbed the same bed, the unique
                #    constraint rejects us here -> caught below and retried with
                #    the next free bed.
                FacilityBooking.objects.bulk_create(rows)
            return None
        except IntegrityError:
            continue

    # Every attempt collided: the slot filled up under us while we retried.
    return problem(
        409, "Slot full",
        "Those slots just filled up. Please pick another time.",
    )


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

    slots, err = _validate_slots(data)
    if err:
        return err

    phone = data["owner_phone"]
    if _rate_limited(f"facility:phone:{phone}", FACILITY_PHONE_LIMIT, FACILITY_WINDOW_SECONDS):
        return problem(429, "Too many requests", "Too many booking attempts. Please try again later.")

    reference = f"FAC-{_uuid.uuid4().hex[:6].upper()}"

    err = _reserve_slots(
        data["date"], slots,
        lambda s, bed: FacilityBooking(
            reference=reference, date=data["date"], slot=s, bed_index=bed,
            pet_name=data["pet_name"], owner_name=data["owner_name"],
            owner_phone=phone, owner_email=data.get("owner_email", ""),
            note=data.get("note", ""), status="PENDING",
        ),
    )
    if err:
        return err

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
    else:
        # HELD rows are transient in-progress holds, not requests the clinic
        # needs to see; exclude them from the default view (a caller can still
        # ask for ?status=HELD explicitly).
        qs = qs.exclude(status="HELD")

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
def facility_hold_view(request):
    """POST /api/v1/facility/holds -- PUBLIC.

    Step one of the BookMyShow-style flow: the visitor picks slots and they are
    HELD for FACILITY_HOLD_SECONDS while they fill in their details. The hold
    occupies a bed immediately (so nobody else can take it) and carries an
    `expires_at`; if it is not confirmed in time it lapses and the beds return
    to the pool with no sweep (see FacilityBooking.occupies_bed_q).

    No pet/owner details here -- those come at confirm. IP-rate-limited (there is
    no phone to limit on yet); honeypot as elsewhere.
    """
    ip = _client_ip(request)
    if _rate_limited(f"facility:ip:{ip}", FACILITY_IP_LIMIT, FACILITY_WINDOW_SECONDS):
        return problem(429, "Too many requests", "Too many booking attempts. Please try again later.")

    if str(request.data.get("website", "")).strip():
        # Honeypot: a plausible-looking, already-expired hold that occupies
        # nothing.
        return Response(
            {"reference": "FAC-RECEIVED", "slots": [], "expires_at": None, "hold_seconds": 0},
            status=http_status.HTTP_201_CREATED,
        )

    serializer = FacilityHoldSerializer(data=request.data)
    if not serializer.is_valid():
        return problem(400, "Invalid input", _first_error_detail(serializer.errors))
    data = serializer.validated_data

    slots, err = _validate_slots(data)
    if err:
        return err

    reference = f"FAC-{_uuid.uuid4().hex[:6].upper()}"
    expires_at = timezone.now() + timedelta(seconds=FACILITY_HOLD_SECONDS)

    err = _reserve_slots(
        data["date"], slots,
        lambda s, bed: FacilityBooking(
            reference=reference, date=data["date"], slot=s, bed_index=bed,
            status="HELD", expires_at=expires_at,
        ),
    )
    if err:
        return err

    return Response(
        {
            "reference": reference,
            "date": data["date"].isoformat(),
            "slots": [{"slot": s, "label": slot_label(s)} for s in slots],
            "expires_at": expires_at.isoformat(),
            "hold_seconds": FACILITY_HOLD_SECONDS,
        },
        status=http_status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def facility_confirm_view(request, reference):
    """POST /api/v1/facility/holds/<reference>/confirm -- PUBLIC.

    Step two: the visitor submits their details before the countdown runs out.
    Flips every HELD row in the group to PENDING (a real request the clinic will
    confirm) and clears the expiry. Refuses with 410 Gone if the hold has already
    lapsed -- the beds are gone and the visitor must start again.
    """
    serializer = FacilityConfirmSerializer(data=request.data)
    if not serializer.is_valid():
        return problem(400, "Invalid input", _first_error_detail(serializer.errors))
    data = serializer.validated_data

    now = timezone.now()
    with transaction.atomic():
        rows = list(
            FacilityBooking.objects.select_for_update().filter(
                reference=reference, status="HELD",
            )
        )
        if not rows:
            return problem(404, "Not found", "That hold does not exist or has already been confirmed.")
        if any(r.expires_at is None or r.expires_at <= now for r in rows):
            # Lapsed: free it explicitly so nothing lingers, and tell the caller.
            FacilityBooking.objects.filter(reference=reference, status="HELD").update(status="CANCELLED")
            return problem(
                410, "Hold expired",
                "Your hold on these slots has expired. Please choose your slots again.",
            )
        for r in rows:
            r.pet_name = data["pet_name"]
            r.owner_name = data["owner_name"]
            r.owner_phone = data["owner_phone"]
            r.owner_email = data.get("owner_email", "")
            r.note = data.get("note", "")
            r.status = "PENDING"
            r.expires_at = None
        FacilityBooking.objects.bulk_update(
            rows, ["pet_name", "owner_name", "owner_phone", "owner_email", "note", "status", "expires_at"],
        )

    slots = sorted(r.slot for r in rows)
    return Response(
        {
            "reference": reference,
            "date": rows[0].date.isoformat(),
            "slots": [{"slot": s, "label": slot_label(s)} for s in slots],
            "status": "PENDING",
            "detail": (
                f"Thanks, {data['owner_name']}! We've held "
                f"{len(slots)} slot(s) for {data['pet_name']} on {rows[0].date.isoformat()} "
                f"(reference {reference}). The clinic will confirm shortly."
            ),
        },
        status=http_status.HTTP_200_OK,
    )


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
