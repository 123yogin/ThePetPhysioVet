"""The billing money state machine (SRS §3.8).

This is the single, centralised home for every money-touching state transition
(PRODUCT_PLAN risk #4: payment correctness is the highest-stakes domain). Views
must go through these functions rather than mutating amounts / statuses directly.

Three responsibilities:
  * ``recompute_totals``      — server-authoritative subtotal / tax / total.
  * ``apply_payment``         — record a Payment and transition the invoice's
                                payment_status from cumulative SUCCESS payments.
  * ``consume_package_session`` — idempotently burn one package session when an
                                appointment is completed.

SHARED foundation module: fan-out tasks import it read-only.
"""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone

from ..models import Invoice, Package, PackageSessionConsumption, Payment

TWO_PLACES = Decimal("0.01")
ZERO = Decimal("0.00")


def _money(value) -> Decimal:
    """Coerce anything numeric-ish to a 2dp Decimal (never raises on junk)."""
    try:
        return Decimal(str(value)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        return ZERO


# ---------------------------------------------------------------------------
# Totals
# ---------------------------------------------------------------------------
def recompute_totals(line_items, tax_rate):
    """Return ``(subtotal, tax, total)`` as 2dp Decimals.

    Each line's amount is recomputed server-side as ``quantity * unit_price``
    (the client-supplied ``amount`` is never trusted). ``tax_rate`` is a
    fraction (e.g. ``Decimal("0.18")`` for 18%).
    """
    subtotal = ZERO
    for item in line_items or []:
        quantity = Decimal(str(item.get("quantity", 0) or 0))
        unit_price = _money(item.get("unit_price", 0))
        subtotal += (quantity * unit_price)
    subtotal = subtotal.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    rate = Decimal(str(tax_rate or 0))
    tax = (subtotal * rate).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    total = (subtotal + tax).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    return subtotal, tax, total


# ---------------------------------------------------------------------------
# Payments
# ---------------------------------------------------------------------------
def amount_paid(invoice) -> Decimal:
    """Cumulative sum of SUCCESS payments on an invoice (2dp Decimal)."""
    total = invoice.payments.filter(status=Payment.SUCCESS).aggregate(
        s=Sum("amount_paid")
    )["s"]
    return _money(total or ZERO)


def balance_due(invoice) -> Decimal:
    """Remaining amount owed, clamped to >= 0."""
    remaining = invoice.total - amount_paid(invoice)
    return remaining if remaining > ZERO else ZERO


def _derive_status(invoice) -> str:
    """Pure function of cumulative SUCCESS payments -> payment_status.

    PAID only when cumulative success >= total (never on an arbitrary amount).
    PARTIALLY_PAID when 0 < cumulative < total. Otherwise FAILED if any payment
    has failed and none succeeded, else PENDING.
    """
    paid = amount_paid(invoice)
    total = _money(invoice.total)
    if paid > ZERO:
        return Invoice.PAID if paid >= total else Invoice.PARTIALLY_PAID
    if invoice.payments.filter(status=Payment.FAILED).exists():
        return Invoice.FAILED
    return Invoice.PENDING


def apply_payment(invoice, amount, gateway_ref=None, success=True):
    """Record a Payment against ``invoice`` and update its ``payment_status``.

    Returns the created :class:`Payment`. The status transition is derived
    solely from the cumulative SUCCESS payments (see ``_derive_status``) — it is
    never set to an arbitrary value by the caller. Runs in a transaction so the
    payment row and the recomputed status commit atomically.
    """
    amount = _money(amount)
    with transaction.atomic():
        payment = Payment.objects.create(
            invoice=invoice,
            amount_paid=amount,
            gateway_ref=gateway_ref or None,
            status=Payment.SUCCESS if success else Payment.FAILED,
            paid_at=timezone.now() if success else None,
        )
        invoice.payment_status = _derive_status(invoice)
        invoice.save(update_fields=["payment_status", "updated_at"])
    return payment


# ---------------------------------------------------------------------------
# Package session consumption
# ---------------------------------------------------------------------------
def consume_package_session(appointment):
    """Burn one package session for a completed appointment — idempotently.

    Finds the pet's active package-mode invoice package with sessions remaining
    and records a :class:`PackageSessionConsumption` for ``(package,
    appointment)`` via ``get_or_create``. Only a freshly created ledger row
    increments ``used_sessions`` — so completing (or re-saving) the SAME
    appointment consumes at most one session (US-PAY-04). Never drops below zero
    and is a no-op when no package has capacity.

    Returns the :class:`PackageSessionConsumption` (created or existing), or
    ``None`` when there is no eligible package.
    """
    pet = appointment.pet
    with transaction.atomic():
        package = (
            Package.objects.select_for_update()
            .filter(
                invoice__pet=pet,
                invoice__payment_mode=Invoice.MODE_PACKAGE,
                used_sessions__lt=F("total_sessions"),
            )
            .order_by("invoice__created_at", "invoice__id")
            .first()
        )
        if package is None:
            return None

        consumption, created = PackageSessionConsumption.objects.get_or_create(
            package=package, appointment=appointment
        )
        if created and package.used_sessions < package.total_sessions:
            package.used_sessions = F("used_sessions") + 1
            package.save(update_fields=["used_sessions"])
            package.refresh_from_db(fields=["used_sessions"])
        return consumption
