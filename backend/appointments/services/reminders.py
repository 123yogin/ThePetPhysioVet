"""Pure due-reminder computation (SRS §3.7 AC-01/02, PRODUCT_PLAN Phase 4).

This module contains NO I/O and NO wall-clock dependence: ``now`` is always
injected (by the ``send_due_reminders`` command or, in tests, by hand) so the
same code path is exercised deterministically and time-controlled.

``due_reminders(now)`` yields a :class:`DueReminder` for every
``(appointment, offset)`` pair whose *fire moment* — the appointment datetime
minus the offset — lands within ``±REMINDER_WINDOW_SECONDS`` of ``now``.

Two properties fall out of the design and give us reschedule/cancel suppression
for free (US-NOTIF-05):

* **Cancel / complete suppression.** We read the appointment's CURRENT status
  and skip any that is terminal (completed / cancelled). A stale reminder for a
  since-cancelled appointment therefore never fires, no matter when the cron
  next runs.
* **Reschedule suppression.** A reschedule mutates the appointment row's
  date/time in place, so the target datetime baked into each ``dedup_key``
  changes. The old-time fire windows no longer exist in the data (the row now
  carries the new time), so old-time offsets can never match a future window,
  while the new time mints fresh keys that each fire exactly once.
"""

import datetime
from dataclasses import dataclass

from django.conf import settings
from django.utils import timezone

from ..models import Appointment

# Statuses that suppress reminders. The Appointment model has no distinct
# "Cancelled" state today (only Pending / Completed / Rescheduled), so Completed
# is the terminal signal; we also suppress a literal "Cancelled" defensively so
# the behaviour is correct the moment a cancel state is introduced. A
# Rescheduled appointment is still upcoming (new date/time) and DOES get
# reminders for its new time.
SUPPRESSED_STATUSES = frozenset(
    {
        Appointment.STATUS_COMPLETED,
        "Cancelled",
    }
)


@dataclass(frozen=True)
class DueReminder:
    """One reminder that is due to fire for an appointment at a given offset."""

    appointment: Appointment
    offset: datetime.timedelta
    appt_dt: datetime.datetime  # aware appointment datetime (date + time)
    fire_at: datetime.datetime  # appt_dt - offset (the moment this should fire)
    dedup_key: str
    message: str
    sms_body: str

    @property
    def doctor(self):
        return self.appointment.doctor

    @property
    def owner_phone(self):
        return self.appointment.owner_phone


def appointment_datetime(appt):
    """Combine an appointment's date + time into an aware datetime.

    Uses the project's current timezone (``settings.TIME_ZONE``) when
    ``USE_TZ`` is on so ``now`` and the appointment moment are comparable.
    """
    naive = datetime.datetime.combine(appt.date, appt.time)
    if timezone.is_aware(naive):
        return naive
    return timezone.make_aware(naive, timezone.get_current_timezone())


def humanize_offset(offset):
    """Return a human label for a reminder offset (e.g. '24 hours', '30 minutes')."""
    total = int(offset.total_seconds())
    if total % 3600 == 0:
        hours = total // 3600
        return f"{hours} hour" + ("s" if hours != 1 else "")
    minutes = total // 60
    return f"{minutes} minute" + ("s" if minutes != 1 else "")


def build_dedup_key(appt, offset, appt_dt):
    """Stable idempotency key: one per (appointment, offset, target datetime).

    The target datetime is included so a reschedule (which changes ``appt_dt``)
    mints a brand-new key — old-time offsets never collide with the new ones and
    never re-match a window. The offset is included so the 24h/1h/30min reminders
    are distinct even for the same appointment.
    """
    return (
        f"reminder:appt={appt.pk}"
        f":{int(offset.total_seconds())}"
        f":{appt_dt.isoformat()}"
    )


def _build(appt, offset, appt_dt, fire_at):
    label = humanize_offset(offset)
    when = f"{appt.date.isoformat()} at {appt.time.strftime('%H:%M')}"
    message = (
        f"Reminder: {appt.pet_name}'s appointment (owner {appt.owner_name}) "
        f"is in {label} — {when}."
    )
    sms_body = (
        f"Reminder: {appt.pet_name}'s vet appointment is in {label} "
        f"({when})."
    )
    return DueReminder(
        appointment=appt,
        offset=offset,
        appt_dt=appt_dt,
        fire_at=fire_at,
        dedup_key=build_dedup_key(appt, offset, appt_dt),
        message=message,
        sms_body=sms_body,
    )


def _within_window(fire_at, now, window_seconds):
    return abs((fire_at - now).total_seconds()) <= window_seconds


def due_reminders(now, appointments=None, offsets=None, window_seconds=None):
    """Compute the reminders due at ``now`` (pure; no delivery, no side effects).

    * ``now`` — an aware datetime. Injected so callers/tests fully control time.
    * ``appointments`` — optional iterable to check; defaults to all non-terminal
      appointments (the CURRENT-status read is what gives cancel suppression).
    * ``offsets`` / ``window_seconds`` — default to ``settings.REMINDER_OFFSETS``
      and ``settings.REMINDER_WINDOW_SECONDS``.
    """
    if offsets is None:
        offsets = settings.REMINDER_OFFSETS
    if window_seconds is None:
        window_seconds = settings.REMINDER_WINDOW_SECONDS
    if appointments is None:
        appointments = (
            Appointment.objects.exclude(status__in=SUPPRESSED_STATUSES)
            .select_related("pet", "doctor")
        )

    due = []
    for appt in appointments:
        # Suppression reads CURRENT status: a completed/cancelled appointment
        # never fires, regardless of when the command next runs.
        if appt.status in SUPPRESSED_STATUSES:
            continue
        appt_dt = appointment_datetime(appt)
        for offset in offsets:
            fire_at = appt_dt - offset
            if _within_window(fire_at, now, window_seconds):
                due.append(_build(appt, offset, appt_dt, fire_at))
    return due
