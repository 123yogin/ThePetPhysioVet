"""Tests for the real-data dashboard stat tiles (SRS §3.2, US-DASH-01).

Run with:  ./.venv/bin/python manage.py test appointments.test_dashboard_stats

Covers the four real-data keys added to ``GET /api/v1/dashboard/stats``
(active_treatments, pending_payments, today_revenue, monthly_revenue) plus the
currency: per-field math, strict per-doctor scoping (doctor B's plans /
invoices / payments never leak), PARITY_TODAY-pinned "today" behaviour,
equality with ``/revenue?range=day`` & ``?range=month`` for the same doctor and
day, and the 403 (non-vet) / 401 (anonymous) auth guards.

"today" is pinned with ``PARITY_TODAY`` (Wed 2026-07-15) so the day/month range
bounds are deterministic:

    day   -> 2026-07-15 .. 2026-07-15
    month -> 2026-07-01 .. 2026-07-31
"""

import datetime
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from .api_revenue import RevenueSummaryView
from .models import Invoice, Payment, TreatmentPlan
from .tests import PASSWORD, make_doctor, make_pet

PIN = datetime.date(2026, 7, 15)  # a Wednesday


def _dt(year, month, day, hour=12):
    """Timezone-aware datetime at midday on the given date."""
    return timezone.make_aware(datetime.datetime(year, month, day, hour, 0))


@override_settings(PARITY_TODAY=PIN)
class DashboardStatsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.factory = APIRequestFactory()
        self.doc = make_doctor("drdashstats", email="dashstats@vet.test")
        self.pet = make_pet(self.doc)
        self.client.login(username="drdashstats", password=PASSWORD)
        self._next_no = {}

    # -- helpers ---------------------------------------------------------
    def _stats(self):
        resp = self.client.get("/api/v1/dashboard/stats")
        self.assertEqual(resp.status_code, 200)
        return resp.data

    def _plan(self, doctor=None, pet=None, status=TreatmentPlan.ACTIVE):
        doctor = doctor or self.doc
        pet = pet or self.pet
        return TreatmentPlan.objects.create(
            pet=pet,
            doctor=doctor,
            therapies=[TreatmentPlan.LASER],
            frequency=TreatmentPlan.DAILY,
            duration=TreatmentPlan.DUR_4WK,
            start_date=PIN,
            status=status,
        )

    def _invoice(self, doctor=None, pet=None, total="100.00",
                 payment_status=Invoice.PENDING):
        doctor = doctor or self.doc
        pet = pet or self.pet
        self._next_no[doctor.id] = self._next_no.get(doctor.id, 0) + 1
        return Invoice.objects.create(
            pet=pet,
            doctor=doctor,
            invoice_no=self._next_no[doctor.id],
            line_items=[],
            subtotal=Decimal(total),
            tax=Decimal("0.00"),
            total=Decimal(total),
            payment_status=payment_status,
        )

    def _pay(self, invoice, when, amount, status=Payment.SUCCESS):
        return Payment.objects.create(
            invoice=invoice,
            amount_paid=Decimal(amount),
            status=status,
            paid_at=when,
        )

    def _revenue(self, range_key, user=None):
        request = self.factory.get("/api/v1/revenue", {"range": range_key})
        force_authenticate(request, user=user or self.doc)
        return RevenueSummaryView.as_view()(request).data

    # -- shape ------------------------------------------------------------
    def test_stats_include_all_new_keys_and_currency(self):
        data = self._stats()
        for key in (
            "today", "today_display", "today_appointments", "completed_count",
            "active_treatments", "pending_payments", "today_revenue",
            "monthly_revenue", "currency",
        ):
            self.assertIn(key, data)
        self.assertEqual(data["currency"], "INR")

    def test_empty_dataset_returns_zeroes_not_error(self):
        data = self._stats()
        self.assertEqual(data["active_treatments"], 0)
        self.assertEqual(data["pending_payments"], "0.00")
        self.assertEqual(data["today_revenue"], "0.00")
        self.assertEqual(data["monthly_revenue"], "0.00")

    # -- active_treatments math ------------------------------------------
    def test_active_treatments_counts_only_active(self):
        self._plan(status=TreatmentPlan.ACTIVE)
        self._plan(status=TreatmentPlan.ACTIVE)
        self._plan(status=TreatmentPlan.ON_HOLD)      # excluded
        self._plan(status=TreatmentPlan.COMPLETED)    # excluded
        data = self._stats()
        self.assertEqual(data["active_treatments"], 2)
        self.assertIsInstance(data["active_treatments"], int)

    # -- today_revenue / monthly_revenue math ----------------------------
    def test_today_and_monthly_revenue_math(self):
        inv = self._invoice(total="1000.00")
        self._pay(inv, _dt(2026, 7, 15), "40.00")   # today -> today + month
        self._pay(inv, _dt(2026, 7, 14), "60.00")   # earlier this month -> month only
        self._pay(inv, _dt(2026, 6, 30), "99.00")   # prev month -> neither
        self._pay(inv, _dt(2026, 7, 10), "5.00", status=Payment.FAILED)  # FAILED -> excluded
        data = self._stats()
        self.assertEqual(data["today_revenue"], "40.00")
        self.assertEqual(data["monthly_revenue"], "100.00")  # 40 + 60

    # -- pending_payments math (NOT windowed) ----------------------------
    def test_pending_payments_sums_balance_due_across_all_open_invoices(self):
        # A wholly-unpaid PENDING invoice -> full total outstanding.
        self._invoice(total="100.00", payment_status=Invoice.PENDING)
        # A PARTIALLY_PAID invoice whose payment sits OUTSIDE the current month
        # -> still fully counted (pending is not windowed) at its remaining bal.
        partial = self._invoice(total="500.00", payment_status=Invoice.PARTIALLY_PAID)
        self._pay(partial, _dt(2026, 6, 1), "200.00")  # last month, remaining 300
        # A PAID invoice contributes nothing.
        self._invoice(total="999.00", payment_status=Invoice.PAID)
        # A FAILED invoice is not PENDING/PARTIALLY_PAID -> excluded.
        self._invoice(total="777.00", payment_status=Invoice.FAILED)
        data = self._stats()
        self.assertEqual(data["pending_payments"], "400.00")  # 100 + 300
        # And the partial's payment did NOT leak into the revenue tiles.
        self.assertEqual(data["monthly_revenue"], "0.00")
        self.assertEqual(data["today_revenue"], "0.00")

    # -- equality with the revenue endpoint ------------------------------
    def test_revenue_tiles_equal_revenue_endpoint_totals(self):
        inv = self._invoice(total="1000.00")
        self._pay(inv, _dt(2026, 7, 15), "125.50")  # today
        self._pay(inv, _dt(2026, 7, 2), "300.00")   # this month, not today
        self._pay(inv, _dt(2026, 8, 1), "88.00")    # next month -> excluded from both
        data = self._stats()
        day = self._revenue("day")
        month = self._revenue("month")
        self.assertEqual(data["today_revenue"], day["total"])
        self.assertEqual(data["monthly_revenue"], month["total"])
        self.assertEqual(data["today_revenue"], "125.50")
        self.assertEqual(data["monthly_revenue"], "425.50")

    # -- PARITY_TODAY behaviour ------------------------------------------
    def test_today_reflects_parity_today_pin(self):
        data = self._stats()
        self.assertEqual(data["today"], "2026-07-15")

    @override_settings(PARITY_TODAY=datetime.date(2026, 8, 15))
    def test_month_window_follows_parity_today(self):
        inv = self._invoice(total="1000.00")
        self._pay(inv, _dt(2026, 8, 15), "10.00")  # August (pinned month) -> in
        self._pay(inv, _dt(2026, 7, 31), "20.00")  # July -> out of August window
        data = self._stats()
        self.assertEqual(data["today"], "2026-08-15")
        self.assertEqual(data["today_revenue"], "10.00")
        self.assertEqual(data["monthly_revenue"], "10.00")

    # -- multi-doctor scoping (no leakage) -------------------------------
    def test_other_doctors_data_never_leaks(self):
        other = make_doctor("drotherdash", email="otherdash@vet.test")
        other_pet = make_pet(other, name="Nala", owner="Sam")
        # Doctor B's active plan, open invoice, and today's payment.
        self._plan(doctor=other, pet=other_pet, status=TreatmentPlan.ACTIVE)
        other_inv = self._invoice(
            doctor=other, pet=other_pet, total="500.00",
            payment_status=Invoice.PARTIALLY_PAID,
        )
        self._pay(other_inv, _dt(2026, 7, 15), "250.00")

        # Doctor A owns nothing -> all real-data tiles are empty.
        data = self._stats()
        self.assertEqual(data["active_treatments"], 0)
        self.assertEqual(data["pending_payments"], "0.00")
        self.assertEqual(data["today_revenue"], "0.00")
        self.assertEqual(data["monthly_revenue"], "0.00")

        # Doctor B sees exactly their own numbers.
        b_client = APIClient()
        b_client.login(username="drotherdash", password=PASSWORD)
        b_data = b_client.get("/api/v1/dashboard/stats").data
        self.assertEqual(b_data["active_treatments"], 1)
        self.assertEqual(b_data["today_revenue"], "250.00")
        self.assertEqual(b_data["monthly_revenue"], "250.00")
        self.assertEqual(b_data["pending_payments"], "250.00")  # 500 - 250

    # -- auth guards ------------------------------------------------------
    def test_anonymous_denied_401(self):
        anon = APIClient()
        self.assertEqual(anon.get("/api/v1/dashboard/stats").status_code, 401)

    def test_non_doctor_forbidden_403(self):
        User.objects.create_user(username="plaindash", password=PASSWORD)
        plain = APIClient()
        plain.login(username="plaindash", password=PASSWORD)
        self.assertEqual(plain.get("/api/v1/dashboard/stats").status_code, 403)
