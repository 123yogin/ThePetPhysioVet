"""Fixes for the 2026-10-08 live QA round (doctor-side B1-B7, public/owner D1-D8).

B1  a doctor can cancel an appointment (with an optional reason).
B2  "Confirm & Book" on an enquiry creates a CONFIRMED appointment.
B3  an unlinked boarding stay is matched lazily on the doctor list, so an owner
    who signed up after booking is recognised.
B7  a doctor can void an unpaid invoice; voided invoices are out of revenue.
D1  /owner/bookings only shows bookings explicitly linked to the account --
    never by phone alone.
D8  unknown /api/v1/* paths return a JSON 404 problem, not Django's HTML page.
"""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from appointments.models import (
    Appointment, BoardingBooking, Enquiry, FacilityBooking, Invoice, Payment, Pet, UserProfile,
)

from .base import API, ApiTestCase


def _future(days=7):
    return (timezone.localdate() + timedelta(days=days)).isoformat()


def _boarding_body(**over):
    body = {
        "petName": "Bruno", "ownerName": "Priya Shah", "ownerPhone": "98765 43210",
        "checkIn": _future(5), "duration": "24h", "termsAccepted": True,
        "emergencyContactName": "Raj Shah", "emergencyContactPhone": "9811122233",
    }
    body.update(over)
    return body


def _enquiry_body(**over):
    body = {
        "firstName": "Priya", "lastName": "Shah", "petName": "Bruno",
        "email": "priya@example.com", "phone": "98765 43210", "reason": "Limping",
    }
    body.update(over)
    return body


def _facility_body(**over):
    body = {
        "petName": "Bruno", "ownerName": "Priya Shah", "ownerPhone": "98765 43210",
        "date": _future(3), "slots": [1],
    }
    body.update(over)
    return body


class DoctorCancelAppointmentTests(ApiTestCase):
    """B1."""

    def url(self, appt):
        return f"{API}/appointments/{appt.id}/cancel"

    def test_doctor_cancels_with_reason(self):
        self.auth(self.doctor)
        r = self.client.post(self.url(self.appt_a), {"reason": "Owner called in sick"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["status"], "Cancelled")
        self.appt_a.refresh_from_db()
        self.assertEqual(self.appt_a.status, "Cancelled")
        self.assertEqual(self.appt_a.cancel_reason, "Owner called in sick")
        self.assertEqual(r.data["cancel_reason"], "Owner called in sick")

    def test_reason_is_optional(self):
        self.auth(self.doctor)
        r = self.client.post(self.url(self.appt_a), {}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.appt_a.refresh_from_db()
        self.assertEqual(self.appt_a.status, "Cancelled")

    def test_completed_or_cancelled_cannot_be_cancelled(self):
        self.auth(self.doctor)
        for st in ("Completed", "Cancelled"):
            with self.subTest(status=st):
                self.appt_a.status = st
                self.appt_a.save()
                r = self.client.post(self.url(self.appt_a), {}, format="json")
                self.assertEqual(r.status_code, 400, r.content)

    def test_other_doctors_appointment_is_404(self):
        other = UserProfile.objects.create_user(
            username="drother", password="x-Pass-123", role="DOCTOR", email="o@example.com",
        )
        self.auth(other)
        r = self.client.post(self.url(self.appt_a), {}, format="json")
        self.assertEqual(r.status_code, 404)
        self.appt_a.refresh_from_db()
        self.assertNotEqual(self.appt_a.status, "Cancelled")

    def test_owner_cannot_use_doctor_cancel(self):
        self.auth(self.owner_a)
        r = self.client.post(self.url(self.appt_a), {}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_cancelled_slot_can_be_rebooked(self):
        self.auth(self.doctor)
        self.client.post(self.url(self.appt_a), {}, format="json")
        Appointment.objects.create(
            pet=self.pet_a, doctor=self.doctor, pet_name="Rex", owner_name="Alice Aye",
            owner_phone="9991110001", date=self.appt_a.date, time=self.appt_a.time,
        )


class EnquiryConvertConfirmedTests(ApiTestCase):
    """B2: the doctor explicitly confirmed a date/time, so the visit is Confirmed."""

    def test_convert_creates_a_confirmed_appointment(self):
        enquiry = Enquiry.objects.create(
            first_name="Priya", pet_name="Bruno", email="p2@example.com", phone="9876543210",
        )
        self.auth(self.doctor)
        r = self.client.post(
            f"{API}/enquiries/{enquiry.id}/convert",
            {"date": _future(), "time": "10:30", "visit_type": "Initial"}, format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        appt = Appointment.objects.get(pk=r.data["appointment"]["id"])
        self.assertEqual(appt.status, "Confirmed")

    def test_enquiry_list_carries_the_enq_reference(self):
        enquiry = Enquiry.objects.create(
            first_name="Priya", pet_name="Bruno", email="p3@example.com", phone="9876543210",
        )
        self.auth(self.doctor)
        r = self.client.get(f"{API}/enquiries")
        row = next(e for e in r.data["results"] if e["id"] == str(enquiry.id))
        self.assertEqual(row["reference"], f"ENQ-{str(enquiry.id)[:8].upper()}")


class BoardingLazyMatchTests(ApiTestCase):
    """B3: matching ran only at create, so an owner who signed up later stayed
    'New client' for ever. The doctor list now matches unlinked active stays."""

    def test_owner_signing_up_after_booking_is_linked_on_the_doctor_list(self):
        r = self.anon().post(f"{API}/facility/boarding", _boarding_body(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        ref = r.data["reference"]
        self.assertIsNone(BoardingBooking.objects.get(reference=ref).owner_id)

        late = UserProfile.objects.create_user(
            username="priya", password="Priya-Pass-1", role="OWNER", phone="9876543210",
            email="priya@example.com",
        )
        self.auth(self.doctor)
        res = self.client.get(f"{API}/facility/boarding")
        row = next(x for x in res.data["results"] if x["reference"] == ref)
        self.assertEqual(str(row["owner_id"]), str(late.id))
        self.assertEqual(row["pet_link_status"], "owner_only")
        # Persisted, not just computed for the response.
        self.assertEqual(BoardingBooking.objects.get(reference=ref).owner_id, late.id)

    def test_cancelled_and_completed_stays_are_not_matched(self):
        r = self.anon().post(f"{API}/facility/boarding", _boarding_body(), format="json")
        ref = r.data["reference"]
        BoardingBooking.objects.filter(reference=ref).update(status="CANCELLED")
        UserProfile.objects.create_user(
            username="priya", password="Priya-Pass-1", role="OWNER", phone="9876543210",
        )
        self.auth(self.doctor)
        self.client.get(f"{API}/facility/boarding")
        self.assertIsNone(BoardingBooking.objects.get(reference=ref).owner_id)

    def test_ambiguous_phone_stays_unlinked(self):
        r = self.anon().post(f"{API}/facility/boarding", _boarding_body(), format="json")
        ref = r.data["reference"]
        for n in ("p1", "p2"):
            UserProfile.objects.create_user(
                username=n, password="Priya-Pass-1", role="OWNER", phone="9876543210",
            )
        self.auth(self.doctor)
        self.client.get(f"{API}/facility/boarding")
        self.assertIsNone(BoardingBooking.objects.get(reference=ref).owner_id)


class InvoiceVoidTests(ApiTestCase):
    """B7."""

    def url(self, inv):
        return f"{API}/invoices/{inv.id}/void"

    def test_doctor_voids_an_unpaid_invoice(self):
        self.auth(self.doctor)
        r = self.client.post(self.url(self.invoice_a), {"reason": "Raised twice"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["payment_status"], "VOID")
        self.assertEqual(Decimal(r.data["balance_due"]), Decimal("0.00"))
        self.assertEqual(r.data["void_reason"], "Raised twice")
        self.assertIsNotNone(r.data["voided_at"])
        self.invoice_a.refresh_from_db()
        self.assertIsNotNone(self.invoice_a.voided_at)

    def test_void_is_idempotent(self):
        self.auth(self.doctor)
        self.client.post(self.url(self.invoice_a), {}, format="json")
        r = self.client.post(self.url(self.invoice_a), {}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["payment_status"], "VOID")

    def test_paid_or_part_paid_invoice_cannot_be_voided(self):
        Payment.objects.create(invoice=self.invoice_a, amount_paid=Decimal("100"), status="SUCCESS")
        self.auth(self.doctor)
        r = self.client.post(self.url(self.invoice_a), {}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.invoice_a.refresh_from_db()
        self.assertIsNone(self.invoice_a.voided_at)

    def test_voided_invoice_takes_no_payment(self):
        self.auth(self.doctor)
        self.client.post(self.url(self.invoice_a), {}, format="json")
        r = self.client.post(
            f"{API}/invoices/{self.invoice_a.id}/payments",
            {"amount_paid": "100", "idempotency_key": "k-void-1"}, format="json",
        )
        self.assertEqual(r.status_code, 400, r.content)
        self.assertFalse(Payment.objects.filter(invoice=self.invoice_a).exists())

    def test_voided_invoice_is_excluded_from_revenue_and_pending(self):
        self.auth(self.doctor)
        before = self.client.get(f"{API}/revenue?range=month").data
        self.client.post(self.url(self.invoice_a), {}, format="json")
        after = self.client.get(f"{API}/revenue?range=month").data
        self.assertEqual(before["total_revenue"] - after["total_revenue"], 1000.0)
        self.assertEqual(before["pending"] - after["pending"], 1000.0)

        stats_pending = self.client.get(f"{API}/dashboard/stats").data
        self.assertNotIn("error", stats_pending)

    def test_other_doctor_gets_404_and_owner_gets_403(self):
        other = UserProfile.objects.create_user(
            username="drother", password="x-Pass-123", role="DOCTOR", email="o@example.com",
        )
        self.auth(other)
        self.assertEqual(self.client.post(self.url(self.invoice_a), {}, format="json").status_code, 404)
        self.auth(self.owner_a)
        self.assertEqual(self.client.post(self.url(self.invoice_a), {}, format="json").status_code, 403)
        self.invoice_a.refresh_from_db()
        self.assertIsNone(self.invoice_a.voided_at)

    def test_owner_sees_void_status(self):
        self.auth(self.doctor)
        self.client.post(self.url(self.invoice_a), {}, format="json")
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/owner/invoices")
        row = next(i for i in r.data if i["id"] == str(self.invoice_a.id))
        self.assertEqual(row["payment_status"], "VOID")


class OwnerBookingsPrivacyTests(ApiTestCase):
    """D1: website bookings are anonymous and signup does not verify the phone,
    so a phone match must never be enough to show a booking to an account."""

    CLIENT_PHONE = "98765 43210"

    def _stranger(self):
        return UserProfile.objects.create_user(
            username="stranger", password="Strange-Pass-1", role="OWNER",
            phone="9876543210", email="stranger@example.com",
        )

    def _bookings(self, user):
        self.auth(user)
        r = self.client.get(f"{API}/owner/bookings")
        self.assertEqual(r.status_code, 200, r.content)
        return r.data

    def _make_all_anonymous(self):
        self.anon().post(f"{API}/facility/boarding", _boarding_body(), format="json")
        self.anon().post(f"{API}/enquiries", _enquiry_body(), format="json")
        r = self.anon().post(f"{API}/facility/bookings", _facility_body(), format="json")
        self.assertEqual(r.status_code, 201, r.content)

    def test_stranger_signing_up_with_a_clients_phone_sees_nothing(self):
        self._make_all_anonymous()
        stranger = self._stranger()
        data = self._bookings(stranger)
        self.assertEqual(data, {"facility": [], "requests": [], "boarding": []})

    def test_stranger_who_signed_up_before_the_booking_still_sees_nothing(self):
        stranger = self._stranger()
        self._make_all_anonymous()
        # The staff-side match may link the stay to the stranger as a HINT for
        # the clinic -- that must still not publish it to the stranger.
        self.auth(self.doctor)
        self.client.get(f"{API}/facility/boarding")
        data = self._bookings(stranger)
        self.assertEqual(data, {"facility": [], "requests": [], "boarding": []})

    def test_boarding_converted_by_the_clinic_is_shown(self):
        owner = self._stranger()
        r = self.anon().post(f"{API}/facility/boarding", _boarding_body(), format="json")
        ref = r.data["reference"]
        self.auth(self.doctor)
        c = self.client.post(f"{API}/facility/boarding/{ref}/convert", {}, format="json")
        self.assertEqual(c.status_code, 200, c.content)
        data = self._bookings(owner)
        self.assertEqual([b["reference"] for b in data["boarding"]], [ref])

    def test_enquiry_converted_by_the_clinic_is_shown_to_that_owner(self):
        r = self.anon().post(f"{API}/enquiries", _enquiry_body(email="a@example.com"), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.auth(self.doctor)
        c = self.client.post(
            f"{API}/enquiries/{r.data['id']}/convert",
            {"date": _future(), "time": "10:30", "visit_type": "Initial"}, format="json",
        )
        self.assertEqual(c.status_code, 200, c.content)
        self.assertEqual(Enquiry.objects.get(pk=r.data["id"]).owner_id, self.owner_a.id)
        data = self._bookings(self.owner_a)
        self.assertEqual([q["reference"] for q in data["requests"]], [r.data["reference"]])
        # And not to anyone else who happens to share the phone.
        self.assertEqual(self._bookings(self._stranger())["requests"], [])

    def test_bookings_made_while_signed_in_are_linked_to_that_owner(self):
        self.auth(self.owner_a)
        e = self.client.post(f"{API}/enquiries", _enquiry_body(email="x@example.com"), format="json")
        self.assertEqual(e.status_code, 201, e.content)
        self.auth(self.owner_a)
        f = self.client.post(f"{API}/facility/bookings", _facility_body(), format="json")
        self.assertEqual(f.status_code, 201, f.content)
        self.auth(self.owner_a)
        b = self.client.post(f"{API}/facility/boarding", _boarding_body(), format="json")
        self.assertEqual(b.status_code, 201, b.content)

        self.assertEqual(Enquiry.objects.get(pk=e.data["id"]).owner_id, self.owner_a.id)
        self.assertTrue(FacilityBooking.objects.filter(reference=f.data["reference"], owner=self.owner_a).exists())
        stay = BoardingBooking.objects.get(reference=b.data["reference"])
        self.assertEqual(stay.owner_id, self.owner_a.id)
        self.assertTrue(stay.owner_verified)

        data = self._bookings(self.owner_a)
        self.assertEqual(len(data["requests"]), 1)
        self.assertEqual(len(data["facility"]), 1)
        self.assertEqual(len(data["boarding"]), 1)
        # owner_b sees none of owner_a's.
        self.assertEqual(self._bookings(self.owner_b), {"facility": [], "requests": [], "boarding": []})

    def test_signed_in_booking_response_is_unchanged(self):
        anon = self.anon().post(f"{API}/facility/boarding", _boarding_body(), format="json")
        self.auth(self.owner_a)
        signed = self.client.post(f"{API}/facility/boarding", _boarding_body(), format="json")
        self.assertEqual(set(anon.data), set(signed.data))
        self.assertNotIn("owner_id", signed.data)


class BoardingCopyTests(ApiTestCase):
    """D8: the success copy says 'requested' like the screen, with Indian grouping."""

    def test_detail_says_requested_and_groups_rupees(self):
        r = self.anon().post(f"{API}/facility/boarding", _boarding_body(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertIn("requested", r.data["detail"])
        self.assertNotIn("is booked", r.data["detail"])
        self.assertIn("₹1,200", r.data["detail"])


class UnknownApiPathTests(ApiTestCase):
    """D8."""

    def test_unknown_api_path_is_a_json_404_problem(self):
        for path in (f"{API}/does-not-exist", f"{API}/pets/not-a-uuid/whatever", "/api/nope"):
            with self.subTest(path=path):
                r = self.anon().get(path)
                self.assertEqual(r.status_code, 404)
                self.assertIn("json", r["Content-Type"])
                body = r.json()
                self.assertEqual(body["status"], 404)
                self.assertEqual(body["title"], "Not found")

    def test_known_routes_still_resolve(self):
        self.assertEqual(self.anon().get(f"{API}/appointment-options").status_code, 200)


class BoardingDepartureTests(ApiTestCase):
    """D4: check_out is the inclusive last bed-night (capacity unchanged); the
    day the pet leaves is derived for display."""

    def test_check_out_is_last_night_and_departure_is_next_day(self):
        from datetime import date
        from appointments.models.boarding import departure_for
        d = date(2026, 10, 8)
        r = self.anon().post(
            f"{API}/facility/boarding", _boarding_body(checkIn="2026-10-08"), format="json",
        )
        if r.status_code == 201:  # date may be in the past when the suite runs later
            self.assertEqual(r.data["check_out"], "2026-10-08")
        self.assertEqual(departure_for(d, "24h"), date(2026, 10, 9))
        self.assertEqual(departure_for(d, "48h"), date(2026, 10, 10))
        self.assertEqual(departure_for(d, "1week"), date(2026, 10, 15))
        self.assertEqual(departure_for(d, "12h"), d)
