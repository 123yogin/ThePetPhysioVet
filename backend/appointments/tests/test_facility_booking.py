"""Indoor-facility slot bookings: 6 beds, four one-hour slots 09:30-13:30,
at most 3 slots per request.

The point of the feature is a bed count that is TRUE, so the tests that matter
are the ones that pin capacity: the sixth bed books, the seventh is refused,
and a cancellation frees a bed. The rest guard the public-write posture that
every unauthenticated endpoint in this app shares (honeypot, past-date, max
slots) and the doctor-only read.

Traceability: CLAUDE.md rules 4 and 7.
"""
from datetime import date, timedelta

from django.utils import timezone
from appointments.models import FacilityBooking, FACILITY_BEDS

from .base import API, ApiTestCase

AVAIL = f"{API}/facility/availability"
BOOK = f"{API}/facility/bookings"


def _tomorrow():
    return (date.today() + timedelta(days=1)).isoformat()


class FacilityAvailabilityTests(ApiTestCase):

    def test_availability_is_public_and_starts_at_six(self):
        res = self.anon().get(AVAIL, {"date": _tomorrow()})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["beds_total"], FACILITY_BEDS)
        self.assertEqual(res.data["max_slots_per_booking"], 3)
        self.assertEqual(len(res.data["slots"]), 4)
        self.assertTrue(all(s["beds_available"] == FACILITY_BEDS for s in res.data["slots"]))

    def test_availability_requires_a_date(self):
        self.assertEqual(self.anon().get(AVAIL).status_code, 400)


class FacilityBookingCreateTests(ApiTestCase):

    def _book(self, slots, phone="9000000001", d=None):
        return self.anon().post(BOOK, {
            "petName": "Rex", "ownerName": "Owner", "ownerPhone": phone,
            "date": d or _tomorrow(), "slots": slots,
        }, format="json")

    def test_a_visitor_can_hold_slots_and_the_count_drops(self):
        res = self._book([0, 1])
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data["reference"].startswith("FAC-"))
        self.assertEqual(res.data["status"], "PENDING")
        avail = self.anon().get(AVAIL, {"date": _tomorrow()}).data["slots"]
        self.assertEqual(avail[0]["beds_available"], FACILITY_BEDS - 1)
        self.assertEqual(avail[1]["beds_available"], FACILITY_BEDS - 1)
        self.assertEqual(avail[2]["beds_available"], FACILITY_BEDS)

    def test_at_most_three_slots_per_request(self):
        res = self._book([0, 1, 2, 3])
        self.assertEqual(res.status_code, 400)
        self.assertEqual(FacilityBooking.objects.count(), 0)

    def test_a_past_date_is_refused(self):
        res = self._book([0], d=(date.today() - timedelta(days=1)).isoformat())
        self.assertEqual(res.status_code, 400)

    def test_an_unknown_slot_is_refused(self):
        res = self._book([9])
        self.assertEqual(res.status_code, 400)

    def test_the_sixth_bed_books_and_the_seventh_is_refused(self):
        for i in range(FACILITY_BEDS):
            self.assertEqual(self._book([2], phone=f"90000001{i:02d}").status_code, 201)
        # slot 2 is now full
        avail = self.anon().get(AVAIL, {"date": _tomorrow()}).data["slots"]
        self.assertEqual(avail[2]["beds_available"], 0)
        # the seventh is refused with 409, and nothing is written
        before = FacilityBooking.objects.filter(slot=2).count()
        res = self._book([2], phone="9999999999")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(FacilityBooking.objects.filter(slot=2).count(), before)

    def test_the_honeypot_writes_nothing_but_looks_fine(self):
        res = self.anon().post(BOOK, {
            "petName": "Bot", "ownerName": "Bot", "ownerPhone": "9000000002",
            "date": _tomorrow(), "slots": [0], "website": "http://spam",
        }, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(FacilityBooking.objects.count(), 0)


class FacilityDoctorTests(ApiTestCase):

    def _book(self, slots, phone="9000000001"):
        return self.anon().post(BOOK, {
            "petName": "Rex", "ownerName": "Owner", "ownerPhone": phone,
            "date": _tomorrow(), "slots": slots,
        }, format="json")

    def test_the_list_is_doctor_only(self):
        self.assertEqual(self.anon().get(BOOK).status_code, 401)
        self.auth(self.owner_a)
        self.assertEqual(self.client.get(BOOK).status_code, 403)

    def test_a_doctor_sees_bookings_grouped_by_reference(self):
        ref = self._book([0, 1]).data["reference"]
        self.auth(self.doctor)
        res = self.client.get(BOOK, {"date": _tomorrow()})
        self.assertEqual(res.status_code, 200)
        group = next(g for g in res.data["results"] if g["reference"] == ref)
        self.assertEqual(len(group["slots"]), 2)

    def test_cancelling_frees_the_beds(self):
        ref = self._book([2]).data["reference"]
        self.auth(self.doctor)
        res = self.client.post(f"{BOOK}/{ref}/status", {"status": "CANCELLED"}, format="json")
        self.assertEqual(res.status_code, 200)
        avail = self.anon().get(AVAIL, {"date": _tomorrow()}).data["slots"]
        self.assertEqual(avail[2]["beds_available"], FACILITY_BEDS)

    def test_confirm_keeps_the_bed_held(self):
        ref = self._book([3]).data["reference"]
        self.auth(self.doctor)
        self.client.post(f"{BOOK}/{ref}/status", {"status": "CONFIRMED"}, format="json")
        avail = self.anon().get(AVAIL, {"date": _tomorrow()}).data["slots"]
        self.assertEqual(avail[3]["beds_available"], FACILITY_BEDS - 1)


class FacilityHoldFlowTests(ApiTestCase):
    """The two-step, BookMyShow-style hold -> confirm flow (no payment)."""

    HOLD = f"{API}/facility/holds"

    def _tomorrow(self):
        return (date.today() + timedelta(days=1)).isoformat()

    def test_holding_slots_occupies_beds_and_returns_a_countdown(self):
        res = self.anon().post(self.HOLD, {"date": self._tomorrow(), "slots": [0, 1]}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data["reference"].startswith("FAC-"))
        self.assertTrue(res.data["expires_at"])
        self.assertEqual(res.data["hold_seconds"], 600)
        # a held bed is unavailable to the next visitor
        avail = self.anon().get(f"{API}/facility/availability", {"date": self._tomorrow()}).data["slots"]
        self.assertEqual(avail[0]["beds_available"], FACILITY_BEDS - 1)
        # ...but it is NOT shown in the doctor's inbox (transient)
        self.auth(self.doctor)
        listed = self.client.get(f"{API}/facility/bookings", {"date": self._tomorrow()}).data
        self.assertEqual(listed["results"], [])

    def test_confirming_a_hold_turns_it_into_a_pending_booking(self):
        ref = self.anon().post(self.HOLD, {"date": self._tomorrow(), "slots": [2]}, format="json").data["reference"]
        res = self.anon().post(f"{API}/facility/holds/{ref}/confirm", {
            "petName": "Rex", "ownerName": "Owner", "ownerPhone": "9000000001",
        }, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "PENDING")
        row = FacilityBooking.objects.get(reference=ref)
        self.assertEqual(row.status, "PENDING")
        self.assertIsNone(row.expires_at)
        self.assertEqual(row.pet_name, "Rex")
        # now the doctor sees it
        self.auth(self.doctor)
        listed = self.client.get(f"{API}/facility/bookings", {"date": self._tomorrow()}).data
        self.assertEqual(len(listed["results"]), 1)

    def test_an_expired_hold_frees_its_beds_and_cannot_be_confirmed(self):
        ref = self.anon().post(self.HOLD, {"date": self._tomorrow(), "slots": [3]}, format="json").data["reference"]
        # force the hold into the past
        FacilityBooking.objects.filter(reference=ref).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        # the bed is free again (lazy expiry, no sweep)
        avail = self.anon().get(f"{API}/facility/availability", {"date": self._tomorrow()}).data["slots"]
        self.assertEqual(avail[3]["beds_available"], FACILITY_BEDS)
        # confirming an expired hold is refused with 410
        res = self.anon().post(f"{API}/facility/holds/{ref}/confirm", {
            "petName": "Rex", "ownerName": "Owner", "ownerPhone": "9000000001",
        }, format="json")
        self.assertEqual(res.status_code, 410)

    def test_a_hold_cannot_exceed_capacity(self):
        for i in range(FACILITY_BEDS):
            self.assertEqual(
                self.anon().post(self.HOLD, {"date": self._tomorrow(), "slots": [0]}, format="json").status_code,
                201,
            )
        res = self.anon().post(self.HOLD, {"date": self._tomorrow(), "slots": [0]}, format="json")
        self.assertEqual(res.status_code, 409)

    def test_hold_honours_the_three_slot_cap(self):
        res = self.anon().post(self.HOLD, {"date": self._tomorrow(), "slots": [0, 1, 2, 3]}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(FacilityBooking.objects.count(), 0)


class FacilityUnapprovedBookingSurvivesTests(ApiTestCase):
    """A confirmed booking the doctor has not yet approved must NEVER be lost:
    only the pre-confirmation HELD lock expires; a PENDING request persists
    until the clinic acts on it."""

    HOLD = f"{API}/facility/holds"

    def _tomorrow(self):
        return (date.today() + timedelta(days=1)).isoformat()

    def _confirm_a_booking(self):
        ref = self.anon().post(self.HOLD, {"date": self._tomorrow(), "slots": [0]}, format="json").data["reference"]
        self.anon().post(f"{API}/facility/holds/{ref}/confirm", {
            "petName": "Rex", "ownerName": "Owner", "ownerPhone": "9000000001",
        }, format="json")
        return ref

    def test_a_confirmed_booking_has_no_expiry(self):
        ref = self._confirm_a_booking()
        for row in FacilityBooking.objects.filter(reference=ref):
            self.assertEqual(row.status, "PENDING")
            self.assertIsNone(row.expires_at)

    def test_an_unapproved_booking_still_holds_its_bed_much_later(self):
        ref = self._confirm_a_booking()
        # simulate the doctor forgetting for a month
        FacilityBooking.objects.filter(reference=ref).update(
            created_at=timezone.now() - timedelta(days=30)
        )
        # it still occupies its bed (availability reflects it) and is still there
        avail = self.anon().get(f"{API}/facility/availability", {"date": self._tomorrow()}).data["slots"]
        self.assertEqual(avail[0]["beds_available"], FACILITY_BEDS - 1)
        self.assertTrue(FacilityBooking.objects.filter(reference=ref, status="PENDING").exists())

    def test_an_unapproved_booking_is_still_in_the_doctor_inbox(self):
        ref = self._confirm_a_booking()
        FacilityBooking.objects.filter(reference=ref).update(
            created_at=timezone.now() - timedelta(days=30)
        )
        self.auth(self.doctor)
        listed = self.client.get(f"{API}/facility/bookings", {"date": self._tomorrow()}).data
        self.assertTrue(any(g["reference"] == ref for g in listed["results"]))


class FacilityBedConstraintTests(ApiTestCase):
    """The database itself refuses to put two occupying bookings in the same bed
    -- the guarantee that holds on Postgres, not just SQLite's write serialising."""

    HOLD = f"{API}/facility/holds"

    def _tomorrow(self):
        return (date.today() + timedelta(days=1)).isoformat()

    def test_bookings_get_distinct_bed_indexes(self):
        for i in range(3):
            self.anon().post(self.HOLD, {"date": self._tomorrow(), "slots": [0]}, format="json")
        beds = sorted(
            FacilityBooking.objects.filter(date=self._tomorrow(), slot=0).values_list("bed_index", flat=True)
        )
        self.assertEqual(beds, [0, 1, 2])

    def test_the_database_rejects_a_duplicate_bed(self):
        from django.db import IntegrityError
        self.anon().post(self.HOLD, {"date": self._tomorrow(), "slots": [0]}, format="json")
        # a confirmed booking already sits in bed 0; forcing a second row into the
        # same (date, slot, bed) must be refused by the unique constraint.
        with self.assertRaises(IntegrityError):
            FacilityBooking.objects.create(
                reference="FAC-DUP", date=self._tomorrow(), slot=0, bed_index=0,
                status="PENDING", pet_name="X", owner_name="Y", owner_phone="9",
            )

    def test_an_expired_holds_bed_is_reused_not_wasted(self):
        # hold bed 0, then expire it
        ref = self.anon().post(self.HOLD, {"date": self._tomorrow(), "slots": [0]}, format="json").data["reference"]
        FacilityBooking.objects.filter(reference=ref).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        # a new hold on the same slot should succeed and take bed 0 again
        res = self.anon().post(self.HOLD, {"date": self._tomorrow(), "slots": [0]}, format="json")
        self.assertEqual(res.status_code, 201)
        live = FacilityBooking.objects.filter(
            FacilityBooking.occupies_bed_q(timezone.now()), date=self._tomorrow(), slot=0
        )
        self.assertEqual(live.count(), 1)
        self.assertEqual(live.first().bed_index, 0)
