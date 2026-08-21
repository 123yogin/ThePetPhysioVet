"""Tests for the 2026-08-21 audit fixes.

Traceability (see docs/API_CONTRACT.md and the sprint task list):
  B1/B2 - VISIT_TYPES extended + GET /appointment-options
  B5    - visit_type_display is now server-derived, not a dead column
  B3    - doctor POST /appointments/:id/reschedule actually reschedules
  B4    - doctor-created pets link to the matching owner by phone
  D3    - viewing a pet's queries no longer creates a phantom inbox thread
  D8    - rejecting a reschedule preserves reschedule_reason
  G1    - POST /appointments/:id/confirm (Pending -> Confirmed)
  G2    - POST /owner/appointments/:id/cancel
  G3    - GET /owner/invoices/:id
  L1    - doctor list/aggregate endpoints scoped to request.user

CLAUDE.md rules under test: 2 (traceability), 4 (authZ in depth / 404-not-403
for cross-owner access), 6 (idempotent money-touching mutations — unaffected
here, exercised in test_billing.py), 7 (report honestly).

Migration modules (0009, 0010) have numeric-leading filenames that are not
importable with a plain `import` statement, so their functions are loaded via
`importlib` where exercised directly.
"""

import importlib
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from appointments.models import (
    Appointment, DiagnosticReport, Invoice, LineItem, Pet, QueryMessage,
    QueryThread, TreatmentPlan, UserProfile,
)

from .base import API, ApiTestCase


def _load_migration(name):
    return importlib.import_module(f"appointments.migrations.{name}")


# ---------------------------------------------------------------------------
# B1/B2 — VISIT_TYPES extended; GET /appointment-options
# ---------------------------------------------------------------------------

class VisitTypeOptionsTests(ApiTestCase):
    def test_hydrotherapy_and_laser_therapy_are_accepted_on_doctor_create(self):
        self.auth(self.doctor)
        for visit_type in ("Hydrotherapy", "LaserTherapy"):
            with self.subTest(visit_type=visit_type):
                r = self.client.post(f"{API}/appointments", {
                    "pet": self.pet_a.id, "visit_type": visit_type,
                    "date": "2030-02-02", "time": "09:00"}, format="json")
                self.assertEqual(r.status_code, 201, r.content)
                self.assertEqual(r.data["visit_type"], visit_type)

    def test_existing_visit_type_codes_still_valid(self):
        self.auth(self.doctor)
        for visit_type in ("Initial", "Followup", "Reassessment"):
            with self.subTest(visit_type=visit_type):
                r = self.client.post(f"{API}/appointments", {
                    "pet": self.pet_a.id, "visit_type": visit_type,
                    "date": "2030-02-03", "time": "09:00"}, format="json")
                self.assertEqual(r.status_code, 201, r.content)

    def test_invalid_visit_type_still_rejected(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/appointments", {
            "pet": self.pet_a.id, "visit_type": "Acupuncture",
            "date": "2030-02-04", "time": "09:00"}, format="json")
        self.assertEqual(r.status_code, 400, r.content)

    def test_owner_can_book_the_new_visit_types(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/appointments", {
            "pet_id": self.pet_a.id, "visit_type": "Hydrotherapy",
            "date": "2030-02-05", "time": "09:00"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["visit_type"], "Hydrotherapy")

    def test_appointment_options_lists_canonical_visit_types(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/appointment-options")
        self.assertEqual(r.status_code, 200, r.content)
        values = {item["value"] for item in r.data["visit_types"]}
        self.assertEqual(
            values,
            {"Initial", "Followup", "Reassessment", "Hydrotherapy", "LaserTherapy"},
        )
        for item in r.data["visit_types"]:
            self.assertIn("value", item)
            self.assertIn("label", item)

    def test_appointment_options_available_to_owner_too(self):
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/appointment-options")
        self.assertEqual(r.status_code, 200, r.content)

    def test_appointment_options_requires_auth(self):
        r = self.anon().get(f"{API}/appointment-options")
        self.assertEqual(r.status_code, 401, r.content)


# ---------------------------------------------------------------------------
# B5 — visit_type_display is server-derived
# ---------------------------------------------------------------------------

class VisitTypeDisplayTests(ApiTestCase):
    def test_visit_type_display_matches_visit_type_on_doctor_create(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/appointments", {
            "pet": self.pet_a.id, "visit_type": "Reassessment",
            "date": "2030-03-01", "time": "09:00"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["visit_type_display"], "Re-assessment")
        appt = Appointment.objects.get(pk=r.data["id"])
        self.assertEqual(appt.visit_type_display, "Re-assessment")

    def test_visit_type_display_matches_for_new_therapy_types(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/appointments", {
            "pet": self.pet_a.id, "visit_type": "LaserTherapy",
            "date": "2030-03-02", "time": "09:00"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["visit_type_display"], "Laser Therapy")

    def test_visit_type_display_matches_on_owner_create(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/appointments", {
            "pet_id": self.pet_a.id, "visit_type": "Followup",
            "date": "2030-03-03", "time": "09:00"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["visit_type_display"], "Follow-up Session")

    def test_backfill_migration_corrects_existing_wrong_display(self):
        """Exercises the 0009 data-migration function directly against a row
        seeded with the historic wrong default — the exact defect reported
        in B5 ("I booked a Reassessment and it returned visit_type_display
        = 'Initial Consultation'").
        """
        mod = _load_migration("0009_backfill_visit_type_display")
        wrong = Appointment.objects.create(
            pet=self.pet_a, doctor=self.doctor, pet_name="Rex",
            owner_name="Alice Aye", owner_phone="9991110001",
            date=timezone.localdate(), time="09:00",
            visit_type="Reassessment", visit_type_display="Initial Consultation",
        )
        # RunPython functions take (apps, schema_editor); pass real `apps`
        # so `apps.get_model` resolves against the actual app registry.
        from django.apps import apps as real_apps
        mod.backfill_visit_type_display(real_apps, None)
        wrong.refresh_from_db()
        self.assertEqual(wrong.visit_type_display, "Re-assessment")

    def test_backfill_migration_leaves_correct_rows_alone(self):
        mod = _load_migration("0009_backfill_visit_type_display")
        from django.apps import apps as real_apps
        correct = Appointment.objects.create(
            pet=self.pet_a, doctor=self.doctor, pet_name="Rex",
            owner_name="Alice Aye", owner_phone="9991110001",
            date=timezone.localdate(), time="10:30",
            visit_type="Hydrotherapy", visit_type_display="Hydrotherapy",
        )
        mod.backfill_visit_type_display(real_apps, None)
        correct.refresh_from_db()
        self.assertEqual(correct.visit_type_display, "Hydrotherapy")


# ---------------------------------------------------------------------------
# B3 — doctor reschedule actually reschedules
# ---------------------------------------------------------------------------

class DoctorRescheduleTests(ApiTestCase):
    def test_doctor_reschedule_moves_date_and_time_directly(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/appointments/{self.appt_a.id}/reschedule",
                             {"date": "2026-09-15", "time": "10:00"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.appt_a.refresh_from_db()
        self.assertEqual(str(self.appt_a.date), "2026-09-15")
        self.assertEqual(str(self.appt_a.time), "10:00:00")

    def test_doctor_reschedule_status_is_not_the_owner_pending_state(self):
        """Regression for the exact reported defect: the doctor must not be
        left having to approve their own edit from the owner-request queue.
        """
        self.auth(self.doctor)
        r = self.client.post(f"{API}/appointments/{self.appt_a.id}/reschedule",
                             {"date": "2026-09-15", "time": "10:00"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertNotEqual(r.data["status"], "Reschedule Requested")
        self.appt_a.refresh_from_db()
        self.assertEqual(self.appt_a.status, "Rescheduled")
        self.assertIsNone(self.appt_a.requested_date)
        self.assertIsNone(self.appt_a.requested_time)

    def test_doctor_reschedule_clears_a_stale_pending_request(self):
        self.appt_a.status = "Reschedule Requested"
        self.appt_a.requested_date = "2026-10-01"
        self.appt_a.requested_time = "12:00"
        self.appt_a.reschedule_reason = "owner asked for later"
        self.appt_a.save()

        self.auth(self.doctor)
        r = self.client.post(f"{API}/appointments/{self.appt_a.id}/reschedule",
                             {"date": "2026-11-01", "time": "14:00"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.appt_a.refresh_from_db()
        self.assertEqual(str(self.appt_a.date), "2026-11-01")
        self.assertIsNone(self.appt_a.requested_date)
        self.assertIsNone(self.appt_a.requested_time)
        self.assertEqual(self.appt_a.status, "Rescheduled")

    def test_missing_date_or_time_still_rejected(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/appointments/{self.appt_a.id}/reschedule",
                             {"date": "2026-09-15"}, format="json")
        self.assertEqual(r.status_code, 400, r.content)


# ---------------------------------------------------------------------------
# B4 — doctor-created pets link to the matching owner
# ---------------------------------------------------------------------------

class PetOwnerLinkTests(ApiTestCase):
    def test_doctor_created_pet_links_to_unambiguous_matching_owner(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/pets", {
            "name": "Buddy", "species": "Dog",
            "owner_name": "Alice Aye", "owner_phone": self.owner_a.phone},
            format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        pet = Pet.objects.get(name="Buddy")
        self.assertEqual(pet.owner_id, self.owner_a.id)

    def test_owner_can_see_the_doctor_created_pet_afterwards(self):
        self.auth(self.doctor)
        self.client.post(f"{API}/pets", {
            "name": "Charlie", "species": "Dog",
            "owner_name": "Alice Aye", "owner_phone": self.owner_a.phone},
            format="multipart")
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/owner/pets")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("Charlie", [p["name"] for p in r.data])

    def test_doctor_created_pet_stays_unlinked_with_no_matching_phone(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/pets", {
            "name": "NoMatch", "species": "Dog",
            "owner_name": "Nobody", "owner_phone": "0000000000"},
            format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        pet = Pet.objects.get(name="NoMatch")
        self.assertIsNone(pet.owner_id)

    def test_doctor_created_pet_stays_unlinked_when_phone_is_ambiguous(self):
        UserProfile.objects.create_user(
            username="owner_dup1", password="OwnerPass!23", role="OWNER",
            first_name="Dup", last_name="One", phone="9995550001",
        )
        UserProfile.objects.create_user(
            username="owner_dup2", password="OwnerPass!23", role="OWNER",
            first_name="Dup", last_name="Two", phone="9995550001",
        )
        self.auth(self.doctor)
        r = self.client.post(f"{API}/pets", {
            "name": "Ambiguous", "species": "Dog",
            "owner_name": "Dup", "owner_phone": "9995550001"},
            format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        pet = Pet.objects.get(name="Ambiguous")
        self.assertIsNone(pet.owner_id,
                          "ambiguous phone match must NOT be guessed")

    def test_doctor_role_account_sharing_the_phone_is_not_linked_as_owner(self):
        """Only OWNER-role accounts are eligible matches — a same-phone
        DOCTOR account must never become a pet's `owner`."""
        UserProfile.objects.create_user(
            username="drSamePhone", password="D0ctorPass!23", role="DOCTOR",
            first_name="Same", last_name="Phone", phone="9997770007",
        )
        self.auth(self.doctor)
        r = self.client.post(f"{API}/pets", {
            "name": "DoctorPhoneMatch", "species": "Dog",
            "owner_name": "Whoever", "owner_phone": "9997770007"},
            format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        pet = Pet.objects.get(name="DoctorPhoneMatch")
        self.assertIsNone(pet.owner_id)

    def test_backfill_migration_links_unambiguous_existing_pets(self):
        mod = _load_migration("0010_backfill_pet_owner_by_phone")
        from django.apps import apps as real_apps
        orphan = Pet.objects.create(
            name="Backfilled", owner=None, owner_name="Alice Aye",
            owner_phone=self.owner_a.phone,
        )
        mod.backfill_pet_owner_by_phone(real_apps, None)
        orphan.refresh_from_db()
        self.assertEqual(orphan.owner_id, self.owner_a.id)

    def test_backfill_migration_skips_ambiguous_phone(self):
        mod = _load_migration("0010_backfill_pet_owner_by_phone")
        from django.apps import apps as real_apps
        UserProfile.objects.create_user(
            username="owner_dup3", password="OwnerPass!23", role="OWNER",
            first_name="Dup", last_name="Three", phone="9994440004",
        )
        UserProfile.objects.create_user(
            username="owner_dup4", password="OwnerPass!23", role="OWNER",
            first_name="Dup", last_name="Four", phone="9994440004",
        )
        orphan = Pet.objects.create(
            name="StillOrphan", owner=None, owner_name="Dup",
            owner_phone="9994440004",
        )
        mod.backfill_pet_owner_by_phone(real_apps, None)
        orphan.refresh_from_db()
        self.assertIsNone(orphan.owner_id)

    def test_backfill_migration_does_not_touch_already_owned_pets(self):
        mod = _load_migration("0010_backfill_pet_owner_by_phone")
        from django.apps import apps as real_apps
        # pet_b is owned by owner_b but shares no phone collision; sanity
        # check the migration doesn't reassign an already-set owner.
        mod.backfill_pet_owner_by_phone(real_apps, None)
        self.pet_b.refresh_from_db()
        self.assertEqual(self.pet_b.owner_id, self.owner_b.id)


# ---------------------------------------------------------------------------
# D3 — viewing a pet's queries no longer creates a phantom thread
# ---------------------------------------------------------------------------

class PhantomThreadTests(ApiTestCase):
    def test_doctor_viewing_queries_for_a_threadless_pet_creates_no_thread(self):
        pet = Pet.objects.create(
            owner=self.owner_a, doctor=self.doctor, name="Threadless",
            species="Dog", owner_name="Alice Aye", owner_phone="9991110001",
        )
        self.assertFalse(QueryThread.objects.filter(pet=pet).exists())
        self.auth(self.doctor)
        r = self.client.get(f"{API}/pets/{pet.id}/queries")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["messages"], [])
        self.assertEqual(r.data["message_count"], 0)
        self.assertFalse(
            QueryThread.objects.filter(pet=pet).exists(),
            "a GET must not manufacture a persistent QueryThread row",
        )

    def test_owner_viewing_queries_for_a_threadless_pet_creates_no_thread(self):
        pet = Pet.objects.create(
            owner=self.owner_a, doctor=self.doctor, name="ThreadlessOwner",
            species="Dog", owner_name="Alice Aye", owner_phone="9991110001",
        )
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/owner/pets/{pet.id}/queries")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["messages"], [])
        self.assertFalse(QueryThread.objects.filter(pet=pet).exists())

    def test_posting_still_creates_a_thread_when_needed(self):
        pet = Pet.objects.create(
            owner=self.owner_a, doctor=self.doctor, name="PostCreates",
            species="Dog", owner_name="Alice Aye", owner_phone="9991110001",
        )
        self.auth(self.doctor)
        r = self.client.post(f"{API}/pets/{pet.id}/queries",
                             {"message": "hello"}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(QueryThread.objects.filter(pet=pet).exists())

    def test_inbox_excludes_threads_with_no_messages(self):
        # base fixtures create thread_a/thread_b with zero messages.
        self.auth(self.doctor)
        r = self.client.get(f"{API}/queries/inbox")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["results"], [])

    def test_inbox_includes_a_thread_once_it_has_a_message(self):
        self.auth(self.doctor)
        self.client.post(f"{API}/pets/{self.pet_a.id}/queries",
                         {"message": "hi"}, format="multipart")
        r = self.client.get(f"{API}/queries/inbox")
        self.assertEqual(r.status_code, 200, r.content)
        pet_ids = [t["pet"]["id"] for t in r.data["results"]]
        self.assertIn(self.pet_a.id, pet_ids)
        self.assertNotIn(self.pet_b.id, pet_ids)


# ---------------------------------------------------------------------------
# D8 — rejecting a reschedule preserves the owner's reason
# ---------------------------------------------------------------------------

class RescheduleRejectPreservesReasonTests(ApiTestCase):
    def test_reject_preserves_reschedule_reason(self):
        self.auth(self.owner_a)
        self.client.post(
            f"{API}/owner/appointments/{self.appt_a.id}/reschedule-request",
            {"date": "2030-01-01", "time": "09:00",
             "reason": "vet visit conflicts with work"}, format="json")

        self.auth(self.doctor)
        r = self.client.post(
            f"{API}/appointments/{self.appt_a.id}/reschedule-reject", {}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["reschedule_reason"], "vet visit conflicts with work")
        self.appt_a.refresh_from_db()
        self.assertEqual(self.appt_a.reschedule_reason, "vet visit conflicts with work")
        self.assertEqual(self.appt_a.status, "Confirmed")
        self.assertIsNone(self.appt_a.requested_date)


# ---------------------------------------------------------------------------
# G1 — doctor confirmation for Pending bookings
# ---------------------------------------------------------------------------

class AppointmentConfirmTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.pending = Appointment.objects.create(
            pet=self.pet_a, doctor=self.doctor, pet_name="Rex",
            owner_name="Alice Aye", owner_phone="9991110001",
            date=timezone.localdate() + timedelta(days=5), time="09:00",
            visit_type="Initial", status="Pending",
        )

    def test_doctor_confirms_a_pending_appointment(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/appointments/{self.pending.id}/confirm",
                             {}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["status"], "Confirmed")
        self.pending.refresh_from_db()
        self.assertEqual(self.pending.status, "Confirmed")

    def test_confirming_a_non_pending_appointment_is_rejected(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/appointments/{self.appt_a.id}/confirm",
                             {}, format="json")  # appt_a defaults to Confirmed
        self.assertEqual(r.status_code, 400, r.content)
        self.appt_a.refresh_from_db()
        self.assertEqual(self.appt_a.status, "Confirmed")

    def test_owner_cannot_confirm_appointments(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/appointments/{self.pending.id}/confirm",
                             {}, format="json")
        self.assertEqual(r.status_code, 403, r.content)

    def test_confirm_is_scoped_to_the_owning_doctor(self):
        other_doctor = UserProfile.objects.create_user(
            username="drother_confirm", password="D0ctorPass!23", role="DOCTOR",
            phone="9990001111",
        )
        self.auth(other_doctor)
        r = self.client.post(f"{API}/appointments/{self.pending.id}/confirm",
                             {}, format="json")
        self.assertEqual(r.status_code, 404, r.content)
        self.pending.refresh_from_db()
        self.assertEqual(self.pending.status, "Pending")

    def test_confirm_missing_appointment_is_404(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/appointments/999999/confirm", {}, format="json")
        self.assertEqual(r.status_code, 404, r.content)


# ---------------------------------------------------------------------------
# G2 — owner cancel
# ---------------------------------------------------------------------------

class OwnerCancelTests(ApiTestCase):
    def test_owner_cancels_a_future_appointment(self):
        future = Appointment.objects.create(
            pet=self.pet_a, doctor=self.doctor, pet_name="Rex",
            owner_name="Alice Aye", owner_phone="9991110001",
            date=timezone.localdate() + timedelta(days=10), time="09:00",
            visit_type="Initial", status="Confirmed",
        )
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/appointments/{future.id}/cancel",
                             {}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["status"], "Cancelled")
        future.refresh_from_db()
        self.assertEqual(future.status, "Cancelled")

    def test_owner_cannot_cancel_a_completed_appointment(self):
        self.appt_a.status = "Completed"
        self.appt_a.save()
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/appointments/{self.appt_a.id}/cancel",
                             {}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.appt_a.refresh_from_db()
        self.assertEqual(self.appt_a.status, "Completed")

    def test_owner_cannot_cancel_an_already_cancelled_appointment(self):
        self.appt_a.status = "Cancelled"
        self.appt_a.save()
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/appointments/{self.appt_a.id}/cancel",
                             {}, format="json")
        self.assertEqual(r.status_code, 400, r.content)

    def test_owner_cannot_cancel_a_past_appointment(self):
        past = Appointment.objects.create(
            pet=self.pet_a, doctor=self.doctor, pet_name="Rex",
            owner_name="Alice Aye", owner_phone="9991110001",
            date=timezone.localdate() - timedelta(days=3), time="09:00",
            visit_type="Initial", status="Confirmed",
        )
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/appointments/{past.id}/cancel",
                             {}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        past.refresh_from_db()
        self.assertEqual(past.status, "Confirmed")

    def test_cross_owner_cancel_is_404_not_403(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/appointments/{self.appt_b.id}/cancel",
                             {}, format="json")
        self.assertEqual(r.status_code, 404, r.content)
        self.appt_b.refresh_from_db()
        self.assertEqual(self.appt_b.status, "Confirmed")

    def test_doctor_cannot_use_the_owner_cancel_route(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/owner/appointments/{self.appt_a.id}/cancel",
                             {}, format="json")
        self.assertEqual(r.status_code, 403, r.content)

    def test_cancelled_is_a_valid_status_choice(self):
        self.assertIn("Cancelled", dict(Appointment.STATUS_CHOICES))


# ---------------------------------------------------------------------------
# G3 — owner invoice detail
# ---------------------------------------------------------------------------

class OwnerInvoiceDetailTests(ApiTestCase):
    def test_owner_can_view_their_own_invoice_detail(self):
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/owner/invoices/{self.invoice_a.id}")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["invoice_no"], self.invoice_a.invoice_no)
        self.assertIn("line_items", r.data)
        self.assertIn("amount_paid", r.data)
        self.assertIn("balance_due", r.data)

    def test_cross_owner_invoice_detail_is_404(self):
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/owner/invoices/{self.invoice_b.id}")
        self.assertEqual(r.status_code, 404, r.content)

    def test_doctor_cannot_use_the_owner_invoice_detail_route(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/owner/invoices/{self.invoice_a.id}")
        self.assertEqual(r.status_code, 403, r.content)

    def test_owner_invoice_detail_is_read_only(self):
        self.auth(self.owner_a)
        for method in ("post", "put", "patch", "delete"):
            with self.subTest(method=method):
                r = getattr(self.client, method)(
                    f"{API}/owner/invoices/{self.invoice_a.id}", {}, format="json")
                self.assertIn(r.status_code, (403, 404, 405))

    def test_missing_invoice_is_404(self):
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/owner/invoices/999999")
        self.assertEqual(r.status_code, 404, r.content)


# ---------------------------------------------------------------------------
# L1 — doctor list/aggregate endpoints scoped to request.user
# ---------------------------------------------------------------------------

class DoctorScopingTests(ApiTestCase):
    def _second_doctor_with_data(self):
        other_doctor = UserProfile.objects.create_user(
            username="drsecond_scope", password="D0ctorPass!23", role="DOCTOR",
            first_name="Second", last_name="Doc", phone="9990002222",
        )
        other_owner = UserProfile.objects.create_user(
            username="ownerother_scope", password="OwnerPass!23", role="OWNER",
            first_name="Other", last_name="Owner", phone="9990003333",
        )
        other_pet = Pet.objects.create(
            owner=other_owner, doctor=other_doctor, name="OtherPet", species="Dog",
            owner_name="Other Owner", owner_phone="9990003333",
        )
        other_appt = Appointment.objects.create(
            pet=other_pet, doctor=other_doctor, pet_name="OtherPet",
            owner_name="Other Owner", owner_phone="9990003333",
            date=timezone.localdate(), time="09:00", visit_type="Initial",
        )
        other_invoice = Invoice.objects.create(
            invoice_no="INV-OTHER-DOC", pet=other_pet, owner=other_owner,
        )
        from appointments.models import LineItem, Payment
        LineItem.objects.create(
            invoice=other_invoice, description="Session", quantity=1,
            unit_price=Decimal("500.00"), amount=Decimal("500.00"),
        )
        Payment.objects.create(
            invoice=other_invoice, amount_paid=Decimal("500.00"), status="SUCCESS",
        )
        QueryThread.objects.create(pet=other_pet)
        QueryMessage.objects.create(
            thread=QueryThread.objects.get(pet=other_pet), sender=other_owner,
            sender_role="OWNER", sender_name="Other Owner", message="hi",
        )
        return other_doctor, other_pet, other_appt, other_invoice

    def test_pets_list_scoped_to_requesting_doctor(self):
        self._second_doctor_with_data()
        self.auth(self.doctor)
        r = self.client.get(f"{API}/pets")
        self.assertEqual(r.status_code, 200, r.content)
        names = {p["name"] for p in r.data}
        self.assertNotIn("OtherPet", names)

    def test_appointments_list_scoped_to_requesting_doctor(self):
        self._second_doctor_with_data()
        self.auth(self.doctor)
        r = self.client.get(f"{API}/appointments")
        self.assertEqual(r.status_code, 200, r.content)
        pet_names = {a["pet_name"] for a in r.data}
        self.assertNotIn("OtherPet", pet_names)

    def test_invoices_list_scoped_to_requesting_doctor(self):
        self._second_doctor_with_data()
        self.auth(self.doctor)
        r = self.client.get(f"{API}/invoices")
        self.assertEqual(r.status_code, 200, r.content)
        nos = {i["invoice_no"] for i in r.data}
        self.assertNotIn("INV-OTHER-DOC", nos)

    def test_revenue_scoped_to_requesting_doctor(self):
        self._second_doctor_with_data()
        self.auth(self.doctor)
        r = self.client.get(f"{API}/revenue?range=month")
        self.assertEqual(r.status_code, 200, r.content)
        # self.doctor has no payments in the fixtures, so collected stays 0
        # even though the other doctor's clinic just recorded Rs. 500.
        self.assertEqual(float(r.data["collected"]), 0.0)

    def test_queries_inbox_scoped_to_requesting_doctor(self):
        _, other_pet, *_ = self._second_doctor_with_data()
        self.auth(self.doctor)
        r = self.client.get(f"{API}/queries/inbox")
        self.assertEqual(r.status_code, 200, r.content)
        pet_ids = [t["pet"]["id"] for t in r.data["results"]]
        self.assertNotIn(other_pet.id, pet_ids)

    def test_dashboard_money_tiles_scoped_to_requesting_doctor(self):
        self._second_doctor_with_data()
        self.auth(self.doctor)
        r = self.client.get(f"{API}/dashboard/stats")
        self.assertEqual(r.status_code, 200, r.content)
        # self.doctor's own unpaid invoices (invoice_a 1000 + invoice_b 2000)
        # must not include the other doctor's invoice / payment.
        self.assertEqual(float(r.data["pending_payments"]), 3000.0)
        self.assertEqual(float(r.data["today_revenue"]), 0.0)
        self.assertEqual(float(r.data["monthly_revenue"]), 0.0)

    def test_single_doctor_scenario_is_unaffected_by_scoping(self):
        """Seed data / these base fixtures are single-doctor: confirms the
        scoping fix does not hide a doctor's own two-pet, two-invoice data
        from themselves.
        """
        self.auth(self.doctor)
        pets = self.client.get(f"{API}/pets")
        appts = self.client.get(f"{API}/appointments")
        invoices = self.client.get(f"{API}/invoices")
        dashboard = self.client.get(f"{API}/dashboard/stats")
        self.assertEqual({p["name"] for p in pets.data}, {"Rex", "Milo"})
        self.assertEqual(len(appts.data), 2)
        self.assertEqual(
            {i["invoice_no"] for i in invoices.data},
            {self.invoice_a.invoice_no, self.invoice_b.invoice_no},
        )
        self.assertEqual(float(dashboard.data["pending_payments"]), 3000.0)


# ---------------------------------------------------------------------------
# L1 follow-up (2026-08-21) — every doctor object-fetch-by-ID route, not just
# the list endpoints, must 404 for a doctor who doesn't own the record.
# Before this fix, a second doctor could read/reschedule/complete an
# appointment, delete a diagnostic report, view a treatment plan, or take a
# payment on another practice's patient purely by guessing/enumerating IDs —
# worse than uniformly unscoped, since the list endpoints (already fixed)
# made it look closed. See `_doctor_scoped` in views.py.
# ---------------------------------------------------------------------------

class DoctorObjectLevelScopingTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.other_doctor = UserProfile.objects.create_user(
            username="drother_objscope", password="D0ctorPass!23", role="DOCTOR",
            first_name="Other", last_name="Doc", phone="9990009999",
        )

    def test_pet_detail_cross_doctor_is_404(self):
        self.auth(self.other_doctor)
        r = self.client.get(f"{API}/pets/{self.pet_a.id}")
        self.assertEqual(r.status_code, 404, r.content)

    def test_pet_detail_patch_cross_doctor_is_404_and_does_not_mutate(self):
        self.auth(self.other_doctor)
        r = self.client.patch(f"{API}/pets/{self.pet_a.id}",
                              {"notes": "hijacked"}, format="json")
        self.assertEqual(r.status_code, 404, r.content)
        self.pet_a.refresh_from_db()
        self.assertNotEqual(self.pet_a.notes, "hijacked")

    def test_pet_diagnoses_get_cross_doctor_is_404(self):
        self.auth(self.other_doctor)
        r = self.client.get(f"{API}/pets/{self.pet_a.id}/diagnoses")
        self.assertEqual(r.status_code, 404, r.content)

    def test_pet_diagnoses_post_cross_doctor_is_404(self):
        from .base import upload
        self.auth(self.other_doctor)
        r = self.client.post(f"{API}/pets/{self.pet_a.id}/diagnoses",
                             {"file": upload("x.png"), "report_type": "XRAY"},
                             format="multipart")
        self.assertEqual(r.status_code, 404, r.content)

    def test_diagnostic_report_delete_cross_doctor_is_404(self):
        report = DiagnosticReport.objects.create(
            pet=self.pet_a, report_type="XRAY", original_filename="x.png",
        )
        self.auth(self.other_doctor)
        r = self.client.delete(f"{API}/diagnoses/{report.id}")
        self.assertEqual(r.status_code, 404, r.content)
        self.assertTrue(DiagnosticReport.objects.filter(pk=report.pk).exists())

    def test_pet_treatment_plans_get_cross_doctor_is_404(self):
        self.auth(self.other_doctor)
        r = self.client.get(f"{API}/pets/{self.pet_a.id}/treatment-plans")
        self.assertEqual(r.status_code, 404, r.content)

    def test_treatment_plan_detail_cross_doctor_is_404(self):
        self.auth(self.other_doctor)
        r = self.client.get(f"{API}/treatment-plans/{self.plan_a.id}")
        self.assertEqual(r.status_code, 404, r.content)

    def test_treatment_plan_progress_notes_cross_doctor_is_404(self):
        self.auth(self.other_doctor)
        r = self.client.post(f"{API}/treatment-plans/{self.plan_a.id}/progress-notes",
                             {"notes": "hijacked"}, format="json")
        self.assertEqual(r.status_code, 404, r.content)
        self.assertEqual(self.plan_a.progress_notes.count(), 0)

    def test_appointment_detail_cross_doctor_is_404(self):
        self.auth(self.other_doctor)
        r = self.client.get(f"{API}/appointments/{self.appt_a.id}")
        self.assertEqual(r.status_code, 404, r.content)

    def test_appointment_reschedule_cross_doctor_is_404_and_does_not_mutate(self):
        self.auth(self.other_doctor)
        r = self.client.post(f"{API}/appointments/{self.appt_a.id}/reschedule",
                             {"date": "2030-01-01", "time": "09:00"}, format="json")
        self.assertEqual(r.status_code, 404, r.content)
        self.appt_a.refresh_from_db()
        self.assertNotEqual(str(self.appt_a.date), "2030-01-01")

    def test_appointment_complete_cross_doctor_is_404(self):
        self.auth(self.other_doctor)
        r = self.client.post(f"{API}/appointments/{self.appt_a.id}/complete", {}, format="json")
        self.assertEqual(r.status_code, 404, r.content)
        self.appt_a.refresh_from_db()
        self.assertNotEqual(self.appt_a.status, "Completed")

    def test_appointment_confirm_cross_doctor_is_404(self):
        pending = Appointment.objects.create(
            pet=self.pet_a, doctor=self.doctor, pet_name="Rex",
            owner_name="Alice Aye", owner_phone="9991110001",
            date=timezone.localdate() + timedelta(days=1), time="09:00",
            visit_type="Initial", status="Pending",
        )
        self.auth(self.other_doctor)
        r = self.client.post(f"{API}/appointments/{pending.id}/confirm", {}, format="json")
        self.assertEqual(r.status_code, 404, r.content)
        pending.refresh_from_db()
        self.assertEqual(pending.status, "Pending")

    def test_appointment_reschedule_approve_cross_doctor_is_404(self):
        self.appt_a.status = "Reschedule Requested"
        self.appt_a.requested_date = "2030-01-01"
        self.appt_a.requested_time = "09:00"
        self.appt_a.save()
        self.auth(self.other_doctor)
        r = self.client.post(f"{API}/appointments/{self.appt_a.id}/reschedule-approve",
                             {}, format="json")
        self.assertEqual(r.status_code, 404, r.content)
        self.appt_a.refresh_from_db()
        self.assertEqual(self.appt_a.status, "Reschedule Requested")

    def test_appointment_reschedule_reject_cross_doctor_is_404(self):
        self.appt_a.status = "Reschedule Requested"
        self.appt_a.reschedule_reason = "conflict"
        self.appt_a.save()
        self.auth(self.other_doctor)
        r = self.client.post(f"{API}/appointments/{self.appt_a.id}/reschedule-reject",
                             {}, format="json")
        self.assertEqual(r.status_code, 404, r.content)
        self.appt_a.refresh_from_db()
        self.assertEqual(self.appt_a.status, "Reschedule Requested")

    def test_appointment_share_cross_doctor_is_404(self):
        self.auth(self.other_doctor)
        r = self.client.get(f"{API}/appointments/{self.appt_a.id}/share")
        self.assertEqual(r.status_code, 404, r.content)

    def test_invoice_detail_cross_doctor_is_404(self):
        self.auth(self.other_doctor)
        r = self.client.get(f"{API}/invoices/{self.invoice_a.id}")
        self.assertEqual(r.status_code, 404, r.content)

    def test_invoice_payments_cross_doctor_is_404_and_does_not_credit(self):
        self.auth(self.other_doctor)
        r = self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                             {"amount_paid": "10.00"}, format="json")
        self.assertEqual(r.status_code, 404, r.content)
        self.invoice_a.refresh_from_db()
        self.assertEqual(self.invoice_a.amount_paid, Decimal("0.00"))

    def test_invoice_create_for_another_doctors_pet_is_404(self):
        self.auth(self.other_doctor)
        r = self.client.post(f"{API}/invoices", {
            "pet_id": self.pet_a.id,
            "line_items": [{"description": "X", "quantity": 1, "unit_price": "10"}],
        }, format="json")
        self.assertEqual(r.status_code, 404, r.content)

    def test_pet_queries_get_cross_doctor_is_404(self):
        self.auth(self.other_doctor)
        r = self.client.get(f"{API}/pets/{self.pet_a.id}/queries")
        self.assertEqual(r.status_code, 404, r.content)

    def test_pet_queries_post_cross_doctor_is_404_and_creates_no_message(self):
        self.auth(self.other_doctor)
        before = QueryMessage.objects.count()
        r = self.client.post(f"{API}/pets/{self.pet_a.id}/queries",
                             {"message": "hijack"}, format="multipart")
        self.assertEqual(r.status_code, 404, r.content)
        self.assertEqual(QueryMessage.objects.count(), before)


# ---------------------------------------------------------------------------
# NULL-doctor decision (2026-08-21, per Tech Lead follow-up): a NULL
# `doctor`/`pet__doctor` is a CLAIMABLE POOL — visible to ANY doctor, not to
# none. A brand-new owner's first pet is exactly this case
# (`owner_pets_view` leaves `doctor` null when it can't unambiguously infer
# one); nothing else in this codebase lets a doctor claim a patient
# afterwards, so treating NULL as "nobody's" would make it (and anything
# hanging off it) permanently unreachable by any doctor. Applied uniformly
# to both list and detail routes via `_doctor_scoped`. See
# docs/API_CONTRACT.md §4.6.
# ---------------------------------------------------------------------------

class NullDoctorClaimablePoolTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.other_doctor = UserProfile.objects.create_user(
            username="drother_pool", password="D0ctorPass!23", role="DOCTOR",
            first_name="Pool", last_name="Doc", phone="9990001234",
        )
        self.unclaimed_pet = Pet.objects.create(
            owner=self.owner_a, doctor=None, name="Unclaimed", species="Dog",
            owner_name="Alice Aye", owner_phone="9991110001",
        )

    def test_unclaimed_pet_visible_to_any_doctor_in_list(self):
        for doctor in (self.doctor, self.other_doctor):
            with self.subTest(doctor=doctor.username):
                self.auth(doctor)
                r = self.client.get(f"{API}/pets")
                self.assertEqual(r.status_code, 200, r.content)
                self.assertIn("Unclaimed", [p["name"] for p in r.data])

    def test_unclaimed_pet_detail_visible_to_any_doctor(self):
        for doctor in (self.doctor, self.other_doctor):
            with self.subTest(doctor=doctor.username):
                self.auth(doctor)
                r = self.client.get(f"{API}/pets/{self.unclaimed_pet.id}")
                self.assertEqual(r.status_code, 200, r.content)

    def test_unclaimed_pet_diagnoses_reachable_by_any_doctor(self):
        self.auth(self.other_doctor)
        r = self.client.get(f"{API}/pets/{self.unclaimed_pet.id}/diagnoses")
        self.assertEqual(r.status_code, 200, r.content)

    def test_diagnostic_report_on_unclaimed_pet_reachable_by_any_doctor(self):
        report = DiagnosticReport.objects.create(
            pet=self.unclaimed_pet, report_type="XRAY", original_filename="x.png",
        )
        self.auth(self.other_doctor)
        r = self.client.delete(f"{API}/diagnoses/{report.id}")
        self.assertEqual(r.status_code, 204, r.content)

    def test_treatment_plan_on_unclaimed_pet_reachable_by_any_doctor(self):
        plan = TreatmentPlan.objects.create(
            pet=self.unclaimed_pet, therapies=["Hydrotherapy"], frequency="Weekly",
            duration="4 weeks", start_date=timezone.localdate(), status="ACTIVE",
        )
        self.auth(self.other_doctor)
        r = self.client.get(f"{API}/treatment-plans/{plan.id}")
        self.assertEqual(r.status_code, 200, r.content)

    def test_unclaimed_pet_appointment_reachable_and_confirmable_by_any_doctor(self):
        appt = Appointment.objects.create(
            pet=self.unclaimed_pet, doctor=None, pet_name="Unclaimed",
            owner_name="Alice Aye", owner_phone="9991110001",
            date=timezone.localdate() + timedelta(days=2), time="09:00",
            visit_type="Initial", status="Pending",
        )
        self.auth(self.other_doctor)
        r = self.client.get(f"{API}/appointments/{appt.id}")
        self.assertEqual(r.status_code, 200, r.content)
        confirm = self.client.post(f"{API}/appointments/{appt.id}/confirm", {}, format="json")
        self.assertEqual(confirm.status_code, 200, confirm.content)

    def test_unclaimed_pet_invoice_reachable_by_any_doctor(self):
        invoice = Invoice.objects.create(
            invoice_no="INV-UNCLAIMED", pet=self.unclaimed_pet, owner=self.owner_a,
        )
        LineItem.objects.create(
            invoice=invoice, description="Session", quantity=1,
            unit_price=Decimal("100"), amount=Decimal("100"),
        )
        self.auth(self.other_doctor)
        r = self.client.get(f"{API}/invoices/{invoice.id}")
        self.assertEqual(r.status_code, 200, r.content)

    def test_orphan_invoice_with_no_pet_at_all_reachable_by_any_doctor(self):
        invoice = Invoice.objects.create(invoice_no="INV-NOPET", pet=None, owner=None)
        self.auth(self.other_doctor)
        r = self.client.get(f"{API}/invoices/{invoice.id}")
        self.assertEqual(r.status_code, 200, r.content)



class AppointmentPetScopingTests(ApiTestCase):
    """`AppointmentSerializer.pet` was the last unscoped write path.

    Every `get_object_or_404` in views.py is doctor-scoped, but the pet on a
    booking arrives as validated serializer input, not a URL lookup, so none of
    those checks ever saw it: `queryset=Pet.objects.all()` let a doctor create
    an appointment against ANY pet id — including a patient they get a 404 for
    on `GET /pets/<id>`. Verified live before the fix: 404 on the detail route,
    201 on the booking. CLAUDE.md rule 4.
    """

    def setUp(self):
        super().setUp()
        self.other_doctor = UserProfile.objects.create_user(
            username="drscopeother", password="D0ctorPass!23", role="DOCTOR",
            first_name="Otto", last_name="Other", phone="9990000099",
        )

    def test_doctor_cannot_book_another_doctors_patient(self):
        self.auth(self.other_doctor)
        res = self.client.post(f"{API}/appointments", {
            "pet": self.pet_a.pk, "date": "2026-12-01", "time": "10:00",
            "visit_type": "Followup",
        }, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("pet", res.data)
        self.assertFalse(
            Appointment.objects.filter(pet=self.pet_a, date="2026-12-01").exists()
        )

    def test_doctor_can_still_book_their_own_patient(self):
        self.auth(self.doctor)
        res = self.client.post(f"{API}/appointments", {
            "pet": self.pet_a.pk, "date": "2026-12-02", "time": "10:00",
            "visit_type": "Followup",
        }, format="json")
        self.assertEqual(res.status_code, 201)

    def test_owner_cannot_book_another_owners_pet(self):
        # owner_b must not be able to book against owner_a's pet.
        self.auth(self.owner_b)
        res = self.client.post(f"{API}/owner/appointments", {
            "pet": self.pet_a.pk, "date": "2026-12-03", "time": "10:00",
            "visit_type": "Followup",
        }, format="json")
        self.assertIn(res.status_code, (400, 404))
        self.assertFalse(
            Appointment.objects.filter(pet=self.pet_a, date="2026-12-03").exists()
        )

    def test_owner_can_still_book_their_own_pet(self):
        self.auth(self.owner_a)
        res = self.client.post(f"{API}/owner/appointments", {
            "pet": self.pet_a.pk, "date": "2026-12-04", "time": "10:00",
            "visit_type": "Followup",
        }, format="json")
        self.assertEqual(res.status_code, 201)
