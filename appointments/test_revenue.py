"""Tests for the revenue dashboard endpoint (SRS §3.8, US-PAY-06).

Run with:  ./.venv/bin/python manage.py test appointments.test_revenue

Covers day/week/month bucketing, partial payments counted for their paid
amount, PENDING/FAILED excluded, another doctor's payments excluded, empty
period returns 0, and the IsVet / anonymous guard.

The endpoint (``RevenueSummaryView``) is exercised directly via
``APIRequestFactory`` because the frozen ``/api/v1/revenue`` route still points
at the foundation stub (see the note in the module's test report). "today" is
pinned with ``PARITY_TODAY`` (Wed 2026-07-15) for deterministic range bounds:

    day   -> 2026-07-15 .. 2026-07-15
    week  -> 2026-07-13 (Mon) .. 2026-07-19 (Sun)
    month -> 2026-07-01 .. 2026-07-31
"""

import datetime
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from .api_revenue import RevenueSummaryView
from .models import Invoice, Payment
from .tests import make_doctor, make_pet

PIN = datetime.date(2026, 7, 15)  # a Wednesday


def _dt(year, month, day, hour=12):
    """Timezone-aware datetime at midday on the given date."""
    return timezone.make_aware(datetime.datetime(year, month, day, hour, 0))


@override_settings(PARITY_TODAY=PIN)
class RevenueSummaryTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.doctor = make_doctor("drrev", email="rev@vet.test")
        self.pet = make_pet(self.doctor)
        self._next_no = 0

    # -- helpers ---------------------------------------------------------
    def _invoice(self, doctor=None, total="100.00"):
        doctor = doctor or self.doctor
        self._next_no += 1
        return Invoice.objects.create(
            pet=self.pet,
            doctor=doctor,
            invoice_no=self._next_no,
            line_items=[],
            subtotal=Decimal(total),
            tax=Decimal("0.00"),
            total=Decimal(total),
        )

    def _pay(self, when, amount, status=Payment.SUCCESS, invoice=None):
        invoice = invoice or self._invoice()
        return Payment.objects.create(
            invoice=invoice,
            amount_paid=Decimal(amount),
            status=status,
            paid_at=when,
        )

    def _get(self, range_key=None, user=None):
        params = {"range": range_key} if range_key is not None else {}
        request = self.factory.get("/api/v1/revenue", params)
        if user is not False:
            force_authenticate(request, user=user or self.doctor)
        return RevenueSummaryView.as_view()(request)

    # -- bucketing -------------------------------------------------------
    def test_day_bucket(self):
        self._pay(_dt(2026, 7, 15), "40.00")  # today -> in
        self._pay(_dt(2026, 7, 14), "40.00")  # yesterday -> out
        self._pay(_dt(2026, 7, 16), "40.00")  # tomorrow -> out
        resp = self._get("day")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["range"], "day")
        self.assertEqual(resp.data["start"], "2026-07-15")
        self.assertEqual(resp.data["end"], "2026-07-15")
        self.assertEqual(resp.data["total"], "40.00")
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["currency"], "INR")

    def test_week_bucket_includes_monday_and_sunday_edges(self):
        self._pay(_dt(2026, 7, 13), "10.00")  # Monday -> in
        self._pay(_dt(2026, 7, 19), "20.00")  # Sunday -> in
        self._pay(_dt(2026, 7, 12), "99.00")  # prev Sunday -> out
        self._pay(_dt(2026, 7, 20), "99.00")  # next Monday -> out
        resp = self._get("week")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["start"], "2026-07-13")
        self.assertEqual(resp.data["end"], "2026-07-19")
        self.assertEqual(resp.data["total"], "30.00")
        self.assertEqual(resp.data["count"], 2)

    def test_month_bucket_includes_first_and_last_day(self):
        self._pay(_dt(2026, 7, 1), "100.00")  # first of month -> in
        self._pay(_dt(2026, 7, 31), "50.00")  # last of month -> in
        self._pay(_dt(2026, 6, 30), "99.00")  # prev month -> out
        self._pay(_dt(2026, 8, 1), "99.00")  # next month -> out
        resp = self._get("month")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["start"], "2026-07-01")
        self.assertEqual(resp.data["end"], "2026-07-31")
        self.assertEqual(resp.data["total"], "150.00")
        self.assertEqual(resp.data["count"], 2)

    def test_default_range_is_month(self):
        self._pay(_dt(2026, 7, 5), "77.00")
        resp = self._get()  # no ?range
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["range"], "month")
        self.assertEqual(resp.data["total"], "77.00")

    # -- inclusion / exclusion rules ------------------------------------
    def test_partial_payment_counted_for_its_paid_amount(self):
        """A PARTIALLY_PAID invoice: only the SUCCESS payment amount counts,
        not the (larger) invoice total."""
        inv = self._invoice(total="500.00")
        inv.payment_status = Invoice.PARTIALLY_PAID
        inv.save(update_fields=["payment_status"])
        self._pay(_dt(2026, 7, 10), "200.00", invoice=inv)  # paid portion
        resp = self._get("month")
        self.assertEqual(resp.data["total"], "200.00")
        self.assertEqual(resp.data["count"], 1)

    def test_pending_and_failed_excluded(self):
        # FAILED payment in range -> excluded.
        self._pay(_dt(2026, 7, 10), "300.00", status=Payment.FAILED)
        # A PENDING invoice with no SUCCESS payment -> contributes nothing.
        pending_inv = self._invoice(total="400.00")
        self.assertEqual(pending_inv.payment_status, Invoice.PENDING)
        # A single SUCCESS payment to prove the rest were genuinely excluded.
        self._pay(_dt(2026, 7, 11), "25.00")
        resp = self._get("month")
        self.assertEqual(resp.data["total"], "25.00")
        self.assertEqual(resp.data["count"], 1)

    def test_other_doctors_payments_excluded(self):
        other = make_doctor("drother", email="other@vet.test")
        other_inv = self._invoice(doctor=other, total="100.00")
        self._pay(_dt(2026, 7, 10), "999.00", invoice=other_inv)  # other doctor
        self._pay(_dt(2026, 7, 10), "60.00")  # mine
        resp = self._get("month")
        self.assertEqual(resp.data["total"], "60.00")
        self.assertEqual(resp.data["count"], 1)

    def test_empty_period_returns_zero_not_error(self):
        resp = self._get("day")  # no payments created
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total"], "0.00")
        self.assertEqual(resp.data["count"], 0)
        self.assertEqual(resp.data["currency"], "INR")

    # -- validation & auth ----------------------------------------------
    def test_invalid_range_returns_400(self):
        resp = self._get("year")
        self.assertEqual(resp.status_code, 400)

    def test_anonymous_denied(self):
        resp = self._get(user=False)
        self.assertIn(resp.status_code, (401, 403))
