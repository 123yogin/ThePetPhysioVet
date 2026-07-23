"""Invoice endpoints (SRS §3.8) — invoices, pet invoices, PDF receipts.

FOUNDATION STUB. The Backend foundation owns the shared plumbing
(models, billing_service, billing_serializers, razorpay_client, api_urls,
settings). The invoice fan-out task implements the bodies of these views WITHOUT
editing api_urls.py — the route -> view-class contract below is fixed.

Build guidance for the fan-out task:
  * InvoiceListCreateView.post: build line_items, call
    ``billing_service.recompute_totals`` for subtotal/tax/total, allocate the
    number via ``Invoice.objects.allocate_next_no(request.user)`` inside a
    ``transaction.atomic()`` and create the Invoice in the SAME transaction;
    create a Package when payment_mode == 'package'. Never trust a client
    invoice_no / totals.
  * Scope every queryset to ``doctor=request.user`` (AuthZ in depth).
  * Render with ``billing_serializers.InvoiceSerializer``.
  * InvoiceReceiptView: stream a reportlab PDF (Content-Type application/pdf).
"""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .api import IsVet

_NOT_IMPLEMENTED = {"detail": "Not implemented yet (Sprint 4 fan-out)."}


class InvoiceListCreateView(APIView):
    permission_classes = [IsVet]

    def get(self, request):
        return Response(_NOT_IMPLEMENTED, status=status.HTTP_501_NOT_IMPLEMENTED)

    def post(self, request):
        return Response(_NOT_IMPLEMENTED, status=status.HTTP_501_NOT_IMPLEMENTED)


class InvoiceDetailView(APIView):
    permission_classes = [IsVet]

    def get(self, request, pk):
        return Response(_NOT_IMPLEMENTED, status=status.HTTP_501_NOT_IMPLEMENTED)


class PetInvoiceListView(APIView):
    """Invoices for a single owned pet — backs the PetDetail billing link."""

    permission_classes = [IsVet]

    def get(self, request, pet_pk):
        return Response(_NOT_IMPLEMENTED, status=status.HTTP_501_NOT_IMPLEMENTED)


class InvoiceReceiptView(APIView):
    """Downloadable PDF receipt for a paid/partly-paid invoice."""

    permission_classes = [IsVet]

    def get(self, request, pk):
        return Response(_NOT_IMPLEMENTED, status=status.HTTP_501_NOT_IMPLEMENTED)
