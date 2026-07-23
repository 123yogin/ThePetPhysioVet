"""Tests for the invoice endpoints (SRS §3.8, US-PAY-01 / US-PAY-02).

Run with:  ./.venv/bin/python manage.py test appointments.test_invoices

Covers gapless per-doctor invoice numbering, server-authoritative total
recomputation (client-sent totals ignored), line-item validation (>=1 item,
description required, non-negative numeric quantity/unit_price), package-mode
invoice creation of a linked Package, and per-doctor ownership isolation.

The views live in ``api_invoices.py``. The shared ``api_urls.py`` (frozen by the
Backend foundation) still routes ``/api/v1/invoices`` at the ``billing_invoice_api``
501 stubs, so these tests dispatch the views directly via ``APIRequestFactory``
— which exercises the real permission + validation + persistence paths.
"""

from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from .api_invoices import InvoiceDetailView, InvoiceListCreateView
from .models import Invoice, Package
from .tests import make_doctor, make_pet


class InvoiceEndpointTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.doc = make_doctor("drbill")
        self.pet = make_pet(self.doc)

    # -- helpers ---------------------------------------------------------
    def _create(self, user, payload):
        request = self.factory.post("/api/v1/invoices", payload, format="json")
        force_authenticate(request, user=user)
        return InvoiceListCreateView.as_view()(request)

    def _list(self, user, query=""):
        request = self.factory.get("/api/v1/invoices" + query)
        force_authenticate(request, user=user)
        return InvoiceListCreateView.as_view()(request)

    def _detail(self, user, pk):
        request = self.factory.get(f"/api/v1/invoices/{pk}")
        force_authenticate(request, user=user)
        return InvoiceDetailView.as_view()(request, pk=pk)

    def _payload(self, **overrides):
        payload = {
            "pet": self.pet.id,
            "payment_mode": Invoice.MODE_POST_TREATMENT,
            "tax_rate": "0.18",
            "line_items": [
                {"description": "Consult", "quantity": 2, "unit_price": "100.00"},
                {"description": "Laser", "quantity": 1, "unit_price": "50.50"},
            ],
        }
        payload.update(overrides)
        return payload

    # -- creation & recompute -------------------------------------------
    def test_create_recomputes_totals_and_ignores_client_values(self):
        # Client sends bogus totals, invoice_no and a lying per-line amount —
        # all must be overridden server-side.
        payload = self._payload(
            invoice_no=999,
            subtotal="1.00",
            tax="1.00",
            total="1.00",
            payment_status=Invoice.PAID,
        )
        payload["line_items"][0]["amount"] = "9999.99"
        resp = self._create(self.doc, payload)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["subtotal"], "250.50")
        self.assertEqual(resp.data["tax"], "45.09")
        self.assertEqual(resp.data["total"], "295.59")
        self.assertEqual(resp.data["invoice_no"], 1)  # not the client's 999
        self.assertEqual(resp.data["payment_status"], "PENDING")  # not PAID
        # Per-line amount recomputed (2 * 100.00), not the client's 9999.99.
        self.assertEqual(resp.data["line_items"][0]["amount"], "200.00")
        inv = Invoice.objects.get(id=resp.data["id"])
        self.assertEqual(inv.subtotal, Decimal("250.50"))
        self.assertEqual(inv.total, Decimal("295.59"))
        self.assertEqual(inv.doctor, self.doc)
        self.assertEqual(inv.pet, self.pet)

    def test_create_without_tax_rate_defaults_to_zero(self):
        payload = self._payload()
        payload.pop("tax_rate")
        resp = self._create(self.doc, payload)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["tax"], "0.00")
        self.assertEqual(resp.data["subtotal"], "250.50")
        self.assertEqual(resp.data["total"], "250.50")

    # -- gapless sequential numbering -----------------------------------
    def test_invoice_numbers_are_gapless_and_per_doctor(self):
        for expected in (1, 2, 3):
            resp = self._create(self.doc, self._payload())
            self.assertEqual(resp.status_code, 201, resp.data)
            self.assertEqual(resp.data["invoice_no"], expected)
        # A different doctor gets an independent sequence starting at 1.
        other = make_doctor("drother")
        other_pet = make_pet(other, name="Rex", owner="Ben")
        resp = self._create(other, self._payload(pet=other_pet.id))
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["invoice_no"], 1)

    # -- line-item validation -------------------------------------------
    def test_empty_line_items_rejected(self):
        resp = self._create(self.doc, self._payload(line_items=[]))
        self.assertEqual(resp.status_code, 400)
        self.assertIn("line_items", resp.data)
        self.assertFalse(Invoice.objects.exists())

    def test_negative_quantity_rejected(self):
        payload = self._payload(
            line_items=[{"description": "X", "quantity": -1, "unit_price": "10.00"}]
        )
        resp = self._create(self.doc, payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("line_items", resp.data)
        self.assertFalse(Invoice.objects.exists())

    def test_negative_unit_price_rejected(self):
        payload = self._payload(
            line_items=[{"description": "X", "quantity": 1, "unit_price": "-10.00"}]
        )
        resp = self._create(self.doc, payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("line_items", resp.data)
        self.assertFalse(Invoice.objects.exists())

    def test_non_numeric_amount_rejected(self):
        payload = self._payload(
            line_items=[{"description": "X", "quantity": "abc", "unit_price": "10.00"}]
        )
        resp = self._create(self.doc, payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("line_items", resp.data)
        self.assertFalse(Invoice.objects.exists())

    def test_missing_description_rejected(self):
        payload = self._payload(
            line_items=[{"description": "  ", "quantity": 1, "unit_price": "10.00"}]
        )
        resp = self._create(self.doc, payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("line_items", resp.data)
        self.assertFalse(Invoice.objects.exists())

    def test_invalid_payment_mode_rejected(self):
        resp = self._create(self.doc, self._payload(payment_mode="crypto"))
        self.assertEqual(resp.status_code, 400)
        self.assertIn("payment_mode", resp.data)
        self.assertFalse(Invoice.objects.exists())

    # -- package mode ----------------------------------------------------
    def test_package_invoice_creates_package(self):
        payload = self._payload(
            payment_mode=Invoice.MODE_PACKAGE, total_sessions=6
        )
        resp = self._create(self.doc, payload)
        self.assertEqual(resp.status_code, 201, resp.data)
        inv = Invoice.objects.get(id=resp.data["id"])
        pkg = Package.objects.get(invoice=inv)
        self.assertEqual(pkg.total_sessions, 6)
        self.assertEqual(pkg.used_sessions, 0)
        self.assertEqual(pkg.remaining, 6)
        # Serialized nested package is present.
        self.assertIsNotNone(resp.data["package"])
        self.assertEqual(resp.data["package"]["total_sessions"], 6)

    def test_package_invoice_requires_total_sessions(self):
        payload = self._payload(payment_mode=Invoice.MODE_PACKAGE)
        resp = self._create(self.doc, payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("total_sessions", resp.data)
        self.assertFalse(Invoice.objects.exists())

    def test_non_package_invoice_creates_no_package(self):
        resp = self._create(self.doc, self._payload(total_sessions=6))
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertFalse(Package.objects.exists())
        self.assertIsNone(resp.data["package"])

    # -- ownership isolation --------------------------------------------
    def test_cannot_create_invoice_for_another_doctors_pet(self):
        other = make_doctor("drstranger")
        foreign_pet = make_pet(other, name="Milo", owner="Zed")
        resp = self._create(self.doc, self._payload(pet=foreign_pet.id))
        self.assertEqual(resp.status_code, 404)
        self.assertFalse(Invoice.objects.exists())

    def test_list_is_scoped_to_the_requesting_doctor(self):
        self._create(self.doc, self._payload())
        other = make_doctor("drrival")
        other_pet = make_pet(other, name="Coco", owner="Ivy")
        self._create(other, self._payload(pet=other_pet.id))

        resp = self._list(self.doc)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["pet"], self.pet.id)

    def test_list_filters_by_pet(self):
        pet2 = make_pet(self.doc, name="Nala", owner="Omar")
        self._create(self.doc, self._payload())
        self._create(self.doc, self._payload(pet=pet2.id))

        resp = self._list(self.doc, query=f"?pet={pet2.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["pet"], pet2.id)

    def test_detail_404_for_non_owned_invoice(self):
        resp = self._create(self.doc, self._payload())
        invoice_id = resp.data["id"]
        other = make_doctor("droutsider")
        resp = self._detail(other, invoice_id)
        self.assertEqual(resp.status_code, 404)

    def test_detail_returns_owned_invoice(self):
        created = self._create(self.doc, self._payload())
        resp = self._detail(self.doc, created.data["id"])
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], created.data["id"])
        self.assertEqual(resp.data["invoice_no"], 1)

    def test_detail_404_for_missing_invoice(self):
        resp = self._detail(self.doc, 999999)
        self.assertEqual(resp.status_code, 404)
