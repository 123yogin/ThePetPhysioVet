"""Payment endpoints (SRS §3.8) — Razorpay order create, manual payment, webhook.

FOUNDATION STUB. The payments fan-out task implements the bodies WITHOUT editing
api_urls.py — the route -> view-class contract below is fixed.

Build guidance for the fan-out task:
  * InvoiceRazorpayOrderView.post: ``razorpay_client.create_order(invoice)`` for
    the owned invoice; return the order id + key id for web checkout.
  * InvoicePaymentCreateView.post: record a manual/partial payment via
    ``billing_service.apply_payment(invoice, amount, gateway_ref, success)``.
  * RazorpayWebhookView.post: this is a server-to-server callback — AllowAny,
    CSRF-exempt, read the RAW body. Verify with
    ``razorpay_client.verify_webhook_signature(body, sig)``; look up / create a
    ``WebhookEvent`` by the gateway event id for idempotency (a replay is a
    no-op, US-PAY-03); on the first delivery call
    ``billing_service.apply_payment`` and link the WebhookEvent to the
    invoice/payment.
"""

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .api import IsVet

_NOT_IMPLEMENTED = {"detail": "Not implemented yet (Sprint 4 fan-out)."}


class InvoiceRazorpayOrderView(APIView):
    """POST -> create a Razorpay order for web checkout of this invoice."""

    permission_classes = [IsVet]

    def post(self, request, pk):
        return Response(_NOT_IMPLEMENTED, status=status.HTTP_501_NOT_IMPLEMENTED)


class InvoicePaymentCreateView(APIView):
    """POST -> record a manual / partial payment against this invoice."""

    permission_classes = [IsVet]

    def post(self, request, pk):
        return Response(_NOT_IMPLEMENTED, status=status.HTTP_501_NOT_IMPLEMENTED)


@method_decorator(csrf_exempt, name="dispatch")
class RazorpayWebhookView(APIView):
    """Server-to-server Razorpay webhook. Idempotent via WebhookEvent."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        return Response(_NOT_IMPLEMENTED, status=status.HTTP_501_NOT_IMPLEMENTED)
