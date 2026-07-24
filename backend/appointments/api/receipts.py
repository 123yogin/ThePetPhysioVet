"""PDF receipt endpoint (SRS §3.8, US-PAY-05).

``InvoiceReceiptView`` backs ``GET /api/v1/invoices/{id}/receipt``. It is
IsVet-guarded, scoped to invoices the caller owns (404 otherwise), and only
serves a receipt once the invoice has actually taken money — PAID or
PARTIALLY_PAID. For a PENDING/FAILED invoice there is nothing to receipt yet,
so it returns 409 Conflict.

The route in ``api_urls.py`` is frozen by the Backend foundation and names
``billing_invoice_api.InvoiceReceiptView``; that module re-exports the class
defined here so the receipt logic lives in a single owned file.
"""

from django.http import HttpResponse
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services import receipts as receipt_service
from .core import IsVet
from ..models import Invoice

# Receipts are only meaningful once the invoice has taken money.
_RECEIPTABLE_STATUSES = (Invoice.PAID, Invoice.PARTIALLY_PAID)


class InvoiceReceiptView(APIView):
    """GET /invoices/{id}/receipt -> downloadable application/pdf receipt."""

    permission_classes = [IsVet]

    def get(self, request, pk):
        # Ownership: 404 for a missing invoice OR one owned by another doctor.
        invoice = get_object_or_404(
            Invoice.objects.select_related("pet", "doctor"),
            pk=pk,
            doctor=request.user,
        )

        if invoice.payment_status not in _RECEIPTABLE_STATUSES:
            return Response(
                {
                    "detail": (
                        "A receipt is available only for a paid or partially "
                        "paid invoice."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        pdf_bytes = receipt_service.build_receipt_pdf(invoice)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        filename = f"receipt-invoice-{invoice.invoice_no}.pdf"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
