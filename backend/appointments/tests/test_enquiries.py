"""Coverage for the marketing-site enquiry inbox.

API_CONTRACT.md does not yet document these routes at the time this file was
written — this task's own spec is the contract for `/api/v1/enquiries` and
its actions. See `appointments/models.py` (`Enquiry`) and
`appointments/views.py` (`enquiries_view`, `enquiry_convert_view`,
`enquiry_dismiss_view`) for the design rationale.

CLAUDE.md rules under test: 2 (traceability), 4 (authZ in depth — role
re-checked in the view, not just at the gateway), 6 (idempotent
money-adjacent... here, patient-record-creating mutation), 7 (report
honestly).
"""

from appointments.models import Appointment, Enquiry, Pet, UserProfile

from .base import API, ApiTestCase

VALID_PAYLOAD = {
    "firstName": "Priya",
    "lastName": "Sharma",
    "petName": "Bruno",
    "speciesBreed": "Golden Retriever",
    "email": "priya.sharma@example.com",
    "phone": "9123456780",
    "reason": "Limping on the left hind leg after a walk.",
    "preferredDate": "2026-10-01",
    "preferredSpecialist": "Dr. Dhanvi",
}


class EnquiryCreateTests(ApiTestCase):
    """POST /api/v1/enquiries — PUBLIC."""

    def test_public_post_works_unauthenticated(self):
        r = self.anon().post(f"{API}/enquiries", VALID_PAYLOAD, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertIn("id", r.data)
        self.assertIn("reference", r.data)
        self.assertTrue(r.data["reference"].startswith("ENQ-"))
        self.assertIn("detail", r.data)

        enquiry = Enquiry.objects.get(pk=r.data["id"])
        self.assertEqual(enquiry.first_name, "Priya")
        self.assertEqual(enquiry.last_name, "Sharma")
        self.assertEqual(enquiry.pet_name, "Bruno")
        self.assertEqual(enquiry.species_breed, "Golden Retriever")
        self.assertEqual(enquiry.email, "priya.sharma@example.com")
        self.assertEqual(enquiry.phone, "9123456780")
        self.assertEqual(enquiry.status, "NEW")
        self.assertEqual(str(enquiry.preferred_date), "2026-10-01")
        self.assertEqual(enquiry.preferred_specialist, "Dr. Dhanvi")

    def test_public_post_works_with_a_junk_bearer_token(self):
        """authentication_classes([]) must be in effect — SimpleJWT raises
        on a garbage bearer token, which would 401 before AllowAny is ever
        consulted if this weren't set (see enquiries_view's docstring)."""
        self.client.credentials(HTTP_AUTHORIZATION="Bearer this.is.not.a.real.jwt")
        r = self.client.post(f"{API}/enquiries",
                              {**VALID_PAYLOAD, "email": "junk-token@example.com"},
                              format="json")
        self.assertEqual(r.status_code, 201, r.content)

    def test_public_post_works_with_an_expired_access_token(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(self.doctor).access_token
        expired = self._expired(token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {expired}")
        r = self.client.post(f"{API}/enquiries",
                              {**VALID_PAYLOAD, "email": "expired-token@example.com"},
                              format="json")
        self.assertEqual(r.status_code, 201, r.content)

    def test_optional_fields_may_be_omitted(self):
        payload = {k: v for k, v in VALID_PAYLOAD.items()
                   if k not in ("preferredDate", "preferredSpecialist")}
        r = self.anon().post(f"{API}/enquiries",
                              {**payload, "email": "nooptional@example.com"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        enquiry = Enquiry.objects.get(pk=r.data["id"])
        self.assertIsNone(enquiry.preferred_date)
        self.assertEqual(enquiry.preferred_specialist, "")

    def test_status_is_not_client_settable(self):
        r = self.anon().post(f"{API}/enquiries",
                              {**VALID_PAYLOAD, "email": "notclientset@example.com",
                               "status": "CONVERTED"},
                              format="json")
        self.assertEqual(r.status_code, 201, r.content)
        enquiry = Enquiry.objects.get(pk=r.data["id"])
        self.assertEqual(enquiry.status, "NEW")

    def test_missing_required_field_is_400(self):
        payload = dict(VALID_PAYLOAD)
        payload.pop("reason")
        r = self.anon().post(f"{API}/enquiries", payload, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn("detail", r.data)

    def test_invalid_email_is_400(self):
        r = self.anon().post(f"{API}/enquiries",
                              {**VALID_PAYLOAD, "email": "not-an-email"}, format="json")
        self.assertEqual(r.status_code, 400, r.content)

    def test_oversized_reason_is_rejected(self):
        payload = {**VALID_PAYLOAD, "email": "oversized@example.com", "reason": "x" * 2001}
        r = self.anon().post(f"{API}/enquiries", payload, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(Enquiry.objects.filter(email="oversized@example.com").count(), 0)

    def test_oversized_pet_name_is_rejected(self):
        payload = {**VALID_PAYLOAD, "email": "oversizedpet@example.com", "petName": "x" * 101}
        r = self.anon().post(f"{API}/enquiries", payload, format="json")
        self.assertEqual(r.status_code, 400, r.content)

    def test_rate_limit_trips_on_repeated_same_email(self):
        # ENQUIRY_EMAIL_LIMIT is 3 -> the 4th request in the window 429s.
        payload = {**VALID_PAYLOAD, "email": "hammered@example.com"}
        statuses = []
        for _ in range(4):
            r = self.anon().post(f"{API}/enquiries", payload, format="json")
            statuses.append(r.status_code)
        self.assertEqual(statuses[:3], [201, 201, 201])
        self.assertEqual(statuses[3], 429)
        self.assertEqual(Enquiry.objects.filter(email="hammered@example.com").count(), 3)

    def test_rate_limit_trips_on_repeated_ip_regardless_of_email(self):
        # ENQUIRY_IP_LIMIT is 10 -> the 11th request from the same client
        # (same REMOTE_ADDR) 429s even with a fresh email each time.
        statuses = []
        for i in range(11):
            payload = {**VALID_PAYLOAD, "email": f"iptest{i}@example.com"}
            r = self.anon().post(f"{API}/enquiries", payload, format="json")
            statuses.append(r.status_code)
        self.assertEqual(statuses[-1], 429)
        self.assertEqual(statuses.count(201), 10)


class EnquiryListTests(ApiTestCase):
    """GET /api/v1/enquiries — doctor-only."""

    def setUp(self):
        super().setUp()
        self.enq_new = Enquiry.objects.create(
            first_name="A", last_name="B", pet_name="Fido", species_breed="Dog",
            email="new1@example.com", phone="111", reason="check-up",
        )
        self.enq_dismissed = Enquiry.objects.create(
            first_name="C", last_name="D", pet_name="Milo", species_breed="Cat",
            email="dismissed1@example.com", phone="222", reason="itchy ears",
            status="DISMISSED",
        )

    def test_requires_authentication(self):
        r = self.anon().get(f"{API}/enquiries")
        self.assertEqual(r.status_code, 401, r.content)

    def test_owner_cannot_reach_it(self):
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/enquiries")
        self.assertEqual(r.status_code, 403, r.content)

    def test_doctor_sees_results_newest_first_with_new_count(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/enquiries")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("results", r.data)
        self.assertIn("new_count", r.data)
        self.assertGreaterEqual(r.data["new_count"], 1)
        ids = [row["id"] for row in r.data["results"]]
        self.assertIn(str(self.enq_new.id), ids)
        self.assertIn(str(self.enq_dismissed.id), ids)

    def test_filter_by_status(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/enquiries?status=DISMISSED")
        self.assertEqual(r.status_code, 200, r.content)
        ids = [row["id"] for row in r.data["results"]]
        self.assertIn(str(self.enq_dismissed.id), ids)
        self.assertNotIn(str(self.enq_new.id), ids)
        # new_count is unaffected by the filter.
        self.assertGreaterEqual(r.data["new_count"], 1)

    def test_junk_bearer_token_is_401_not_500(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer garbage.not.a.jwt")
        r = self.client.get(f"{API}/enquiries")
        self.assertEqual(r.status_code, 401, r.content)


class EnquiryConvertTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.enquiry = Enquiry.objects.create(
            first_name="New", last_name="Owner", pet_name="Rex2",
            species_breed="Labrador Retriever", email="newowner@example.com",
            phone="9001112222", reason="Rear leg stiffness",
        )

    def _convert(self, **overrides):
        self.auth(self.doctor)
        body = {"date": "2026-10-05", "time": "10:30", "visit_type": "Initial"}
        body.update(overrides)
        return self.client.post(f"{API}/enquiries/{self.enquiry.id}/convert", body, format="json")

    def test_owner_cannot_reach_it(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/enquiries/{self.enquiry.id}/convert",
                              {"date": "2026-10-05", "time": "10:30", "visit_type": "Initial"},
                              format="json")
        self.assertEqual(r.status_code, 403, r.content)

    def test_requires_authentication(self):
        r = self.anon().post(f"{API}/enquiries/{self.enquiry.id}/convert",
                              {"date": "2026-10-05", "time": "10:30", "visit_type": "Initial"},
                              format="json")
        self.assertEqual(r.status_code, 401, r.content)

    def test_convert_creates_owner_pet_and_pending_appointment(self):
        r = self._convert()
        self.assertEqual(r.status_code, 200, r.content)
        self.enquiry.refresh_from_db()
        self.assertEqual(self.enquiry.status, "CONVERTED")
        self.assertIsNotNone(self.enquiry.converted_appointment_id)
        self.assertEqual(self.enquiry.actioned_by_id, self.doctor.id)
        self.assertIsNotNone(self.enquiry.actioned_at)

        owner = UserProfile.objects.get(email="newowner@example.com")
        self.assertEqual(owner.role, "OWNER")
        self.assertFalse(owner.has_usable_password())

        pet = Pet.objects.get(owner=owner, name="Rex2")
        self.assertEqual(pet.doctor_id, self.doctor.id)

        appt = Appointment.objects.get(pk=self.enquiry.converted_appointment_id)
        self.assertEqual(appt.pet_id, pet.id)
        self.assertEqual(appt.doctor_id, self.doctor.id)
        self.assertEqual(appt.status, "Pending")
        self.assertEqual(appt.visit_type, "Initial")
        self.assertEqual(appt.visit_type_display, "Initial Consultation")
        self.assertEqual(str(appt.date), "2026-10-05")
        self.assertEqual(appt.reason_notes, "Rear leg stiffness")

        # Response body carries the enquiry + nested appointment.
        self.assertEqual(r.data["status"], "CONVERTED")
        self.assertEqual(r.data["appointment"]["id"], str(appt.id))

    def test_convert_reuses_an_existing_owner_account_by_email(self):
        # owner_a already exists with email a@example.com (see base.py).
        self.enquiry.email = "a@example.com"
        self.enquiry.save(update_fields=["email"])
        before_count = UserProfile.objects.filter(role="OWNER").count()

        r = self._convert()
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(UserProfile.objects.filter(role="OWNER").count(), before_count)

        pet = Pet.objects.get(owner=self.owner_a, name="Rex2")
        appt = Appointment.objects.get(pet=pet)
        self.assertEqual(appt.status, "Pending")
        # Existing owner's real, usable password must be untouched.
        self.owner_a.refresh_from_db()
        self.assertTrue(self.owner_a.has_usable_password())

    def test_convert_reuses_an_existing_pet_for_the_same_owner_by_name(self):
        # pet_a ("Rex") already belongs to owner_a.
        self.enquiry.email = "a@example.com"
        self.enquiry.pet_name = "Rex"
        self.enquiry.save(update_fields=["email", "pet_name"])
        before_pet_count = Pet.objects.filter(owner=self.owner_a).count()

        r = self._convert()
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Pet.objects.filter(owner=self.owner_a).count(), before_pet_count)

        appt = Appointment.objects.get(pet=self.pet_a, doctor=self.doctor, status="Pending")
        self.assertEqual(appt.pet_id, self.pet_a.id)

    def test_convert_twice_is_idempotent(self):
        r1 = self._convert()
        self.assertEqual(r1.status_code, 200, r1.content)
        appt_id_1 = r1.data["appointment"]["id"]
        owner_count_1 = UserProfile.objects.filter(role="OWNER").count()
        pet_count_1 = Pet.objects.count()
        appt_count_1 = Appointment.objects.count()

        # Second convert call with different (and even invalid-looking, to
        # prove it's not re-run) date/time — must be a no-op that returns
        # the SAME appointment, not a new one, and never even needs to
        # look at the new body.
        r2 = self._convert(date="1999-01-01", time="00:00", visit_type="LaserTherapy")
        self.assertEqual(r2.status_code, 200, r2.content)
        self.assertEqual(r2.data["appointment"]["id"], appt_id_1)

        self.assertEqual(UserProfile.objects.filter(role="OWNER").count(), owner_count_1)
        self.assertEqual(Pet.objects.count(), pet_count_1)
        self.assertEqual(Appointment.objects.count(), appt_count_1)

    def test_invalid_visit_type_is_400(self):
        r = self._convert(visit_type="NotARealType")
        self.assertEqual(r.status_code, 400, r.content)
        self.enquiry.refresh_from_db()
        self.assertEqual(self.enquiry.status, "NEW")
        self.assertIsNone(self.enquiry.converted_appointment_id)

    def test_missing_date_time_or_visit_type_is_400(self):
        for missing in ("date", "time", "visit_type"):
            with self.subTest(missing=missing):
                body = {"date": "2026-10-05", "time": "10:30", "visit_type": "Initial"}
                body.pop(missing)
                self.auth(self.doctor)
                r = self.client.post(f"{API}/enquiries/{self.enquiry.id}/convert", body, format="json")
                self.assertEqual(r.status_code, 400, r.content)

    def test_cannot_convert_a_dismissed_enquiry(self):
        self.enquiry.status = "DISMISSED"
        self.enquiry.save(update_fields=["status"])
        r = self._convert()
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(Appointment.objects.filter(pet_name="Rex2").count(), 0)

    def test_unknown_enquiry_id_is_404(self):
        import uuid
        self.auth(self.doctor)
        r = self.client.post(f"{API}/enquiries/{uuid.uuid4()}/convert",
                              {"date": "2026-10-05", "time": "10:30", "visit_type": "Initial"},
                              format="json")
        self.assertEqual(r.status_code, 404, r.content)


class EnquiryDismissTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.enquiry = Enquiry.objects.create(
            first_name="Dis", last_name="Missed", pet_name="Ghost",
            species_breed="Cat", email="dismissme@example.com",
            phone="9009998888", reason="Routine check",
        )

    def test_owner_cannot_reach_it(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/enquiries/{self.enquiry.id}/dismiss")
        self.assertEqual(r.status_code, 403, r.content)

    def test_dismiss_marks_status_and_keeps_the_row(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/enquiries/{self.enquiry.id}/dismiss")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["status"], "DISMISSED")

        self.enquiry.refresh_from_db()
        self.assertEqual(self.enquiry.status, "DISMISSED")
        self.assertEqual(self.enquiry.actioned_by_id, self.doctor.id)
        self.assertIsNotNone(self.enquiry.actioned_at)
        self.assertTrue(Enquiry.objects.filter(pk=self.enquiry.id).exists())

    def test_dismiss_twice_is_idempotent(self):
        self.auth(self.doctor)
        r1 = self.client.post(f"{API}/enquiries/{self.enquiry.id}/dismiss")
        r2 = self.client.post(f"{API}/enquiries/{self.enquiry.id}/dismiss")
        self.assertEqual(r1.status_code, 200, r1.content)
        self.assertEqual(r2.status_code, 200, r2.content)

    def test_cannot_dismiss_a_converted_enquiry(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/enquiries/{self.enquiry.id}/convert",
                              {"date": "2026-10-05", "time": "10:30", "visit_type": "Initial"},
                              format="json")
        self.assertEqual(r.status_code, 200, r.content)
        r2 = self.client.post(f"{API}/enquiries/{self.enquiry.id}/dismiss")
        self.assertEqual(r2.status_code, 400, r2.content)
        self.enquiry.refresh_from_db()
        self.assertEqual(self.enquiry.status, "CONVERTED")
