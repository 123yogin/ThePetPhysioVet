"""Invoice endpoints (SRS §3.8) — US-PAY-01 (create) & US-PAY-02 (list/detail).

This module owns the *invoice* fan-out task: an ``InvoiceCreateSerializer`` plus
``InvoiceListCreateView`` and ``InvoiceDetailView``. It deliberately does NOT
touch the shared foundation modules (``billing_serializers.py``,
``billing_service.py``) beyond importing them read-only.

Server-authoritative rules enforced here (never trust the client):
  * ``invoice_no`` is assigned via ``Invoice.objects.allocate_next_no(doctor)``
    inside the SAME ``transaction.atomic()`` as the insert, so the per-doctor
    sequence stays gapless (CLAUDE.md — money mutations are the highest stakes).
  * ``subtotal`` / ``tax`` / ``total`` are recomputed with
    ``billing_service.recompute_totals`` — any client-sent totals are ignored.
  * New invoices persist with ``payment_status = PENDING``.
  * A ``package``-mode invoice gets a linked :class:`Package` with the requested
    ``total_sessions`` and ``used_sessions = 0``.

AuthZ in depth (CLAUDE.md rule 4): every queryset is scoped to
``doctor=request.user`` and per-object lookups 404 on records the caller does
not own. Read responses use the shared ``InvoiceSerializer``.

NOTE (wiring): ``api_urls.py`` is frozen by the foundation and currently points
``/api/v1/invoices`` at ``billing_invoice_api``'s 501 stubs. Wiring these views
into that route is a one-line import change outside this task's file scope; the
Tech Lead should reconcile the ``api_invoices`` vs ``billing_invoice_api`` module
split. These views are covered directly by ``test_invoices.py``.
"""

from decimal import Decimal, InvalidOperation

from django.db import transaction
from rest_framework import serializers, status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services import billing as billing_service
from .core import IsVet
from ..serializers.billing import InvoiceSerializer
from ..models import Invoice, Package, Pet

TWO_PLACES = Decimal("0.01")


def _positive_decimal(value, field):
    """Coerce ``value`` to a non-negative Decimal or raise a field error.

    Rejects non-numeric junk (``"abc"``), booleans and negatives — the client
    may only supply real, non-negative amounts.
    """
    if isinstance(value, bool) or value is None:
        raise serializers.ValidationError(f"{field} must be a number.")
    try:
        dec = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise serializers.ValidationError(f"{field} must be a number.")
    if dec != dec:  # NaN
        raise serializers.ValidationError(f"{field} must be a number.")
    if dec < 0:
        raise serializers.ValidationError(f"{field} must not be negative.")
    return dec


class InvoiceCreateSerializer(serializers.Serializer):
    """Validate an invoice-creation request.

    Only inputs a client is allowed to influence are declared: the target pet,
    the itemised ``line_items``, the ``payment_mode``, an optional ``tax_rate``
    fraction, and ``total_sessions`` for package mode. Everything money-related
    (per-line ``amount``, subtotal/tax/total, invoice_no, payment_status) is
    derived server-side and any client-sent value for it is ignored.
    """

    # ``pet`` (legacy / tests) and ``pet_id`` (the React SPA contract) are both
    # accepted; at least one must be supplied (resolved in ``validate``).
    pet = serializers.IntegerField(min_value=1, required=False)
    pet_id = serializers.IntegerField(min_value=1, required=False)
    line_items = serializers.ListField(allow_empty=False)
    payment_mode = serializers.ChoiceField(
        choices=[c[0] for c in Invoice.PAYMENT_MODE_CHOICES]
    )
    # Tax may be given two ways (no default, so presence is detectable):
    #   * ``tax_rate`` — a fraction (e.g. 0.18) applied to the subtotal. Takes
    #     precedence when supplied (legacy / tests).
    #   * ``tax``      — an absolute tax amount added to the subtotal. This is
    #     what the React invoice form sends. Used only when ``tax_rate`` is
    #     absent.
    tax_rate = serializers.DecimalField(
        max_digits=6,
        decimal_places=4,
        required=False,
        min_value=Decimal("0"),
    )
    tax = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        min_value=Decimal("0"),
    )
    total_sessions = serializers.IntegerField(required=False, min_value=1)

    def validate_line_items(self, value):
        """Require >= 1 item, each with a description + non-negative amounts."""
        cleaned = []
        for idx, item in enumerate(value):
            if not isinstance(item, dict):
                raise serializers.ValidationError(
                    f"Line {idx + 1}: each item must be an object."
                )
            description = str(item.get("description", "")).strip()
            if not description:
                raise serializers.ValidationError(
                    f"Line {idx + 1}: description is required."
                )
            quantity = _positive_decimal(item.get("quantity"), f"Line {idx + 1} quantity")
            unit_price = _positive_decimal(
                item.get("unit_price"), f"Line {idx + 1} unit_price"
            )
            amount = (quantity * unit_price).quantize(TWO_PLACES)
            # Normalise the stored line (server-computed amount; client amount
            # is never trusted). Amounts are stored as 2dp strings so the
            # JSONField round-trips exact decimals.
            cleaned.append(
                {
                    "description": description,
                    "quantity": str(quantity),
                    "unit_price": str(unit_price.quantize(TWO_PLACES)),
                    "amount": str(amount),
                }
            )
        return cleaned

    def validate(self, attrs):
        # Resolve the target pet from either ``pet`` or ``pet_id`` and normalise
        # onto ``attrs["pet"]`` so the view has a single field to read.
        pet = attrs.get("pet") or attrs.get("pet_id")
        if not pet:
            raise serializers.ValidationError(
                {"pet_id": ["A patient is required for the invoice."]}
            )
        attrs["pet"] = pet

        if attrs["payment_mode"] == Invoice.MODE_PACKAGE and not attrs.get(
            "total_sessions"
        ):
            raise serializers.ValidationError(
                {"total_sessions": ["Required for a package-mode invoice."]}
            )
        return attrs


class InvoiceListCreateView(APIView):
    """GET the doctor's invoices (optionally ``?pet=``) / POST a new invoice."""

    permission_classes = [IsVet]

    def get(self, request):
        qs = (
            Invoice.objects.filter(doctor=request.user)
            .select_related("pet", "package")
            .prefetch_related("payments")
        )
        pet = request.query_params.get("pet", "").strip()
        if pet:
            qs = qs.filter(pet_id=pet)
        return Response(InvoiceSerializer(qs, many=True).data)

    def post(self, request):
        serializer = InvoiceCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data

        # Ownership: the pet must belong to the requesting doctor (404 otherwise).
        pet = get_object_or_404(Pet, pk=data["pet"], doctor=request.user)

        line_items = data["line_items"]
        # Totals are always server-authoritative. ``tax_rate`` (a fraction) wins
        # when supplied; otherwise an absolute ``tax`` amount from the SPA form is
        # added to the subtotal; otherwise tax is zero.
        if "tax_rate" in data:
            subtotal, tax, total = billing_service.recompute_totals(
                line_items, data["tax_rate"]
            )
        else:
            subtotal, _zero_tax, _zero_total = billing_service.recompute_totals(
                line_items, Decimal("0")
            )
            tax = (data.get("tax") or Decimal("0")).quantize(TWO_PLACES)
            total = (subtotal + tax).quantize(TWO_PLACES)

        with transaction.atomic():
            invoice_no = Invoice.objects.allocate_next_no(request.user)
            invoice = Invoice.objects.create(
                pet=pet,
                doctor=request.user,
                invoice_no=invoice_no,
                line_items=line_items,
                subtotal=subtotal,
                tax=tax,
                total=total,
                payment_status=Invoice.PENDING,
                payment_mode=data["payment_mode"],
            )
            if data["payment_mode"] == Invoice.MODE_PACKAGE:
                Package.objects.create(
                    invoice=invoice,
                    total_sessions=data["total_sessions"],
                    used_sessions=0,
                )

        return Response(
            InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED
        )


class InvoiceDetailView(APIView):
    """GET a single owned invoice (404 on a non-owned / missing invoice)."""

    permission_classes = [IsVet]

    def get(self, request, pk):
        invoice = get_object_or_404(
            Invoice.objects.select_related("pet", "package").prefetch_related(
                "payments"
            ),
            pk=pk,
            doctor=request.user,
        )
        return Response(InvoiceSerializer(invoice).data)


class PetInvoiceListView(APIView):
    """GET the invoices for one owned pet — backs ``/pets/{pet_pk}/invoices``.

    Scoped to the calling doctor's own pet (404 for a missing / non-owned pet).
    """

    permission_classes = [IsVet]

    def get(self, request, pet_pk):
        pet = get_object_or_404(Pet, pk=pet_pk, doctor=request.user)
        qs = (
            Invoice.objects.filter(doctor=request.user, pet=pet)
            .select_related("pet", "package")
            .prefetch_related("payments")
        )
        return Response(InvoiceSerializer(qs, many=True).data)
