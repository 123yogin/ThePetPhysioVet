"""Drop the now-unused `Invoice.tax` column.

Deliberately separate from 0007 and **must be applied only after the code that
stops reading this column is deployed**. `Invoice.tax` is a derived property now
(summed from each line item's rate); the column is dead weight, but a build that
still selects it would break the moment this runs.

Nothing is lost: 0007 already carried every existing invoice's tax onto its line
items, and totals were verified unchanged across that migration.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0007_remove_invoice_tax_lineitem_tax_rate"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="invoice",
            name="tax",
        ),
    ]
