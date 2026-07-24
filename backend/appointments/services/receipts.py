"""Downloadable PDF receipts for billing invoices (SRS §3.8, US-PAY-05).

``build_receipt_pdf(invoice)`` renders a self-contained PDF (as ``bytes``) using
reportlab. Every value on the receipt is read from the server-side
``Invoice`` / ``Payment`` records (and the doctor's ``DoctorProfile`` /
``settings.DEFAULT_CLINIC_*``) — a client never supplies invoice numbers,
totals, amounts-paid or payment references. Money figures come from
``billing_service`` so the receipt always agrees with the payment state machine.

SHARED note: this module only *reads* billing state; it performs no mutations.
"""

from decimal import Decimal
from io import BytesIO

from django.conf import settings

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from . import billing as billing_service


def _rupees(amount) -> str:
    """Format a Decimal/number as ``Rs. 1,234.56`` for the receipt."""
    value = Decimal(str(amount or 0)).quantize(Decimal("0.01"))
    return f"Rs. {value:,.2f}"


def _clinic_details(invoice):
    """Resolve clinic name/address/phone, preferring the doctor's profile and
    falling back to the ``DEFAULT_CLINIC_*`` settings."""
    profile = getattr(invoice.doctor, "doctor_profile", None)
    name = (getattr(profile, "clinic_name", "") or "").strip()
    if not name:
        name = getattr(settings, "DEFAULT_CLINIC_NAME", "") or ""
    address = (getattr(profile, "clinic_address", "") or "").strip()
    if not address:
        address = getattr(settings, "DEFAULT_CLINIC_ADDRESS", "") or ""
    phone = (getattr(profile, "clinic_phone", "") or "").strip()
    return name, address, phone


def _doctor_name(invoice) -> str:
    user = invoice.doctor
    full = (user.get_full_name() or "").strip()
    label = full or user.username
    return f"Dr. {label}"


def _payment_reference(invoice):
    """The gateway reference of the most recent SUCCESS payment, if any."""
    payment = (
        invoice.payments.filter(status="SUCCESS")
        .exclude(gateway_ref__isnull=True)
        .exclude(gateway_ref__exact="")
        .order_by("-paid_at", "-created_at", "-id")
        .first()
    )
    if payment is not None:
        return payment.gateway_ref
    return None


def build_receipt_pdf(invoice) -> bytes:
    """Render a payment receipt for ``invoice`` and return the PDF as bytes.

    All figures are read server-side: ``billing_service.amount_paid`` /
    ``balance_due`` drive the money shown, never any client value.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        title=f"Receipt - Invoice #{invoice.invoice_no}",
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="ClinicName", parent=styles["Title"], fontSize=18))
    styles.add(
        ParagraphStyle(name="MetaRight", parent=styles["Normal"], alignment=TA_RIGHT)
    )
    styles.add(
        ParagraphStyle(name="Heading", parent=styles["Heading3"], spaceBefore=6)
    )
    right_cell = ParagraphStyle(
        name="CellRight", parent=styles["Normal"], alignment=TA_RIGHT
    )

    story = []

    clinic_name, clinic_address, clinic_phone = _clinic_details(invoice)
    story.append(Paragraph(clinic_name, styles["ClinicName"]))
    if clinic_address:
        story.append(Paragraph(clinic_address.replace("\n", "<br/>"), styles["Normal"]))
    if clinic_phone:
        story.append(Paragraph(f"Phone: {clinic_phone}", styles["Normal"]))
    story.append(Spacer(1, 6 * mm))

    story.append(
        Paragraph("PAYMENT RECEIPT", ParagraphStyle(
            name="ReceiptTitle", parent=styles["Heading2"], alignment=TA_CENTER
        ))
    )
    story.append(Spacer(1, 4 * mm))

    # Invoice / doctor / pet meta block
    invoice_date = invoice.created_at.strftime("%d %b %Y, %H:%M") if invoice.created_at else ""
    meta_rows = [
        [Paragraph("<b>Invoice No.</b>", styles["Normal"]),
         Paragraph(f"#{invoice.invoice_no}", styles["Normal"])],
        [Paragraph("<b>Date</b>", styles["Normal"]),
         Paragraph(invoice_date, styles["Normal"])],
        [Paragraph("<b>Attending Doctor</b>", styles["Normal"]),
         Paragraph(_doctor_name(invoice), styles["Normal"])],
        [Paragraph("<b>Pet</b>", styles["Normal"]),
         Paragraph(f"{invoice.pet.name} ({invoice.pet.pet_type})", styles["Normal"])],
        [Paragraph("<b>Owner</b>", styles["Normal"]),
         Paragraph(f"{invoice.pet.owner_name} - {invoice.pet.owner_phone}", styles["Normal"])],
    ]
    meta_table = Table(meta_rows, colWidths=[45 * mm, 128 * mm])
    meta_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ])
    )
    story.append(meta_table)
    story.append(Spacer(1, 6 * mm))

    # Itemised line items
    story.append(Paragraph("Items", styles["Heading"]))
    item_rows = [[
        Paragraph("<b>Description</b>", styles["Normal"]),
        Paragraph("<b>Qty</b>", right_cell),
        Paragraph("<b>Unit Price</b>", right_cell),
        Paragraph("<b>Amount</b>", right_cell),
    ]]
    for item in invoice.line_items or []:
        description = str(item.get("description", ""))
        quantity = item.get("quantity", "")
        unit_price = _rupees(item.get("unit_price", 0))
        amount = _rupees(item.get("amount", 0))
        item_rows.append([
            Paragraph(description, styles["Normal"]),
            Paragraph(str(quantity), right_cell),
            Paragraph(unit_price, right_cell),
            Paragraph(amount, right_cell),
        ])
    items_table = Table(item_rows, colWidths=[95 * mm, 18 * mm, 30 * mm, 30 * mm])
    items_table.setStyle(
        TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f0f0")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ])
    )
    story.append(items_table)
    story.append(Spacer(1, 4 * mm))

    # Totals + payment status (all server-authoritative)
    paid = billing_service.amount_paid(invoice)
    balance = billing_service.balance_due(invoice)

    totals_rows = [
        ["Subtotal", _rupees(invoice.subtotal)],
        ["Tax", _rupees(invoice.tax)],
        ["Total", _rupees(invoice.total)],
        ["Payment Status", invoice.get_payment_status_display()],
        ["Payment Mode", invoice.get_payment_mode_display()],
    ]
    if invoice.payment_status == invoice.PARTIALLY_PAID:
        totals_rows.append(["Amount Paid", _rupees(paid)])
        totals_rows.append(["Balance Due", _rupees(balance)])
    else:
        totals_rows.append(["Amount Paid", _rupees(paid)])

    reference = _payment_reference(invoice)
    if reference:
        totals_rows.append(["Payment Reference", str(reference)])

    totals_table = Table(totals_rows, colWidths=[45 * mm, 60 * mm], hAlign="RIGHT")
    totals_table.setStyle(
        TableStyle([
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),  # Total row
            ("LINEABOVE", (0, 2), (-1, 2), 0.5, colors.black),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ])
    )
    story.append(totals_table)
    story.append(Spacer(1, 10 * mm))
    story.append(
        Paragraph(
            "This is a computer-generated receipt.",
            ParagraphStyle(name="Footer", parent=styles["Normal"],
                           fontSize=8, textColor=colors.grey, alignment=TA_CENTER),
        )
    )

    doc.build(story)
    return buffer.getvalue()
