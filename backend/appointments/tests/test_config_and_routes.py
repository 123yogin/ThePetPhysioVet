"""Configuration fail-fast (API_CONTRACT.md §5) and route-existence smoke test.

The route smoke test is the cheap deterministic check for cross-boundary
contract drift: every path the SPA calls must resolve (no 404-by-URLconf).
"""

import os
import re
import subprocess
import sys
from pathlib import Path

from django.test import SimpleTestCase, override_settings
from django.urls import Resolver404, resolve

from .base import API, ApiTestCase

REPO = Path(__file__).resolve().parents[3]
FRONTEND_SRC = REPO / "frontend" / "src"


class SecretKeyFailFastTests(SimpleTestCase):
    def test_no_hardcoded_secret_key_used_when_debug_false(self):
        """DEBUG=False + no SECRET_KEY must raise ImproperlyConfigured."""
        env = {k: v for k, v in os.environ.items()
               if k not in ("SECRET_KEY", "DEBUG")}
        env["DEBUG"] = "false"
        env["PYTHONPATH"] = str(REPO / "backend")
        code = (
            "import django, os;"
            "os.environ.setdefault('DJANGO_SETTINGS_MODULE','petphysio.settings');"
            "django.setup()"
        )
        proc = subprocess.run([sys.executable, "-c", code], env=env,
                              capture_output=True, text=True,
                              cwd=str(REPO / "backend"))
        self.assertNotEqual(proc.returncode, 0,
                            "settings imported cleanly with DEBUG=False and no "
                            "SECRET_KEY — fail-fast is not working")
        self.assertIn("ImproperlyConfigured", proc.stderr)

    def test_settings_source_contains_no_real_secret(self):
        src = (REPO / "backend" / "petphysio" / "settings.py").read_text()
        for line in src.splitlines():
            if "SECRET_KEY" in line and "=" in line and "os.environ" not in line:
                if '"' in line or "'" in line:
                    value = re.findall(r'["\']([^"\']*)["\']', line)
                    for v in value:
                        self.assertTrue(
                            "insecure" in v or "local-dev" in v or len(v) < 8,
                            f"possible baked-in secret in settings.py: {line!r}")

    @override_settings(DEBUG=False)
    def test_debug_defaults_to_false(self):
        # The default is asserted at the parser level rather than at runtime,
        # because the test runner forces DEBUG=False anyway.
        from petphysio.settings import _env_bool
        self.assertFalse(_env_bool("A_NAME_THAT_DOES_NOT_EXIST"))


class SpaRouteSmokeTests(ApiTestCase):
    """Every `/api/v1/...` path the SPA references must resolve in the URLconf."""

    PATH_RE = re.compile(r"http[^(]*\(\s*[`'\"](/[^`'\"?]*)")

    def _spa_paths(self):
        paths = set()
        for f in FRONTEND_SRC.rglob("*.ts*"):
            for m in self.PATH_RE.finditer(f.read_text()):
                raw = m.group(1)
                # normalise template holes: `/pets/${id}` -> `/pets/1`, but a
                # hole not preceded by `/` is an optional query string
                # (`/pets${query}`) and collapses to nothing.
                concrete = re.sub(r"(?<=/)\$\{[^}]+\}", "1", raw)
                concrete = re.sub(r"\$\{[^}]+\}", "", concrete)
                if concrete.startswith("/"):
                    paths.add((concrete, f"{f.relative_to(REPO)}"))
        return sorted(paths)

    def test_every_spa_path_resolves(self):
        unresolved = []
        checked = 0
        for path, origin in self._spa_paths():
            checked += 1
            try:
                resolve(f"{API}{path}")
            except Resolver404:
                unresolved.append(f"{path}  (referenced by {origin})")
        self.assertGreater(checked, 20, "path scraper found too few paths")
        self.assertFalse(unresolved,
                         "SPA references unroutable API paths:\n" +
                         "\n".join(unresolved))

    def test_no_spa_path_returns_404_when_authenticated(self):
        """404 on a GET the SPA makes = path mismatch, not an empty result."""
        self.auth(self.doctor)
        get_paths = [
            "/auth/me", "/dashboard/stats", "/pets", f"/pets/{self.pet_a.id}",
            f"/pets/{self.pet_a.id}/diagnoses",
            f"/pets/{self.pet_a.id}/treatment-plans",
            f"/pets/{self.pet_a.id}/queries", "/appointments",
            f"/appointments/{self.appt_a.id}",
            f"/appointments/{self.appt_a.id}/share", "/invoices",
            f"/invoices/{self.invoice_a.id}", "/revenue?range=month",
            "/notifications", "/queries/inbox",
            f"/treatment-plans/{self.plan_a.id}",
            f"/notification-prefs?owner_phone={self.owner_a.phone}",
        ]
        bad = []
        for p in get_paths:
            r = self.client.get(f"{API}{p}")
            if r.status_code == 404:
                bad.append(f"{p} -> 404")
        self.assertFalse(bad, "doctor GET endpoints 404ing: " + ", ".join(bad))

    def test_owner_spa_paths_do_not_404(self):
        self.auth(self.owner_a)
        bad = []
        for p in ("/owner/pets", f"/owner/pets/{self.pet_a.id}",
                  f"/owner/pets/{self.pet_a.id}/queries",
                  "/owner/appointments", "/owner/invoices"):
            r = self.client.get(f"{API}{p}")
            if r.status_code == 404:
                bad.append(f"{p} -> 404")
        self.assertFalse(bad, "owner GET endpoints 404ing: " + ", ".join(bad))

    def test_bare_api_prefix_also_resolves(self):
        """petphysio/urls.py mounts the app under both /api/ and /api/v1/."""
        self.auth(self.doctor)
        r = self.client.get("/api/pets")
        self.assertEqual(r.status_code, 200, r.content)


class PiiLeakTests(ApiTestCase):
    def test_error_responses_do_not_echo_the_submitted_password(self):
        r = self.anon().post(f"{API}/auth/login",
                             {"username": "drwho", "password": "SuperSecret123"},
                             format="json")
        self.assertNotIn("SuperSecret123", str(r.data))

    def test_signup_validation_error_does_not_echo_password(self):
        r = self.anon().post(f"{API}/auth/signup", {
            "username": "drwho", "password": "SuperSecret123", "email": "x@e.com",
            "first_name": "A", "last_name": "B", "role": "OWNER"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertNotIn("SuperSecret123", str(r.data))

    def test_password_hash_is_never_serialized(self):
        self.auth(self.doctor)
        for path in ("/auth/me",):
            r = self.client.get(f"{API}{path}")
            self.assertNotIn("password", r.data)
        r = self.anon().post(f"{API}/auth/login",
                             {"username": "drwho", "password": "D0ctorPass!23"},
                             format="json")
        self.assertNotIn("password", r.data)
        self.assertNotIn("is_staff", r.data)
        self.assertNotIn("is_superuser", r.data)


class MethodNotAllowedTests(ApiTestCase):
    def test_unsupported_methods_return_405_not_500(self):
        self.auth(self.doctor)
        cases = [("delete", "/pets"), ("put", f"/pets/{self.pet_a.id}"),
                 ("delete", f"/invoices/{self.invoice_a.id}"),
                 ("delete", f"/appointments/{self.appt_a.id}")]
        for method, path in cases:
            with self.subTest(path=f"{method} {path}"):
                r = getattr(self.client, method)(f"{API}{path}", {}, format="json")
                self.assertEqual(r.status_code, 405, f"{method} {path} -> "
                                                     f"{r.status_code}")
