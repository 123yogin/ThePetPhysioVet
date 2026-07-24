"""Payment endpoints (SRS §3.8) — US-PAY-03 webhook, US-PAY-02 (partial).

Three views owned by the ``payment-webhook`` fan-out task:

  * ``CheckoutOrderView``  POST /invoices/{id}/checkout
        IsVet; for an owned PENDING / PARTIALLY_PAID invoice, creates a
        Razorpay order (``razorpay_client.create_order``) and returns the
        handshake the web checkout needs: ``{order_id, amount, currency,
        key_id, mock}``. No money moves here — the gateway confirms via webhook.

  * ``RecordPaymentView`` POST /invoices/{id}/payments
        IsVet; records a manual / partial payment through
        ``billing_service.apply_payment`` (US-PAY-02). The invoice status is
        re-derived from cumulative SUCCESS payments (PARTIALLY_PAID -> PAID).

  * ``RazorpayWebhookView`` POST /payments/webhook
        The server-to-server gateway callback (US-PAY-03). ``AllowAny`` +
        ``authentication_classes=[]`` + CSRF-exempt — the *signature* is the
        auth. Verifies the signature over the RAW body (bad sig -> 400), dedupes
        on ``WebhookEvent(event_id)`` so a replay is a no-op (idempotent), then
        applies the payment (success -> PAID/PARTIALLY_PAID, failure -> FAILED)
        within one request.

PCI-DSS: we persist and log NOTHING but the gateway reference, amount and
status. Any card data in the payload is read past, never stored.

NOTE (routing hand-off): ``api_urls.py`` (foundation-frozen, not editable by
this task) still points the three billing payment routes at the
``billing_payment_api`` stub module. To go live, the Tech Lead swaps that one
import to ``api_payments`` — the frozen route class-names
(``InvoiceRazorpayOrderView`` / ``InvoicePaymentCreateView`` /
``RazorpayWebhookView``) are re-exported at the bottom of this module so the
swap is a single line with no route churn.
"""

from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services import billing as billing_service, razorpay_client
from .core import IsVet
from ..serializers.billing import InvoiceSerializer, PaymentSerializer
from ..models import Invoice, WebhookEvent


# Display name shown in the Razorpay web-checkout modal.
CHECKOUT_DISPLAY_NAME = "ThePetPhysioVet"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _owned_invoice(request, pk):
    """Fetch an invoice owned by the calling doctor, or 404 (AuthZ in depth)."""
    return get_object_or_404(
        Invoice.objects.select_related("pet"), pk=pk, doctor=request.user
    )


def _parse_amount(raw):
    """Coerce a client-supplied amount to a positive 2dp Decimal, or ``None``."""
    try:
        amount = Decimal(str(raw))
    except (InvalidOperation, TypeError, ValueError):
        return None
    if amount <= Decimal("0"):
        return None
    return amount.quantize(Decimal("0.01"))


# ---------------------------------------------------------------------------
# (a) Web checkout — create a gateway order
# ---------------------------------------------------------------------------
class CheckoutOrderView(APIView):
    """POST -> create a Razorpay order for web checkout of this invoice."""

    permission_classes = [IsVet]

    # Only invoices that still owe money can start a checkout.
    _CHECKOUTABLE = {Invoice.PENDING, Invoice.PARTIALLY_PAID}

    def post(self, request, pk):
        invoice = _owned_invoice(request, pk)
        if invoice.payment_status not in self._CHECKOUTABLE:
            return Response(
                {
                    "detail": (
                        "Invoice is not payable "
                        f"({invoice.get_payment_status_display()})."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        order = razorpay_client.create_order(invoice)
        return Response(
            {
                "order_id": order["id"],
                "amount": order["amount"],  # paise, gateway smallest unit
                "currency": order["currency"],
                "key_id": settings.RAZORPAY_KEY_ID,
                "mock": bool(settings.RAZORPAY_MOCK),
                "invoice_id": invoice.pk,
                # Fields the web checkout widget renders (SPA contract).
                "invoice_no": str(invoice.invoice_no),
                "name": CHECKOUT_DISPLAY_NAME,
            }
        )


# ---------------------------------------------------------------------------
# (b) Manual / partial payment
# ---------------------------------------------------------------------------
class RecordPaymentView(APIView):
    """POST -> record a manual / partial payment against this invoice.

    Drives the invoice status via ``billing_service.apply_payment`` (the status
    is re-derived from cumulative SUCCESS payments, never set by the caller).
    """

    permission_classes = [IsVet]

    def post(self, request, pk):
        invoice = _owned_invoice(request, pk)
        # Accept both ``amount`` (legacy / tests) and ``amount_paid`` (the SPA
        # RecordPaymentPayload contract).
        raw_amount = request.data.get("amount")
        if raw_amount is None:
            raw_amount = request.data.get("amount_paid")
        amount = _parse_amount(raw_amount)
        if amount is None:
            return Response(
                {"amount": ["A positive payment amount is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        gateway_ref = (request.data.get("gateway_ref") or "").strip() or None
        # A manual record defaults to a successful payment. Callers may flag a
        # failed attempt with success=false or an explicit status of "FAILED"
        # (the SPA sends a `status` field).
        success = request.data.get("success", True)
        if isinstance(success, str):
            success = success.strip().lower() not in ("false", "0", "no", "")
        client_status = str(request.data.get("status") or "").strip().upper()
        if client_status == Invoice.FAILED:
            success = False

        payment = billing_service.apply_payment(
            invoice, amount, gateway_ref=gateway_ref, success=bool(success)
        )
        invoice.refresh_from_db()
        data = InvoiceSerializer(invoice).data
        data["payment"] = PaymentSerializer(payment).data
        return Response(data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# (c) Razorpay webhook — idempotent, signature-verified (US-PAY-03)
# ---------------------------------------------------------------------------
@method_decorator(csrf_exempt, name="dispatch")
class RazorpayWebhookView(APIView):
    """Server-to-server Razorpay webhook. Idempotent via ``WebhookEvent``.

    Contract with :meth:`CheckoutOrderView`: the payment carries the invoice
    reference so we can resolve it without a local Order table — via
    ``payload.payment.entity.notes.invoice_id`` or the order receipt
    ``invoice_<pk>`` (set by ``razorpay_client.create_order``).
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    # Events that represent money captured vs. an explicit failure.
    _FAILURE_EVENTS = {"payment.failed"}

    def post(self, request):
        # 1. Signature over the RAW body — the webhook's only authentication.
        body = request.body
        signature = request.headers.get("X-Razorpay-Signature", "")
        try:
            razorpay_client.verify_webhook_signature(body, signature)
        except razorpay_client.SignatureVerificationError:
            return Response(
                {"detail": "Invalid webhook signature."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 2. Parse the payload.
        try:
            payload = razorpay_client.parse_webhook_body(body)
        except (ValueError, TypeError):
            return Response(
                {"detail": "Malformed webhook body."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(payload, dict):
            return Response(
                {"detail": "Malformed webhook body."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 3. Identify the event (idempotency key) and the money it carries.
        event_id = self._event_id(request, payload)
        if not event_id:
            return Response(
                {"detail": "Missing webhook event id."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invoice = self._resolve_invoice(payload)
        if invoice is None:
            return Response(
                {"detail": "Unknown invoice for webhook."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        gateway_ref, amount, success = self._extract_payment(payload)
        if amount is None:
            return Response(
                {"detail": "Webhook missing a payment amount."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 4. Dedupe + apply, atomically. A replayed event_id short-circuits
        #    BEFORE any money moves (US-PAY-03). Validation 400s above happen
        #    before the ledger row exists, so a rejected delivery can be retried.
        with transaction.atomic():
            event, created = WebhookEvent.objects.get_or_create(event_id=event_id)
            if not created:
                return Response({"status": "duplicate"}, status=status.HTTP_200_OK)

            payment = billing_service.apply_payment(
                invoice, amount, gateway_ref=gateway_ref, success=success
            )
            event.invoice = invoice
            event.payment = payment
            event.save(update_fields=["invoice", "payment"])

        invoice.refresh_from_db()
        return Response(
            {
                "status": "processed",
                "invoice_id": invoice.pk,
                "payment_status": invoice.payment_status,
            },
            status=status.HTTP_200_OK,
        )

    # -- payload extraction ------------------------------------------------
    @staticmethod
    def _payment_entity(payload):
        return (
            (payload.get("payload") or {}).get("payment") or {}
        ).get("entity") or {}

    @staticmethod
    def _order_entity(payload):
        return (
            (payload.get("payload") or {}).get("order") or {}
        ).get("entity") or {}

    def _event_id(self, request, payload):
        """Idempotency key: the delivery's event id.

        Razorpay sends it in the ``X-Razorpay-Event-Id`` header; we fall back to
        a top-level ``id`` or a composed ``<event>:<payment id>`` so replays of
        the same logical event always collide.
        """
        header = request.headers.get("X-Razorpay-Event-Id", "").strip()
        if header:
            return header
        top = str(payload.get("id") or "").strip()
        if top:
            return top
        entity = self._payment_entity(payload)
        event = payload.get("event") or ""
        pay_id = entity.get("id")
        return f"{event}:{pay_id}" if pay_id else ""

    def _resolve_invoice(self, payload):
        """Map the webhook to a local invoice without a local Order table."""
        entity = self._payment_entity(payload)
        notes = entity.get("notes") or {}

        # 1. Explicit invoice id in the payment notes (checkout attaches this).
        inv_id = notes.get("invoice_id")
        if inv_id:
            invoice = Invoice.objects.filter(pk=inv_id).first()
            if invoice is not None:
                return invoice

        # 2. Order receipt "invoice_<pk>" (set by create_order).
        receipt = self._order_entity(payload).get("receipt") or entity.get("receipt")
        invoice = self._invoice_from_receipt(receipt)
        if invoice is not None:
            return invoice

        # 3. Defensive: a top-level invoice_id.
        top_id = payload.get("invoice_id")
        if top_id:
            return Invoice.objects.filter(pk=top_id).first()
        return None

    @staticmethod
    def _invoice_from_receipt(receipt):
        if not receipt or not str(receipt).startswith("invoice_"):
            return None
        try:
            pk = int(str(receipt).split("invoice_", 1)[1])
        except (ValueError, IndexError):
            return None
        return Invoice.objects.filter(pk=pk).first()

    def _extract_payment(self, payload):
        """Return ``(gateway_ref, amount_decimal, success)``.

        Reads only the gateway reference, amount and status — never card data.
        Amount arrives in paise and is converted to a 2dp rupee Decimal.
        """
        entity = self._payment_entity(payload)
        gateway_ref = entity.get("id") or None

        raw_amount = entity.get("amount")
        if raw_amount is None:
            raw_amount = self._order_entity(payload).get("amount_paid")
        amount = None
        if raw_amount is not None:
            try:
                amount = (Decimal(str(raw_amount)) / Decimal("100")).quantize(
                    Decimal("0.01")
                )
            except (InvalidOperation, TypeError, ValueError):
                amount = None

        event = payload.get("event") or ""
        entity_status = str(entity.get("status") or "").lower()
        success = event not in self._FAILURE_EVENTS and entity_status != "failed"
        return gateway_ref, amount, success


# ---------------------------------------------------------------------------
# Route-name aliases for the foundation-frozen api_urls.py.
# Swapping api_urls' import from ``billing_payment_api`` to ``api_payments``
# wires these three routes to the real implementations above with no other
# change (the class names match the frozen route contract).
# ---------------------------------------------------------------------------
InvoiceRazorpayOrderView = CheckoutOrderView
InvoicePaymentCreateView = RecordPaymentView
