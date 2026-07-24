"""Owner-side portal endpoints — Sprint 11 (SRS §3.8 billing, §3.9 queries).

These views mirror the doctor-side billing/query logic but re-scope every
queryset through the OWNER's ownership path (``pet.owner == request.user`` /
``invoice.pet.owner == request.user``) instead of ``pet.doctor`` / ``doctor``.
AuthZ in depth (CLAUDE.md rule 4): a cross-owner primary key 404s and never
leaks another owner's data.

Business rules (invoice_no allocation, total recompute, status derivation,
receipt gating, attachment validation) are NOT re-implemented — they are reused
from the shared services (``billing_service``, ``receipt_service``) and the
doctor-side validators so the two sides can never diverge.
"""

from django.http import HttpResponse
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services import billing as billing_service, receipts as receipt_service
from .core import IsOwner
from .payments import _parse_amount
from .queries import validate_attachments
from .receipts import _RECEIPTABLE_STATUSES
from ..serializers.billing import InvoiceSerializer, PaymentSerializer
from ..models import Invoice, Notification, Pet, Query, QueryAttachment, QueryMessage
from ..services.notifications import notify
from ..serializers.queries import (
    QueryMessageSerializer,
    QueryPetSummarySerializer,
)


def _owner_pet(request, pet_pk):
    """The owner's own pet, or 404 (never another owner's pet)."""
    return get_object_or_404(Pet, pk=pet_pk, owner=request.user)


def _owner_invoice(request, pk):
    """An invoice for one of the owner's pets, or 404."""
    return get_object_or_404(
        Invoice.objects.select_related("pet", "doctor"), pk=pk, pet__owner=request.user
    )


# ---------------------------------------------------------------------------
# Owner billing (SRS §3.8 owner side) — read invoices, download receipts, pay.
# ---------------------------------------------------------------------------
class OwnerInvoiceListView(APIView):
    """GET the owner's invoices (across all their pets), newest first."""

    permission_classes = [IsOwner]

    def get(self, request):
        qs = (
            Invoice.objects.filter(pet__owner=request.user)
            .select_related("pet")
            .order_by("-created_at", "-id")
        )
        return Response(InvoiceSerializer(qs, many=True).data)


class OwnerInvoiceDetailView(APIView):
    """GET one owner invoice with line items + payment history."""

    permission_classes = [IsOwner]

    def get(self, request, pk):
        invoice = _owner_invoice(request, pk)
        return Response(InvoiceSerializer(invoice).data)


class OwnerInvoiceReceiptView(APIView):
    """GET a PDF receipt for a paid / partially-paid owner invoice (else 409)."""

    permission_classes = [IsOwner]

    def get(self, request, pk):
        invoice = _owner_invoice(request, pk)
        if invoice.payment_status not in _RECEIPTABLE_STATUSES:
            return Response(
                {"detail": "A receipt is available only for a paid or partially paid invoice."},
                status=status.HTTP_409_CONFLICT,
            )
        pdf_bytes = receipt_service.build_receipt_pdf(invoice)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="receipt-invoice-{invoice.invoice_no}.pdf"'
        )
        return response


class OwnerInvoicePaymentView(APIView):
    """POST — owner pays (in full or partially) against their invoice.

    Status is re-derived by ``billing_service.apply_payment`` from cumulative
    successful payments — never set by the caller. Notifies the doctor.
    """

    permission_classes = [IsOwner]

    def post(self, request, pk):
        invoice = _owner_invoice(request, pk)
        amount = _parse_amount(request.data.get("amount") or request.data.get("amount_paid"))
        if amount is None:
            return Response(
                {"amount": ["A positive payment amount is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        gateway_ref = (request.data.get("gateway_ref") or "").strip() or None
        payment = billing_service.apply_payment(
            invoice, amount, gateway_ref=gateway_ref, success=True
        )
        invoice.refresh_from_db()
        notify(
            invoice.doctor,
            Notification.PAYMENT_RECEIVED,
            f"{invoice.pet.name}: owner paid ₹{amount} on invoice {invoice.invoice_no}.",
        )
        data = InvoiceSerializer(invoice).data
        data["payment"] = PaymentSerializer(payment).data
        return Response(data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Owner queries (SRS §3.9 owner side) — view + append to their pet's thread.
# ---------------------------------------------------------------------------
class OwnerPetQueryThreadView(APIView):
    """GET+POST /owner/pets/<pet_pk>/queries — the owner side of the thread.

    GET returns ``{pet, messages[]}`` oldest->newest. POST (multipart) appends a
    message with ``sender_role = OWNER`` (server-side, non-spoofable), validates
    attachments (0-5 JPEG/PNG, <=5MB), writes atomically, and notifies the pet's
    doctor. Append-only: no PUT/PATCH/DELETE (405).
    """

    permission_classes = [IsOwner]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, pet_pk):
        pet = _owner_pet(request, pet_pk)
        query = Query.objects.filter(pet=pet).first()
        messages = query.messages.all() if query is not None else QueryMessage.objects.none()
        return Response(
            {
                "pet": QueryPetSummarySerializer(pet).data,
                "messages": QueryMessageSerializer(
                    messages, many=True, context={"request": request}
                ).data,
            }
        )

    def post(self, request, pet_pk):
        from django.db import transaction

        pet = _owner_pet(request, pet_pk)
        message_text = (request.data.get("message") or "").strip()
        files = request.FILES.getlist("attachments")
        validate_attachments(files)
        if not message_text and not files:
            from rest_framework.exceptions import ValidationError

            raise ValidationError(
                {"message": ["A message or at least one attachment is required."]}
            )

        with transaction.atomic():
            query, _ = Query.objects.get_or_create(pet=pet)
            msg = QueryMessage.objects.create(
                query=query,
                sender=request.user,
                sender_role=QueryMessage.OWNER,  # server-side, ignores any body value
                message=message_text,
            )
            for f in files:
                QueryAttachment.objects.create(
                    message=msg,
                    file=f,
                    original_filename=f.name,
                    mime=(getattr(f, "content_type", "") or ""),
                    size=f.size,
                )
            query.last_message_at = msg.sent_at
            query.save(update_fields=["last_message_at"])

        if pet.doctor_id:
            notify(
                pet.doctor,
                Notification.MESSAGE_RECEIVED,
                f"{pet.name}: new message from the owner.",
            )
        return Response(
            QueryMessageSerializer(msg, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )
