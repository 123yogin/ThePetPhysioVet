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

# The rules, defined here so the API, the serializers and both front-ends read
# one source of truth rather than each hard-coding "6" and "09:30" (the exact
# mistake that once made every visit-type booking 400 -- see
# appointment_options_view). Change them here and every surface follows.
FACILITY_BEDS = 6

FACILITY_MAX_SLOTS_PER_BOOKING = 3

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

    pet_name = models.CharField(max_length=100)
    owner_name = models.CharField(max_length=150)
    owner_phone = models.CharField(max_length=50)
    owner_email = models.EmailField(blank=True, default="")
    note = models.TextField(max_length=1000, blank=True, default="")

    # PENDING holds a bed the moment it is requested -- the count must not lie
    # while the clinic decides -- and the doctor confirms or cancels. CANCELLED
    # frees the bed. COMPLETED is a past, honoured stay kept for the record.
    STATUS_CHOICES = (
        ("PENDING", "Pending"),
        ("CONFIRMED", "Confirmed"),
        ("CANCELLED", "Cancelled"),
        ("COMPLETED", "Completed"),
    )
    # The statuses that occupy a bed. A booking in one of these counts against
    # the six; anything else does not.
    ACTIVE_STATUSES = ("PENDING", "CONFIRMED")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("date", "slot", "created_at")
        indexes = [
            # The availability query is always "active rows for this date and
            # slot", so index exactly that.
            models.Index(fields=["date", "slot", "status"]),
        ]

    def __str__(self):
        return f"{self.reference} {self.date} slot {self.slot} ({self.status})"
