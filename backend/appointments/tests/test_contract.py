"""Contract conformance: response JSON keys must match frontend/src/lib/types.ts
field-for-field (API_CONTRACT.md §2 "Field names are exactly as in types.ts").

The expected key sets below are transcribed from types.ts. Optional TS fields
(`foo?:`) are allowed to be absent; required fields must be present.
"""

from decimal import Decimal

from appointments.models import Notification, ProgressNote, QueryMessage

from .base import API, ApiTestCase, upload


def assert_keys(test, payload, required, optional=(), label=""):
    actual = set(payload.keys())
    missing = set(required) - actual
    extra = actual - set(required) - set(optional)
    test.assertFalse(missing, f"{label}: missing keys {sorted(missing)}")
    test.assertFalse(extra, f"{label}: unexpected keys {sorted(extra)} "
                            f"(not in frontend/src/lib/types.ts)")


class UserContractTests(ApiTestCase):
    REQUIRED = ["id", "username", "email", "first_name", "last_name", "role"]
    OPTIONAL = ["clinic_name", "clinic_address", "clinic_phone", "phone"]

    def test_auth_me_shape(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/auth/me")
        self.assertEqual(r.status_code, 200, r.content)
        assert_keys(self, r.data, self.REQUIRED, self.OPTIONAL, "User")


class PetContractTests(ApiTestCase):
    REQUIRED = ["id", "name", "species", "owner_name", "owner_phone"]
    OPTIONAL = ["pet_type", "breed", "age", "sex", "weight", "photo",
                "owner_email", "medical_history", "complaint",
                "complaint_started", "referred_by", "notes"]

    def test_pet_list_shape(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/pets")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsInstance(r.data, list, "GET /pets must return a bare array")
        assert_keys(self, r.data[0], self.REQUIRED, self.OPTIONAL, "Pet")

    def test_pet_detail_shape(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/pets/{self.pet_a.id}")
        assert_keys(self, r.data, self.REQUIRED, self.OPTIONAL, "Pet detail")

    def test_pet_search_filters(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/pets?q=Milo")
        self.assertEqual([p["name"] for p in r.data], ["Milo"])


class AppointmentContractTests(ApiTestCase):
    REQUIRED = ["id", "pet_id", "pet_name", "owner_name", "owner_phone",
                "date", "time", "visit_type", "status"]
    OPTIONAL = ["visit_type_display", "requested_date", "requested_time",
                "reschedule_reason", "reason_notes", "share"]

    def test_appointment_list_shape(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/appointments")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsInstance(r.data, list)
        assert_keys(self, r.data[0], self.REQUIRED, self.OPTIONAL, "Appointment")

    def test_appointment_create_returns_contract_shape(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/appointments", {
            "pet": self.pet_a.id, "visit_type": "Followup",
            "date": "2030-01-01", "time": "09:30",
            "reason_notes": "limping"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        assert_keys(self, r.data, self.REQUIRED, self.OPTIONAL, "Appointment create")
        self.assertEqual(r.data["pet_id"], self.pet_a.id)

    def test_share_shape(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/appointments/{self.appt_a.id}/share")
        self.assertEqual(r.status_code, 200, r.content)
        assert_keys(self, r.data,
                    ["whatsapp_url", "sms_url", "pet_name", "owner_name",
                     "owner_phone"], label="share")


class DiagnosisContractTests(ApiTestCase):
    REQUIRED = ["id", "pet_id", "report_type", "original_filename", "size",
                "mime", "uploaded_at", "file_url"]
    OPTIONAL = ["report_type_display", "notes", "is_dicom"]

    def test_diagnosis_create_and_list_shape(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/pets/{self.pet_a.id}/diagnoses",
                             {"file": upload("scan.png"),
                              "report_type": "XRAY", "notes": "left hip"},
                             format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        assert_keys(self, r.data, self.REQUIRED, self.OPTIONAL, "Diagnosis")
        self.assertEqual(r.data["original_filename"], "scan.png")
        from .base import MAGIC
        self.assertEqual(r.data["size"], len(MAGIC["image/png"]))
        self.assertEqual(r.data["mime"], "image/png")

        lst = self.client.get(f"{API}/pets/{self.pet_a.id}/diagnoses")
        self.assertIsInstance(lst.data, list)
        assert_keys(self, lst.data[0], self.REQUIRED, self.OPTIONAL, "Diagnosis list")


class TreatmentPlanContractTests(ApiTestCase):
    REQUIRED = ["id", "pet_id", "therapies", "frequency", "duration",
                "start_date", "status", "created_at", "updated_at",
                "progress_notes"]
    OPTIONAL = ["frequency_custom", "duration_custom", "end_date", "completed_at"]

    def test_plan_shape_and_therapies_is_a_list(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/pets/{self.pet_a.id}/treatment-plans")
        self.assertEqual(r.status_code, 200, r.content)
        assert_keys(self, r.data[0], self.REQUIRED, self.OPTIONAL, "TreatmentPlan")
        self.assertIsInstance(r.data[0]["therapies"], list)
        self.assertEqual(r.data[0]["therapies"], ["Hydrotherapy"])

    def test_progress_note_shape_and_autonumbering(self):
        self.auth(self.doctor)
        r1 = self.client.post(f"{API}/treatment-plans/{self.plan_a.id}/progress-notes",
                              {"notes": "session one"}, format="json")
        self.assertEqual(r1.status_code, 201, r1.content)
        assert_keys(self, r1.data, ["id", "session_no", "notes", "created_at"],
                    label="ProgressNote")
        self.assertEqual(r1.data["session_no"], 1)
        r2 = self.client.post(f"{API}/treatment-plans/{self.plan_a.id}/progress-notes",
                              {"notes": "session two"}, format="json")
        self.assertEqual(r2.data["session_no"], 2)


class InvoiceContractTests(ApiTestCase):
    REQUIRED = ["id", "invoice_no", "pet_id", "pet_name", "subtotal", "tax",
                "total", "payment_status", "payment_mode", "created_at",
                "line_items", "payments", "amount_paid", "balance_due"]
    OPTIONAL = ["package"]

    def test_invoice_shape_uses_contract_names_not_legacy_names(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/invoices")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsInstance(r.data, list)
        inv = r.data[0]
        assert_keys(self, inv, self.REQUIRED, self.OPTIONAL, "Invoice")
        for legacy in ("invoice_number", "status", "items"):
            self.assertNotIn(legacy, inv, f"legacy field `{legacy}` resurfaced")

    def test_line_item_shape(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/invoices/{self.invoice_a.id}")
        assert_keys(self, r.data["line_items"][0],
                    ["description", "quantity", "unit_price", "amount"],
                    ["id"], "LineItem")

    def test_payment_shape_does_not_leak_idempotency_key(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                             {"amount_paid": "10.00", "idempotency_key": "k"},
                             format="json")
        assert_keys(self, r.data,
                    ["id", "invoice_id", "amount_paid", "status", "paid_at"],
                    ["gateway_ref"], "Payment")

    def test_package_shape(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/invoices", {
            "pet_id": self.pet_a.id, "payment_mode": "package",
            "total_sessions": 5,
            "line_items": [{"description": "5 pack", "quantity": 1,
                            "unit_price": "500"}]}, format="json")
        assert_keys(self, r.data["package"],
                    ["id", "invoice_id", "total_sessions", "used_sessions",
                     "remaining_sessions"], label="Package")


class DashboardContractTests(ApiTestCase):
    REQUIRED = ["today", "today_display", "today_appointments",
                "completed_count", "active_treatments", "pending_payments",
                "today_revenue", "monthly_revenue", "currency"]

    def test_dashboard_stats_shape(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/dashboard/stats")
        self.assertEqual(r.status_code, 200, r.content)
        assert_keys(self, r.data, self.REQUIRED, label="DashboardStats")
        assert_keys(self, r.data["today_appointments"][0],
                    ["id", "pet_name", "owner_name", "time", "pet_type",
                     "visit_type", "status"], ["visit_type_display"],
                    "DashboardStats.today_appointments[]")


class NotificationContractTests(ApiTestCase):
    def test_notifications_envelope_has_results_and_unread_count(self):
        Notification.objects.create(user=self.doctor, type="APPOINTMENT",
                                    message="hi", link="/x")
        self.auth(self.doctor)
        r = self.client.get(f"{API}/notifications")
        self.assertEqual(r.status_code, 200, r.content)
        assert_keys(self, r.data, ["results", "unread_count"], label="notifications")
        assert_keys(self, r.data["results"][0],
                    ["id", "type", "message", "is_read", "created_at"],
                    ["type_display", "link"], "NotificationItem")
        self.assertEqual(r.data["unread_count"], 1)

    def test_notifications_are_scoped_to_the_requesting_user(self):
        Notification.objects.create(user=self.owner_b, type="X", message="secret")
        self.auth(self.doctor)
        r = self.client.get(f"{API}/notifications")
        self.assertEqual(r.data["results"], [])
        self.assertEqual(r.data["unread_count"], 0)

    def test_mark_all_read_only_touches_own_notifications(self):
        mine = Notification.objects.create(user=self.doctor, type="X", message="m")
        theirs = Notification.objects.create(user=self.owner_b, type="X", message="t")
        self.auth(self.doctor)
        r = self.client.post(f"{API}/notifications/mark-all-read", {}, format="json")
        self.assertEqual(r.status_code, 204)
        mine.refresh_from_db(); theirs.refresh_from_db()
        self.assertTrue(mine.is_read)
        self.assertFalse(theirs.is_read)

    def test_owner_cannot_read_another_owners_notification_prefs(self):
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/notification-prefs?owner_phone={self.owner_b.phone}")
        self.assertEqual(r.status_code, 404, r.content)

    def test_owner_cannot_write_another_owners_notification_prefs(self):
        from appointments.models import NotificationPref
        self.auth(self.owner_a)
        r = self.client.put(f"{API}/notification-prefs",
                            {"owner_phone": self.owner_b.phone, "sms_opt_out": True},
                            format="json")
        self.assertEqual(r.status_code, 404, r.content)
        self.assertFalse(
            NotificationPref.objects.filter(owner_phone=self.owner_b.phone,
                                            sms_opt_out=True).exists())


class QueryContractTests(ApiTestCase):
    THREAD_REQUIRED = ["pet", "messages"]
    THREAD_OPTIONAL = ["last_message", "awaiting_reply", "message_count"]

    def test_thread_shape(self):
        self.auth(self.doctor)
        self.client.post(f"{API}/pets/{self.pet_a.id}/queries",
                         {"message": "hello"}, format="multipart")
        r = self.client.get(f"{API}/pets/{self.pet_a.id}/queries")
        self.assertEqual(r.status_code, 200, r.content)
        assert_keys(self, r.data, self.THREAD_REQUIRED, self.THREAD_OPTIONAL,
                    "QueryThread")
        assert_keys(self, r.data["pet"], ["id", "name", "owner_name"],
                    ["pet_type"], "QueryThread.pet")
        assert_keys(self, r.data["messages"][0],
                    ["id", "sender_role", "sender_name", "message",
                     "attachments", "sent_at"], label="QueryMessage")
        assert_keys(self, r.data["last_message"],
                    ["snippet", "sent_at", "sender_role"], label="last_message")

    def test_inbox_envelope(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/queries/inbox")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("results", r.data)
        self.assertIsInstance(r.data["results"], list)


class ErrorBodyContractTests(ApiTestCase):
    """frontend/src/lib/http.ts reads `errorData.detail || errorData.message`.

    An error body with neither degrades to `response.statusText`, so the user
    sees "Bad Request" instead of the real reason.
    """

    def test_400_errors_carry_a_detail_the_spa_can_render(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/invoices", {"line_items": []}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertTrue(
            r.data.get("detail") or r.data.get("message"),
            f"error body {dict(r.data)} has no `detail`/`message`; the SPA "
            f"will show a bare status text",
        )

    def test_401_body_does_not_reveal_whether_the_username_exists(self):
        a = self.anon().post(f"{API}/auth/login",
                             {"username": "drwho", "password": "nope"},
                             format="json")
        b = self.anon().post(f"{API}/auth/login",
                             {"username": "nobody", "password": "nope"},
                             format="json")
        self.assertEqual(a.status_code, b.status_code)
        self.assertEqual(dict(a.data), dict(b.data),
                         "login error body differs by username existence")
