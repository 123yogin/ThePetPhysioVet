"""Smoke / functional tests for the whole ThePetPhysioVet app.

Run with:  python manage.py test
Covers: authentication, the email-or-username backend, the vet_required
guard, patient (Pet) management, the appointment lifecycle, per-doctor
access control, and the WhatsApp/SMS share flow.
"""

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from .models import Appointment, DoctorProfile, Pet

PASSWORD = "Rehab!2026xy"


def make_doctor(username, email=None, clinic="Clinic"):
    """Create a doctor user + DoctorProfile directly (bypassing signup)."""
    user = User.objects.create_user(
        username=username,
        email=email or f"{username}@vet.test",
        password=PASSWORD,
    )
    DoctorProfile.objects.create(user=user, clinic_name=clinic, clinic_phone="+911112223334")
    return user


def make_pet(doctor, name="Bruno", owner="Asha", phone="+919876543210"):
    return Pet.objects.create(
        doctor=doctor, name=name, pet_type="Dog", owner_name=owner, owner_phone=phone
    )


# ---------------------------------------------------------------------------
# Authentication & profile
# ---------------------------------------------------------------------------
class AuthTests(TestCase):
    def test_signup_creates_user_and_profile(self):
        resp = self.client.post(reverse("signup"), {
            "username": "drjane",
            "email": "jane@vet.test",
            "first_name": "Jane",
            "last_name": "Doe",
            "password1": PASSWORD,
            "password2": PASSWORD,
            "clinic_name": "Happy Paws",
            "clinic_address": "12 MG Road",
        })
        self.assertRedirects(resp, reverse("dashboard"))
        user = User.objects.get(username="drjane")
        self.assertTrue(hasattr(user, "doctor_profile"))
        self.assertEqual(user.doctor_profile.clinic_name, "Happy Paws")

    def test_signup_rejects_duplicate_email(self):
        make_doctor("existing", email="dup@vet.test")
        resp = self.client.post(reverse("signup"), {
            "username": "newuser",
            "email": "dup@vet.test",
            "first_name": "New",
            "password1": PASSWORD,
            "password2": PASSWORD,
        })
        self.assertEqual(resp.status_code, 200)  # re-rendered with error
        self.assertFalse(User.objects.filter(username="newuser").exists())

    def test_login_with_username(self):
        make_doctor("drbob")
        resp = self.client.post(reverse("login"), {"username": "drbob", "password": PASSWORD})
        self.assertRedirects(resp, reverse("dashboard"))

    def test_login_with_email(self):
        make_doctor("drbob", email="bob@vet.test")
        resp = self.client.post(reverse("login"), {"username": "bob@vet.test", "password": PASSWORD})
        self.assertRedirects(resp, reverse("dashboard"))

    def test_login_invalid_credentials(self):
        make_doctor("drbob")
        resp = self.client.post(reverse("login"), {"username": "drbob", "password": "wrong"})
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.wsgi_request.user.is_authenticated)

    def test_logout(self):
        make_doctor("drbob")
        self.client.login(username="drbob", password=PASSWORD)
        resp = self.client.get(reverse("logout"))
        self.assertRedirects(resp, reverse("login"))

    def test_home_redirects_to_login_when_anonymous(self):
        self.assertRedirects(self.client.get(reverse("home")), reverse("login"))


# ---------------------------------------------------------------------------
# vet_required guard / access
# ---------------------------------------------------------------------------
class AccessGuardTests(TestCase):
    def test_protected_pages_require_login(self):
        for name in ["dashboard", "patient_list", "patient_create", "create_appointment", "appointment_list"]:
            resp = self.client.get(reverse(name))
            self.assertEqual(resp.status_code, 302, name)
            self.assertIn(reverse("login"), resp.url, name)

    def test_non_doctor_user_is_rejected(self):
        # A plain user with no DoctorProfile and not superuser.
        User.objects.create_user(username="plain", password=PASSWORD)
        self.client.login(username="plain", password=PASSWORD)
        resp = self.client.get(reverse("dashboard"))
        self.assertRedirects(resp, reverse("login"))

    def test_superuser_gets_profile_autocreated(self):
        User.objects.create_superuser(username="admin", email="a@a.com", password=PASSWORD)
        self.client.login(username="admin", password=PASSWORD)
        resp = self.client.get(reverse("dashboard"))
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(DoctorProfile.objects.filter(user__username="admin").exists())


# ---------------------------------------------------------------------------
# Patients (Pet)
# ---------------------------------------------------------------------------
class PatientTests(TestCase):
    def setUp(self):
        self.doc = make_doctor("drpet")
        self.client.login(username="drpet", password=PASSWORD)

    def test_add_patient(self):
        resp = self.client.post(reverse("patient_create"), {
            "name": "Milo", "pet_type": "Cat",
            "owner_name": "Ravi", "owner_phone": "+919000000000", "notes": "",
        })
        self.assertRedirects(resp, reverse("patient_list"))
        pet = Pet.objects.get(name="Milo")
        self.assertEqual(pet.doctor, self.doc)

    def test_patient_list_shows_only_own(self):
        make_pet(self.doc, name="Mine")
        other = make_doctor("drother")
        make_pet(other, name="Theirs")
        resp = self.client.get(reverse("patient_list"))
        self.assertContains(resp, "Mine")
        self.assertNotContains(resp, "Theirs")

    def test_patient_search(self):
        make_pet(self.doc, name="Rex", owner="Sara")
        make_pet(self.doc, name="Fluffy", owner="Tom")
        resp = self.client.get(reverse("patient_list"), {"q": "rex"})
        self.assertContains(resp, "Rex")
        self.assertNotContains(resp, "Fluffy")


# ---------------------------------------------------------------------------
# Appointments
# ---------------------------------------------------------------------------
class AppointmentTests(TestCase):
    def setUp(self):
        self.doc = make_doctor("drapp")
        self.client.login(username="drapp", password=PASSWORD)
        self.pet = make_pet(self.doc)

    def _book(self, date=None, time="10:30"):
        return self.client.post(reverse("create_appointment"), {
            "pet": self.pet.id,
            "visit_type": Appointment.VISIT_CLINIC,
            "date": date or timezone.localdate().isoformat(),
            "time": time,
            "reason_notes": "Limping",
        })

    def test_create_redirects_to_add_patient_when_no_pets(self):
        Pet.objects.all().delete()
        resp = self.client.get(reverse("create_appointment"))
        self.assertRedirects(resp, reverse("patient_create"))

    def test_book_appointment(self):
        resp = self._book()
        appt = Appointment.objects.get(pet=self.pet)
        self.assertRedirects(resp, reverse("share_appointment", args=[appt.pk]))
        self.assertEqual(appt.doctor, self.doc)
        self.assertEqual(appt.status, Appointment.STATUS_PENDING)

    def test_cannot_book_for_another_doctors_pet(self):
        other_pet = make_pet(make_doctor("drx"), name="NotYours")
        resp = self.client.post(reverse("create_appointment"), {
            "pet": other_pet.id, "visit_type": "Clinic",
            "date": timezone.localdate().isoformat(), "time": "09:00", "reason_notes": "",
        })
        self.assertEqual(resp.status_code, 200)  # form invalid, re-rendered
        self.assertFalse(Appointment.objects.filter(pet=other_pet).exists())

    def test_proxy_properties(self):
        self._book()
        appt = Appointment.objects.get(pet=self.pet)
        self.assertEqual(appt.pet_name, self.pet.name)
        self.assertEqual(appt.owner_name, self.pet.owner_name)
        self.assertEqual(appt.owner_phone, self.pet.owner_phone)
        self.assertEqual(appt.pet_type, self.pet.pet_type)

    def test_appointment_list_and_filters(self):
        self._book()
        self.assertContains(self.client.get(reverse("appointment_list")), "Bruno")
        self.assertContains(self.client.get(reverse("appointment_list"), {"pet": "bru"}), "Bruno")
        self.assertContains(self.client.get(reverse("appointment_list"), {"owner": "ash"}), "Bruno")

    def test_dashboard_today_and_completed_count(self):
        self._book()  # today, pending -> shows on dashboard
        resp = self.client.get(reverse("dashboard"))
        self.assertContains(resp, "Bruno")
        self.assertEqual(resp.context["completed_count"], 0)

        appt = Appointment.objects.get(pet=self.pet)
        self.client.post(reverse("mark_complete", args=[appt.pk]), {"next": "dashboard"})
        appt.refresh_from_db()
        self.assertEqual(appt.status, Appointment.STATUS_COMPLETED)
        resp2 = self.client.get(reverse("dashboard"))
        self.assertNotContains(resp2, "Bruno")  # completed -> excluded
        self.assertEqual(resp2.context["completed_count"], 1)

    def test_mark_complete_requires_post(self):
        self._book()
        appt = Appointment.objects.get(pet=self.pet)
        self.assertEqual(self.client.get(reverse("mark_complete", args=[appt.pk])).status_code, 405)

    def test_reschedule(self):
        self._book()
        appt = Appointment.objects.get(pet=self.pet)
        resp = self.client.post(reverse("reschedule_appointment", args=[appt.pk]),
                                {"date": "2026-12-25", "time": "15:45"})
        self.assertRedirects(resp, reverse("share_appointment", args=[appt.pk]))
        appt.refresh_from_db()
        self.assertEqual(appt.status, Appointment.STATUS_RESCHEDULED)
        self.assertEqual(appt.time.strftime("%H:%M"), "15:45")

    def test_cannot_access_another_doctors_appointment(self):
        self._book()
        appt = Appointment.objects.get(pet=self.pet)
        make_doctor("intruder")
        self.client.logout()
        self.client.login(username="intruder", password=PASSWORD)
        self.assertEqual(self.client.get(reverse("share_appointment", args=[appt.pk])).status_code, 404)
        self.assertEqual(self.client.get(reverse("reschedule_appointment", args=[appt.pk])).status_code, 404)


# ---------------------------------------------------------------------------
# Share flow
# ---------------------------------------------------------------------------
class ShareTests(TestCase):
    def setUp(self):
        self.doc = make_doctor("drshare")
        self.client.login(username="drshare", password=PASSWORD)
        self.pet = make_pet(self.doc)
        self.appt = Appointment.objects.create(
            doctor=self.doc, pet=self.pet, visit_type=Appointment.VISIT_CLINIC,
            date=timezone.localdate(), time="11:00",
        )

    def test_share_page_builds_links(self):
        resp = self.client.get(reverse("share_appointment", args=[self.appt.pk]))
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.context["whatsapp_url"].startswith("https://wa.me/"))
        self.assertIn("919876543210", resp.context["whatsapp_url"])  # owner phone digits
        self.assertTrue(resp.context["sms_url"].startswith("sms:"))
