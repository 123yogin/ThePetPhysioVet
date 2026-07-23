"""Tests for the Sprint-4 payment views (SRS §3.8): checkout order, manual /
partial payment, and the idempotent signature-verified Razorpay webhook.

Run with:  ./.venv/bin/python manage.py test appointments.test_payments

Covers US-PAY-03 (idempotent, signature-verified webhook -> invoice status) and
US-PAY-02 partial payments. The three views live in ``api_payments`` and are
exercised directly with an ``APIRequestFactory`` because ``api_urls.py`` (frozen
by the backend foundation, outside this task's edit scope) still routes the
billing payment paths to the ``billing_payment_api`` stub module — so the tests
do not depend on that pending one-line routing swap.

Runs in RAZORPAY_MOCK mode: signatures are a plain HMAC-SHA256 over the raw body
using the fixed dev webhook secret, so ``razorpay_client.sign_body`` produces a
signature the view accepts and any other value is rejected.
"""

import json
from decimal import Decimal

from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from . import razorpay_client
from .api_payments import (
    CheckoutOrderView,
    RazorpayWebhookView,
    RecordPaymentView,
)
from .models import Invoice, Payment, WebhookEvent
from .tests import make_doctor, make_pet


def make_invoice(doctor, pet, total="100.00", mode=Invoice.MODE_POST_TREATMENT,
                 payment_status=Invoice.PENDING):
    """Create an owned invoice with a server-allocated gapless number."""
    from django.db import transaction

    total = Decimal(total)
    with transaction.atomic():
        no = Invoice.objects.allocate_next_no(doctor)
        return Invoice.objects.create(
            doctor=doctor,
            pet=pet,
            invoice_no=no,
            line_items=[{
                "description": "Consultation",
                "quantity": 1,
                "unit_price": str(total),
                "amount": str(total),
            }],
            subtotal=total,
            tax=Decimal("0.00"),
            total=total,
            payment_mode=mode,
            payment_status=payment_status,
        )


def webhook_body(invoice, *, event="payment.captured", amount_paise=None,
                 pay_id="pay_TEST123", pan=None, entity_status=None):
    """Build a Razorpay-shaped webhook payload for ``invoice``.

    ``amount_paise`` defaults to the full invoice total. ``pan`` injects fake
    card data into the payment entity so we can prove it is never persisted.
    """
    if amount_paise is None:
        amount_paise = int((invoice.total * 100).to_integral_value())
    entity = {
        "id": pay_id,
        "entity": "payment",
        "amount": amount_paise,
        "currency": "INR",
        "status": entity_status or ("failed" if event == "payment.failed" else "captured"),
        "order_id": f"order_mock_{invoice.pk}",
        "notes": {"invoice_id": str(invoice.pk)},
    }
    if pan is not None:
        # Card data that a real gateway might echo — must NOT be stored/logged.
        entity["card"] = {"number": pan, "last4": pan[-4:], "network": "Visa"}
    return {
        "event": event,
        "payload": {"payment": {"entity": entity}},
    }


class PaymentTestBase(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.doc = make_doctor("drpay")
        self.pet = make_pet(self.doc)

    # -- request helpers ---------------------------------------------------
    def _auth_post(self, view, path, data, user, **kwargs):
        request = self.factory.post(path, data, format="json")
        force_authenticate(request, user=user)
        return view.as_view()(request, **kwargs)

    def _webhook(self, payload, *, signature=None, event_id="evt_default", headers=None):
        body = json.dumps(payload).encode()
        sig = signature if signature is not None else razorpay_client.sign_body(body)
        extra = {"HTTP_X_RAZORPAY_SIGNATURE": sig}
        if event_id is not None:
            extra["HTTP_X_RAZORPAY_EVENT_ID"] = event_id
        if headers:
            extra.update(headers)
        request = self.factory.post(
            "/api/v1/payments/webhook",
            data=body,
            content_type="application/json",
            **extra,
        )
        return RazorpayWebhookView.as_view()(request)


# ---------------------------------------------------------------------------
# (a) Checkout order
# ---------------------------------------------------------------------------
class CheckoutOrderTests(PaymentTestBase):
    def test_checkout_returns_order_handshake(self):
        inv = make_invoice(self.doc, self.pet, total="250.00")
        resp = self._auth_post(
            CheckoutOrderView, f"/api/v1/invoices/{inv.pk}/checkout", {}, self.doc, pk=inv.pk
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["order_id"].startswith("order_mock_"))
        self.assertEqual(resp.data["amount"], 25000)  # paise
        self.assertEqual(resp.data["currency"], "INR")
        self.assertTrue(resp.data["mock"])
        self.assertEqual(resp.data["invoice_id"], inv.pk)

    def test_checkout_rejected_when_already_paid(self):
        inv = make_invoice(self.doc, self.pet, payment_status=Invoice.PAID)
        resp = self._auth_post(
            CheckoutOrderView, f"/api/v1/invoices/{inv.pk}/checkout", {}, self.doc, pk=inv.pk
        )
        self.assertEqual(resp.status_code, 400)

    def test_checkout_allowed_when_partially_paid(self):
        inv = make_invoice(self.doc, self.pet, payment_status=Invoice.PARTIALLY_PAID)
        resp = self._auth_post(
            CheckoutOrderView, f"/api/v1/invoices/{inv.pk}/checkout", {}, self.doc, pk=inv.pk
        )
        self.assertEqual(resp.status_code, 200)

    def test_checkout_scoped_to_owner_404(self):
        other = make_doctor("drother")
        inv = make_invoice(self.doc, self.pet)
        resp = self._auth_post(
            CheckoutOrderView, f"/api/v1/invoices/{inv.pk}/checkout", {}, other, pk=inv.pk
        )
        self.assertEqual(resp.status_code, 404)

    def test_checkout_requires_auth(self):
        inv = make_invoice(self.doc, self.pet)
        request = self.factory.post(f"/api/v1/invoices/{inv.pk}/checkout", {}, format="json")
        resp = CheckoutOrderView.as_view()(request, pk=inv.pk)
        self.assertIn(resp.status_code, (401, 403))


# ---------------------------------------------------------------------------
# (b) Manual / partial payment (US-PAY-02)
# ---------------------------------------------------------------------------
class RecordPaymentTests(PaymentTestBase):
    def test_partial_then_full_transitions_status(self):
        inv = make_invoice(self.doc, self.pet, total="100.00")

        resp = self._auth_post(
            RecordPaymentView, f"/api/v1/invoices/{inv.pk}/payments",
            {"amount": "40.00"}, self.doc, pk=inv.pk,
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["payment_status"], Invoice.PARTIALLY_PAID)
        self.assertEqual(resp.data["balance_due"], "60.00")

        resp = self._auth_post(
            RecordPaymentView, f"/api/v1/invoices/{inv.pk}/payments",
            {"amount": "60.00"}, self.doc, pk=inv.pk,
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["payment_status"], Invoice.PAID)
        self.assertEqual(resp.data["balance_due"], "0.00")
        inv.refresh_from_db()
        self.assertEqual(inv.payment_status, Invoice.PAID)

    def test_zero_amount_rejected(self):
        inv = make_invoice(self.doc, self.pet)
        resp = self._auth_post(
            RecordPaymentView, f"/api/v1/invoices/{inv.pk}/payments",
            {"amount": "0"}, self.doc, pk=inv.pk,
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(Payment.objects.filter(invoice=inv).count(), 0)

    def test_negative_amount_rejected(self):
        inv = make_invoice(self.doc, self.pet)
        resp = self._auth_post(
            RecordPaymentView, f"/api/v1/invoices/{inv.pk}/payments",
            {"amount": "-10"}, self.doc, pk=inv.pk,
        )
        self.assertEqual(resp.status_code, 400)

    def test_payment_scoped_to_owner_404(self):
        other = make_doctor("drother2")
        inv = make_invoice(self.doc, self.pet)
        resp = self._auth_post(
            RecordPaymentView, f"/api/v1/invoices/{inv.pk}/payments",
            {"amount": "10"}, other, pk=inv.pk,
        )
        self.assertEqual(resp.status_code, 404)


# ---------------------------------------------------------------------------
# (c) Razorpay webhook (US-PAY-03)
# ---------------------------------------------------------------------------
@override_settings(RAZORPAY_MOCK=True, RAZORPAY_WEBHOOK_SECRET="")
class WebhookTests(PaymentTestBase):
    def test_valid_signature_success_marks_paid(self):
        inv = make_invoice(self.doc, self.pet, total="100.00")
        resp = self._webhook(webhook_body(inv), event_id="evt_paid_1")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "processed")
        inv.refresh_from_db()
        self.assertEqual(inv.payment_status, Invoice.PAID)
        self.assertEqual(inv.payments.filter(status=Payment.SUCCESS).count(), 1)
        pay = inv.payments.get()
        self.assertEqual(pay.gateway_ref, "pay_TEST123")
        self.assertEqual(pay.amount_paid, Decimal("100.00"))

    def test_partial_then_second_payment_marks_paid(self):
        inv = make_invoice(self.doc, self.pet, total="100.00")

        r1 = self._webhook(
            webhook_body(inv, amount_paise=4000, pay_id="pay_A"),
            event_id="evt_A",
        )
        self.assertEqual(r1.status_code, 200)
        inv.refresh_from_db()
        self.assertEqual(inv.payment_status, Invoice.PARTIALLY_PAID)

        r2 = self._webhook(
            webhook_body(inv, amount_paise=6000, pay_id="pay_B"),
            event_id="evt_B",
        )
        self.assertEqual(r2.status_code, 200)
        inv.refresh_from_db()
        self.assertEqual(inv.payment_status, Invoice.PAID)
        self.assertEqual(inv.payments.filter(status=Payment.SUCCESS).count(), 2)

    def test_failure_event_marks_failed(self):
        inv = make_invoice(self.doc, self.pet, total="100.00")
        resp = self._webhook(
            webhook_body(inv, event="payment.failed", pay_id="pay_FAIL"),
            event_id="evt_fail_1",
        )
        self.assertEqual(resp.status_code, 200)
        inv.refresh_from_db()
        self.assertEqual(inv.payment_status, Invoice.FAILED)
        pay = inv.payments.get()
        self.assertEqual(pay.status, Payment.FAILED)
        self.assertIsNone(pay.paid_at)

    def test_duplicate_event_applied_once(self):
        inv = make_invoice(self.doc, self.pet, total="100.00")
        body = webhook_body(inv)

        r1 = self._webhook(body, event_id="evt_dupe")
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r1.data["status"], "processed")

        r2 = self._webhook(body, event_id="evt_dupe")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data["status"], "duplicate")

        # Applied exactly once despite two deliveries.
        self.assertEqual(Payment.objects.filter(invoice=inv).count(), 1)
        self.assertEqual(WebhookEvent.objects.filter(event_id="evt_dupe").count(), 1)
        inv.refresh_from_db()
        self.assertEqual(inv.payment_status, Invoice.PAID)

    def test_bad_signature_rejected(self):
        inv = make_invoice(self.doc, self.pet, total="100.00")
        resp = self._webhook(
            webhook_body(inv), signature="deadbeef", event_id="evt_badsig"
        )
        self.assertEqual(resp.status_code, 400)
        # Nothing recorded on a rejected delivery.
        self.assertEqual(Payment.objects.filter(invoice=inv).count(), 0)
        self.assertEqual(WebhookEvent.objects.count(), 0)
        inv.refresh_from_db()
        self.assertEqual(inv.payment_status, Invoice.PENDING)

    def test_missing_signature_rejected(self):
        inv = make_invoice(self.doc, self.pet, total="100.00")
        resp = self._webhook(webhook_body(inv), signature="", event_id="evt_nosig")
        self.assertEqual(resp.status_code, 400)

    def test_unknown_invoice_rejected(self):
        inv = make_invoice(self.doc, self.pet, total="100.00")
        body = webhook_body(inv)
        body["payload"]["payment"]["entity"]["notes"]["invoice_id"] = "999999"
        resp = self._webhook(body, event_id="evt_unknown")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(WebhookEvent.objects.count(), 0)

    def test_no_card_data_persisted_or_logged(self):
        inv = make_invoice(self.doc, self.pet, total="100.00")
        pan = "4111111111111111"
        resp = self._webhook(
            webhook_body(inv, pan=pan, pay_id="pay_PCI"), event_id="evt_pci"
        )
        self.assertEqual(resp.status_code, 200)

        pay = inv.payments.get()
        # Only gateway_ref / amount / status stored — never the PAN.
        for value in (pay.gateway_ref, str(pay.amount_paid), pay.status):
            self.assertNotIn(pan, value or "")
        # No model field anywhere holds the PAN.
        for obj in (pay, WebhookEvent.objects.get(event_id="evt_pci"), inv):
            for field in obj._meta.get_fields():
                if not hasattr(field, "attname"):
                    continue
                raw = getattr(obj, field.attname, None)
                self.assertNotIn(pan, str(raw))
        # And the invoice never absorbed the card blob into its line_items.
        self.assertNotIn(pan, json.dumps(inv.line_items))
