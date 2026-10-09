# Boarding Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boarding (Indoor Facility) stays get an emergency contact, are recognised against existing clients, can be converted into a patient record, show the pet's previous reports to the clinic, and hold a bed while the owner finishes booking.

**Architecture:** `BoardingBooking` gains emergency-contact fields, nullable `owner`/`pet` links, a `HELD` status with `expires_at` (mirroring `FacilityBooking`'s hold model and `FACILITY_HOLD_SECONDS`). Matching runs server-side on create; staff see the match, convert, and reports. The public landing form holds a bed with a countdown, then confirms.

**Tech Stack:** Django 6 + DRF (`backend/appointments`), React/TS staff SPA (`frontend/`), React landing (`landing/`).

**Spec:** Client handwritten note 2026-10-08 "Boarding": add emergency contact number; existing user → show their things, validate; appointments not converted to patient; enquiry; previous reports; slot holding (not done). Owner confirmed this reading in chat 2026-10-08.

## Global Constraints

- Emergency contact: `emergency_contact_name` (optional, ≤150) + `emergency_contact_phone` (REQUIRED on new bookings, validated/normalised with the existing phone validator in `backend/appointments/validators.py`; must differ from `owner_phone` after normalisation → 400 "Emergency contact must be a different number").
- Privacy: the public (anonymous) API must NEVER reveal whether a phone belongs to an existing client, nor return any client/pet/report data. Matching results are visible only to doctors.
- Matching: normalised `owner_phone` equals an existing owner's normalised phone (`Pet.owner_phone` or the owner account's `phone`) → link `owner`; if that owner has exactly one pet whose name matches `pet_name` case-insensitively (trimmed) → link `pet`. Ambiguity (several owners/pets) → leave unlinked; staff resolve via convert.
- Convert (doctor-only, idempotent): find-or-create owner by normalised phone (fallback email) and pet by name under that owner, reusing the enquiry-convert owner/pet creation helpers/patterns in `views/enquiries.py`; links the booking; never creates duplicates on a second call.
- Previous reports: the doctor's boarding booking payload includes the linked pet's diagnostic reports (id, report_type, label, uploaded_at, file URL) — same serializer the pet page uses. None when unlinked.
- Hold: `HELD` + `expires_at = now + FACILITY_HOLD_SECONDS` (600 s). Unexpired holds count against the 6-bed capacity exactly like ACTIVE stays; expired holds never do. Confirm within the window turns HELD → PENDING with the full intake; after expiry → 410 "Hold expired". Rate limits/honeypot same as create.
- "Now"/"today" via `django.utils.timezone` (`localdate()` for dates).
- Existing direct create (`POST facility/boarding`) keeps working (doctor-entered stays and old clients).
- Backend suite green (503 baseline + new); frontend and landing lint/build green; landing `npm run seo:check` green.

## Review Focus

1. Two visitors holding the last bed at once: exactly one hold succeeds; the other gets 409.
2. An expired hold frees its bed for availability and new holds without any cron.
3. Anonymous create with an existing client's phone returns the same response shape/text as a new phone (no enumeration).
4. Convert twice → one owner, one pet; convert a booking already auto-linked → no duplicate.
5. Emergency phone equal to the owner phone written with different spacing/+91 → rejected.

---

### Task 1: Backend — fields, matching, convert, reports, holds

**Files:** `backend/appointments/models/boarding.py`, new migration, `backend/appointments/serializers.py` (boarding serializers), `backend/appointments/views/boarding.py`, `backend/appointments/urls.py`, `docs/API_CONTRACT.md`; Test: `backend/appointments/tests/test_boarding_upgrades.py` (time-freeze pattern from `test_facility_booking.py`).

**Interfaces (Produces):**
- Model: `emergency_contact_name`, `emergency_contact_phone`, `owner` FK(User, null, SET_NULL, related_name `boarding_bookings`), `pet` FK(Pet, null, SET_NULL, related_name `boarding_bookings`), `expires_at` DateTimeField null; status adds `HELD`.
- `POST facility/boarding/holds` (public) `{check_in, duration}` → 201 `{reference, expires_at, check_out, price}`; 409 when full.
- `POST facility/boarding/holds/<ref>/confirm` (public) full intake body as today's create + emergency fields → 201 `{reference, detail}`; 410 expired; 404 unknown/non-HELD.
- `POST facility/boarding/<ref>/convert` (doctor) → booking JSON with `owner_id`, `pet_id`.
- Doctor list/detail booking JSON adds: `emergency_contact_name`, `emergency_contact_phone`, `owner_id`, `pet_id`, `pet_link_status` ("linked" | "owner_only" | "unlinked"), `previous_reports` [...].
- Doctor list hides HELD rows by default.

- [ ] Steps: failing tests for every Global Constraint + Review Focus item → implement → focused then full suite green → commit `feat(backend): boarding emergency contact, client matching, convert, reports and bed holds`.

### Task 2: Landing — emergency contact + hold countdown

**Files:** `landing/src/components/IndoorFacilityBooking.tsx` (+ `landing/src/lib/clinicApi.ts` helpers if needed).

- Emergency contact name + phone fields (phone required, client-side check that it differs from the owner phone).
- When duration + check-in date are chosen and beds are free: "Hold this bed" places a hold and shows a mm:ss countdown (reuse the facility slot booking countdown pattern in `FacilitySlotBooking.tsx`); submit confirms the hold. On 410 show "Your hold expired — hold again" and reset; on 409 show "Just taken — pick another date". Changing date/duration after holding releases nothing server-side (expiry handles it) but starts a new hold.
- Generic success text identical for new and existing clients.

- [ ] Steps: implement → `npx tsc --noEmit -p . && npm run build && npm run seo:check` → browser check against local API → commit `feat(landing): boarding emergency contact and bed hold countdown`.

### Task 3: Staff frontend — client match, convert, reports

**Files:** `frontend/src/api/boarding.ts`, `frontend/src/lib/types.ts`, `frontend/src/screens/BoardingScreen.tsx` (+ small components if it grows).

- Show emergency contact on each booking (tap-to-call link).
- Badge: "Existing client · <pet>" (linked, link to pet page) / "Existing client · new pet" (owner_only) / "New client" (unlinked).
- "Convert to patient" button when not linked (or owner_only) → convert endpoint → refresh; then link "Open pet record".
- "Previous reports" disclosure listing the linked pet's reports (type label, date, open file).
- Doctor-entered boarding form (if present in this screen) gains the emergency contact fields.

- [ ] Steps: implement → `npm run lint && npm run build` → browser check → commit `feat(frontend): boarding client match, convert to patient and previous reports`.

### Task 4: End-to-end browser test (Agency QA)

Drive the full local stack in a real browser and report PASS/FAIL per scenario with screenshots:
- Rehab: doctor builds plan (Hydrotherapy every day + Laser twice weekly Mon/Thu), ticks today, late tick, skip, undo, Today's Rehab, extend, mark complete → no tick controls and no future Missed; owner sees read-only grid.
- Boarding: landing hold → countdown → confirm with emergency contact; second hold when full → 409 message; existing-client phone → staff sees "Existing client" badge + previous reports; new client → Convert to patient → pet record exists; emergency = owner phone → error.
Fixes for failures go through the normal fix loop.
