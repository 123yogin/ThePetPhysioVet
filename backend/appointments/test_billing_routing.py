"""Router-level smoke tests for the Sprint-4 billing endpoints (SRS §3.8).

Run with:  ./.venv/bin/python manage.py test appointments.test_billing_routing

Why this file exists (QA fix round 2): the per-view billing tests
(``test_invoices`` / ``test_payments`` / ``test_revenue`` / ``test_receipts``)
dispatch the view classes DIRECTLY with ``APIRequestFactory`` and never traverse
the URL router. That gave false confidence: the views were correct while
``api_urls.py`` still routed every billing path at a 501 stub, so the live app
served ``501 Not Implemented`` everywhere.

These tests go through the REAL project urlconf (``/api/v1/...`` via reverse())
with an ``APIClient`` session, so any regression that unwires a route — or points
it back at a stub — fails here. Each endpoint asserts a genuine, non-501 status
AND that the route resolves to the real implementation. They also lock the exact
JSON field names the React SPA sends (``pet_id`` / absolute ``tax`` /
``amount_paid``) so a backend rename can't silently break the client contract.
"""

import json
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from . import razorpay_client
from .models import Invoice, Package
from .tests import PASSWORD, make_doctor, make_pet


class BillingRoutingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.doc = make_doctor("drroute")
        self.client.login(username="drroute", password=PASSWORD)
        self.pet = make_pet(self.doc)

    # -- helpers ---------------------------------------------------------
    def _create_invoice_via_spa_contract(self, payment_mode="advance", total_sessions=None):
        """POST /invoices with the EXACT payload shape the React form sends."""
        payload = {
            "pet_id": self.pet.id,          # SPA sends pet_id, not pet
            "line_items": [
                {"description": "Hydrotherapy", "quantity": 2, "unit_price": 100},
            ],
            "tax": 18,                        # SPA sends an absolute tax amount
            "payment_mode": payment_mode,
        }
        if total_sessions is not None:
            payload["total_sessions"] = total_sessions
        return self.client.post(
            reverse("api:invoices"), payload, format="json"
        )

    # -- wiring: nothing is a 501 stub ----------------------------------
    def test_invoice_list_is_wired(self):
        resp = self.client.get(reverse("api:invoices"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertNotEqual(resp.status_code, status.HTTP_501_NOT_IMPLEMENTED)

    def test_invoice_create_accepts_spa_contract(self):
        resp = self._create_invoice_via_spa_contract()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        # pet_id resolved; absolute tax applied on top of the 200.00 subtotal.
        self.assertEqual(resp.data["pet_id"], self.pet.id)
        self.assertEqual(resp.data["subtotal"], "200.00")
        self.assertEqual(resp.data["tax"], "18.00")
        self.assertEqual(resp.data["total"], "218.00")
        self.assertEqual(resp.data["payment_status"], "PENDING")

    def test_invoice_detail_is_wired(self):
        inv_id = self._create_invoice_via_spa_contract().data["id"]
        resp = self.client.get(reverse("api:invoice-detail", args=[inv_id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_pet_invoices_is_wired(self):
        self._create_invoice_via_spa_contract()
        resp = self.client.get(reverse("api:pet-invoices", args=[self.pet.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)

    def test_razorpay_order_is_wired(self):
        inv_id = self._create_invoice_via_spa_contract().data["id"]
        resp = self.client.post(reverse("api:invoice-razorpay-order", args=[inv_id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # The exact keys the CheckoutButton reads.
        for key in ("order_id", "amount", "currency", "key_id", "mock", "invoice_no", "name"):
            self.assertIn(key, resp.data)

    def test_record_payment_accepts_spa_amount_paid(self):
        inv_id = self._create_invoice_via_spa_contract().data["id"]
        resp = self.client.post(
            reverse("api:invoice-payments", args=[inv_id]),
            {"amount_paid": "218.00"},        # SPA sends amount_paid, not amount
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data["payment_status"], Invoice.PAID)

    def test_webhook_is_wired_not_stub(self):
        # No signature -> the REAL view rejects with 400 (a stub would 501).
        resp = self.client.post(
            reverse("api:payments-webhook"),
            data=json.dumps({"event": "payment.captured"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotEqual(resp.status_code, status.HTTP_501_NOT_IMPLEMENTED)

    def test_webhook_processes_signed_delivery(self):
        inv_id = self._create_invoice_via_spa_contract().data["id"]
        invoice = Invoice.objects.get(pk=inv_id)
        amount_paise = int((invoice.total * 100).to_integral_value())
        payload = {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_ROUTE1",
                        "amount": amount_paise,
                        "status": "captured",
                        "notes": {"invoice_id": str(invoice.pk)},
                    }
                }
            },
        }
        body = json.dumps(payload).encode()
        sig = razorpay_client.sign_body(body)
        resp = self.client.post(
            reverse("api:payments-webhook"),
            data=body,
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=sig,
            HTTP_X_RAZORPAY_EVENT_ID="evt_route_1",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        invoice.refresh_from_db()
        self.assertEqual(invoice.payment_status, Invoice.PAID)

    def test_package_detail_is_wired(self):
        inv_id = self._create_invoice_via_spa_contract(
            payment_mode="package", total_sessions=5
        ).data["id"]
        package = Package.objects.get(invoice_id=inv_id)
        resp = self.client.get(reverse("api:package-detail", args=[package.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["total_sessions"], 5)
        self.assertEqual(resp.data["remaining_sessions"], 5)

    def test_receipt_is_wired(self):
        # PENDING invoice -> the REAL receipt view answers 409 (a stub would 501).
        inv_id = self._create_invoice_via_spa_contract().data["id"]
        resp = self.client.get(reverse("api:invoice-receipt", args=[inv_id]))
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertNotEqual(resp.status_code, status.HTTP_501_NOT_IMPLEMENTED)

    def test_revenue_is_wired_all_ranges(self):
        for range_key in ("day", "week", "month"):
            resp = self.client.get(reverse("api:revenue"), {"range": range_key})
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            for key in ("total", "pending_total", "invoice_count", "paid_count"):
                self.assertIn(key, resp.data)
