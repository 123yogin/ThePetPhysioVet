"""Tests for the JSON API at /api/v1 (DRF, session auth).

Run with:  ./.venv/bin/python manage.py test appointments.test_api

Covers auth (login/logout/me/signup), dashboard stats, the appointment
lifecycle (list/filter/create/detail/reschedule/complete/share), pets
(list/search/create), per-doctor ownership scoping, and the anonymous-401
behaviour that drives the SPA's RequireAuth guard.
"""

import datetime
import shutil
import tempfile
from io import BytesIO

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient


def _png_bytes(size=(32, 32), color=(200, 120, 60)):
    """Return the bytes of a small in-memory PNG for photo-upload tests."""
    buf = BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


# Photo-upload tests write into a throwaway MEDIA_ROOT so the real media/ dir is
# never touched; the tree is removed in PetAPITests.tearDownClass.
_PET_MEDIA = tempfile.mkdtemp(prefix="ppv-pet-media-")

from .models import Appointment, DoctorProfile, Pet
from .serializers import AppointmentSerializer
from .tests import PASSWORD, make_doctor, make_pet


class AuthAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_login_success_returns_doctor(self):
        make_doctor("drbob", email="bob@vet.test", clinic="Happy Paws")
        resp = self.client.post(
            "/api/v1/auth/login", {"username": "drbob", "password": PASSWORD}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["username"], "drbob")
        self.assertEqual(resp.data["clinic_name"], "Happy Paws")
        # session established -> me now works
        self.assertEqual(self.client.get("/api/v1/auth/me").status_code, 200)

    def test_login_with_email(self):
        make_doctor("drbob", email="bob@vet.test")
        resp = self.client.post(
            "/api/v1/auth/login", {"username": "bob@vet.test", "password": PASSWORD}, format="json"
        )
        self.assertEqual(resp.status_code, 200)

    def test_login_bad_credentials_returns_401_non_field_errors(self):
        # Auth-hardening (AC-01): invalid credentials now return 401 (was 400).
        make_doctor("drbob")
        resp = self.client.post(
            "/api/v1/auth/login", {"username": "drbob", "password": "nope"}, format="json"
        )
        self.assertEqual(resp.status_code, 401)
        self.assertIn("non_field_errors", resp.data)

    def test_login_success_returns_jwt_pair(self):
        # Auth-hardening: a valid login returns access + refresh tokens.
        make_doctor("drbob")
        resp = self.client.post(
            "/api/v1/auth/login", {"username": "drbob", "password": PASSWORD}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data.get("access"))
        self.assertTrue(resp.data.get("refresh"))

    def test_login_sets_csrftoken_cookie(self):
        make_doctor("drbob")
        resp = self.client.post(
            "/api/v1/auth/login", {"username": "drbob", "password": PASSWORD}, format="json"
        )
        self.assertIn("csrftoken", resp.cookies)

    def test_me_anonymous_returns_401(self):
        self.assertEqual(self.client.get("/api/v1/auth/me").status_code, 401)

    def test_me_anonymous_401_still_plants_csrftoken_cookie(self):
        """ensure_csrf_cookie on MeView.dispatch must plant the csrftoken cookie
        even when the request is anonymous (401), so the SPA's very first
        login/signup POST already carries a valid X-CSRFToken."""
        resp = self.client.get("/api/v1/auth/me")
        self.assertEqual(resp.status_code, 401)
        self.assertIn("csrftoken", resp.cookies)
        self.assertTrue(resp.cookies["csrftoken"].value)

    def test_me_authenticated_plants_csrftoken_cookie(self):
        make_doctor("drbob")
        self.client.login(username="drbob", password=PASSWORD)
        resp = self.client.get("/api/v1/auth/me")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("csrftoken", resp.cookies)

    def test_me_authenticated(self):
        make_doctor("drbob", email="bob@vet.test")
        self.client.login(username="drbob", password=PASSWORD)
        resp = self.client.get("/api/v1/auth/me")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["email"], "bob@vet.test")

    def test_signup_creates_user_profile_and_logs_in(self):
        resp = self.client.post(
            "/api/v1/auth/signup",
            {
                "username": "drjane",
                "email": "jane@vet.test",
                "first_name": "Jane",
                "last_name": "Doe",
                "password1": PASSWORD,
                "password2": PASSWORD,
                "clinic_name": "Rehab Room",
                "clinic_address": "12 MG Road",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["username"], "drjane")
        user = User.objects.get(username="drjane")
        self.assertTrue(DoctorProfile.objects.filter(user=user).exists())
        self.assertEqual(user.doctor_profile.clinic_name, "Rehab Room")
        # logged in
        self.assertEqual(self.client.get("/api/v1/auth/me").status_code, 200)

    def test_signup_duplicate_email_returns_409(self):
        # Auth-hardening: a duplicate email is a conflict, now 409 (was 400).
        make_doctor("existing", email="dup@vet.test")
        resp = self.client.post(
            "/api/v1/auth/signup",
            {
                "username": "newuser",
                "email": "dup@vet.test",
                "first_name": "New",
                "password1": PASSWORD,
                "password2": PASSWORD,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 409)
        self.assertIn("email", resp.data)
        self.assertFalse(User.objects.filter(username="newuser").exists())

    def test_signup_password_mismatch_returns_400(self):
        resp = self.client.post(
            "/api/v1/auth/signup",
            {
                "username": "mismatch",
                "email": "m@vet.test",
                "first_name": "M",
                "password1": PASSWORD,
                "password2": "different-XZ-99",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("password2", resp.data)

    def test_logout_clears_session(self):
        make_doctor("drbob")
        self.client.login(username="drbob", password=PASSWORD)
        self.assertEqual(self.client.post("/api/v1/auth/logout").status_code, 204)
        self.assertEqual(self.client.get("/api/v1/auth/me").status_code, 401)


class DashboardAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.doc = make_doctor("drdash")
        self.client.login(username="drdash", password=PASSWORD)
        self.pet = make_pet(self.doc)

    def test_stats_shape_and_completed_exclusion(self):
        today = timezone.localdate()
        pending = Appointment.objects.create(
            doctor=self.doc, pet=self.pet, visit_type=Appointment.VISIT_CLINIC,
            date=today, time="10:30",
        )
        Appointment.objects.create(
            doctor=self.doc, pet=self.pet, visit_type=Appointment.VISIT_CLINIC,
            date=today, time="09:00", status=Appointment.STATUS_COMPLETED,
        )
        resp = self.client.get("/api/v1/dashboard/stats")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["today"], today.isoformat())
        self.assertIn(",", resp.data["today_display"])  # e.g. "Wednesday, July 22, 2026"
        ids = [a["id"] for a in resp.data["today_appointments"]]
        self.assertEqual(ids, [pending.id])  # completed excluded
        self.assertEqual(resp.data["completed_count"], 1)
        row = resp.data["today_appointments"][0]
        for key in ("pet_name", "owner_name", "time", "pet_type", "visit_type_display", "status"):
            self.assertIn(key, row)


class AppointmentAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.doc = make_doctor("drapp")
        self.client.login(username="drapp", password=PASSWORD)
        self.pet = make_pet(self.doc)

    def _create(self, time="10:30"):
        return self.client.post(
            "/api/v1/appointments",
            {
                "pet": self.pet.id,
                "visit_type": Appointment.VISIT_CLINIC,
                "date": timezone.localdate().isoformat(),
                "time": time,
                "reason_notes": "Limping",
            },
            format="json",
        )

    def test_create_success(self):
        resp = self._create()
        self.assertEqual(resp.status_code, 201)
        appt = Appointment.objects.get(pet=self.pet)
        self.assertEqual(appt.doctor, self.doc)
        self.assertEqual(appt.status, Appointment.STATUS_PENDING)
        self.assertEqual(resp.data["visit_type_display"], "Clinic")

    def test_create_invalid_returns_400_with_field_errors(self):
        # Missing required pet/date/time -> 400 with per-field keys matching the
        # template form field names (AppointmentForm).
        resp = self.client.post(
            "/api/v1/appointments",
            {"visit_type": Appointment.VISIT_CLINIC, "reason_notes": "x"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        for key in ("pet", "date", "time"):
            self.assertIn(key, resp.data)

    def test_serializer_emits_iso_date_and_hms_time(self):
        # US-INFRA-01: raw `date` is ISO YYYY-MM-DD, `time` is HH:MM:SS so the
        # frontend normalize layer can derive both the display strings and the
        # date_iso/time_24h form-prefill values.
        appt = Appointment.objects.create(
            doctor=self.doc, pet=self.pet, visit_type=Appointment.VISIT_CLINIC,
            date=datetime.date(2026, 7, 22), time=datetime.time(9, 30),
        )
        data = AppointmentSerializer(appt).data
        self.assertEqual(data["date"], "2026-07-22")
        self.assertEqual(data["time"], "09:30:00")
        # And the same through the HTTP detail endpoint.
        http = self.client.get(f"/api/v1/appointments/{appt.id}").data
        self.assertEqual(http["date"], "2026-07-22")
        self.assertEqual(http["time"], "09:30:00")

    def test_reschedule_invalid_returns_400_with_field_errors(self):
        self._create()
        appt = Appointment.objects.get(pet=self.pet)
        resp = self.client.post(
            f"/api/v1/appointments/{appt.id}/reschedule",
            {"date": "not-a-date", "time": ""},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("date", resp.data)
        self.assertIn("time", resp.data)
        appt.refresh_from_db()
        self.assertEqual(appt.status, Appointment.STATUS_PENDING)  # unchanged

    def test_create_for_another_doctors_pet_rejected(self):
        other_pet = make_pet(make_doctor("drx"), name="NotYours")
        resp = self.client.post(
            "/api/v1/appointments",
            {
                "pet": other_pet.id,
                "visit_type": Appointment.VISIT_CLINIC,
                "date": timezone.localdate().isoformat(),
                "time": "09:00",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("pet", resp.data)
        self.assertFalse(Appointment.objects.filter(pet=other_pet).exists())

    def test_list_scoped_and_filtered(self):
        self._create()
        other = make_doctor("drother")
        make_pet(other, name="Theirs", owner="Zed")
        Appointment.objects.create(
            doctor=other, pet=Pet.objects.get(name="Theirs"),
            visit_type=Appointment.VISIT_CLINIC, date=timezone.localdate(), time="12:00",
        )
        data = self.client.get("/api/v1/appointments").data
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["pet_name"], "Bruno")
        # filters
        self.assertEqual(len(self.client.get("/api/v1/appointments", {"pet": "bru"}).data), 1)
        self.assertEqual(len(self.client.get("/api/v1/appointments", {"owner": "ash"}).data), 1)
        self.assertEqual(len(self.client.get("/api/v1/appointments", {"pet": "zzz"}).data), 0)

    def test_detail_own_and_other_404(self):
        self._create()
        appt = Appointment.objects.get(pet=self.pet)
        self.assertEqual(self.client.get(f"/api/v1/appointments/{appt.id}").status_code, 200)
        # other doctor cannot read it
        self.client.logout()
        make_doctor("intruder")
        self.client.login(username="intruder", password=PASSWORD)
        self.assertEqual(self.client.get(f"/api/v1/appointments/{appt.id}").status_code, 404)

    def test_reschedule_returns_share_payload(self):
        self._create()
        appt = Appointment.objects.get(pet=self.pet)
        resp = self.client.post(
            f"/api/v1/appointments/{appt.id}/reschedule",
            {"date": "2026-12-25", "time": "15:45"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], Appointment.STATUS_RESCHEDULED)
        self.assertEqual(resp.data["time"], "15:45:00")
        self.assertIn("share", resp.data)
        self.assertTrue(resp.data["share"]["whatsapp_url"].startswith("https://wa.me/"))

    def test_complete(self):
        self._create()
        appt = Appointment.objects.get(pet=self.pet)
        resp = self.client.post(f"/api/v1/appointments/{appt.id}/complete")
        self.assertEqual(resp.status_code, 200)
        appt.refresh_from_db()
        self.assertEqual(appt.status, Appointment.STATUS_COMPLETED)

    def test_share_payload(self):
        self._create()
        appt = Appointment.objects.get(pet=self.pet)
        resp = self.client.get(f"/api/v1/appointments/{appt.id}/share")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("919876543210", resp.data["whatsapp_url"])
        self.assertTrue(resp.data["sms_url"].startswith("sms:"))
        self.assertEqual(resp.data["owner_name"], "Asha")

    def test_other_doctor_cannot_mutate(self):
        self._create()
        appt = Appointment.objects.get(pet=self.pet)
        self.client.logout()
        make_doctor("intruder")
        self.client.login(username="intruder", password=PASSWORD)
        self.assertEqual(
            self.client.post(f"/api/v1/appointments/{appt.id}/complete").status_code, 404
        )
        self.assertEqual(
            self.client.post(
                f"/api/v1/appointments/{appt.id}/reschedule",
                {"date": "2026-12-25", "time": "10:00"}, format="json",
            ).status_code,
            404,
        )
        self.assertEqual(self.client.get(f"/api/v1/appointments/{appt.id}/share").status_code, 404)


@override_settings(MEDIA_ROOT=_PET_MEDIA)
class PetAPITests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_PET_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        self.doc = make_doctor("drpet")
        self.client.login(username="drpet", password=PASSWORD)

    def test_create(self):
        resp = self.client.post(
            "/api/v1/pets",
            {
                "name": "Milo", "pet_type": "Cat",
                "owner_name": "Ravi", "owner_phone": "+919000000000", "notes": "",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        pet = Pet.objects.get(name="Milo")
        self.assertEqual(pet.doctor, self.doc)

    def test_create_invalid_returns_400_with_field_errors(self):
        # Blank required fields -> 400 with per-field keys matching PetForm.
        # Per the Sprint-8 contract only name + owner_name/phone are required
        # (species/pet_type/breed/... are optional clinical fields).
        resp = self.client.post(
            "/api/v1/pets",
            {"name": "", "owner_name": "", "owner_phone": ""},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        for key in ("name", "owner_name", "owner_phone"):
            self.assertIn(key, resp.data)
        # pet_type is no longer required, so it must NOT appear as an error.
        self.assertNotIn("pet_type", resp.data)
        self.assertFalse(Pet.objects.filter(doctor=self.doc).exists())

    def test_list_scoped_and_search(self):
        make_pet(self.doc, name="Rex", owner="Sara")
        make_pet(self.doc, name="Fluffy", owner="Tom")
        make_pet(make_doctor("drother"), name="Theirs")
        data = self.client.get("/api/v1/pets").data
        names = {p["name"] for p in data}
        self.assertEqual(names, {"Rex", "Fluffy"})
        # search by pet name
        self.assertEqual([p["name"] for p in self.client.get("/api/v1/pets", {"q": "rex"}).data], ["Rex"])
        # search by owner name
        self.assertEqual([p["name"] for p in self.client.get("/api/v1/pets", {"q": "tom"}).data], ["Fluffy"])

    def test_json_create_no_photo_still_201_and_photo_null(self):
        # BE-1: the existing JSON create path must keep working (no photo) and
        # GET detail returns photo=None when unset.
        resp = self.client.post(
            "/api/v1/pets",
            {"name": "Coco", "pet_type": "Dog", "owner_name": "Neha",
             "owner_phone": "+919000000001"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertIsNone(resp.data["photo"])
        pet = Pet.objects.get(name="Coco")
        self.assertFalse(pet.photo)
        detail = self.client.get(f"/api/v1/pets/{pet.id}")
        self.assertEqual(detail.status_code, 200)
        self.assertIsNone(detail.data["photo"])

    def test_multipart_create_with_photo_sets_photo_and_absolute_url(self):
        # BE-1: multipart create with a 'photo' file -> 201, pet.photo set, and
        # GET detail returns photo as a resolvable /media URL (absolute).
        upload = SimpleUploadedFile("milo.png", _png_bytes(), content_type="image/png")
        resp = self.client.post(
            "/api/v1/pets",
            {"name": "Milo", "pet_type": "Cat", "owner_name": "Ravi",
             "owner_phone": "+919000000002", "photo": upload},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        pet = Pet.objects.get(name="Milo")
        self.assertTrue(pet.photo)
        self.assertIn("/media/", resp.data["photo"])
        detail = self.client.get(f"/api/v1/pets/{pet.id}")
        self.assertEqual(detail.status_code, 200)
        self.assertIn("/media/", detail.data["photo"])
        self.assertTrue(detail.data["photo"].startswith("http"))

    def test_photo_over_800px_is_resized_and_small_photo_unchanged(self):
        # AC-02 (US-PET-01): a photo larger than 800x800 is resized server-side
        # so that max(width, height) <= 800, aspect ratio preserved; a photo
        # already within 800x800 is stored unchanged.
        big = SimpleUploadedFile(
            "big.png", _png_bytes(size=(1000, 1200)), content_type="image/png"
        )
        resp = self.client.post(
            "/api/v1/pets",
            {"name": "Jumbo", "pet_type": "Dog", "owner_name": "Sam",
             "owner_phone": "+919000000003", "photo": big},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        pet = Pet.objects.get(name="Jumbo")
        with Image.open(pet.photo.path) as img:
            self.assertLessEqual(max(img.width, img.height), 800)
            # longer side scaled down to the 800 cap, aspect ratio preserved
            self.assertEqual(img.height, 800)
            self.assertAlmostEqual(img.width / img.height, 1000 / 1200, places=2)

        small = SimpleUploadedFile(
            "small.png", _png_bytes(size=(400, 300)), content_type="image/png"
        )
        resp2 = self.client.post(
            "/api/v1/pets",
            {"name": "Tiny", "pet_type": "Cat", "owner_name": "Mia",
             "owner_phone": "+919000000004", "photo": small},
            format="multipart",
        )
        self.assertEqual(resp2.status_code, 201, resp2.data)
        tiny = Pet.objects.get(name="Tiny")
        with Image.open(tiny.photo.path) as img:
            self.assertEqual((img.width, img.height), (400, 300))  # untouched


class AuthzAPITests(TestCase):
    """Anonymous access is rejected with 401 across protected endpoints."""

    def setUp(self):
        self.client = APIClient()

    def test_protected_endpoints_require_auth(self):
        for method, url in [
            ("get", "/api/v1/dashboard/stats"),
            ("get", "/api/v1/appointments"),
            ("post", "/api/v1/appointments"),
            ("get", "/api/v1/pets"),
            ("post", "/api/v1/pets"),
        ]:
            resp = getattr(self.client, method)(url, {}, format="json") if method == "post" \
                else getattr(self.client, method)(url)
            self.assertEqual(resp.status_code, 401, f"{method} {url}")

    def test_non_doctor_user_forbidden(self):
        User.objects.create_user(username="plain", password=PASSWORD)
        self.client.login(username="plain", password=PASSWORD)
        # authenticated but no DoctorProfile -> IsVet denies (403)
        self.assertEqual(self.client.get("/api/v1/dashboard/stats").status_code, 403)


@override_settings(PARITY_TODAY=datetime.date(2026, 7, 22))
class SeededParityAPITests(TestCase):
    """The live API over the canonical seed_parity dataset returns exactly the
    rows/order/text the Playwright parity golden expects (PARITY_TODAY pinned to
    2026-07-22, the seed's anchor)."""

    def setUp(self):
        call_command("seed_parity")
        self.client = APIClient()
        self.assertTrue(self.client.login(username="drmeadow", password="MeadowPhysio!2026"))

    def test_dashboard_matches_seed(self):
        resp = self.client.get("/api/v1/dashboard/stats")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["today"], "2026-07-22")
        # 2026-07-22 is a Wednesday -> Django `l, F j, Y`.
        self.assertEqual(resp.data["today_display"], "Wednesday, July 22, 2026")
        appts = resp.data["today_appointments"]
        # 3 non-completed visits today in (time, id) order.
        self.assertEqual([a["pet_name"] for a in appts], ["Biscuit", "Mittens", "Rocky"])
        self.assertEqual([a["time"] for a in appts], ["09:30:00", "11:00:00", "14:15:00"])
        self.assertEqual([a["id"] for a in appts], [1, 2, 3])
        self.assertEqual(resp.data["completed_count"], 1)

    def test_appointments_list_order_matches_seed(self):
        data = self.client.get("/api/v1/appointments").data
        # order_by("-date", "-time") -> id 3, 2, 1, then the Jul-20 completed id 4.
        self.assertEqual([a["id"] for a in data], [3, 2, 1, 4])

    def test_complete_drops_visit_and_bumps_count(self):
        # Completing a pending "today" visit removes it from today's list and
        # increments completed_count (US-APPT-04 / US-DASH-01).
        before = self.client.get("/api/v1/dashboard/stats").data
        self.assertEqual(before["completed_count"], 1)
        self.assertIn(1, [a["id"] for a in before["today_appointments"]])
        resp = self.client.post("/api/v1/appointments/1/complete")
        self.assertEqual(resp.status_code, 200)
        after = self.client.get("/api/v1/dashboard/stats").data
        self.assertEqual(after["completed_count"], 2)
        self.assertNotIn(1, [a["id"] for a in after["today_appointments"]])

    def test_share_for_seeded_id1(self):
        resp = self.client.get("/api/v1/appointments/1/share")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["pet_name"], "Biscuit")
        self.assertEqual(resp.data["owner_name"], "Priya Sharma")
        # Biscuit's owner phone "+91 98765 43210" -> digits only in the wa.me link.
        self.assertIn("919876543210", resp.data["whatsapp_url"])
        self.assertTrue(resp.data["sms_url"].startswith("sms:"))

    def test_reschedule_id1_flips_status_and_returns_share(self):
        resp = self.client.post(
            "/api/v1/appointments/1/reschedule",
            {"date": "2026-07-24", "time": "10:00"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], Appointment.STATUS_RESCHEDULED)
        self.assertEqual(resp.data["date"], "2026-07-24")
        self.assertEqual(resp.data["time"], "10:00:00")
        self.assertIn("share", resp.data)
        self.assertIn("919876543210", resp.data["share"]["whatsapp_url"])
