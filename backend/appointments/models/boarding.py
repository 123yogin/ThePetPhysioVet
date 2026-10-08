"""Indoor-facility BOARDING (day-care / overnight stays).

Different from the hourly `FacilityBooking` next door. That one cuts a day into
fixed one-hour slots for short services (physio, grooming, ...). Boarding is a
*stay*: the pet occupies one of a small number of beds for a whole duration —
an hour, a day, a week, a month — and is priced by that duration, not by the
clock. Capacity is therefore counted per DATE across the stay's range, not per
slot.

One row per stay. A visitor on the marketing site first HOLDS a bed (status
HELD + `expires_at`, FACILITY_HOLD_SECONDS) while filling in the intake, then
confirms it (HELD -> PENDING); a doctor can also create a stay directly and run
check-in from the portal. Expiry is lazy, exactly as for `FacilityBooking`: an
expired hold simply stops matching `occupies_q`, no sweeper needed.
"""
import uuid
from datetime import timedelta

from django.db import models
from django.db.models import Q

# Six beds. A stay holds one for its whole date range; a seventh overlapping
# stay on any date in that range is turned away. One source of truth for the
# API, the serializers and both front-ends.
BOARDING_BEDS = 6

# Duration menu: key (stored), label (shown), how many DATES the stay occupies,
# and the price in whole rupees. Change here and every surface follows.
# Sub-day stays occupy their check-in date; 48h spans two dates, and so on.
# `hours` is the exact length, used to work out when a checked-in stay ends
# (checked_in_at + hours) so the clinic can be warned it is about to finish.
BOARDING_DURATIONS = (
    {"key": "1h", "label": "1 hour", "days": 1, "hours": 1, "price": 100},
    {"key": "8h", "label": "8 hours", "days": 1, "hours": 8, "price": 600},
    {"key": "12h", "label": "12 hours", "days": 1, "hours": 12, "price": 800},
    {"key": "24h", "label": "24 hours", "days": 1, "hours": 24, "price": 1200},
    {"key": "48h", "label": "48 hours", "days": 2, "hours": 48, "price": 2000},
    {"key": "1week", "label": "1 week", "days": 7, "hours": 168, "price": 6000},
    {"key": "1month", "label": "1 month", "days": 30, "hours": 720, "price": 21000},
)
BOARDING_DURATION_KEYS = tuple(d["key"] for d in BOARDING_DURATIONS)


def _duration(key):
    for d in BOARDING_DURATIONS:
        if d["key"] == key:
            return d
    return None


def duration_days(key):
    d = _duration(key)
    return d["days"] if d else 1


def duration_price(key):
    d = _duration(key)
    return d["price"] if d else 0


def duration_hours(key):
    d = _duration(key)
    return d["hours"] if d else 24


def duration_label(key):
    d = _duration(key)
    return d["label"] if d else key


# The three walk windows an owner may request, with their length in minutes.
BOARDING_WALK_OPTIONS = (
    {"key": "morning", "label": "Morning", "minutes": 20},
    {"key": "evening", "label": "Evening", "minutes": 10},
    {"key": "late", "label": "Late", "minutes": 30},
)
BOARDING_WALK_KEYS = tuple(w["key"] for w in BOARDING_WALK_OPTIONS)


class BoardingBooking(models.Model):
    """One indoor-facility stay. Price and check-out are derived from the
    duration server-side (never trusted from the client). Capacity is six beds,
    counted over the stay's date range across the active statuses."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=16, db_index=True)

    pet_name = models.CharField(max_length=100)
    owner_name = models.CharField(max_length=150)
    owner_phone = models.CharField(max_length=50)
    owner_email = models.EmailField(blank=True, default="")

    # Who to call if the owner cannot be reached. Required on every NEW booking
    # (enforced in the serializer); existing rows default to "".
    emergency_contact_name = models.CharField(max_length=150, blank=True, default="")
    emergency_contact_phone = models.CharField(max_length=50, blank=True, default="")

    # Set by server-side matching on create, or by the doctor's "convert".
    # Never exposed on the public API. SET_NULL so deleting a client never
    # deletes the stay record.
    owner = models.ForeignKey(
        "appointments.UserProfile", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="boarding_bookings",
    )
    pet = models.ForeignKey(
        "appointments.Pet", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="boarding_bookings",
    )

    check_in = models.DateField()
    duration = models.CharField(max_length=12)
    # Derived from check_in + duration in save(); the last date the stay occupies
    # a bed (inclusive). Stored so the overlap query is a plain range comparison.
    check_out = models.DateField()
    # Whole rupees, derived from the duration tier. Paid at the clinic.
    price = models.PositiveIntegerField(default=0)

    # Intake: who provides each item — "clinic" or "owner".
    PROVIDER_CHOICES = (("clinic", "Clinic"), ("owner", "Owner"))
    food_by = models.CharField(max_length=6, choices=PROVIDER_CHOICES, default="owner")
    utensils_by = models.CharField(max_length=6, choices=PROVIDER_CHOICES, default="owner")
    medicines_by = models.CharField(max_length=6, choices=PROVIDER_CHOICES, default="owner")
    blanket_by = models.CharField(max_length=6, choices=PROVIDER_CHOICES, default="owner")
    food_preference = models.CharField(max_length=200, blank=True, default="")
    # Requested walk windows, a subset of BOARDING_WALK_KEYS.
    walk_times = models.JSONField(default=list, blank=True)

    # 12-digit Aadhaar (validated for shape + Verhoeff checksum in the serializer).
    aadhaar = models.CharField(max_length=12, blank=True, default="")
    terms_accepted = models.BooleanField(default=False)

    # PENDING -> the clinic confirms -> CHECKED_IN when the pet arrives ->
    # COMPLETED at the end. CANCELLED frees the beds immediately.
    STATUS_CHOICES = (
        ("HELD", "Held"),
        ("PENDING", "Pending"),
        ("CONFIRMED", "Confirmed"),
        ("CHECKED_IN", "Checked in"),
        ("CANCELLED", "Cancelled"),
        ("COMPLETED", "Completed"),
    )
    # Non-expiring statuses that occupy a bed. HELD also occupies one, but only
    # until `expires_at` -- always count capacity with `occupies_q(now)`.
    ACTIVE_STATUSES = ("PENDING", "CONFIRMED", "CHECKED_IN")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")

    # Where the booking came from, so the portal can tell owner self-service
    # from a clinic-entered one.
    source = models.CharField(max_length=10, default="owner")
    created_at = models.DateTimeField(auto_now_add=True)
    # Set the moment the clinic checks the pet in. The stay ends at
    # checked_in_at + the duration's hours, which is how the "ending soon" alert
    # knows when to warn the clinic. Null until check-in.
    checked_in_at = models.DateTimeField(null=True, blank=True)
    # Set only while status == HELD; cleared on confirm.
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            # The capacity query is "active stays overlapping this date range".
            models.Index(fields=["check_in", "check_out", "status"]),
        ]

    @staticmethod
    def occupies_q(now):
        """Rows that currently take a bed: an active stay, or a HELD one whose
        hold has not expired. Expired holds match nothing, so they free their
        bed with no sweep."""
        return Q(status__in=BoardingBooking.ACTIVE_STATUSES) | Q(
            status="HELD", expires_at__gt=now
        )

    def save(self, *args, **kwargs):
        # Derive check_out and price from the duration; never trust the client.
        self.check_out = self.check_in + timedelta(days=max(0, duration_days(self.duration) - 1))
        self.price = duration_price(self.duration)
        super().save(*args, **kwargs)

    def ends_at(self):
        """When this stay actually finishes: check-in time + the duration's
        hours. None until the pet is checked in (a stay that has not started
        cannot be ending)."""
        if not self.checked_in_at:
            return None
        return self.checked_in_at + timedelta(hours=duration_hours(self.duration))

    def __str__(self):
        return f"{self.reference} {self.check_in} {self.duration} ({self.status})"
