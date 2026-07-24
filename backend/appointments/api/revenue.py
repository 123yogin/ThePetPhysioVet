"""Revenue dashboard endpoint (SRS §3.8, US-PAY-06).

``GET /revenue?range=day|week|month`` — ``IsVet``, doctor-scoped.

Revenue is the sum of SUCCESS :class:`~appointments.models.Payment`
``amount_paid`` whose ``paid_at`` falls inside the selected range, restricted
to the caller's own invoices (``invoice__doctor == request.user`` — AuthZ in
depth). Because only SUCCESS payments count, this naturally includes the paid
portion of PARTIALLY_PAID invoices and excludes PENDING/FAILED ones.

Range bounds are computed from ``settings.PARITY_TODAY`` when set (reusing the
dashboard's today-pinning pattern) otherwise ``timezone.localdate()``:

* ``day``   — just today.
* ``week``  — Monday..Sunday of the week containing today.
* ``month`` — first..last calendar day of the current month.

A period with no matching payments returns ``total`` ``"0.00"`` and ``count``
``0`` (never an error).
"""

import calendar
import datetime
from decimal import Decimal

from django.conf import settings
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services import billing as billing_service
from .core import IsVet
from ..models import Invoice, Payment

CURRENCY = "INR"

RANGE_DAY = "day"
RANGE_WEEK = "week"
RANGE_MONTH = "month"
VALID_RANGES = (RANGE_DAY, RANGE_WEEK, RANGE_MONTH)
DEFAULT_RANGE = RANGE_MONTH


def _range_bounds(range_key, today):
    """Return the inclusive ``(start, end)`` dates for ``range_key``."""
    if range_key == RANGE_DAY:
        return today, today
    if range_key == RANGE_WEEK:
        start = today - datetime.timedelta(days=today.weekday())  # Monday
        return start, start + datetime.timedelta(days=6)  # Sunday
    # month
    start = today.replace(day=1)
    last_day = calendar.monthrange(today.year, today.month)[1]
    return start, today.replace(day=last_day)


class RevenueSummaryView(APIView):
    """Doctor-scoped revenue total for a day/week/month window."""

    permission_classes = [IsVet]

    def get(self, request):
        range_key = request.query_params.get("range", DEFAULT_RANGE)
        if range_key not in VALID_RANGES:
            return Response(
                {"detail": f"range must be one of {', '.join(VALID_RANGES)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # PARITY_TODAY pins "today" during the UI-parity check; None (real
        # clock) unless the env var is set, so production behaviour is unchanged.
        today = getattr(settings, "PARITY_TODAY", None) or timezone.localdate()
        start, end = _range_bounds(range_key, today)

        qs = Payment.objects.filter(
            invoice__doctor=request.user,
            status=Payment.SUCCESS,
            paid_at__date__gte=start,
            paid_at__date__lte=end,
        )
        agg = qs.aggregate(total=Sum("amount_paid"))
        total = (agg["total"] or Decimal("0")).quantize(Decimal("0.01"))

        # Invoice-level counters for the dashboard, keyed off invoices *raised*
        # (created) in the same window and scoped to the caller.
        invoices = Invoice.objects.filter(
            doctor=request.user,
            created_at__date__gte=start,
            created_at__date__lte=end,
        )
        invoice_count = invoices.count()
        paid_count = invoices.filter(payment_status=Invoice.PAID).count()

        # Outstanding balance across not-yet-settled invoices in the window.
        pending_total = Decimal("0.00")
        for invoice in invoices.filter(
            payment_status__in=(Invoice.PENDING, Invoice.PARTIALLY_PAID)
        ):
            pending_total += billing_service.balance_due(invoice)
        pending_total = pending_total.quantize(Decimal("0.01"))

        return Response(
            {
                "range": range_key,
                "start": start.isoformat(),
                "end": end.isoformat(),
                "total": str(total),
                "currency": CURRENCY,
                "count": qs.count(),
                # SPA RevenueSummary contract fields.
                "pending_total": str(pending_total),
                "invoice_count": invoice_count,
                "paid_count": paid_count,
            }
        )
