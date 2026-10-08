"""Rehab checklist: schedule -> per-therapy sessions -> doctor ticks.

Clock is frozen at Wed 2026-10-07 10:00 IST (same approach as
test_facility_booking.py). Weekdays: 0=Mon .. 6=Sun.
"""

from datetime import date, datetime
from unittest import mock
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase

from appointments.models import Pet, RehabSession, TreatmentPlan, UserProfile
from appointments.rehab import generate_dates, sync_sessions

from .base import API, ApiTestCase

IST = ZoneInfo("Asia/Kolkata")
WED = date(2026, 10, 7)


def d(day):
    return date(2026, 10, day)


def _freeze(test, now):
    patcher = mock.patch("django.utils.timezone.now", return_value=now)
    patcher.start()
    test.addCleanup(patcher.stop)


class GenerateDatesTests(SimpleTestCase):
    def test_everyday_seven_dates_over_seven_day_plan(self):
        out = generate_dates(WED, d(13), "EVERYDAY", [])
        self.assertEqual(out, [d(i) for i in range(7, 14)])

    def test_alternate_day_counts_from_start(self):
        out = generate_dates(WED, d(13), "ALTERNATE_DAY", [])
        self.assertEqual(out, [d(7), d(9), d(11), d(13)])

    def test_twice_weekly_mon_thu_starting_wed(self):
        out = generate_dates(WED, d(13), "TWICE_WEEKLY", [0, 3])
        self.assertEqual(out, [d(8), d(12)])  # Thu, Mon

    def test_weekly_monday_starting_wed_is_next_monday_only(self):
        out = generate_dates(WED, d(13), "WEEKLY", [0])
        self.assertEqual(out, [d(12)])

    def test_weekly_never_before_start_date(self):
        self.assertTrue(all(x >= WED for x in generate_dates(WED, d(31), "WEEKLY", [0])))

    def test_biweekly_wednesday_over_28_days_two_dates_14_apart(self):
        out = generate_dates(WED, date(2026, 11, 3), "BIWEEKLY", [2])
        self.assertEqual(out, [d(7), d(21)])

    def test_biweekly_starts_at_first_occurrence_on_or_after_start(self):
        out = generate_dates(WED, date(2026, 11, 3), "BIWEEKLY", [0])
        self.assertEqual(out, [d(12), d(26)])

    def test_end_before_start_is_empty(self):
        self.assertEqual(generate_dates(WED, d(1), "EVERYDAY", []), [])


class RehabBase(ApiTestCase):
    def setUp(self):
        super().setUp()
        _freeze(self, datetime(2026, 10, 7, 10, 0, tzinfo=IST))
        self.url = f"{API}/pets/{self.pet_a.id}/treatment-plans"
        self.auth(self.doctor)

    def payload(self, **over):
        body = {
            "start_date": "2026-10-07",
            "schedule": [{"therapy": "Massage", "frequency": "EVERYDAY", "weekdays": []}],
        }
        body.update(over)
        return body

    def make_plan(self, **over):
        r = self.client.post(self.url, self.payload(**over), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def sess(self, plan_id, therapy="Massage", day=7):
        return RehabSession.objects.get(plan_id=plan_id, therapy=therapy, planned_date=d(day))


class PlanCreateTests(RehabBase):
    def test_defaults_end_date_and_creates_sessions(self):
        plan = self.make_plan()
        self.assertEqual(plan["end_date"], "2026-10-13")
        self.assertEqual(len(plan["sessions"]), 7)
        s = plan["sessions"][0]
        self.assertEqual(
            set(s),
            {"id", "therapy", "planned_date", "status", "display_status",
             "done_on", "done_by_name", "note", "skip_reason"},
        )
        self.assertEqual(s["status"], "DUE")

    def test_explicit_end_date_respected(self):
        plan = self.make_plan(end_date="2026-10-20")
        self.assertEqual(plan["end_date"], "2026-10-20")
        self.assertEqual(len(plan["sessions"]), 14)

    def test_twice_weekly_needs_exactly_two_weekdays(self):
        for wd in ([], [0], [0, 1, 2]):
            r = self.client.post(self.url, self.payload(schedule=[
                {"therapy": "TENS", "frequency": "TWICE_WEEKLY", "weekdays": wd}]), format="json")
            self.assertEqual(r.status_code, 400, wd)

    def test_weekly_and_biweekly_need_exactly_one(self):
        for f in ("WEEKLY", "BIWEEKLY"):
            r = self.client.post(self.url, self.payload(schedule=[
                {"therapy": "TENS", "frequency": f, "weekdays": [0, 1]}]), format="json")
            self.assertEqual(r.status_code, 400, f)

    def test_everyday_takes_no_weekdays(self):
        r = self.client.post(self.url, self.payload(schedule=[
            {"therapy": "TENS", "frequency": "EVERYDAY", "weekdays": [1]}]), format="json")
        self.assertEqual(r.status_code, 400)

    def test_bad_weekday_value_unknown_therapy_unknown_frequency(self):
        bad = [
            {"therapy": "TENS", "frequency": "WEEKLY", "weekdays": [7]},
            {"therapy": "Voodoo", "frequency": "EVERYDAY", "weekdays": []},
            {"therapy": "TENS", "frequency": "HOURLY", "weekdays": []},
        ]
        for entry in bad:
            r = self.client.post(self.url, self.payload(schedule=[entry]), format="json")
            self.assertEqual(r.status_code, 400, entry)
        self.assertEqual(RehabSession.objects.count(), 0)

    def test_duplicate_therapy_in_schedule_rejected(self):
        e = {"therapy": "TENS", "frequency": "EVERYDAY", "weekdays": []}
        r = self.client.post(self.url, self.payload(schedule=[e, e]), format="json")
        self.assertEqual(r.status_code, 400)

    def test_end_before_start_rejected(self):
        r = self.client.post(self.url, self.payload(end_date="2026-10-01"), format="json")
        self.assertEqual(r.status_code, 400)

    def test_legacy_plan_without_schedule_still_works(self):
        r = self.client.post(self.url, {"start_date": "2026-10-07", "therapies": ["Hydrotherapy"],
                                        "frequency": "Weekly"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["sessions"], [])
        self.assertEqual(r.json()["schedule"], [])

    def test_duration_4wk_derives_end_date(self):
        plan = self.make_plan(duration="4WK")
        self.assertEqual(plan["end_date"], "2026-11-03")  # start + 27
        self.assertEqual(len(plan["sessions"]), 28)

    def test_unparseable_duration_leaves_end_date_open(self):
        r = self.client.post(self.url, {"start_date": "2026-10-07", "duration": "until healed"},
                             format="json")
        self.assertEqual(r.status_code, 201)
        self.assertIsNone(r.json()["end_date"])

    def test_patch_status_only_on_legacy_plan_keeps_null_end_date(self):
        legacy = TreatmentPlan.objects.create(pet=self.pet_a, start_date=WED, therapies=["x"])
        self.assertIsNone(legacy.end_date)
        r = self.client.patch(f"{API}/treatment-plans/{legacy.id}", {"status": "PAUSED"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsNone(r.json()["end_date"])
        legacy.refresh_from_db()
        self.assertIsNone(legacy.end_date)

    def test_client_cannot_write_sessions(self):
        r = self.client.post(self.url, self.payload(sessions=[{"therapy": "x"}]), format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(len(r.json()["sessions"]), 7)


class TickTests(RehabBase):
    def setUp(self):
        super().setUp()
        self.plan = self.make_plan(start_date="2026-10-04", end_date="2026-10-10")

    def url_for(self, s, action):
        return f"{API}/rehab/sessions/{s.id}/{action}"

    def test_done_today_on_time(self):
        s = self.sess(self.plan["id"], day=7)
        r = self.client.post(self.url_for(s, "done"), {"note": "good"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body["status"], "DONE")
        self.assertEqual(body["display_status"], "DONE")
        self.assertEqual(body["done_on"], "2026-10-07")
        self.assertEqual(body["done_by_name"], "Dana Who")
        s.refresh_from_db()
        self.assertEqual(s.done_by, self.doctor)

    def test_done_late_keeps_planned_date(self):
        s = self.sess(self.plan["id"], day=5)
        sessions = self.client.get(f"{API}/treatment-plans/{self.plan['id']}").json()["sessions"]
        by_date = {x["planned_date"]: x for x in sessions}
        self.assertEqual(by_date["2026-10-05"]["display_status"], "MISSED")
        r = self.client.post(self.url_for(s, "done"), {}, format="json")
        body = r.json()
        self.assertEqual(body["planned_date"], "2026-10-05")
        self.assertEqual(body["done_on"], "2026-10-07")
        self.assertEqual(body["display_status"], "DONE_LATE")

    def test_done_on_backdated_ok_within_bounds(self):
        s = self.sess(self.plan["id"], day=5)
        r = self.client.post(self.url_for(s, "done"), {"done_on": "2026-10-06"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["done_on"], "2026-10-06")

    def test_done_on_future_before_planned_or_garbage_is_400(self):
        s = self.sess(self.plan["id"], day=5)
        for v in ("2026-10-08", "2026-10-04", "nope", 5):
            r = self.client.post(self.url_for(s, "done"), {"done_on": v}, format="json")
            self.assertEqual(r.status_code, 400, v)
        s.refresh_from_db()
        self.assertEqual(s.status, "DUE")

    def test_cannot_tick_future_session_with_default_today(self):
        s = self.sess(self.plan["id"], day=9)
        r = self.client.post(self.url_for(s, "done"), {}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_done_is_idempotent(self):
        s = self.sess(self.plan["id"], day=7)
        for _ in range(2):
            r = self.client.post(self.url_for(s, "done"), {}, format="json")
            self.assertEqual(r.status_code, 200)
        self.assertEqual(RehabSession.objects.filter(status="DONE").count(), 1)

    def test_skip_with_reason(self):
        s = self.sess(self.plan["id"], day=7)
        r = self.client.post(self.url_for(s, "skip"), {"reason": "pet unwell"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "SKIPPED")
        self.assertEqual(r.json()["skip_reason"], "pet unwell")
        self.assertEqual(r.json()["display_status"], "SKIPPED")

    def test_skip_without_reason(self):
        s = self.sess(self.plan["id"], day=7)
        self.assertEqual(self.client.post(self.url_for(s, "skip"), {}, format="json").status_code, 200)

    def test_undo_returns_to_due_and_clears(self):
        s = self.sess(self.plan["id"], day=5)
        self.client.post(self.url_for(s, "done"), {"note": "n"}, format="json")
        r = self.client.post(self.url_for(s, "undo"), {}, format="json")
        self.assertEqual(r.status_code, 200)
        b = r.json()
        self.assertEqual((b["status"], b["done_on"], b["done_by_name"], b["skip_reason"]),
                         ("DUE", None, "", ""))
        self.assertEqual(b["display_status"], "MISSED")
        self.client.post(self.url_for(s, "skip"), {"reason": "x"}, format="json")
        b = self.client.post(self.url_for(s, "undo"), {}, format="json").json()
        self.assertEqual(b["skip_reason"], "")

    def test_owner_gets_403(self):
        s = self.sess(self.plan["id"], day=7)
        self.auth(self.owner_a)
        for action in ("done", "skip", "undo"):
            r = self.client.post(self.url_for(s, action), {}, format="json")
            self.assertEqual(r.status_code, 403, action)
        self.assertEqual(self.client.post(
            f"{API}/treatment-plans/{self.plan['id']}/extend", {}, format="json").status_code, 403)
        s.refresh_from_db()
        self.assertEqual(s.status, "DUE")

    def test_anonymous_gets_401(self):
        s = self.sess(self.plan["id"], day=7)
        self.assertEqual(self.anon().post(self.url_for(s, "done"), {}, format="json").status_code, 401)

    def test_other_doctor_gets_404(self):
        other = UserProfile.objects.create_user(
            username="drtwo", password="x", role="DOCTOR", phone="9990000009", email="d2@example.com")
        s = self.sess(self.plan["id"], day=7)
        self.auth(other)
        for action in ("done", "skip", "undo"):
            self.assertEqual(self.client.post(self.url_for(s, action), {}, format="json").status_code, 404)
        self.assertEqual(self.client.post(
            f"{API}/treatment-plans/{self.plan['id']}/extend", {}, format="json").status_code, 404)

    def test_unknown_session_404(self):
        r = self.client.post(f"{API}/rehab/sessions/00000000-0000-0000-0000-000000000000/done", {}, format="json")
        self.assertEqual(r.status_code, 404)


class EditAndExtendTests(RehabBase):
    def test_edit_after_done_keeps_done_rows_and_does_not_duplicate(self):
        plan = self.make_plan(start_date="2026-10-05", end_date="2026-10-11")
        done = self.sess(plan["id"], day=5)
        self.client.post(f"{API}/rehab/sessions/{done.id}/done", {}, format="json")
        r = self.client.patch(f"{API}/treatment-plans/{plan['id']}", {
            "schedule": [{"therapy": "Massage", "frequency": "ALTERNATE_DAY", "weekdays": []}],
        }, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        done.refresh_from_db()
        self.assertEqual(done.status, "DONE")
        qs = RehabSession.objects.filter(plan_id=plan["id"])
        self.assertEqual(qs.count(), len({(s.therapy, s.planned_date) for s in qs}))
        # Alternate from Oct 5 wants 5,7,9,11. The past DUE row (6, now missed
        # history) is kept; future DUE rows are rebuilt to 7,9,11.
        self.assertEqual(sorted(s.planned_date.day for s in qs), [5, 6, 7, 9, 11])

    def test_edit_removes_future_due_but_keeps_past_due_and_skipped(self):
        plan = self.make_plan(start_date="2026-10-05", end_date="2026-10-11")
        skipped = self.sess(plan["id"], day=9)
        self.client.post(f"{API}/rehab/sessions/{skipped.id}/skip", {}, format="json")
        self.client.patch(f"{API}/treatment-plans/{plan['id']}", {
            "schedule": [{"therapy": "TENS", "frequency": "EVERYDAY", "weekdays": []}],
        }, format="json")
        qs = RehabSession.objects.filter(plan_id=plan["id"])
        # Massage: past (5,6) DUE stay (missed history); 9 SKIPPED stays; 7,8,10,11 gone.
        self.assertEqual(sorted(s.planned_date.day for s in qs if s.therapy == "Massage"), [5, 6, 9])
        self.assertEqual(sorted(s.planned_date.day for s in qs if s.therapy == "TENS"), [7, 8, 9, 10, 11])

    def test_edit_does_not_backfill_past_sessions(self):
        plan = self.make_plan(start_date="2026-10-05", end_date="2026-10-11")
        self.client.patch(f"{API}/treatment-plans/{plan['id']}", {
            "schedule": [{"therapy": "Massage", "frequency": "EVERYDAY", "weekdays": []},
                         {"therapy": "TENS", "frequency": "EVERYDAY", "weekdays": []}],
        }, format="json")
        tens = RehabSession.objects.filter(plan_id=plan["id"], therapy="TENS")
        self.assertEqual(sorted(s.planned_date.day for s in tens), [7, 8, 9, 10, 11])

    def test_edit_validates_schedule(self):
        plan = self.make_plan()
        r = self.client.patch(f"{API}/treatment-plans/{plan['id']}", {
            "schedule": [{"therapy": "TENS", "frequency": "WEEKLY", "weekdays": []}]}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_extend_continues_alternate_day_cadence(self):
        plan = self.make_plan(schedule=[{"therapy": "Massage", "frequency": "ALTERNATE_DAY", "weekdays": []}])
        r = self.client.post(f"{API}/treatment-plans/{plan['id']}/extend", {}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["end_date"], "2026-10-20")
        days = sorted(s.planned_date.day for s in RehabSession.objects.filter(plan_id=plan["id"]))
        self.assertEqual(days, [7, 9, 11, 13, 15, 17, 19])

    def test_extend_continues_biweekly_cadence(self):
        plan = self.make_plan(
            end_date="2026-10-27",
            schedule=[{"therapy": "Massage", "frequency": "BIWEEKLY", "weekdays": [2]}])
        self.client.post(f"{API}/treatment-plans/{plan['id']}/extend", {"days": 14}, format="json")
        days = sorted(s.planned_date for s in RehabSession.objects.filter(plan_id=plan["id"]))
        self.assertEqual(days, [d(7), d(21), date(2026, 11, 4)])

    def test_extend_twice_does_not_duplicate(self):
        plan = self.make_plan()
        for _ in range(2):
            self.client.post(f"{API}/treatment-plans/{plan['id']}/extend", {"days": 7}, format="json")
        self.assertEqual(RehabSession.objects.filter(plan_id=plan["id"]).count(), 21)

    def test_extend_rejects_bad_days(self):
        plan = self.make_plan()
        for v in (0, -3, "x", 10000):
            r = self.client.post(f"{API}/treatment-plans/{plan['id']}/extend", {"days": v}, format="json")
            self.assertEqual(r.status_code, 400, v)

    def test_sync_sessions_is_idempotent(self):
        plan = TreatmentPlan.objects.get(pk=self.make_plan()["id"])
        sync_sessions(plan, WED)
        sync_sessions(plan, WED)
        self.assertEqual(plan.sessions.count(), 7)


class CatalogueAndTodayTests(RehabBase):
    def test_therapies_catalogue_any_authenticated_user(self):
        for u in (self.doctor, self.owner_a):
            self.auth(u)
            r = self.client.get(f"{API}/rehab/therapies")
            self.assertEqual(r.status_code, 200)
            body = r.json()
            self.assertEqual([g["group"] for g in body["groups"]],
                             ["Electro-physical", "Manual", "Special"])
            self.assertIn("Walk on Special Mat", body["groups"][1]["therapies"])
            self.assertEqual(
                [(f["code"], f["weekdays_required"]) for f in body["frequencies"]],
                [("EVERYDAY", 0), ("ALTERNATE_DAY", 0), ("TWICE_WEEKLY", 2),
                 ("WEEKLY", 1), ("BIWEEKLY", 1)])
            self.assertEqual(body["frequencies"][4]["label"], "Bi-weekly")
        self.assertEqual(self.anon().get(f"{API}/rehab/therapies").status_code, 401)

    def test_today_lists_due_and_pending(self):
        plan = self.make_plan(start_date="2026-10-05", end_date="2026-10-09")
        r = self.client.get(f"{API}/rehab/today")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["today"], "2026-10-07")
        self.assertEqual([s["planned_date"] for s in body["due"]], ["2026-10-07"])
        self.assertEqual([s["planned_date"] for s in body["pending"]], ["2026-10-05", "2026-10-06"])
        item = body["due"][0]
        self.assertEqual(item["pet"]["id"], str(self.pet_a.id))
        self.assertEqual(item["pet"]["name"], "Rex")
        self.assertEqual(item["plan"]["id"], plan["id"])

    def test_late_tick_leaves_pending_and_today_done_stays_in_due_as_done(self):
        self.make_plan(start_date="2026-10-05", end_date="2026-10-09")
        missed = RehabSession.objects.get(planned_date=d(5))
        today_s = RehabSession.objects.get(planned_date=d(7))
        self.client.post(f"{API}/rehab/sessions/{missed.id}/done", {}, format="json")
        self.client.post(f"{API}/rehab/sessions/{today_s.id}/done", {}, format="json")
        body = self.client.get(f"{API}/rehab/today").json()
        self.assertEqual([s["planned_date"] for s in body["pending"]], ["2026-10-06"])
        self.assertEqual([(s["planned_date"], s["status"]) for s in body["due"]],
                         [("2026-10-07", "DONE")])

    def test_today_scoped_to_doctor_and_excludes_non_active_plans(self):
        other = UserProfile.objects.create_user(
            username="drtwo", password="x", role="DOCTOR", phone="9990000009", email="d2@example.com")
        other_pet = Pet.objects.create(owner=self.owner_b, doctor=other, name="Zed", species="Dog",
                                       owner_name="Bob", owner_phone="9992220002")
        TreatmentPlan.objects.create(pet=other_pet, start_date=WED, end_date=d(9), schedule=[
            {"therapy": "TENS", "frequency": "EVERYDAY", "weekdays": []}])
        plan_other = TreatmentPlan.objects.get(pet=other_pet)
        sync_sessions(plan_other, WED)
        paused = self.make_plan()
        TreatmentPlan.objects.filter(pk=paused["id"]).update(status="PAUSED")
        body = self.client.get(f"{API}/rehab/today").json()
        self.assertEqual(body["due"], [])
        self.assertEqual(body["pending"], [])

    def test_today_forbidden_for_owner(self):
        self.auth(self.owner_a)
        self.assertEqual(self.client.get(f"{API}/rehab/today").status_code, 403)


class OwnerPayloadTests(RehabBase):
    def test_owner_pet_detail_includes_sessions_read_only(self):
        self.make_plan()
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/owner/pets/{self.pet_a.id}")
        self.assertEqual(r.status_code, 200)
        plans = [p for p in r.json()["treatment_plans"] if p["sessions"]]
        self.assertEqual(len(plans), 1)
        self.assertEqual(len(plans[0]["sessions"]), 7)
        self.assertEqual(plans[0]["schedule"][0]["therapy"], "Massage")
