"""Tests for scheduled appointment reminders (US-NOTIF-04 + US-NOTIF-05).

Run with:  ./.venv/bin/python manage.py test appointments.test_reminders

Covers the pure due-computation (appointments/reminders.py) and the cron-able
``manage.py send_due_reminders`` command:

  * fires INSIDE the ±window / does NOT fire outside it (SRS §3.7 AC-01),
  * each 24h/1h/30min offset fires independently,
  * idempotent — re-running inside the window never duplicates a reminder or
    re-delivers (US-NOTIF-04),
  * cancelled/completed appointments are suppressed — no send (US-NOTIF-05),
  * reschedule forward AND backward: the old-time reminder is suppressed and the
    new time mints a fresh reminder that fires (US-NOTIF-05).

``now`` is injected everywhere so there is NO wall-clock dependence.
"""

import datetime
from io import StringIO

from django.conf import settings
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from . import reminders
from .models import Appointment, DeliveryLog, Notification
from .reminders import appointment_datetime, due_reminders
from .tests import make_doctor, make_pet

WINDOW = settings.REMINDER_WINDOW_SECONDS  # 120
OFFSET_24H = datetime.timedelta(hours=24)
OFFSET_1H = datetime.timedelta(hours=1)
OFFSET_30M = datetime.timedelta(minutes=30)


def _reminder_notifs():
    """Only REMINDER notifications — excludes §7 catalogue events from signals.py."""
    return Notification.objects.filter(type=Notification.REMINDER)


def _reminder_deliveries():
    """Only DeliveryLog rows for reminders (notif_type mirrors Notification.type)."""
    return DeliveryLog.objects.filter(notif_type=Notification.REMINDER)


def make_appt(doctor, pet, date, time, status=Appointment.STATUS_PENDING):
    return Appointment.objects.create(
        doctor=doctor,
        pet=pet,
        date=date,
        time=time,
        status=status,
    )


class ReminderComputationTests(TestCase):
    """Pure `due_reminders(now)` — deterministic, no delivery."""

    def setUp(self):
        self.doc = make_doctor("drrem")
        self.pet = make_pet(self.doc)
        self.appt = make_appt(
            self.doc, self.pet, datetime.date(2026, 8, 1), datetime.time(10, 0)
        )
        self.appt_dt = appointment_datetime(self.appt)

    def _fire_at(self, offset):
        return self.appt_dt - offset

    def test_fires_exactly_at_fire_moment(self):
        now = self._fire_at(OFFSET_1H)
        due = due_reminders(now)
        self.assertEqual(len(due), 1)
        self.assertEqual(due[0].offset, OFFSET_1H)
        self.assertEqual(due[0].appointment.pk, self.appt.pk)

    def test_fires_at_window_edge_but_not_past_it(self):
        base = self._fire_at(OFFSET_1H)
        # +WINDOW seconds is the boundary -> still due.
        inside = due_reminders(base + datetime.timedelta(seconds=WINDOW))
        self.assertEqual(len(inside), 1)
        # One second past the window -> not due.
        outside = due_reminders(base + datetime.timedelta(seconds=WINDOW + 1))
        self.assertEqual(outside, [])

    def test_does_not_fire_well_outside_window(self):
        now = self._fire_at(OFFSET_1H) + datetime.timedelta(minutes=10)
        self.assertEqual(due_reminders(now), [])

    def test_each_offset_fires_independently(self):
        for offset in (OFFSET_24H, OFFSET_1H, OFFSET_30M):
            with self.subTest(offset=offset):
                due = due_reminders(self._fire_at(offset))
                self.assertEqual(len(due), 1)
                self.assertEqual(due[0].offset, offset)

    def test_dedup_key_encodes_appt_offset_and_target(self):
        due = due_reminders(self._fire_at(OFFSET_1H))[0]
        self.assertEqual(
            due.dedup_key,
            f"reminder:appt={self.appt.pk}:{int(OFFSET_1H.total_seconds())}"
            f":{self.appt_dt.isoformat()}",
        )

    def test_completed_appointment_suppressed(self):
        self.appt.status = Appointment.STATUS_COMPLETED
        self.appt.save(update_fields=["status"])
        self.assertEqual(due_reminders(self._fire_at(OFFSET_1H)), [])

    def test_cancelled_appointment_suppressed(self):
        # The model has no distinct Cancelled choice yet; the string is stored on
        # the CharField and suppressed defensively (SUPPRESSED_STATUSES).
        self.appt.status = "Cancelled"
        self.appt.save(update_fields=["status"])
        self.assertEqual(due_reminders(self._fire_at(OFFSET_1H)), [])


class SendDueRemindersCommandTests(TestCase):
    """The cron-able `send_due_reminders` command: delivery + idempotency."""

    def setUp(self):
        self.doc = make_doctor("drcron")
        self.pet = make_pet(self.doc)
        self.appt = make_appt(
            self.doc, self.pet, datetime.date(2026, 8, 1), datetime.time(10, 0)
        )
        self.appt_dt = appointment_datetime(self.appt)

    def _run(self, now):
        call_command("send_due_reminders", now=now.isoformat(), stdout=StringIO())

    def _fire_at(self, offset):
        return self.appt_dt - offset

    def test_fires_creates_notification_and_delivery_logs(self):
        self._run(self._fire_at(OFFSET_1H))

        notifs = Notification.objects.filter(type=Notification.REMINDER)
        self.assertEqual(notifs.count(), 1)
        notif = notifs.get()
        self.assertEqual(notif.user_id, self.doc.pk)
        self.assertIn(self.pet.name, notif.message)

        # One SMS attempt to the owner + one FCM attempt to the doctor, audited.
        deliveries = DeliveryLog.objects.filter(notification=notif)
        self.assertEqual(deliveries.count(), 2)
        channels = set(deliveries.values_list("channel", flat=True))
        self.assertEqual(channels, {DeliveryLog.SMS, DeliveryLog.FCM})
        sms = deliveries.get(channel=DeliveryLog.SMS)
        self.assertEqual(sms.recipient, self.pet.owner_phone)

    def test_no_fire_outside_window(self):
        self._run(self._fire_at(OFFSET_1H) + datetime.timedelta(minutes=10))
        # Isolate reminder effects — creating the appointment fires an unrelated
        # APPOINTMENT_CREATED catalogue notification (signals.py).
        self.assertEqual(_reminder_notifs().count(), 0)
        self.assertEqual(_reminder_deliveries().count(), 0)

    def test_rerun_inside_window_is_idempotent(self):
        now = self._fire_at(OFFSET_1H)
        self._run(now)
        self._run(now)  # cron fires again a minute later, still inside window
        self._run(now)
        self.assertEqual(_reminder_notifs().count(), 1)
        # No re-delivery: still exactly the two original reminder attempts.
        self.assertEqual(_reminder_deliveries().count(), 2)

    def test_each_offset_fires_once(self):
        self._run(self._fire_at(OFFSET_24H))
        self._run(self._fire_at(OFFSET_1H))
        self._run(self._fire_at(OFFSET_30M))
        self.assertEqual(_reminder_notifs().count(), 3)
        keys = set(_reminder_notifs().values_list("dedup_key", flat=True))
        self.assertEqual(len(keys), 3)

    def test_cancelled_before_window_no_send(self):
        self.appt.status = "Cancelled"
        self.appt.save(update_fields=["status"])
        self._run(self._fire_at(OFFSET_1H))
        self.assertEqual(_reminder_notifs().count(), 0)
        self.assertEqual(_reminder_deliveries().count(), 0)


class RescheduleSuppressionTests(TestCase):
    """US-NOTIF-05: reschedule suppresses the old-time reminder, new time fires."""

    def setUp(self):
        self.doc = make_doctor("drresched")
        self.pet = make_pet(self.doc)
        # Original appointment far enough out that no reminder has fired yet.
        self.appt = make_appt(
            self.doc, self.pet, datetime.date(2026, 8, 1), datetime.time(10, 0)
        )
        self.old_dt = appointment_datetime(self.appt)

    def _run(self, now):
        call_command("send_due_reminders", now=now.isoformat(), stdout=StringIO())

    def _reschedule(self, date, time):
        self.appt.date = date
        self.appt.time = time
        self.appt.status = Appointment.STATUS_RESCHEDULED
        self.appt.save(update_fields=["date", "time", "status", "updated_at"])
        return appointment_datetime(self.appt)

    def _assert_forward_or_backward(self, new_date, new_time):
        old_fire = self.old_dt - OFFSET_1H
        new_dt = self._reschedule(new_date, new_time)
        new_fire = new_dt - OFFSET_1H

        # Running at the OLD fire moment fires nothing: the row now carries the
        # new time, so the old-time window no longer exists in the data.
        self.assertEqual(due_reminders(old_fire), [])
        self._run(old_fire)
        # No REMINDER fired for the stale old time (catalogue notifications from
        # create/reschedule are unrelated and excluded).
        self.assertEqual(_reminder_notifs().count(), 0)
        self.assertEqual(_reminder_deliveries().count(), 0)

        # Running at the NEW fire moment fires a fresh reminder (new dedup_key).
        self._run(new_fire)
        notifs = _reminder_notifs()
        self.assertEqual(notifs.count(), 1)
        self.assertEqual(notifs.get().dedup_key, reminders.build_dedup_key(
            self.appt, OFFSET_1H, new_dt
        ))

    def test_reschedule_forward_old_suppressed_new_fires(self):
        self._assert_forward_or_backward(datetime.date(2026, 8, 10), datetime.time(15, 0))

    def test_reschedule_backward_old_suppressed_new_fires(self):
        self._assert_forward_or_backward(datetime.date(2026, 7, 25), datetime.time(8, 0))
