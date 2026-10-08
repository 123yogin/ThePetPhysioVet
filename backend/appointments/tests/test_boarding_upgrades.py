"""Boarding upgrades (2026-10-08): emergency contact, client matching, convert to
patient, previous reports, and bed holds.

Time is frozen at 2026-10-08 10:00 IST so hold expiry and "today" are exact.
Capacity and hold length are read from the model constants.
"""
from datetime import datetime, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

from django.core.files.uploadedfile import SimpleUploadedFile

from appointments.models import (
    BoardingBooking, BOARDING_BEDS, FACILITY_HOLD_SECONDS,
    DiagnosticReport, Pet, UserProfile,
)

from .base import API, ApiTestCase

IST = ZoneInfo("Asia/Kolkata")
NOW = datetime(2026, 10, 8, 10, 0, tzinfo=IST)
CHECK_IN = "2026-10-12"

BOARD = f"{API}/facility/boarding"
AVAIL = f"{API}/facility/boarding/availability"
HOLDS = f"{API}/facility/boarding/holds"


def _payload(**over):
    body = {
        "petName": "Bruno", "ownerName": "Priya Shah", "ownerPhone": "98765 43210",
        "checkIn": CHECK_IN, "duration": "24h", "termsAccepted": True,
        "emergencyContactName": "Raj Shah", "emergencyContactPhone": "9811122233",
    }
    body.update(over)
    return body


class BoardingBase(ApiTestCase):
    def setUp(self):
        super().setUp()
        patcher = mock.patch("django.utils.timezone.now", return_value=NOW)
        self.clock = patcher.start()
        self.addCleanup(patcher.stop)

    def advance(self, seconds):
        self.clock.return_value = self.clock.return_value + timedelta(seconds=seconds)

    def create(self, **over):
        return self.anon().post(BOARD, _payload(**over), format="json")

    def hold(self, **over):
        body = {"check_in": CHECK_IN, "duration": "24h"}
        body.update(over)
        return self.anon().post(HOLDS, body, format="json")

    def confirm(self, ref, **over):
        return self.anon().post(f"{HOLDS}/{ref}/confirm", _payload(**over), format="json")

    def doctor_list(self, qs=""):
        self.auth(self.doctor)
        return self.client.get(BOARD + qs)

    def doctor_row(self, ref):
        res = self.doctor_list("?include_held=1")
        self.assertEqual(res.status_code, 200, res.content)
        return next(r for r in res.data["results"] if r["reference"] == ref)

    def fill(self, n, status="CONFIRMED"):
        for i in range(n):
            BoardingBooking(
                reference=f"FILL{i}", pet_name="x", owner_name="x", owner_phone=f"90000000{i:02d}",
                check_in=__import__("datetime").date.fromisoformat(CHECK_IN), duration="24h",
                status=status,
            ).save()


class EmergencyContactTests(BoardingBase):
    def test_emergency_phone_is_required_on_public_create(self):
        body = _payload()
        del body["emergencyContactPhone"]
        res = self.anon().post(BOARD, body, format="json")
        self.assertEqual(res.status_code, 400)

    def test_emergency_fields_are_stored_normalised(self):
        res = self.create(emergencyContactPhone="98111 22233")
        self.assertEqual(res.status_code, 201, res.content)
        b = BoardingBooking.objects.get(reference=res.data["reference"])
        self.assertEqual(b.emergency_contact_phone, "9811122233")
        self.assertEqual(b.emergency_contact_name, "Raj Shah")
        self.assertEqual(b.owner_phone, "9876543210")

    def test_emergency_name_is_optional_but_capped(self):
        self.assertEqual(self.create(emergencyContactName="").status_code, 201)
        self.assertEqual(self.create(emergencyContactName="x" * 151).status_code, 400)

    def test_emergency_phone_is_validated(self):
        self.assertEqual(self.create(emergencyContactPhone="98r1122233").status_code, 400)

    def test_emergency_equal_to_owner_phone_is_rejected_however_written(self):
        for variant in ("9876543210", "98765 43210", "+91 98765-43210", "+919876543210", "(98765) 43210"):
            res = self.create(emergencyContactPhone=variant)
            self.assertEqual(res.status_code, 400, variant)
            self.assertIn("Emergency contact must be a different number", res.data["detail"])
        self.assertEqual(BoardingBooking.objects.count(), 0)

    def test_doctor_entered_stay_requires_emergency_phone_too(self):
        self.auth(self.doctor)
        body = _payload()
        del body["emergencyContactPhone"]
        self.assertEqual(self.client.post(BOARD, body, format="json").status_code, 400)
        res = self.client.post(BOARD, _payload(), format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(BoardingBooking.objects.get(reference=res.data["reference"]).status, "CONFIRMED")

    def test_doctor_list_exposes_emergency_fields(self):
        ref = self.create().data["reference"]
        row = self.doctor_row(ref)
        self.assertEqual(row["emergency_contact_name"], "Raj Shah")
        self.assertEqual(row["emergency_contact_phone"], "9811122233")


class MatchingTests(BoardingBase):
    def test_owner_by_account_phone_and_single_pet_name_match_links_both(self):
        # owner_a phone 9991110001, pet Rex
        ref = self.create(ownerPhone="99911 10001", petName="  rEX ").data["reference"]
        row = self.doctor_row(ref)
        self.assertEqual(row["pet_link_status"], "linked")
        self.assertEqual(row["owner_id"], str(self.owner_a.id))
        self.assertEqual(row["pet_id"], str(self.pet_a.id))

    def test_owner_found_via_pet_owner_phone_with_separators(self):
        self.owner_a.phone = ""
        self.owner_a.save()
        Pet.objects.filter(pk=self.pet_a.pk).update(owner_phone="99911-10001")
        ref = self.create(ownerPhone="9991110001", petName="Rex").data["reference"]
        self.assertEqual(self.doctor_row(ref)["pet_link_status"], "linked")

    def test_owner_matches_but_pet_name_does_not_is_owner_only(self):
        ref = self.create(ownerPhone="9991110001", petName="Newpet").data["reference"]
        row = self.doctor_row(ref)
        self.assertEqual(row["pet_link_status"], "owner_only")
        self.assertEqual(row["owner_id"], str(self.owner_a.id))
        self.assertIsNone(row["pet_id"])
        self.assertIsNone(row["previous_reports"])

    def test_no_match_is_unlinked(self):
        row = self.doctor_row(self.create().data["reference"])
        self.assertEqual(row["pet_link_status"], "unlinked")
        self.assertIsNone(row["owner_id"])
        self.assertIsNone(row["pet_id"])
        self.assertIsNone(row["previous_reports"])

    def test_two_owners_sharing_a_phone_is_ambiguous_and_unlinked(self):
        self.owner_b.phone = "9991110001"
        self.owner_b.save()
        row = self.doctor_row(self.create(ownerPhone="9991110001", petName="Rex").data["reference"])
        self.assertEqual(row["pet_link_status"], "unlinked")

    def test_two_pets_with_the_same_name_leave_pet_unlinked(self):
        Pet.objects.create(owner=self.owner_a, doctor=self.doctor, name="rex", owner_name="Alice",
                           owner_phone="9991110001")
        row = self.doctor_row(self.create(ownerPhone="9991110001", petName="Rex").data["reference"])
        self.assertEqual(row["pet_link_status"], "owner_only")
        self.assertIsNone(row["pet_id"])


class PrivacyTests(BoardingBase):
    def test_existing_client_phone_gets_the_same_response_as_a_new_phone(self):
        known = self.create(ownerPhone="9991110001", petName="Rex")
        unknown = self.create(ownerPhone="9123456789", petName="Rex")
        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(set(known.data), set(unknown.data))
        for k in set(known.data) - {"reference", "detail"}:
            self.assertEqual(known.data[k], unknown.data[k], k)
        self.assertEqual(
            known.data["detail"].replace(known.data["reference"], "REF"),
            unknown.data["detail"].replace(unknown.data["reference"], "REF"),
        )
        for k in ("owner_id", "pet_id", "pet_link_status", "previous_reports"):
            self.assertNotIn(k, known.data)

    def test_confirm_response_is_identical_for_existing_and_new_phone(self):
        a = self.confirm(self.hold().data["reference"], ownerPhone="9991110001", petName="Rex")
        b = self.confirm(self.hold().data["reference"], ownerPhone="9123456789", petName="Rex")
        self.assertEqual(a.status_code, 201)
        self.assertEqual(set(a.data), set(b.data))
        self.assertEqual(a.data["detail"].replace(a.data["reference"], "R"),
                         b.data["detail"].replace(b.data["reference"], "R"))

    def test_public_cannot_list_or_convert(self):
        ref = self.create().data["reference"]
        self.assertIn(self.anon().get(BOARD).status_code, (401, 403))
        self.assertIn(self.anon().post(f"{BOARD}/{ref}/convert").status_code, (401, 403))


class ConvertTests(BoardingBase):
    def convert(self, ref, user=None):
        self.auth(user or self.doctor)
        return self.client.post(f"{BOARD}/{ref}/convert")

    def test_owner_role_cannot_convert(self):
        ref = self.create().data["reference"]
        self.assertEqual(self.convert(ref, self.owner_a).status_code, 403)

    def test_unknown_reference_is_404(self):
        self.assertEqual(self.convert("BRD-NOPE").status_code, 404)

    def test_convert_creates_owner_and_pet_and_links(self):
        ref = self.create(ownerEmail="priya@example.com").data["reference"]
        res = self.convert(ref)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.data["pet_link_status"], "linked")
        owner = UserProfile.objects.get(pk=res.data["owner_id"])
        self.assertEqual(owner.role, "OWNER")
        self.assertEqual(owner.phone, "9876543210")
        self.assertEqual(owner.email, "priya@example.com")
        self.assertFalse(owner.has_usable_password())
        pet = Pet.objects.get(pk=res.data["pet_id"])
        self.assertEqual((pet.owner_id, pet.name, pet.doctor_id), (owner.id, "Bruno", self.doctor.id))
        b = BoardingBooking.objects.get(reference=ref)
        self.assertEqual((b.owner_id, b.pet_id), (owner.id, pet.id))

    def test_convert_twice_makes_one_owner_and_one_pet(self):
        ref = self.create().data["reference"]
        owners, pets = UserProfile.objects.count(), Pet.objects.count()
        first, second = self.convert(ref), self.convert(ref)
        self.assertEqual((first.status_code, second.status_code), (200, 200))
        self.assertEqual(first.data["pet_id"], second.data["pet_id"])
        self.assertEqual(UserProfile.objects.count(), owners + 1)
        self.assertEqual(Pet.objects.count(), pets + 1)

    def test_second_booking_for_same_new_client_reuses_owner_and_pet(self):
        r1 = self.create().data["reference"]
        r2 = self.create(checkIn="2026-11-01").data["reference"]
        a, b = self.convert(r1), self.convert(r2)
        self.assertEqual((a.data["owner_id"], a.data["pet_id"]), (b.data["owner_id"], b.data["pet_id"]))
        self.assertEqual(Pet.objects.filter(name="Bruno").count(), 1)

    def test_convert_of_auto_linked_booking_creates_nothing(self):
        ref = self.create(ownerPhone="9991110001", petName="Rex").data["reference"]
        owners, pets = UserProfile.objects.count(), Pet.objects.count()
        res = self.convert(ref)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["pet_id"], str(self.pet_a.id))
        self.assertEqual((UserProfile.objects.count(), Pet.objects.count()), (owners, pets))

    def test_owner_only_booking_adds_a_pet_under_the_existing_owner(self):
        ref = self.create(ownerPhone="9991110001", petName="Newpet").data["reference"]
        owners = UserProfile.objects.count()
        res = self.convert(ref)
        self.assertEqual(res.data["owner_id"], str(self.owner_a.id))
        self.assertEqual(UserProfile.objects.count(), owners)
        self.assertEqual(Pet.objects.get(pk=res.data["pet_id"]).owner_id, self.owner_a.id)

    def test_email_is_the_fallback_when_phone_matches_nobody(self):
        ref = self.create(ownerPhone="9123456789", ownerEmail="A@Example.com", petName="Rex").data["reference"]
        res = self.convert(ref)
        self.assertEqual(res.data["owner_id"], str(self.owner_a.id))
        self.assertEqual(res.data["pet_id"], str(self.pet_a.id))


class PreviousReportsTests(BoardingBase):
    def test_linked_pet_reports_are_included_unlinked_is_null(self):
        DiagnosticReport.objects.create(
            pet=self.pet_a, report_type="XRAY",
            file=SimpleUploadedFile("scan.png", b"\x89PNG\r\n\x1a\n", content_type="image/png"),
            original_filename="scan.png",
        )
        row = self.doctor_row(self.create(ownerPhone="9991110001", petName="Rex").data["reference"])
        self.assertEqual(len(row["previous_reports"]), 1)
        rep = row["previous_reports"][0]
        for k in ("id", "report_type", "report_type_display", "uploaded_at", "file_url"):
            self.assertIn(k, rep)
        self.assertEqual(rep["report_type"], "XRAY")
        self.assertNotIn("file", rep)
        none_row = self.doctor_row(self.create(ownerPhone="9123456789").data["reference"])
        self.assertIsNone(none_row["previous_reports"])

    def test_linked_pet_without_reports_is_an_empty_list(self):
        row = self.doctor_row(self.create(ownerPhone="9991110001", petName="Rex").data["reference"])
        self.assertEqual(row["previous_reports"], [])


class HoldTests(BoardingBase):
    def test_hold_returns_reference_expiry_checkout_price(self):
        res = self.hold(duration="48h")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(set(res.data), {"reference", "expires_at", "check_out", "price"})
        self.assertEqual(res.data["check_out"], "2026-10-13")
        self.assertEqual(res.data["price"], 2000)
        b = BoardingBooking.objects.get(reference=res.data["reference"])
        self.assertEqual(b.status, "HELD")
        self.assertEqual(b.expires_at, NOW + timedelta(seconds=FACILITY_HOLD_SECONDS))
        self.assertEqual(FACILITY_HOLD_SECONDS, 600)

    def test_hold_validates_input(self):
        self.assertEqual(self.hold(duration="9y").status_code, 400)
        self.assertEqual(self.hold(check_in="2026-10-01").status_code, 400)
        self.assertEqual(self.hold(check_in="nonsense").status_code, 400)

    def test_unexpired_holds_count_against_capacity_like_active_stays(self):
        self.fill(BOARDING_BEDS - 1)
        self.assertEqual(self.hold().status_code, 201)
        self.assertEqual(self.hold().status_code, 409)
        self.assertEqual(self.create().status_code, 409)
        sel = self.anon().get(AVAIL, {"check_in": CHECK_IN, "duration": "24h"}).data["selection"]
        self.assertEqual(sel["available"], 0)

    def test_expired_hold_frees_its_bed_without_any_sweep(self):
        self.fill(BOARDING_BEDS - 1)
        ref = self.hold().data["reference"]
        self.assertEqual(self.hold().status_code, 409)
        self.advance(FACILITY_HOLD_SECONDS + 1)
        sel = self.anon().get(AVAIL, {"check_in": CHECK_IN, "duration": "24h"}).data["selection"]
        self.assertEqual(sel["available"], 1)
        self.assertEqual(self.hold().status_code, 201)
        self.assertEqual(BoardingBooking.objects.get(reference=ref).status, "HELD")  # not swept

    def test_last_bed_two_visitors_exactly_one_wins(self):
        self.fill(BOARDING_BEDS - 1)
        codes = sorted([self.hold().status_code, self.hold().status_code])
        self.assertEqual(codes, [201, 409])

    def test_capacity_check_and_insert_run_under_the_boarding_lock(self):
        with mock.patch("appointments.views.boarding._lock_boarding_capacity") as lock:
            self.hold()
            self.assertEqual(lock.call_count, 1)
            self.create()
            self.assertEqual(lock.call_count, 2)

    def test_hold_honeypot_writes_nothing(self):
        res = self.hold(website="http://spam")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(BoardingBooking.objects.count(), 0)

    def test_hold_is_ip_rate_limited(self):
        from appointments.views.boarding import BOARDING_IP_LIMIT
        codes = [self.hold(check_in=f"2026-{11 + i // 28:02d}-{1 + i % 28:02d}").status_code
                 for i in range(BOARDING_IP_LIMIT + 1)]
        self.assertEqual(codes[-1], 429)

    def test_doctor_list_hides_held_unless_asked(self):
        ref = self.hold().data["reference"]
        self.assertNotIn(ref, [r["reference"] for r in self.doctor_list().data["results"]])
        self.assertIn(ref, [r["reference"] for r in self.doctor_list("?include_held=1").data["results"]])

    def test_held_row_does_not_count_as_pending_and_cannot_be_actioned(self):
        ref = self.hold().data["reference"]
        self.assertEqual(self.doctor_list().data["pending_count"], 0)
        self.auth(self.doctor)
        res = self.client.post(f"{BOARD}/{ref}/status", {"action": "confirm"}, format="json")
        self.assertEqual(res.status_code, 404)
        self.assertEqual(BoardingBooking.objects.get(reference=ref).status, "HELD")


class ConfirmTests(BoardingBase):
    def test_confirm_within_window_turns_hold_into_pending_with_intake(self):
        ref = self.hold().data["reference"]
        self.advance(FACILITY_HOLD_SECONDS - 1)
        res = self.confirm(ref, ownerPhone="9991110001", petName="Rex")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.data["reference"], ref)
        self.assertIn("detail", res.data)
        b = BoardingBooking.objects.get(reference=ref)
        self.assertEqual((b.status, b.expires_at), ("PENDING", None))
        self.assertEqual((b.pet_name, b.emergency_contact_phone), ("Rex", "9811122233"))
        self.assertEqual(b.pet_id, self.pet_a.id)  # matching ran
        self.assertEqual(self.doctor_list().data["pending_count"], 1)

    def test_confirm_uses_the_held_dates_not_the_body(self):
        ref = self.hold(duration="48h").data["reference"]
        self.confirm(ref, checkIn="2027-01-01", duration="1h")
        b = BoardingBooking.objects.get(reference=ref)
        self.assertEqual((str(b.check_in), b.duration, str(b.check_out)), (CHECK_IN, "48h", "2026-10-13"))

    def test_confirm_after_expiry_is_410(self):
        ref = self.hold().data["reference"]
        self.advance(FACILITY_HOLD_SECONDS + 1)
        res = self.confirm(ref)
        self.assertEqual(res.status_code, 410)
        self.assertIn("Hold expired", str(res.data))
        self.assertNotEqual(BoardingBooking.objects.get(reference=ref).status, "PENDING")

    def test_confirm_unknown_or_non_held_is_404(self):
        self.assertEqual(self.confirm("BRD-NOPE").status_code, 404)
        ref = self.create().data["reference"]  # PENDING, not HELD
        self.assertEqual(self.confirm(ref).status_code, 404)
        ref2 = self.hold().data["reference"]
        self.assertEqual(self.confirm(ref2).status_code, 201)
        self.assertEqual(self.confirm(ref2).status_code, 404)  # already confirmed

    def test_confirm_requires_emergency_phone_different_from_owner(self):
        ref = self.hold().data["reference"]
        body = _payload()
        del body["emergencyContactPhone"]
        self.assertEqual(self.anon().post(f"{HOLDS}/{ref}/confirm", body, format="json").status_code, 400)
        self.assertEqual(self.confirm(ref, emergencyContactPhone="+91 98765 43210").status_code, 400)
        self.assertEqual(BoardingBooking.objects.get(reference=ref).status, "HELD")
        self.assertEqual(self.confirm(ref).status_code, 201)

    def test_confirm_requires_terms(self):
        ref = self.hold().data["reference"]
        self.assertEqual(self.confirm(ref, termsAccepted=False).status_code, 400)

    def test_confirm_honeypot_confirms_nothing(self):
        ref = self.hold().data["reference"]
        res = self.confirm(ref, website="spam")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(BoardingBooking.objects.get(reference=ref).status, "HELD")

    def test_confirm_is_phone_rate_limited(self):
        from appointments.views.boarding import BOARDING_PHONE_LIMIT
        refs = [self.hold(check_in=f"2026-11-{1 + i:02d}").data["reference"] for i in range(BOARDING_PHONE_LIMIT + 1)]
        codes = [self.confirm(r).status_code for r in refs]
        self.assertEqual(codes[-1], 429)
