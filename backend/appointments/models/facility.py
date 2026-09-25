"""Indoor-facility (day-care) slot bookings.

A different shape from `Appointment` and `Enquiry`. An appointment is one
open-ended visit; an enquiry is a lead the clinic triages by hand. A facility
booking is *inventory*: the day is cut into fixed one-hour slots, each slot has
a fixed number of beds, and a visitor can hold one bed per slot. "3 beds left
at 10:30" is a promise of real-time truth, so unlike an enquiry it cannot be a
"we'll call you" — the count has to be backed by real rows.

One row per held bed-slot. A single visitor request for, say, 10:30 + 11:30 is
two rows that share a `reference`, so the doctor portal can group them and a
booking can be confirmed or cancelled as a unit while capacity is still counted
per (date, slot).
"""
import uuid

from django.db import models
from django.db.models import Q

# The rules, defined here so the API, the serializers and both front-ends read
# one source of truth rather than each hard-coding "6" and "09:30" (the exact
# mistake that once made every visit-type booking 400 -- see
# appointment_options_view). Change them here and every surface follows.
FACILITY_BEDS = 6

FACILITY_MAX_SLOTS_PER_BOOKING = 3

# How long a slot is held for the visitor while they fill in their details --
# the "seats blocked for 10:00" countdown, minus the payment. After this the
# hold is treated as released and its beds return to the pool. There is no
# background worker in this app, so expiry is LAZY: an expired hold is simply
# excluded from the capacity count (see `occupies_bed_q`); nothing needs to
# sweep it.
FACILITY_HOLD_SECONDS = 600

# Four one-hour slots, 09:30-13:30. `slot` is stored as the 0-based index; the
# times live here so a stored row never disagrees with what was shown.
FACILITY_SLOTS = (
    {"slot": 0, "start": "09:30", "end": "10:30"},
    {"slot": 1, "start": "10:30", "end": "11:30"},
    {"slot": 2, "start": "11:30", "end": "12:30"},
    {"slot": 3, "start": "12:30", "end": "13:30"},
)

FACILITY_SLOT_INDEXES = tuple(s["slot"] for s in FACILITY_SLOTS)


def slot_label(index):
    """'09:30 – 10:30' for a slot index, or '' if the index is unknown."""
    for s in FACILITY_SLOTS:
        if s["slot"] == index:
            return f"{s['start']} – {s['end']}"
    return ""


class FacilityBooking(models.Model):
    """One held bed for one (date, slot). See the module docstring.

    Rows sharing a `reference` are one visitor's request. Capacity is counted
    per (date, slot) over the ACTIVE statuses only, so a cancelled row frees
    its bed immediately.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Groups the 1-3 rows created by a single request. Rendered to the visitor
    # as FAC-XXXX and shown in the doctor portal so the slots book, confirm and
    # cancel as one unit.
    reference = models.CharField(max_length=12, db_index=True)

    date = models.DateField()
    # 0-based index into FACILITY_SLOTS. Not a time field: the slots are a fixed
    # menu, and an index cannot drift into a half-hour the clinic never offered.
    slot = models.PositiveSmallIntegerField()

    # Blank until the visitor confirms: a HELD row is created before any details
    # are given (the countdown starts the moment slots are picked), and these are
    # filled when the hold is confirmed. The confirm serializer still requires
    # them, so a real booking always has them.
    pet_name = models.CharField(max_length=100, blank=True, default="")
    owner_name = models.CharField(max_length=150, blank=True, default="")
    owner_phone = models.CharField(max_length=50, blank=True, default="")
    owner_email = models.EmailField(blank=True, default="")
    note = models.TextField(max_length=1000, blank=True, default="")

    # HELD is a temporary lock with an `expires_at` -- the "seats blocked for
    # 10:00" state -- created before details exist and occupying a bed so nobody
    # else takes it. On confirm it becomes PENDING (expiry cleared) and the
    # clinic confirms or cancels. CANCELLED frees the bed. COMPLETED is a past,
    # honoured stay kept for the record.
    STATUS_CHOICES = (
        ("HELD", "Held"),
        ("PENDING", "Pending"),
        ("CONFIRMED", "Confirmed"),
        ("CANCELLED", "Cancelled"),
        ("COMPLETED", "Completed"),
    )
    # Non-expiring statuses that always occupy a bed. HELD also occupies a bed,
    # but only until `expires_at` -- see `occupies_bed_q`, which must be used for
    # any capacity count so expired holds are treated as free.
    ACTIVE_STATUSES = ("PENDING", "CONFIRMED")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    # Set only while status == HELD. Null once confirmed (a PENDING/CONFIRMED
    # booking does not expire).
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("date", "slot", "created_at")
        indexes = [
            # The availability query is always "active rows for this date and
            # slot", so index exactly that.
            models.Index(fields=["date", "slot", "status"]),
        ]

    @staticmethod
    def occupies_bed_q(now):
        """Q for rows that currently take up a bed: a confirmed/pending booking,
        or a HELD one whose hold has not yet expired. Expired holds match
        nothing here, so their beds are free without any sweep."""
        return Q(status__in=FacilityBooking.ACTIVE_STATUSES) | Q(
            status="HELD", expires_at__gt=now
        )

    def __str__(self):
        return f"{self.reference} {self.date} slot {self.slot} ({self.status})"
