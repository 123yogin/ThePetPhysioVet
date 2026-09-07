"""Money. Invoice subtotal/total/balance are computed properties, never columns,
so they cannot drift or be spoofed by a client. GST lives on the line item.

Split out of a single 583-line models.py. Cross-model foreign keys are lazy
"appointments.X" strings, so these modules import nothing from each other and
cannot form a cycle. No schema changed: Django keys models by app_label and
class name, not module path.
"""
import uuid
from decimal import Decimal

from django.db import models
from django.core.validators import MinValueValidator


class Invoice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    PAYMENT_STATUS_CHOICES = (
        ("PAID", "Paid"),
        ("PENDING", "Pending"),
        ("PARTIALLY_PAID", "Partially Paid"),
    )
    PAYMENT_MODE_CHOICES = (
        ("post_treatment", "Post Treatment"),
        ("pre_payment", "Pre Payment"),
        ("package", "Package"),
    )

    invoice_no = models.CharField(max_length=50, unique=True)
    # Nullable: a handful of legacy invoices may not cleanly match a Pet
    # during backfill (API_CONTRACT.md ownership-backfill note) — such rows
    # stay doctor-visible only, never owner-visible.
    pet = models.ForeignKey(
        "appointments.Pet", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="invoices",
    )
    owner = models.ForeignKey(
        "appointments.UserProfile", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="invoices",
    )
    payment_mode = models.CharField(max_length=20, choices=PAYMENT_MODE_CHOICES, default="post_treatment")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Invoice {self.invoice_no}"

    # --- server-computed fields (never trust client input for these) ---

    @property
    def tax(self):
        """Derived, like every other money field on this model.

        It was the one exception: a stored column the client supplied, so an
        invoice could be saved with any tax the caller felt like — verified in
        production, where a 1,600 invoice stored tax = 0.00 purely because that
        is what the request said.
        """
        return sum((item.tax_amount for item in self.line_items.all()), Decimal("0.00"))

    @property
    def is_tax_invoice(self):
        """A supply with no tax needs a bill of supply, not a tax invoice
        (s.31(3)(c) CGST). The document has to say which it is."""
        return self.tax > 0

    @property
    def subtotal(self):
        total = sum((item.amount for item in self.line_items.all()), Decimal("0.00"))
        return total

    @property
    def total(self):
        return self.subtotal + (self.tax or Decimal("0.00"))

    @property
    def amount_paid(self):
        total = sum(
            (p.amount_paid for p in self.payments.filter(status="SUCCESS")),
            Decimal("0.00"),
        )
        return total

    @property
    def balance_due(self):
        return self.total - self.amount_paid

    @property
    def payment_status(self):
        total = self.total
        paid = self.amount_paid
        if total > 0 and paid >= total:
            return "PAID"
        if paid > 0:
            return "PARTIALLY_PAID"
        return "PENDING"

class LineItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey("appointments.Invoice", on_delete=models.CASCADE, related_name="line_items")
    description = models.CharField(max_length=255)
    # Known-issue #4 (API_CONTRACT.md §3 Billing, "money guards"): a negative
    # unit_price/quantity previously minted a negative invoice and dragged
    # /revenue.total_revenue below zero.
    quantity = models.IntegerField(default=1, validators=[MinValueValidator(0)])
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    # GST is per line, not per invoice: one bill can carry an exempt clinical
    # service, medicines at 5%, and boarding at 18%. A single invoice-level rate
    # cannot express that, and the flat 18% this app used to apply was wrong for
    # the most common line of all.
    #
    # Default Nil. Entry 46 of Notification 12/2017-Central Tax (Rate), heading
    # 9983, SAC 998351: "Services by a veterinary clinic in relation to health
    # care of animals or birds" — Nil. Still current after GST 2.0 (Notification
    # 16/2025-CTR amends other entries and leaves serial 46 alone).
    #
    # NOT legal advice, and one case is genuinely unsettled: entry 46 is drafted
    # around the supplier being a veterinary clinic, and a standalone animal
    # physiotherapy practice that is not one sits in a grey area with no AAR on
    # point. That is exactly why this is a per-line field with a documented
    # default rather than a constant: a clinic and its accountant can set what
    # applies to them without a code change.
    TAX_RATES = [
        (Decimal("0.00"), "Nil — veterinary clinical service (exempt)"),
        (Decimal("5.00"), "5% — medicines"),
        (Decimal("12.00"), "12%"),
        (Decimal("18.00"), "18% — grooming, boarding, training"),
    ]
    tax_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("0.00"),
        validators=[MinValueValidator(0)],
        help_text="GST percentage for this line. Nil for veterinary clinical services.",
    )

    @property
    def tax_amount(self):
        return (self.amount * self.tax_rate / Decimal("100")).quantize(Decimal("0.01"))

    def save(self, *args, **kwargs):
        if self.amount is None:
            self.amount = (self.unit_price or Decimal("0.00")) * (self.quantity or 0)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.description} ({self.quantity} x {self.unit_price})"

class Payment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    STATUS_CHOICES = (
        ("SUCCESS", "Success"),
        ("PENDING", "Pending"),
        ("FAILED", "Failed"),
    )

    invoice = models.ForeignKey("appointments.Invoice", on_delete=models.CASCADE, related_name="payments")
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2)
    gateway_ref = models.CharField(max_length=255, null=True, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="SUCCESS")
    paid_at = models.DateTimeField(auto_now_add=True)
    # CLAUDE.md rule 6: idempotent money-touching mutations.
    idempotency_key = models.CharField(max_length=255, unique=True, null=True, blank=True)

    class Meta:
        ordering = ["-paid_at"]

    def __str__(self):
        return f"Payment {self.amount_paid} for invoice {self.invoice_id}"

class Package(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.OneToOneField("appointments.Invoice", on_delete=models.CASCADE, related_name="package")
    total_sessions = models.PositiveIntegerField(default=0)
    used_sessions = models.PositiveIntegerField(default=0)

    @property
    def remaining_sessions(self):
        return max(self.total_sessions - self.used_sessions, 0)

    def __str__(self):
        return f"Package for invoice {self.invoice_id} ({self.used_sessions}/{self.total_sessions})"
