"""Money paths: server-computed totals, idempotency (CLAUDE.md rule 6),
payment_status transitions, and no-fabricated-revenue.

API_CONTRACT.md §3 Billing / Dashboard.
"""

from decimal import Decimal

from appointments.models import Invoice, LineItem, Payment, Package

from .base import API, ApiTestCase


class InvoiceComputationTests(ApiTestCase):
    def test_server_computes_subtotal_and_ignores_client_totals(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/invoices", {
            "pet_id": self.pet_a.id,
            "line_items": [
                {"description": "Hydro", "quantity": 2, "unit_price": "500.00"},
                {"description": "Laser", "quantity": 1, "unit_price": "250.00"},
            ],
            "tax": "100.00",
            # hostile client input — all of these must be ignored:
            "subtotal": "1.00", "total": "1.00", "amount_paid": "9999.00",
            "balance_due": "0.00", "payment_status": "PAID",
        }, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Decimal(str(r.data["subtotal"])), Decimal("1250.00"))
        self.assertEqual(Decimal(str(r.data["total"])), Decimal("1350.00"))
        self.assertEqual(Decimal(str(r.data["amount_paid"])), Decimal("0.00"))
        self.assertEqual(Decimal(str(r.data["balance_due"])), Decimal("1350.00"))
        self.assertEqual(r.data["payment_status"], "PENDING")

    def test_line_item_amount_is_server_computed(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/invoices", {
            "pet_id": self.pet_a.id,
            "line_items": [{"description": "X", "quantity": 3,
                            "unit_price": "100.00", "amount": "1.00"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Decimal(str(r.data["line_items"][0]["amount"])),
                         Decimal("300.00"))

    def test_invoice_requires_at_least_one_line_item(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/invoices",
                             {"pet_id": self.pet_a.id, "line_items": []},
                             format="json")
        self.assertEqual(r.status_code, 400, r.content)

    def test_invoice_rejects_invalid_payment_mode(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/invoices", {
            "pet_id": self.pet_a.id, "payment_mode": "free_money",
            "line_items": [{"description": "X", "quantity": 1, "unit_price": "1"}],
        }, format="json")
        self.assertEqual(r.status_code, 400, r.content)

    def test_invoice_owner_is_derived_from_pet_not_from_body(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/invoices", {
            "pet_id": self.pet_a.id, "owner": self.owner_b.id,
            "line_items": [{"description": "X", "quantity": 1, "unit_price": "10"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        inv = Invoice.objects.get(pk=r.data["id"])
        self.assertEqual(inv.owner_id, self.owner_a.id)

    def test_negative_unit_price_is_rejected(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/invoices", {
            "pet_id": self.pet_a.id,
            "line_items": [{"description": "Refund hack", "quantity": 1,
                            "unit_price": "-5000.00"}],
        }, format="json")
        self.assertEqual(
            r.status_code, 400,
            "negative unit_price accepted -> attacker can mint a negative "
            "invoice / drive revenue reporting negative",
        )

    def test_package_created_only_for_package_mode(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/invoices", {
            "pet_id": self.pet_a.id, "payment_mode": "package",
            "total_sessions": 10,
            "line_items": [{"description": "10 pack", "quantity": 1,
                            "unit_price": "5000"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertIsNotNone(r.data["package"])
        self.assertEqual(r.data["package"]["remaining_sessions"], 10)


class PaymentIdempotencyTests(ApiTestCase):
    """CLAUDE.md rule 6: idempotency on money-touching mutations."""

    def test_same_idempotency_key_twice_credits_once(self):
        self.auth(self.doctor)
        body = {"amount_paid": "500.00", "gateway_ref": "pay_abc",
                "idempotency_key": "key-123"}
        r1 = self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                              body, format="json")
        r2 = self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                              body, format="json")
        self.assertEqual(r1.status_code, 201, r1.content)
        self.assertIn(r2.status_code, (200, 201), r2.content)
        self.assertEqual(r1.data["id"], r2.data["id"], "second POST made a new Payment")
        self.assertEqual(Payment.objects.filter(invoice=self.invoice_a).count(), 1)
        self.invoice_a.refresh_from_db()
        self.assertEqual(self.invoice_a.amount_paid, Decimal("500.00"))

    def test_idempotency_key_is_global_not_per_invoice(self):
        """A replay aimed at a different invoice must not double-credit."""
        self.auth(self.doctor)
        body = {"amount_paid": "500.00", "idempotency_key": "key-xyz"}
        self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                         body, format="json")
        r2 = self.client.post(f"{API}/invoices/{self.invoice_b.id}/payments",
                              body, format="json")
        self.assertIn(r2.status_code, (200, 201), r2.content)
        self.assertEqual(Payment.objects.count(), 1)
        self.invoice_b.refresh_from_db()
        self.assertEqual(self.invoice_b.amount_paid, Decimal("0.00"))

    def test_distinct_keys_create_distinct_payments(self):
        self.auth(self.doctor)
        for i, key in enumerate(("k1", "k2")):
            r = self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                                 {"amount_paid": "100.00", "idempotency_key": key},
                                 format="json")
            self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Payment.objects.filter(invoice=self.invoice_a).count(), 2)

    def test_zero_and_negative_payments_rejected(self):
        self.auth(self.doctor)
        for amount in ("0", "-100.00"):
            with self.subTest(amount=amount):
                r = self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                                     {"amount_paid": amount}, format="json")
                self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(Payment.objects.count(), 0)

    def test_non_numeric_amount_rejected(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                             {"amount_paid": "; DROP TABLE"}, format="json")
        self.assertEqual(r.status_code, 400, r.content)

    def test_overpayment_beyond_balance_due_is_rejected(self):
        """invoice_a total is 1000.00."""
        self.auth(self.doctor)
        r = self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                             {"amount_paid": "99999.00"}, format="json")
        self.assertEqual(
            r.status_code, 400,
            "overpayment accepted -> balance_due goes negative and the "
            "revenue report over-counts",
        )

    def test_payment_status_transitions_pending_partial_paid(self):
        self.auth(self.doctor)
        url = f"{API}/invoices/{self.invoice_a.id}"

        r = self.client.get(url)
        self.assertEqual(r.data["payment_status"], "PENDING")
        self.assertEqual(Decimal(str(r.data["balance_due"])), Decimal("1000.00"))

        self.client.post(f"{url}/payments", {"amount_paid": "400.00"}, format="json")
        r = self.client.get(url)
        self.assertEqual(r.data["payment_status"], "PARTIALLY_PAID")
        self.assertEqual(Decimal(str(r.data["amount_paid"])), Decimal("400.00"))
        self.assertEqual(Decimal(str(r.data["balance_due"])), Decimal("600.00"))

        self.client.post(f"{url}/payments", {"amount_paid": "600.00"}, format="json")
        r = self.client.get(url)
        self.assertEqual(r.data["payment_status"], "PAID")
        self.assertEqual(Decimal(str(r.data["balance_due"])), Decimal("0.00"))

    def test_failed_payment_does_not_count_towards_paid(self):
        Payment.objects.create(invoice=self.invoice_a, amount_paid=Decimal("1000"),
                               status="FAILED")
        self.invoice_a.refresh_from_db()
        self.assertEqual(self.invoice_a.amount_paid, Decimal("0.00"))
        self.assertEqual(self.invoice_a.payment_status, "PENDING")

    def test_no_raw_card_data_is_accepted_or_stored(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments", {
            "amount_paid": "100.00", "card_number": "4111111111111111",
            "cvv": "123"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        payment = Payment.objects.get(pk=r.data["id"])
        blob = " ".join(str(v) for v in vars(payment).values())
        self.assertNotIn("4111111111111111", blob)
        self.assertNotIn("4111111111111111", str(r.data))


class EmptyDatabaseTests(ApiTestCase):
    """No fabricated data: an empty DB must return real zeros."""

    def setUp(self):
        super().setUp()
        Payment.objects.all().delete()
        LineItem.objects.all().delete()
        Package.objects.all().delete()
        Invoice.objects.all().delete()
        self.plan_a.delete()
        self.appt_a.delete()
        self.appt_b.delete()

    def test_dashboard_stats_on_empty_db_returns_zeros(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/dashboard/stats")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["today_appointments"], [])
        self.assertEqual(r.data["completed_count"], 0)
        self.assertEqual(r.data["active_treatments"], 0)
        self.assertEqual(float(r.data["pending_payments"]), 0.0)
        self.assertEqual(float(r.data["today_revenue"]), 0.0)
        self.assertEqual(float(r.data["monthly_revenue"]), 0.0)
        self.assertEqual(r.data["currency"], "INR")
        # the notorious fabricated constant
        for key in ("pending_payments", "today_revenue", "monthly_revenue"):
            self.assertNotEqual(float(r.data[key]), 15200.0, f"{key} is fabricated")

    def test_revenue_on_empty_db_returns_zeros_for_every_range(self):
        self.auth(self.doctor)
        for rng in ("today", "month", "year"):
            with self.subTest(range=rng):
                r = self.client.get(f"{API}/revenue?range={rng}")
                self.assertEqual(r.status_code, 200, r.content)
                self.assertEqual(r.data["range"], rng)
                self.assertEqual(float(r.data["total_revenue"]), 0.0)
                self.assertEqual(float(r.data["collected"]), 0.0)
                self.assertEqual(float(r.data["pending"]), 0.0)
                self.assertEqual(r.data["currency"], "INR")
                self.assertIsInstance(r.data["series"], list)
                self.assertTrue(all(float(p["amount"]) == 0.0
                                    for p in r.data["series"]))

    def test_revenue_unknown_range_defaults_to_month(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/revenue?range=../../etc/passwd")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["range"], "month")


class RevenueRealSumsTests(ApiTestCase):
    def test_revenue_reflects_actual_payments(self):
        self.auth(self.doctor)
        self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                         {"amount_paid": "300.00"}, format="json")
        r = self.client.get(f"{API}/revenue?range=today")
        self.assertEqual(float(r.data["collected"]), 300.0)

    def test_dashboard_pending_payments_is_sum_of_balance_due(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/dashboard/stats")
        # invoice_a 1000 + invoice_b 2000, nothing paid
        self.assertEqual(float(r.data["pending_payments"]), 3000.0)

    def test_dashboard_today_appointments_scoped_to_requesting_doctor(self):
        from appointments.models import UserProfile, Appointment
        other_doc = UserProfile.objects.create_user(
            username="dr2", password="x", role="DOCTOR")
        self.auth(other_doc)
        r = self.client.get(f"{API}/dashboard/stats")
        self.assertEqual(r.data["today_appointments"], [],
                         "another doctor's appointments leaked into the dashboard")
