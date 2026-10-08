"""When the clinic texts an owner. Called from views after the state change has
been saved; each helper swallows every error so an SMS problem can never undo
or fail a confirmation (the notify.py rule).

Idempotency keys carry the date the text is about, so a visit moved to a new
day gets a fresh confirmation/reminder while a repeat for the same day never
goes out twice.
"""
import logging
import time as time_mod
from datetime import timedelta

from django.utils import timezone

from ..models import Appointment, BoardingBooking
from ..models.boarding import departure_for, duration_hours
from . import templates
from .service import send_sms

logger = logging.getLogger("appointments.sms")

# Appointment statuses that mean "this visit is booked". Rescheduled is a
# doctor-moved visit at its new time (views/scheduling.py), so it is reminded too.
REMINDABLE = ("Confirmed", "Rescheduled")
CHECKOUT_STATUSES = ("CONFIRMED", "CHECKED_IN")
# Vercel caps the function at 30 s; stop starting new sends after this.
CRON_BUDGET_SECONDS = 20
# Consecutive provider failures before the run stops calling the gateway.
CIRCUIT_BREAK_AFTER = 3


def appointment_confirmed(appt):
    try:
        # Callers may have just created it from request strings ("09:30");
        # reload so the text and the idempotency key see real date/time values.
        appt.refresh_from_db(fields=["date", "time", "owner_phone", "pet_name"])
        send_sms(
            appt.owner_phone,
            templates.appointment_confirmed(appt.pet_name, appt.date, appt.time),
            kind="appointment_confirmed", related=appt,
            scheduled_for=f"{appt.date}T{appt.time}",
        )
    except Exception:  # noqa: BLE001
        logger.exception("appointment_confirmed SMS failed; the confirmation is unaffected.")


def appointment_moved(appt):
    """A doctor moved the visit (direct reschedule, or approving the owner's
    request). One text per new slot."""
    try:
        appt.refresh_from_db(fields=["date", "time", "owner_phone", "pet_name"])
        send_sms(
            appt.owner_phone,
            templates.appointment_moved(appt.pet_name, appt.date, appt.time),
            kind="appointment_moved", related=appt,
            scheduled_for=f"{appt.date}T{appt.time}",
        )
    except Exception:  # noqa: BLE001
        logger.exception("appointment_moved SMS failed; the reschedule is unaffected.")


def boarding_confirmed(stay):
    try:
        send_sms(
            stay.owner_phone,
            templates.boarding_confirmed(stay.pet_name, stay.check_in, stay.departure_date(), stay.reference),
            kind="boarding_confirmed", related=stay,
            scheduled_for=f"{stay.check_in}:{stay.duration}",
        )
    except Exception:  # noqa: BLE001
        logger.exception("boarding_confirmed SMS failed; the confirmation is unaffected.")


def _empty():
    return {"considered": 0, "sent": 0, "already_sent": 0, "skipped": 0, "failed": 0, "deferred": 0}


def _tally(counts, msg, created_before):
    if msg.pk in created_before:
        counts["already_sent"] += 1
    elif msg.status == "SENT":
        counts["sent"] += 1
    elif msg.status.startswith("SKIPPED"):
        counts["skipped"] += 1
    else:
        counts["failed"] += 1


def _jobs(today):
    tomorrow = today + timedelta(days=1)
    # Only visits a doctor booked, confirmed or moved: an owner-made booking
    # must never make the clinic's SIM text a number nobody at the clinic saw.
    appts = (Appointment.objects.filter(date=tomorrow, status__in=REMINDABLE,
                                        doctor__isnull=False, confirmed_at__isnull=False)
             .order_by("time"))
    for a in appts:
        yield ("appointment_reminders", a.owner_phone,
               templates.appointment_reminder(a.pet_name, a.date, a.time),
               "appointment_reminder", a, str(a.date))
    # A stay leaves on departure_for(check_in, duration); the longest is 30 days.
    stays = BoardingBooking.objects.filter(
        status__in=CHECKOUT_STATUSES, check_in__gte=today - timedelta(days=31), check_in__lt=today,
    ).order_by("check_in")
    for s in stays:
        if duration_hours(s.duration) < 24:
            continue  # same-day stays: the owner is already coming back today
        departure = departure_for(s.check_in, s.duration)
        if departure == today:
            yield ("checkout_reminders", s.owner_phone,
                   templates.boarding_checkout(s.pet_name, departure),
                   "boarding_checkout", s, str(departure))


def run_daily_reminders(today=None, budget_seconds=CRON_BUDGET_SECONDS):
    """Tomorrow's appointment reminders + today's check-out reminders.
    Safe to run any number of times a day. Returns counts per group."""
    today = today or timezone.localdate()
    started = time_mod.monotonic()
    result = {"date": today.isoformat(), "appointment_reminders": _empty(), "checkout_reminders": _empty()}
    from ..models import SmsMessage
    existing = set(SmsMessage.objects.filter(
        kind__in=("appointment_reminder", "boarding_checkout"),
        created_at__gte=timezone.now() - timedelta(days=3),
    ).exclude(status__in=("FAILED", "SKIPPED_LIMIT", "SKIPPED_DISABLED")).values_list("pk", flat=True))
    consecutive_failures = 0
    for group, phone, body, kind, related, scheduled_for in _jobs(today):
        counts = result[group]
        counts["considered"] += 1
        if (time_mod.monotonic() - started > budget_seconds
                or consecutive_failures >= CIRCUIT_BREAK_AFTER):
            counts["deferred"] += 1
            continue
        msg = send_sms(phone, body, kind=kind, related=related, scheduled_for=scheduled_for)
        _tally(counts, msg, existing)
        # Only provider/transport failures trip the breaker; a bad number in
        # one record must not stop everyone else's reminder (review M1).
        if getattr(msg, "provider_attempted", False):
            consecutive_failures = consecutive_failures + 1 if msg.status == "FAILED" else 0
    if result["appointment_reminders"]["deferred"] or result["checkout_reminders"]["deferred"]:
        logger.warning("SMS cron deferred some reminders (time budget or gateway failing); re-run to retry.")
    return result
