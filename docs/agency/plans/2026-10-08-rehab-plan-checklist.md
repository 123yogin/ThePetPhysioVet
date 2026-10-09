# Rehab Plan Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a pet's rehab plan into a doctor-ticked daily checklist: grouped therapy picker, per-therapy frequency with doctor-picked weekdays, 7-day default duration, Done / Done late / Skipped / Missed sessions, a "Today's rehab" doctor screen, and a read-only owner view.

**Architecture:** Backend adds a therapy catalogue constant, a per-therapy `schedule` on `TreatmentPlan`, and a `RehabSession` row per planned therapy-day generated from that schedule. Missed is derived at read time (past + still DUE) — no cron. Frontend (staff SPA) gets a plan builder, a plan grid with tick/skip/undo, and a Today screen; the owner pet screen renders the same grid read-only.

**Tech Stack:** Django 6 + DRF (`backend/appointments`), React + TS + TanStack Query (`frontend/`).

**Spec:** Client handwritten notes 2026-10-08 (Rehab plans: frequency list, grouped therapies, Days/Dates column) + owner decisions in chat 2026-10-08: plan defaults to 7 days; only the DOCTOR ticks; the doctor PICKS the weekdays for weekly-type frequencies; owners can SEE the checklist (read-only).

## Global Constraints

- Frequencies (exact codes/labels): `EVERYDAY` "Every day", `ALTERNATE_DAY` "Every alternate day", `TWICE_WEEKLY` "Twice a week", `WEEKLY` "Once a week", `BIWEEKLY` "Bi-weekly" (= once every two weeks).
- Therapy catalogue (exact labels, grouped):
  - Electro-physical: "Pulsed Electro-Magnetic Field (PEMF)", "Class IV Laser Therapy", "TENS", "Ultrasound Therapy", "Electro-acupuncture"
  - Manual: "Massage", "Exercise", "Acupressure", "Strength Training", "Balance Training", "Walk on Special Mat"
  - Special: "Acupuncture", "Hydrotherapy"
- Plan duration default: 7 days (`end_date = start_date + 6`). Options 7 / 14 / 28 / custom end date.
- Weekdays: ints 0=Mon..6=Sun. `TWICE_WEEKLY` requires exactly 2 picked weekdays; `WEEKLY` and `BIWEEKLY` exactly 1; `EVERYDAY` / `ALTERNATE_DAY` take none (alternate = start_date, +2, +4…).
- "Today" = `timezone.localdate()` (Asia/Kolkata). Never `date.today()`.
- Only a user passing the existing doctor permission (`IsDoctor`, scoped by `_doctor_scoped(..., lookup="pet__doctor")`) may tick/untick/skip/extend. Owners: read-only via existing owner pet detail payload.
- Session statuses stored: `DUE`, `DONE`, `SKIPPED`. Derived for display: `MISSED` (DUE and planned_date < today), `DONE_LATE` (DONE and done_on != planned_date).
- Editing a plan's schedule rebuilds only sessions with planned_date >= today that are still DUE; DONE/SKIPPED rows are never deleted.
- Old plans (free-text `therapies`, no `schedule`) must still display; no data migration of old text.
- Backend tests stay green (449 baseline + new). Frontend `npm run lint` + `npm run build` green.

## Review Focus

1. Plan start mid-week with WEEKLY on an earlier weekday → first session is the next occurrence inside the window, not before start_date.
2. Ticking a MISSED session "done today" keeps planned_date and sets done_on=today (DONE_LATE), and it leaves the Pending list.
3. Editing a plan after some sessions are DONE must not delete or duplicate them.
4. Extending a plan by 7 days continues the alternate-day / bi-weekly cadence from the original start_date, not restarting.
5. An owner hitting tick/skip endpoints gets 403; a doctor not assigned to the pet gets 404.

---

### Task 1: Backend — catalogue, schedule, sessions, endpoints

**Files:**
- Modify: `backend/appointments/models/clinical.py` (TreatmentPlan: `schedule` JSONField default=list; frequency choices; new `RehabSession` model)
- Create: `backend/appointments/rehab.py` (catalogue constant, `generate_dates(plan_start, plan_end, frequency, weekdays) -> list[date]`, `sync_sessions(plan, today) -> None`)
- Modify: `backend/appointments/serializers.py` (TreatmentPlanSerializer: `schedule` with validation, `sessions` nested read-only with derived `display_status`; RehabSessionSerializer)
- Modify: `backend/appointments/views/clinical.py`, `backend/appointments/urls.py`, `backend/appointments/views/owner.py` (owner payload includes sessions read-only)
- Create migration; Test: `backend/appointments/tests/test_rehab_checklist.py`

**Interfaces (Produces):**
- `TreatmentPlan.schedule`: `[{"therapy": str, "frequency": FREQ_CODE, "weekdays": [int]}]`
- `RehabSession`: `id` UUID, `plan` FK related_name `sessions`, `therapy` str, `planned_date` date, `status` DUE|DONE|SKIPPED, `done_on` date null, `done_by` FK user null, `note` text blank, `skip_reason` text blank, `updated_at`. Unique (plan, therapy, planned_date).
- API (all under existing `/api/v1/` prefix, doctor-only unless stated):
  - `GET  rehab/therapies` → catalogue `[{group, therapies:[...]}]` + frequencies `[{code,label,weekdays_required}]` (any authenticated user)
  - `GET  rehab/today` → `{today, due:[session+pet+plan], pending:[missed sessions]}` for the doctor's pets
  - `POST rehab/sessions/<uuid>/done` body `{done_on?: "YYYY-MM-DD", note?}` (default today; done_on may not be in the future or before planned_date - but can be any day up to today)
  - `POST rehab/sessions/<uuid>/skip` body `{reason?}`
  - `POST rehab/sessions/<uuid>/undo` → back to DUE (clears done_on/done_by/skip_reason)
  - `POST treatment-plans/<uuid>/extend` body `{days?: int=7}` → end_date += days, sync sessions
- Plan create/update: if `duration`/`end_date` absent, end_date = start_date + 6. After save, call `sync_sessions`.
- Session JSON: `{id, therapy, planned_date, status, display_status, done_on, done_by_name, note, skip_reason}`

- [ ] Step 1: Write failing tests — `generate_dates` for each frequency (EVERYDAY 7 dates over a 7-day plan; ALTERNATE_DAY 4 dates; TWICE_WEEKLY weekdays [0,3] starting Wed → Thu, Mon; WEEKLY [0] starting Wed → next Mon only; BIWEEKLY [2] over 28 days → 2 dates 14 apart); validation errors for wrong weekday counts / unknown therapy; plan create defaults end_date = start+6 and creates sessions; tick done today / late; skip; undo; derived MISSED; edit-after-done keeps DONE rows; extend continues cadence; owner 403 on tick; other doctor 404; `rehab/today` lists due + pending with frozen time (use the same time-freezing approach as `test_facility_booking.py`).
- [ ] Step 2: Run `cd backend && DEBUG=true .venv/bin/python manage.py test appointments.tests.test_rehab_checklist` — expect FAIL.
- [ ] Step 3: Implement model + migration, `rehab.py`, serializers, views, urls, owner payload.
- [ ] Step 4: Focused tests PASS, then full suite PASS.
- [ ] Step 5: Commit `feat(backend): rehab plan schedule, per-therapy sessions and doctor tick endpoints`.

### Task 2: Staff frontend — plan builder, plan grid, Today's rehab

**Files:**
- Modify: `frontend/src/lib/types.ts` (RehabSession, schedule types), `frontend/src/api/*` (the module that already calls treatment-plans; add rehab calls there)
- Modify: `frontend/src/screens/PetDetailScreen.tsx` (replace free-text therapies + frequency/duration selects with the builder; render plan grid)
- Create: `frontend/src/components/rehab/PlanBuilder.tsx`, `frontend/src/components/rehab/PlanGrid.tsx` (prop `readOnly`), `frontend/src/screens/TodayRehabScreen.tsx`; register the screen in the app's existing router/nav for doctors
- Uses `todayISO()` from `frontend/src/lib/dates.ts`

**Behaviour:**
- Builder: catalogue from `GET rehab/therapies`, grouped checkboxes; for each ticked therapy a frequency select and, when required, weekday chips (Mon..Sun) enforcing the required count; start date (default today); duration 7 (default) / 14 / 28 / custom end date.
- Grid: rows = therapies, columns = plan dates (scroll horizontally beyond 7); cell states ✓ Done, ✓ late (tooltip "planned Wed, done Thu"), ✗ Missed, – Skipped, ○ Due, blank not planned. Progress bar "X of Y done · N late · N skipped". Doctor click on a Due/Missed cell → popover: "Done today" / "Done on…" (date input max today, min planned_date) / "Skip" (reason) ; on Done/Skipped → "Undo". When today >= end_date: banner with Extend 7 days / Edit / Mark complete.
- Today screen: "Due today" grouped by pet with one-tap tick; "Pending" (missed) with Done today / Done on… / Skip. Empty states for both.
- Old plans without `schedule`: show the existing text summary, no grid.

- [ ] Step 1: Implement; Step 2: `npm run lint && npm run build` green; Step 3: drive it in the browser against the local backend (create plan, tick, late tick, skip, undo, extend) and screenshot; Step 4: commit `feat(frontend): rehab plan builder, checklist grid and Today's rehab screen`.

### Task 3: Owner view — read-only checklist

**Files:** Modify `frontend/src/screens/OwnerPetDetailScreen.tsx` to render `PlanGrid` with `readOnly` for plans that have sessions (fall back to existing text for old plans).

- [ ] Step 1: Implement; Step 2: lint + build; Step 3: verify as an owner in the browser that no tick controls appear; Step 4: commit `feat(frontend): owners see the rehab checklist read-only`.
