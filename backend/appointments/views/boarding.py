"""Indoor-facility BOARDING (stays priced by duration).

Public surface:
  GET  /facility/boarding/availability?check_in=&duration=
       -> the duration menu + walk options + capacity, and (when both params are
          given) free beds / price / check-out for that selection.
  POST /facility/boarding/holds
       -> HOLD a bed for FACILITY_HOLD_SECONDS (dates only, no personal data).
  POST /facility/boarding/holds/<ref>/confirm
       -> submit the intake inside the window: HELD -> PENDING (410 once lapsed).
  POST /facility/boarding
       -> create a PENDING stay. Owners hit this from the marketing site; a
          signed-in doctor hits the same path from the portal (source="doctor",
          no honeypot/rate-limit).

Doctor surface (same endpoints, auth by hand — the split-posture pattern used by
enquiries and facility bookings):
  GET  /facility/boarding                     the stays inbox
  POST /facility/boarding/<ref>/status        confirm / check-in / complete / cancel
  POST /facility/boarding/<ref>/convert       find-or-create owner + pet, link them

Capacity is six beds counted per DATE over a stay's range (a month-long stay
holds a bed on all thirty dates), counting active stays AND unexpired holds.
A range count cannot be a DB constraint (unlike the hourly slots' bed_index),
so the check + insert run under a transaction-scoped Postgres advisory lock
(`_lock_boarding_capacity`): two visitors racing for the last bed serialise, the
second sees the first's row and gets 409. SQLite (tests/dev) serialises writers
on the file lock.

PRIVACY: whether a phone belongs to an existing client is never revealed to the
public. Matching happens after the response is decided and only ever lands in
`owner`/`pet`, which only the doctor serializer exposes.
"""
import hashlib
import uuid as _uuid
from datetime import date as date_cls, timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import connection, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status as http_status

from ..models import (
    BoardingBooking, BOARDING_BEDS, BOARDING_DURATIONS, BOARDING_DURATION_KEYS,
    BOARDING_WALK_OPTIONS, duration_days, duration_price, duration_label,
    FACILITY_HOLD_SECONDS, Pet, UserProfile,
)
from ..permissions import IsDoctor
from ..serializers import (
    BoardingConfirmSerializer, BoardingCreateSerializer, BoardingHoldSerializer,
    BoardingSerializer,
)
from ..notify import notify_doctor
from ..validators import normalise_phone, phone_key
from ._shared import (
    _client_ip, _first_error_detail, _rate_limited, _unique_owner_username, problem,
    maybe_doctor as _maybe_doctor, maybe_owner as _maybe_owner, require_doctor as _require_doctor,
)
from .enquiries import _guess_species

BOARDING_WINDOW_SECONDS = 60 * 60
BOARDING_IP_LIMIT = 15
BOARDING_PHONE_LIMIT = 6
# One visitor may not park more than this many unexpired holds at once.
BOARDING_MAX_LIVE_HOLDS_PER_IP = 2
_RATE_MESSAGE = "Too many booking attempts. Please try again later."


def _rate_peek(key, limit):
    """True once `limit` events are already on record for `key` (does not count)."""
    return (cache.get(key) or 0) >= limit


def _rate_bump(key, window_seconds):
    """Record one event for `key` in a fixed window."""
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=window_seconds)


def _ip_hash(ip):
    """Salted, truncated hash of the requester IP -- enough to count one
    visitor's live holds, not enough to recover the address."""
    return hashlib.sha256(f"{settings.SECRET_KEY}|boarding-hold|{ip}".encode()).hexdigest()[:32]


# Arbitrary fixed keys for pg_advisory_xact_lock (one per critical section).
_CAPACITY_LOCK_KEY = 0x50485931
_CONVERT_LOCK_KEY = 0x50485932


def _advisory_lock(key):
    """Transaction-scoped lock; released on commit/rollback. Postgres only --
    SQLite already serialises writers. Must be called inside transaction.atomic()."""
    if connection.vendor == "postgresql":
        with connection.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(%s)", [key])


def _lock_boarding_capacity():
    """Serialise 'count occupied beds, then insert' across requests."""
    _advisory_lock(_CAPACITY_LOCK_KEY)


def _owner_ids_for_phone(raw_phone):
    """Ids of OWNER accounts whose account phone or any pet's owner_phone is the
    same number (compared via `phone_key`, so spacing/+91 do not matter)."""
    key = phone_key(raw_phone)
    # Both queries run whether or not `key` is empty/matches, so the work done
    # (and the response time) does not reveal whether the phone is a client's.
    accounts = list(UserProfile.objects.filter(role="OWNER").exclude(phone="").values_list("id", "phone"))
    pets = list(Pet.objects.filter(owner__isnull=False).exclude(owner_phone="").values_list("owner_id", "owner_phone"))
    if not key:
        return set()
    ids = {uid for uid, ph in accounts if phone_key(ph) == key}
    ids |= {oid for oid, ph in pets if phone_key(ph) == key}
    return ids


def _match_client(owner_phone, pet_name):
    """Server-side matching. Returns (owner|None, pet|None).

    Exactly one owner for the phone -> owner. If that owner has exactly one pet
    whose name matches (case-insensitive, trimmed) -> pet. Any ambiguity leaves
    that link empty; staff resolve it with convert."""
    ids = _owner_ids_for_phone(owner_phone)
    # The owner and pet queries always run (pk=None -> IS NULL, results thrown
    # away) so the query count is the same for a match and a miss.
    owner_pk = next(iter(ids)) if len(ids) == 1 else None
    owner = UserProfile.objects.filter(pk=owner_pk).first()
    candidates = list(Pet.objects.filter(owner_id=owner_pk)[:200])
    if owner is None or owner_pk is None:
        return None, None
    wanted = (pet_name or "").strip().casefold()
    pets = [p for p in candidates if p.name.strip().casefold() == wanted]
    return owner, (pets[0] if len(pets) == 1 else None)


def _link_for(request, owner_phone, pet_name):
    """(owner, pet, verified) for a new stay.

    Booked while signed in as an owner -> that account, VERIFIED (the only proof
    of identity this app has), plus their pet if exactly one has that name.
    Otherwise the automatic phone match, which is a staff hint only and never
    makes the stay visible to the matched account (live QA D1)."""
    account = _maybe_owner(request)
    if account is not None:
        wanted = (pet_name or "").strip().casefold()
        pets = [p for p in Pet.objects.filter(owner=account) if p.name.strip().casefold() == wanted]
        return account, (pets[0] if len(pets) == 1 else None), True
    owner, pet = _match_client(owner_phone, pet_name)
    return owner, pet, False


def _rupees(amount):
    """₹1,200 / ₹1,00,000 -- Indian digit grouping, as the clinic writes it."""
    digits = str(int(amount))
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join(groups + [tail])
    return f"₹{digits}"


def _lazy_match(rows):
    """Live QA B3: matching used to run only when a stay was created, so a client
    who signed up AFTER booking stayed "New client" for ever. On the doctor list,
    try the same staff-only match again for active stays that have no owner, and
    persist what it finds. The public API is untouched (it never exposes the
    link), and the link stays unverified -- it does not reach the owner portal."""
    pending = [b for b in rows if b.owner_id is None and b.status in BoardingBooking.ACTIVE_STATUSES]
    if not pending:
        return
    # Narrow candidates in SQL by the last seven digits of each stay's phone
    # (stored phones vary in separators/prefix, so exact equality would miss);
    # phone_key then does the exact comparison in Python. Never scans every
    # owner per GET.
    tails = {phone_key(b.owner_phone)[-7:] for b in pending} - {""}
    if not tails:
        return
    acc_q, pet_q = Q(), Q()
    for t in tails:
        acc_q |= Q(phone__contains=t)
        pet_q |= Q(owner_phone__contains=t)
    index = {}
    for uid, ph in UserProfile.objects.filter(acc_q, role="OWNER").values_list("id", "phone"):
        index.setdefault(phone_key(ph), set()).add(uid)
    for oid, ph in Pet.objects.filter(pet_q, owner__isnull=False).values_list("owner_id", "owner_phone"):
        index.setdefault(phone_key(ph), set()).add(oid)
    index.pop("", None)
    for b in pending:
        ids = index.get(phone_key(b.owner_phone)) or set()
        if len(ids) != 1:
            continue
        owner_id = next(iter(ids))
        wanted = (b.pet_name or "").strip().casefold()
        pets = [p for p in Pet.objects.filter(owner_id=owner_id) if p.name.strip().casefold() == wanted]
        pet = pets[0] if len(pets) == 1 else None
        # Conditional update: never overwrite a link a concurrent convert made.
        updated = BoardingBooking.objects.filter(pk=b.pk, owner__isnull=True).update(
            owner_id=owner_id, pet=pet,
        )
        if updated:
            b.owner_id, b.pet = owner_id, pet


def _max_concurrent(check_in, check_out, exclude_ref=None):
    """Peak number of active stays occupying any single date in the range."""
    qs = BoardingBooking.objects.filter(
        BoardingBooking.occupies_q(timezone.now()), check_in__lte=check_out, check_out__gte=check_in,
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
    resp = Response(payload)
    # The duration/walk menu + capacity is static config, so let the CDN cache
    # it. A `selection` carries the LIVE free-bed count and must never be cached.
    if "selection" not in payload:
        resp["Cache-Control"] = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"
    return resp


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
    owner, pet, verified = _link_for(request, data["owner_phone"], data["pet_name"])

    with transaction.atomic():
        _lock_boarding_capacity()
        if _max_concurrent(check_in, check_out) >= BOARDING_BEDS:
            return _full_response()
        reference = f"BRD-{_uuid.uuid4().hex[:6].upper()}"
        booking = BoardingBooking(
            reference=reference,
            source="doctor" if doctor else "owner",
            status="CONFIRMED" if doctor else "PENDING",
            owner=owner, pet=pet, owner_verified=verified,
            **data,
        )
        booking.save()  # derives check_out + price
    return _created_response(booking)


def _full_response():
    return problem(
        409, "Fully booked",
        "All beds are taken for those dates. Please choose a different date or duration.",
    )


def _created_response(booking):
    """Notify the clinic and build the 201. ONE shape/text for every caller --
    it must not vary with whether the phone matched an existing client."""
    notify_doctor(
        kind="boarding",
        subject=f"New boarding — {booking.pet_name} ({booking.reference})",
        headline=booking.pet_name,
        subhead=f"({duration_label(booking.duration)})",
        lead="A new boarding stay was just requested on the website.",
        owner_phone=booking.owner_phone,
        rows=[
            ("Owner", booking.owner_name),
            ("Phone", booking.owner_phone),
            ("Emergency contact", f"{booking.emergency_contact_name} {booking.emergency_contact_phone}".strip()),
            ("Check-in", booking.check_in.isoformat()),
            # check_out is the last bed-night; people read the day they leave.
            ("Check-out", booking.departure_date().isoformat()),
            ("Duration", duration_label(booking.duration)),
            ("Price", _rupees(booking.price)),
            ("Reference", booking.reference),
            ("Status", booking.status),
        ],
    )
    return Response(
        {
            "reference": booking.reference,
            "check_in": booking.check_in.isoformat(),
            "check_out": booking.check_out.isoformat(),
            "duration": booking.duration,
            "price": booking.price,
            "status": booking.status,
            "detail": (
                f"Thanks, {booking.owner_name}! {booking.pet_name}'s stay has been requested "
                f"(reference {booking.reference}, {_rupees(booking.price)}). The clinic will confirm by phone."
            ),
        },
        status=http_status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def boarding_hold_view(request):
    """POST /facility/boarding/holds -- PUBLIC. Holds a bed for
    FACILITY_HOLD_SECONDS while the visitor fills in the intake. Dates only; no
    personal data is taken or returned. IP-rate-limited (no phone yet)."""
    ip = _client_ip(request)
    rate_key = f"boarding-hold:ip:{ip}"
    # Only holds that actually succeed (201) burn the hourly allowance, so typos
    # and "fully booked" retries cannot lock a visitor out.
    if _rate_peek(rate_key, BOARDING_IP_LIMIT):
        return problem(429, "Too many requests", _RATE_MESSAGE)
    serializer = BoardingHoldSerializer(data=request.data)
    valid = serializer.is_valid()
    if str(request.data.get("website", "")).strip():
        # Honeypot: a plausible hold (same shape) that occupies nothing.
        check_in = serializer.validated_data["check_in"] if valid else timezone.localdate()
        duration = serializer.validated_data["duration"] if valid else "24h"
        return Response(
            {
                "reference": "BRD-RECEIVED",
                "expires_at": (timezone.now() + timedelta(seconds=FACILITY_HOLD_SECONDS)).isoformat(),
                "check_out": (check_in + timedelta(days=max(0, duration_days(duration) - 1))).isoformat(),
                "price": duration_price(duration),
            },
            status=http_status.HTTP_201_CREATED,
        )
    if not valid:
        return problem(400, "Invalid input", _first_error_detail(serializer.errors))
    check_in, duration = serializer.validated_data["check_in"], serializer.validated_data["duration"]
    check_out = check_in + timedelta(days=max(0, duration_days(duration) - 1))
    requester = _ip_hash(ip)

    with transaction.atomic():
        _lock_boarding_capacity()
        live = BoardingBooking.objects.filter(
            status="HELD", requester_hash=requester, expires_at__gt=timezone.now(),
        ).count()
        if live >= BOARDING_MAX_LIVE_HOLDS_PER_IP:
            return problem(429, "Too many requests", _RATE_MESSAGE)
        if _max_concurrent(check_in, check_out) >= BOARDING_BEDS:
            return _full_response()
        booking = BoardingBooking(
            # 8 hex: the confirm URL finds the row by reference alone.
            reference=f"BRD-{_uuid.uuid4().hex[:8].upper()}",
            check_in=check_in, duration=duration, status="HELD", source="owner",
            expires_at=timezone.now() + timedelta(seconds=FACILITY_HOLD_SECONDS),
            requester_hash=requester,
        )
        booking.save()
    _rate_bump(rate_key, BOARDING_WINDOW_SECONDS)
    return Response(
        {
            "reference": booking.reference,
            "expires_at": booking.expires_at.isoformat(),
            "check_out": booking.check_out.isoformat(),
            "price": booking.price,
        },
        status=http_status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def boarding_hold_confirm_view(request, reference):
    """POST /facility/boarding/holds/<ref>/confirm -- PUBLIC. Turns a live HELD
    row into a PENDING stay with the full intake. Dates/duration come from the
    hold, never the body. 404 unknown / not HELD; 410 once the hold lapsed."""
    ip = _client_ip(request)
    if _rate_limited(f"boarding:ip:{ip}", BOARDING_IP_LIMIT, BOARDING_WINDOW_SECONDS):
        return problem(429, "Too many requests", "Too many booking attempts. Please try again later.")
    if str(request.data.get("website", "")).strip():
        return Response(
            {"reference": "BRD-RECEIVED", "detail": "Thanks! Your boarding request has been received."},
            status=http_status.HTTP_201_CREATED,
        )
    serializer = BoardingConfirmSerializer(data=request.data)
    if not serializer.is_valid():
        return problem(400, "Invalid input", _first_error_detail(serializer.errors))
    data = dict(serializer.validated_data)
    data.pop("website", None)
    if _rate_limited(f"boarding:phone:{data['owner_phone']}", BOARDING_PHONE_LIMIT, BOARDING_WINDOW_SECONDS):
        return problem(429, "Too many requests", "Too many booking attempts. Please try again later.")

    owner, pet, verified = _link_for(request, data["owner_phone"], data["pet_name"])
    with transaction.atomic():
        _lock_boarding_capacity()
        booking = BoardingBooking.objects.select_for_update().filter(
            reference=reference, status="HELD",
        ).first()
        if booking is None:
            return problem(404, "Not found", "That hold does not exist or has already been confirmed.")
        if (
            booking.expires_at is None or booking.expires_at <= timezone.now()
            # A hold taken for a day that has since passed is useless too.
            or booking.check_in < timezone.localdate()
        ):
            return problem(410, "Hold expired", "Hold expired")
        for field, value in data.items():
            setattr(booking, field, value)
        booking.owner, booking.pet = owner, pet
        booking.owner_verified = verified
        booking.status = "PENDING"
        booking.expires_at = None
        booking.requester_hash = ""
        booking.save()
    return _created_response(booking)


def _boarding_list(request, user):
    qs = BoardingBooking.objects.select_related("pet").prefetch_related("pet__diagnostic_reports")
    # HELD rows are transient in-progress holds with no details, not stays.
    if request.query_params.get("include_held") != "1":
        qs = qs.exclude(status="HELD")
    else:
        # Even when asked for, a LAPSED hold is not a hold any more.
        qs = qs.exclude(Q(status="HELD") & ~Q(expires_at__gt=timezone.now()))
    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status=status_filter)
    rows = list(qs)
    _lazy_match(rows)
    results = BoardingSerializer(
        rows, many=True, context={"request": request, "doctor": user},
    ).data
    pending_count = BoardingBooking.objects.filter(status="PENDING").count()
    return Response({"results": results, "pending_count": pending_count})


@api_view(["GET", "POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def boarding_view(request):
    """POST = public/doctor intake; GET = doctor inbox."""
    if request.method == "POST":
        return _boarding_create(request)
    user, err = _require_doctor(request)
    if err:
        return err
    return _boarding_list(request, user)


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
    # A HELD row is an unconfirmed hold with no intake; it is not actionable.
    booking = BoardingBooking.objects.filter(reference=reference).exclude(status="HELD").first()
    if booking is None:
        return problem(404, "Not found", "No boarding booking with that reference.")

    # Date guards (live QA): a stay that starts on 20 Nov cannot be checked in
    # or completed today. Dates are compared in the clinic's local day.
    if action in ("check_in", "complete") and booking.check_in > timezone.localdate():
        verb = "checked in" if action == "check_in" else "completed"
        return problem(
            400, "Stay has not started",
            f"This stay starts on {booking.check_in.strftime('%a %d %b')}, so it cannot be {verb} before then.",
        )

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


class _AmbiguousOwner(Exception):
    """Several owner accounts share the stay's phone and email cannot pick one."""


def _find_owner_for_convert(owner_phone, owner_email):
    """Existing OWNER for a stay: by phone (several -> the one whose email
    matches, else AMBIGUOUS), falling back to email."""
    ids = _owner_ids_for_phone(owner_phone)
    if ids:
        candidates = UserProfile.objects.filter(pk__in=ids, role="OWNER").order_by("date_joined", "id")
        if len(ids) > 1:
            by_email = candidates.filter(email__iexact=owner_email).first() if owner_email else None
            if by_email:
                return by_email
            raise _AmbiguousOwner()
        found = candidates.first()
        if found:
            return found
    if owner_email:
        return UserProfile.objects.filter(email__iexact=owner_email, role="OWNER").first()
    return None


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def boarding_convert_view(request, reference):
    """POST /facility/boarding/<ref>/convert -- DOCTOR only. Find-or-create the
    owner (by normalised phone, then email) and the pet (by name under that
    owner), link them to the stay, return the stay. Idempotent: a stay that is
    already linked to a pet is returned untouched, and the whole thing runs under
    a lock so two concurrent converts cannot create two owners/pets."""
    with transaction.atomic():
        _advisory_lock(_CONVERT_LOCK_KEY)
        booking = BoardingBooking.objects.select_for_update().filter(
            reference=reference,
        ).exclude(status="HELD").first()
        if booking is None:
            return problem(404, "Not found", "No boarding booking with that reference.")
        if booking.pet_id is None:
            email = (booking.owner_email or "").strip().lower()
            phone = normalise_phone(booking.owner_phone) or booking.owner_phone
            try:
                owner = booking.owner or _find_owner_for_convert(booking.owner_phone, email)
            except _AmbiguousOwner:
                return problem(
                    409, "Ambiguous client",
                    "Several clients share this phone — open the right client and link manually.",
                )
            if owner is None:
                parts = booking.owner_name.strip().split(None, 1)
                owner = UserProfile(
                    username=_unique_owner_username(email or booking.owner_name),
                    # An email already held by a non-owner account would break the
                    # unique-email constraint; leave it blank rather than fail.
                    email="" if (not email or UserProfile.objects.filter(email__iexact=email).exists()) else email,
                    role="OWNER",
                    first_name=parts[0] if parts else "",
                    last_name=parts[1] if len(parts) > 1 else "",
                    phone=phone,
                )
                owner.set_unusable_password()
                owner.save()
                # Convert made this account for this stay, so the link is the
                # clinic's own -- not a match against someone else's signup.
                booking.owner_verified = True
            name = booking.pet_name.strip()
            pet = Pet.objects.filter(owner=owner, name__iexact=name).order_by("created_at", "id").first()
            if pet is None:
                pet = Pet.objects.create(
                    owner=owner, doctor=request.user, name=name,
                    species=_guess_species(""), owner_name=booking.owner_name,
                    owner_phone=phone, owner_email=email,
                )
            booking.owner, booking.pet = owner, pet
            # owner_verified is True only if the account was created just above.
            # An EXISTING account found by phone/email stays unverified until
            # staff press "Confirm client" (live QA D1 review).
            booking.save(update_fields=["owner", "pet", "owner_verified"])
    return Response(BoardingSerializer(
        booking, context={"request": request, "doctor": request.user},
    ).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def boarding_confirm_client_view(request, reference):
    """POST /facility/boarding/<ref>/confirm-client -- DOCTOR only. Staff have
    checked the linked account (name / email / phone shown on the card as
    `owner_account`) really is this client, so the stay may now appear in that
    owner's portal. The ONLY way a matched existing account becomes verified.
    404 unknown/HELD; 400 when no account is linked; idempotent."""
    booking = BoardingBooking.objects.filter(reference=reference).exclude(status="HELD").first()
    if booking is None:
        return problem(404, "Not found", "No boarding booking with that reference.")
    if booking.owner_id is None:
        return problem(
            400, "No client linked",
            "This stay is not linked to a client account yet — convert it first.",
        )
    if not booking.owner_verified:
        booking.owner_verified = True
        booking.save(update_fields=["owner_verified"])
    return Response(BoardingSerializer(
        booking, context={"request": request, "doctor": request.user},
    ).data)
