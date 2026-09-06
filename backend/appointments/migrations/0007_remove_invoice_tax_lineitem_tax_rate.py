"""GST moves from a single client-supplied invoice column to a per-line rate.

`Invoice.tax` was the only money field on the model that was a stored column
rather than a derived property, so a client could put any number in it. It also
could not express a real Indian veterinary bill, where an exempt clinical
service, medicines at 5% and boarding at 18% can sit on one invoice.

Split deliberately into two migrations. This one only ADDS the per-line rate and
carries the existing tax onto the lines, which is safe to run while the current
build is still live — it reads `Invoice.tax`, and that column is still here.
Dropping it is 0008, to be applied only after the new code is deployed.
Otherwise there is a window where the running app selects a column that has
already gone.
"""

import django.core.validators
from decimal import Decimal

from django.db import migrations, models


def carry_existing_tax_onto_the_lines(apps, schema_editor):
    """Preserve every existing invoice total exactly.

    The old model knew one tax figure for the whole invoice, so the only
    faithful translation is to spread it across the lines as a single effective
    rate. An invoice that was taxed at a flat 18% comes out as lines at 18%.
    """
    Invoice = apps.get_model("appointments", "Invoice")
    for invoice in Invoice.objects.all():
        items = list(invoice.line_items.all())
        subtotal = sum((i.amount for i in items), Decimal("0.00"))
        if not items or subtotal <= 0 or not invoice.tax:
            continue
        rate = (Decimal(invoice.tax) / subtotal * Decimal("100")).quantize(Decimal("0.01"))
        for item in items:
            item.tax_rate = rate
            item.save(update_fields=["tax_rate"])


def restore_invoice_tax_from_the_lines(apps, schema_editor):
    """Reverse: fold the per-line tax back into one invoice figure."""
    Invoice = apps.get_model("appointments", "Invoice")
    for invoice in Invoice.objects.all():
        total = sum(
            ((i.amount * i.tax_rate / Decimal("100")).quantize(Decimal("0.01"))
             for i in invoice.line_items.all()),
            Decimal("0.00"),
        )
        invoice.tax = total
        invoice.save(update_fields=["tax"])


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0006_appointment_uniq_active_appointment_per_pet_slot"),
    ]

    operations = [
        migrations.AddField(
            model_name="lineitem",
            name="tax_rate",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("0.00"),
                help_text="GST percentage for this line. Nil for veterinary clinical services.",
                max_digits=5,
                validators=[django.core.validators.MinValueValidator(0)],
            ),
        ),
        migrations.RunPython(
            carry_existing_tax_onto_the_lines,
            restore_invoice_tax_from_the_lines,
        ),
    ]
