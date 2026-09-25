"""Visits. The unique constraint here is what stops a double-tapped booking
becoming two rows -- a serializer check alone lost that race.

Split out of a single 583-line models.py. Cross-model foreign keys are lazy
"appointments.X" strings, so these modules import nothing from each other and
cannot form a cycle. No schema changed: Django keys models by app_label and
class name, not module path.
"""
import uuid

from django.db import models


class Appointment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # B1/B2 fix (2026-08-21): the three original codes below did not cover
    # the services the clinic actually offers (hydrotherapy, laser therapy),
    # so all three frontend booking forms — each hardcoding its own
    # vocabulary — sent strings that never matched and every booking 400'd.
    # Existing codes are left unchanged so current rows stay valid; two new
    # codes were added for the two missing service types. The canonical list
    # is also exposed at GET /appointment-options so the frontend never has
    # to hardcode (or drift from) this vocabulary again.
    #
    # 2026-09-18: four services the clinic offers but could not be booked --
    # physiotherapy as a session in its own right, indoor-facility day care,
    # grooming and dog walking. Nothing was removed: every existing code stays
    # valid, so no booked appointment changes meaning. "Swimming" from the
    # clinic's list is not added here because it is what `Hydrotherapy` already
    # means -- the public site labels that service "Hydrotherapy — Indoor
    # Swimming Pool".
    #
    # NOTE: the Indoor Facility is NOT 24x7. It is booked as fixed one-hour
    # slots, 09:30-13:30, and has its own inventory model (FacilityBooking) with
    # the real bed-and-slot booking flow. This `IndoorFacility` visit type is
    # only the general "I'm interested in day care" route through the ordinary
    # appointment/enquiry form; the label must not imply round-the-clock care
    # the clinic does not offer.
    VISIT_TYPES = (
        ("Initial", "Initial Consultation"),
        ("Followup", "Follow-up Session"),
        ("Reassessment", "Re-assessment"),
        ("Hydrotherapy", "Hydrotherapy"),
        ("LaserTherapy", "Laser Therapy"),
        ("Physiotherapy", "Physiotherapy"),
        ("IndoorFacility", "Indoor Facility (Day Care)"),
        ("Grooming", "Grooming"),
        ("Walking", "Walking"),
    )

    # Which of those a member of the public may pick on the marketing site.
    #
    # The three excluded -- Initial, Followup, Reassessment -- are stages of a
    # course of care, not things to buy: a visitor who has never been here
    # cannot sensibly choose "Re-assessment", and offering it invites an
    # enquiry the clinic then has to correct. They stay bookable by the clinic,
    # which is where that judgement belongs.
    #
    # Kept here rather than as a filter in the website, so the public list and
    # the bookable list cannot drift apart -- the drift between three separate
    # hardcoded vocabularies is what made every booking form return 400.
    PUBLIC_VISIT_TYPES = frozenset({
        "Hydrotherapy", "LaserTherapy", "Physiotherapy",
        "IndoorFacility", "Grooming", "Walking",
    })
    STATUS_CHOICES = (
        ("Confirmed", "Confirmed"),
        ("Completed", "Completed"),
        ("Cancelled", "Cancelled"),
        ("Rescheduled", "Rescheduled"),
        ("Reschedule Requested", "Reschedule Requested"),
        ("Pending", "Pending"),
    )

    pet = models.ForeignKey("appointments.Pet", on_delete=models.CASCADE, related_name="appointments")
    doctor = models.ForeignKey(
        "appointments.UserProfile", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="appointments",
    )
    pet_name = models.CharField(max_length=100)
    owner_name = models.CharField(max_length=150)
    owner_phone = models.CharField(max_length=50)
    date = models.DateField()
    time = models.TimeField()
    visit_type = models.CharField(max_length=50, choices=VISIT_TYPES, default="Initial")
    visit_type_display = models.CharField(max_length=100, blank=True, default="Initial Consultation")
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default="Confirmed")
    requested_date = models.DateField(null=True, blank=True)
    requested_time = models.TimeField(null=True, blank=True)
    reschedule_reason = models.TextField(blank=True, default="")
    reason_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            # The serializer also checks for a clash, but that is check-then-act:
            # a double tap fires both requests before either commits, both see
            # no clash, and both insert. Only the database can serialise this.
            # Cancelled slots are excluded so a freed slot can be rebooked.
            models.UniqueConstraint(
                fields=["pet", "date", "time"],
                condition=~models.Q(status="Cancelled"),
                name="uniq_active_appointment_per_pet_slot",
            ),
        ]

    def __str__(self):
        return f"{self.pet_name} on {self.date} at {self.time} [{self.status}]"
