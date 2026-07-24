"""Shared read serializers for the billing domain (SRS §3.8).

Output-only shapes consumed by the invoice / payment / revenue views. Input
validation and money mutations live in ``billing_service`` and the fan-out
views; these serializers only render state.

SHARED foundation module: fan-out tasks import it read-only.
"""

from rest_framework import serializers

from ..services import billing as billing_service
from ..models import Invoice, Package, Payment


class PaymentSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    invoice_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "invoice_id",
            "amount_paid",
            "gateway_ref",
            "status",
            "status_display",
            "paid_at",
            "created_at",
        ]


class PackageSerializer(serializers.ModelSerializer):
    remaining = serializers.IntegerField(read_only=True)
    # ``remaining_sessions`` is the name the React SPA reads; kept alongside the
    # shorter ``remaining`` so both the API contract and existing callers work.
    remaining_sessions = serializers.IntegerField(source="remaining", read_only=True)
    exhausted = serializers.BooleanField(read_only=True)
    invoice_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Package
        fields = [
            "id",
            "invoice_id",
            "total_sessions",
            "used_sessions",
            "remaining",
            "remaining_sessions",
            "exhausted",
        ]


class InvoiceSerializer(serializers.ModelSerializer):
    """Full read shape: nested line_items, payments, package + computed money.

    ``amount_paid`` / ``balance_due`` are computed centrally via
    ``billing_service`` so the numbers always agree with the state machine.
    """

    payments = PaymentSerializer(many=True, read_only=True)
    package = serializers.SerializerMethodField()
    # The React SPA reads ``pet_id``; ``pet`` (the PK relation) is kept for
    # existing/legacy callers and tests.
    pet_id = serializers.IntegerField(read_only=True)
    pet_name = serializers.CharField(source="pet.name", read_only=True)
    owner_name = serializers.CharField(source="pet.owner_name", read_only=True)
    payment_status_display = serializers.CharField(
        source="get_payment_status_display", read_only=True
    )
    payment_mode_display = serializers.CharField(
        source="get_payment_mode_display", read_only=True
    )
    amount_paid = serializers.SerializerMethodField()
    balance_due = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id",
            "invoice_no",
            "pet",
            "pet_id",
            "pet_name",
            "owner_name",
            "line_items",
            "subtotal",
            "tax",
            "total",
            "payment_status",
            "payment_status_display",
            "payment_mode",
            "payment_mode_display",
            "amount_paid",
            "balance_due",
            "payments",
            "package",
            "created_at",
        ]

    def get_package(self, obj):
        package = getattr(obj, "package", None)
        if package is None:
            return None
        return PackageSerializer(package).data

    def get_amount_paid(self, obj):
        return str(billing_service.amount_paid(obj))

    def get_balance_due(self, obj):
        return str(billing_service.balance_due(obj))
