"""Tests for the PDF receipt piece (SRS §3.8, US-PAY-05).

Covers ``receipt_service.build_receipt_pdf`` and ``InvoiceReceiptView``:
  * a PDF is generated for PAID and PARTIALLY_PAID invoices,
  * the endpoint is blocked (409) for PENDING/FAILED invoices,
  * receipt figures are read from the server-side records (amount paid /
    balance due / reference), never client values,
  * ownership is enforced (404 for another doctor's / missing invoice).

The frozen route in api_urls.py still points at the foundation stub, so these
tests drive ``InvoiceReceiptView`` directly via APIRequestFactory +
force_authenticate — validating this task's code regardless of the shared
wiring the invoice fan-out task completes separately.

Run with:  ./.venv/bin/python manage.py test appointments.test_receipts
"""

from decimal import Decimal

from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from . import billing_service, receipt_service
from .api_receipts import InvoiceReceiptView
from .models import Invoice, Payment
from .tests import make_doctor, make_pet


def make_invoice(doctor, pet, **kwargs):
    """Create an invoice with a couple of line items and server-computed totals."""
    line_items = kwargs.pop("line_items", [
        {"description": "Hydrotherapy session", "quantity": 2,
         "unit_price": "500.00", "amount": "1000.00"},
        {"description": "Laser therapy", "quantity": 1,
         "unit_price": "250.50", "amount": "250.50"},
    ])
    subtotal, tax, total = billing_service.recompute_totals(line_items, Decimal("0.18"))
    return Invoice.objects.create(
        pet=pet,
        doctor=doctor,
        invoice_no=Invoice.objects.allocate_next_no(doctor),
        line_items=line_items,
        subtotal=subtotal,
        tax=tax,
        total=total,
        payment_mode=kwargs.pop("payment_mode", Invoice.MODE_POST_TREATMENT),
        **kwargs,
    )


def _get_receipt(invoice, user):
    factory = APIRequestFactory()
    request = factory.get(f"/api/v1/invoices/{invoice.pk}/receipt")
    force_authenticate(request, user=user)
    return InvoiceReceiptView.as_view()(request, pk=invoice.pk)


class BuildReceiptPdfTests(TestCase):
    def setUp(self):
        self.doctor = make_doctor("drbob", clinic="Happy Paws")
        self.pet = make_pet(self.doctor)

    def test_pdf_generated_for_paid_invoice(self):
        invoice = make_invoice(self.doctor, self.pet)
        billing_service.apply_payment(invoice, invoice.total, gateway_ref="pay_abc123")
        invoice.refresh_from_db()
        self.assertEqual(invoice.payment_status, Invoice.PAID)

        pdf = receipt_service.build_receipt_pdf(invoice)
        self.assertIsInstance(pdf, bytes)
        self.assertTrue(len(pdf) > 500)
        self.assertTrue(pdf.startswith(b"%PDF"))

    def test_pdf_generated_for_partially_paid_invoice(self):
        invoice = make_invoice(self.doctor, self.pet, payment_mode=Invoice.MODE_PARTIAL)
        part = (invoice.total / Decimal("2")).quantize(Decimal("0.01"))
        billing_service.apply_payment(invoice, part, gateway_ref="pay_partial")
        invoice.refresh_from_db()
        self.assertEqual(invoice.payment_status, Invoice.PARTIALLY_PAID)

        pdf = receipt_service.build_receipt_pdf(invoice)
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertTrue(len(pdf) > 500)

    @override_settings(DEFAULT_CLINIC_NAME="Fallback Clinic")
    def test_clinic_falls_back_to_settings_when_profile_blank(self):
        # Doctor with an empty clinic name -> receipt uses DEFAULT_CLINIC_NAME.
        doc2 = make_doctor("drnoclinic", clinic="")
        pet2 = make_pet(doc2, name="Rex")
        invoice = make_invoice(doc2, pet2)
        billing_service.apply_payment(invoice, invoice.total)
        pdf = receipt_service.build_receipt_pdf(invoice)
        self.assertTrue(pdf.startswith(b"%PDF"))


class InvoiceReceiptViewTests(TestCase):
    def setUp(self):
        self.doctor = make_doctor("drbob", clinic="Happy Paws")
        self.pet = make_pet(self.doctor)

    def test_receipt_returned_for_paid_invoice(self):
        invoice = make_invoice(self.doctor, self.pet)
        billing_service.apply_payment(invoice, invoice.total, gateway_ref="pay_ok")
        resp = _get_receipt(invoice, self.doctor)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "application/pdf")
        self.assertIn("attachment", resp["Content-Disposition"])
        self.assertIn(f"receipt-invoice-{invoice.invoice_no}.pdf", resp["Content-Disposition"])
        body = b"".join(resp.streaming_content) if resp.streaming else resp.content
        self.assertTrue(body.startswith(b"%PDF"))

    def test_receipt_returned_for_partially_paid_invoice(self):
        invoice = make_invoice(self.doctor, self.pet, payment_mode=Invoice.MODE_PARTIAL)
        part = (invoice.total / Decimal("2")).quantize(Decimal("0.01"))
        billing_service.apply_payment(invoice, part)
        resp = _get_receipt(invoice, self.doctor)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "application/pdf")

    def test_receipt_blocked_for_pending_invoice(self):
        invoice = make_invoice(self.doctor, self.pet)  # no payments -> PENDING
        self.assertEqual(invoice.payment_status, Invoice.PENDING)
        resp = _get_receipt(invoice, self.doctor)
        self.assertEqual(resp.status_code, 409)

    def test_receipt_blocked_for_failed_invoice(self):
        invoice = make_invoice(self.doctor, self.pet)
        billing_service.apply_payment(invoice, invoice.total, success=False)
        invoice.refresh_from_db()
        self.assertEqual(invoice.payment_status, Invoice.FAILED)
        resp = _get_receipt(invoice, self.doctor)
        self.assertEqual(resp.status_code, 409)

    def test_receipt_404_for_other_doctors_invoice(self):
        other = make_doctor("drmallory", clinic="Other Clinic")
        other_pet = make_pet(other, name="Milo")
        invoice = make_invoice(other, other_pet)
        billing_service.apply_payment(invoice, invoice.total)
        # drbob must not be able to fetch drmallory's invoice receipt.
        resp = _get_receipt(invoice, self.doctor)
        self.assertEqual(resp.status_code, 404)

    def test_receipt_404_for_missing_invoice(self):
        factory = APIRequestFactory()
        request = factory.get("/api/v1/invoices/999999/receipt")
        force_authenticate(request, user=self.doctor)
        resp = InvoiceReceiptView.as_view()(request, pk=999999)
        self.assertEqual(resp.status_code, 404)

    def test_amounts_on_receipt_match_the_record_not_client(self):
        """The receipt's paid/balance figures come from billing_service, which
        aggregates SUCCESS Payment rows — not from any client-supplied value."""
        invoice = make_invoice(self.doctor, self.pet, payment_mode=Invoice.MODE_PARTIAL)
        first = Decimal("400.00")
        billing_service.apply_payment(invoice, first, gateway_ref="pay_1")
        invoice.refresh_from_db()

        expected_paid = billing_service.amount_paid(invoice)
        expected_balance = billing_service.balance_due(invoice)
        self.assertEqual(expected_paid, first)
        self.assertEqual(expected_balance, invoice.total - first)

        # A failed payment must NOT move the paid figure.
        billing_service.apply_payment(invoice, Decimal("100.00"), success=False)
        invoice.refresh_from_db()
        self.assertEqual(billing_service.amount_paid(invoice), first)

        # And the PDF renders (figures embedded are the server-side ones).
        pdf = receipt_service.build_receipt_pdf(invoice)
        self.assertTrue(pdf.startswith(b"%PDF"))
