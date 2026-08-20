"""Shared test fixtures/helpers for the appointments API test-suite.

Traceability: docs/API_CONTRACT.md §3 (endpoints), §4 (authZ), §5 (config);
CLAUDE.md rules 1, 4, 6, 7.
"""

import io
import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone

from rest_framework.test import APITestCase

from appointments.models import (
    UserProfile, Pet, Appointment, DiagnosticReport, TreatmentPlan,
    Invoice, LineItem, Payment, QueryThread, QueryMessage,
)

API = "/api/v1"

# bcrypt at cost 12 is deliberately slow; the suite creates a lot of users so
# swap in a fast hasher for everything except the tests that assert on hashing.
FAST_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class ApiTestCase(APITestCase):
    """Base class: builds two owners, one doctor, and each owner's data island."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media = tempfile.mkdtemp(prefix="qa-media-")
        cls._media_override = override_settings(MEDIA_ROOT=cls._media)
        cls._media_override.enable()

    @classmethod
    def tearDownClass(cls):
        cls._media_override.disable()
        shutil.rmtree(cls._media, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        super().setUp()
        self.doctor = UserProfile.objects.create_user(
            username="drwho", password="D0ctorPass!23", role="DOCTOR",
            first_name="Dana", last_name="Who", phone="9990000001",
            email="dr@example.com",
        )
        self.owner_a = UserProfile.objects.create_user(
            username="ownera", password="OwnerAPass!23", role="OWNER",
            first_name="Alice", last_name="Aye", phone="9991110001",
            email="a@example.com",
        )
        self.owner_b = UserProfile.objects.create_user(
            username="ownerb", password="OwnerBPass!23", role="OWNER",
            first_name="Bob", last_name="Bee", phone="9992220002",
            email="b@example.com",
        )

        self.pet_a = Pet.objects.create(
            owner=self.owner_a, doctor=self.doctor, name="Rex", species="Dog",
            breed="Lab", owner_name="Alice Aye", owner_phone="9991110001",
        )
        self.pet_b = Pet.objects.create(
            owner=self.owner_b, doctor=self.doctor, name="Milo", species="Cat",
            breed="Persian", owner_name="Bob Bee", owner_phone="9992220002",
        )

        today = timezone.localdate()
        self.appt_a = Appointment.objects.create(
            pet=self.pet_a, doctor=self.doctor, pet_name="Rex",
            owner_name="Alice Aye", owner_phone="9991110001",
            date=today, time="10:00", visit_type="Initial",
        )
        self.appt_b = Appointment.objects.create(
            pet=self.pet_b, doctor=self.doctor, pet_name="Milo",
            owner_name="Bob Bee", owner_phone="9992220002",
            date=today, time="11:00", visit_type="Initial",
        )

        self.plan_a = TreatmentPlan.objects.create(
            pet=self.pet_a, therapies=["Hydrotherapy"], frequency="Weekly",
            duration="6 weeks", start_date=today, status="ACTIVE",
        )

        self.invoice_a = self._make_invoice(self.pet_a, self.owner_a, "INV-T-A", 1000)
        self.invoice_b = self._make_invoice(self.pet_b, self.owner_b, "INV-T-B", 2000)

        self.thread_a = QueryThread.objects.create(pet=self.pet_a)
        self.thread_b = QueryThread.objects.create(pet=self.pet_b)

    # --- helpers ---------------------------------------------------------

    def _make_invoice(self, pet, owner, no, amount, tax="0.00"):
        inv = Invoice.objects.create(
            invoice_no=no, pet=pet, owner=owner, tax=Decimal(tax),
        )
        LineItem.objects.create(
            invoice=inv, description="Session", quantity=1,
            unit_price=Decimal(amount), amount=Decimal(amount),
        )
        return inv

    def auth(self, user):
        """Authenticate the shared client as `user` using a real JWT."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        return self.client

    def anon(self):
        self.client.credentials()
        return self.client

    @staticmethod
    def _expired(token):
        """Force a JWT past its expiry.

        NOTE: override_settings(SIMPLE_JWT=...) does NOT work for this —
        SimpleJWT binds `Token.lifetime` as a class attribute at import
        time, so only the `exp` claim itself can be moved.
        """
        from datetime import timedelta
        token.set_exp(lifetime=timedelta(seconds=-1))
        return str(token)


# Real file signatures. QA round 2: the fixtures used to send placeholder
# bytes (b"data") under a real Content-Type, which meant a header-only
# allow-list looked sufficient and blocked the engineer from adding
# magic-byte sniffing. Content-Type is 100% client-controlled, so validating
# it alone is a UX guard, not a security control — the fixtures now carry
# genuine signatures so that sniffing can be enforced.
MAGIC = {
    "image/png": b"\x89PNG\r\n\x1a\n" + b"\x00" * 8,
    "image/jpeg": b"\xff\xd8\xff\xe0" + b"\x00" * 8,
    "image/gif": b"GIF89a" + b"\x00" * 8,
    "image/webp": b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 8,
    "application/pdf": b"%PDF-1.4\n" + b"\x00" * 8,
    "application/dicom": b"\x00" * 128 + b"DICM",
}

# A real Windows PE header — used to prove that a hostile payload wearing an
# `image/png` Content-Type is still rejected.
PE_EXECUTABLE = b"MZ\x90\x00\x03\x00\x00\x00" + b"\x00" * 32


def upload(name, content=None, content_type="image/png", pad_to=None):
    """Build an uploaded file.

    `content=None` (the default) emits the genuine magic bytes for
    `content_type`. `pad_to` grows the payload to an exact byte length while
    keeping the real signature intact, for size-boundary tests.
    """
    if content is None:
        content = MAGIC.get(content_type, b"x")
    if pad_to is not None:
        content = (content + b"\x00" * pad_to)[:pad_to] if pad_to >= len(content) \
            else content[:pad_to]
    return SimpleUploadedFile(name, content, content_type=content_type)
