"""Tests for US-NOTIF-03 — event-driven §7 catalogue notification creation.

Run with:  ./.venv/bin/python manage.py test appointments.test_notification_events

Each of the domain actions in the SRS §7 catalogue must create exactly one
:class:`~appointments.models.Notification` of the right type, addressed to the
doctor, with a message naming the pet/owner, and a duplicated/redelivered event
must de-dupe on the ``evt:<domain>:<pk>:<type>`` key (AC-05). Runs entirely in
the dev mock delivery path (``NOTIFY_MOCK`` truthy by default) so no network /
keys are needed. Diagnosis uploads use a throwaway MEDIA_ROOT.
"""

import datetime
import shutil
import tempfile
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.db.models.signals import post_save
from django.test import TestCase, override_settings

from .models import (
    Appointment,
    DeliveryLog,
    Diagnosis,
    Invoice,
    Notification,
    Payment,
    TreatmentPlan,
)
from .tests import make_doctor, make_pet

_MEDIA = tempfile.mkdtemp(prefix="ppv-notif-media-")


def _make_appointment(doctor, pet, status=Appointment.STATUS_PENDING):
    return Appointment.objects.create(
        doctor=doctor,
        pet=pet,
        visit_type=Appointment.VISIT_CLINIC,
        date=datetime.date(2026, 8, 1),
        time=datetime.time(10, 30),
        status=status,
    )


def _make_invoice(doctor, pet, total="500.00"):
    total = Decimal(total)
    with transaction.atomic():
        no = Invoice.objects.allocate_next_no(doctor)
        return Invoice.objects.create(
            doctor=doctor,
            pet=pet,
            invoice_no=no,
            line_items=[{"description": "Session", "quantity": 1,
                         "unit_price": str(total), "amount": str(total)}],
            subtotal=total,
            tax=Decimal("0.00"),
            total=total,
        )


@override_settings(MEDIA_ROOT=_MEDIA)
class NotificationEventTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.doc = make_doctor("drnotif")
        self.pet = make_pet(self.doc, name="Bruno", owner="Asha")

    def _feed(self, type=None):
        qs = Notification.objects.filter(user=self.doc)
        return qs.filter(type=type) if type else qs

    def _assert_one(self, type):
        """Exactly one notification of ``type`` for the doctor; return it."""
        notifs = list(self._feed(type))
        self.assertEqual(len(notifs), 1, f"expected exactly one {type}, got {len(notifs)}")
        n = notifs[0]
        self.assertEqual(n.user, self.doc)
        self.assertEqual(n.type, type)
        # message names the pet + owner
        self.assertIn(self.pet.name, n.message)
        self.assertIn(self.pet.owner_name, n.message)
        return n

    # --- the catalogue actions --------------------------------------------
    def test_appointment_created(self):
        appt = _make_appointment(self.doc, self.pet)
        n = self._assert_one(Notification.APPOINTMENT_CREATED)
        self.assertEqual(
            n.dedup_key, f"evt:appointment:{appt.pk}:APPOINTMENT_CREATED"
        )

    def test_appointment_rescheduled_on_status_transition(self):
        appt = _make_appointment(self.doc, self.pet)
        # only the CREATED notification so far
        self.assertEqual(self._feed(Notification.APPOINTMENT_RESCHEDULED).count(), 0)
        appt.status = Appointment.STATUS_RESCHEDULED
        appt.date = datetime.date(2026, 8, 5)
        appt.save()
        n = self._assert_one(Notification.APPOINTMENT_RESCHEDULED)
        self.assertEqual(
            n.dedup_key, f"evt:appointment:{appt.pk}:APPOINTMENT_RESCHEDULED"
        )

    def test_non_catalogue_status_transition_is_silent(self):
        # Completed is a real status but not in the §7 catalogue -> no notification.
        appt = _make_appointment(self.doc, self.pet)
        appt.status = Appointment.STATUS_COMPLETED
        appt.save()
        self.assertEqual(
            self._feed().exclude(type=Notification.APPOINTMENT_CREATED).count(), 0
        )

    def test_resave_without_status_change_does_not_renotify(self):
        appt = _make_appointment(self.doc, self.pet)
        appt.reason_notes = "edited"
        appt.save()  # created=False, status unchanged
        self.assertEqual(self._feed(Notification.APPOINTMENT_CREATED).count(), 1)
        self.assertEqual(self._feed().count(), 1)

    def test_invoice_generated(self):
        inv = _make_invoice(self.doc, self.pet)
        n = self._assert_one(Notification.INVOICE_GENERATED)
        self.assertIn(str(inv.invoice_no), n.message)
        self.assertEqual(
            n.dedup_key, f"evt:invoice:{inv.pk}:INVOICE_GENERATED"
        )

    def test_payment_received_only_on_success(self):
        inv = _make_invoice(self.doc, self.pet)
        # A FAILED payment raises nothing.
        Payment.objects.create(invoice=inv, amount_paid=Decimal("100.00"),
                               status=Payment.FAILED)
        self.assertEqual(self._feed(Notification.PAYMENT_RECEIVED).count(), 0)
        # A SUCCESS payment raises exactly one.
        pay = Payment.objects.create(invoice=inv, amount_paid=Decimal("500.00"),
                                     status=Payment.SUCCESS)
        n = self._assert_one(Notification.PAYMENT_RECEIVED)
        self.assertEqual(
            n.dedup_key, f"evt:payment:{pay.pk}:PAYMENT_RECEIVED"
        )

    def test_diagnosis_uploaded(self):
        diag = Diagnosis.objects.create(
            pet=self.pet, doctor=self.doc, report_type=Diagnosis.XRAY,
            file=SimpleUploadedFile("scan.png", b"\x89PNG\r\n\x1a\nrest",
                                    content_type="image/png"),
            original_filename="scan.png", mime="image/png", size=12,
        )
        n = self._assert_one(Notification.DIAGNOSIS_UPLOADED)
        self.assertEqual(
            n.dedup_key, f"evt:diagnosis:{diag.pk}:DIAGNOSIS_UPLOADED"
        )

    def test_treatment_plan_added(self):
        plan = TreatmentPlan.objects.create(
            pet=self.pet, doctor=self.doc, therapies=[TreatmentPlan.LASER],
            frequency=TreatmentPlan.DAILY, duration=TreatmentPlan.DUR_4WK,
            start_date=datetime.date(2026, 8, 1),
        )
        n = self._assert_one(Notification.TREATMENT_ADDED)
        self.assertEqual(
            n.dedup_key, f"evt:treatment:{plan.pk}:TREATMENT_ADDED"
        )

    # --- delivery fan-out ran (mock) --------------------------------------
    def test_creation_fans_out_to_delivery_log(self):
        _make_appointment(self.doc, self.pet)
        # SMS to owner + FCM to doctor both audited in the mock path.
        logs = DeliveryLog.objects.all()
        self.assertTrue(logs.filter(channel=DeliveryLog.SMS).exists())
        self.assertTrue(logs.filter(channel=DeliveryLog.FCM).exists())

    # --- idempotency / de-dup (AC-05) -------------------------------------
    def test_duplicated_event_dedupes(self):
        appt = _make_appointment(self.doc, self.pet)
        self.assertEqual(self._feed(Notification.APPOINTMENT_CREATED).count(), 1)
        deliveries_before = DeliveryLog.objects.count()
        # Redeliver the SAME creation event (at-least-once semantics).
        post_save.send(sender=Appointment, instance=appt, created=True)
        post_save.send(sender=Appointment, instance=appt, created=True)
        # Still exactly one notification and no extra deliveries.
        self.assertEqual(self._feed(Notification.APPOINTMENT_CREATED).count(), 1)
        self.assertEqual(
            Notification.objects.filter(
                dedup_key=f"evt:appointment:{appt.pk}:APPOINTMENT_CREATED"
            ).count(),
            1,
        )
        self.assertEqual(DeliveryLog.objects.count(), deliveries_before)

    def test_duplicated_payment_event_dedupes(self):
        inv = _make_invoice(self.doc, self.pet)
        pay = Payment.objects.create(invoice=inv, amount_paid=Decimal("500.00"),
                                     status=Payment.SUCCESS)
        self.assertEqual(self._feed(Notification.PAYMENT_RECEIVED).count(), 1)
        # Re-saving the same successful payment must not create a second row.
        pay.save()
        post_save.send(sender=Payment, instance=pay, created=False)
        self.assertEqual(self._feed(Notification.PAYMENT_RECEIVED).count(), 1)
