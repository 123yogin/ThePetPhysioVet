# API Contract — v1 (authoritative)

**Status:** approved by Tech Lead, 2026-08-20. Supersedes ad-hoc endpoint invention.
**Traceability:** SRS §3.1–§3.9; PRODUCT_PLAN phases 2–7. CLAUDE.md rules 1, 2, 4, 6.

## ⚠️ BREAKING CHANGE — 2026-09-02: every `id` is now a UUID string

All 16 models moved from sequential integer (`BigAutoField`) primary keys to
`UUIDField(primary_key=True, default=uuid.uuid4, editable=False)`. This is a
breaking change to **every path parameter and every `id`/`*_id` field in every
response shape below** — nothing in this document was renamed, but every
value that used to be an integer (`1`, `42`, ...) is now a UUID string
(`"8496f558-b2c6-4896-997f-e5d37efea0cf"`).

Concretely:
- Every `:id`/`:pk` path segment (`/pets/:id`, `/appointments/:id`,
  `/diagnoses/:id`, `/treatment-plans/:id`, `/invoices/:id`,
  `/owner/pets/:id`, `/owner/appointments/:id`, `/owner/invoices/:id`, etc.)
  now requires a syntactically valid UUID. A non-UUID path segment (e.g. the
  old-style `/pets/1`) no longer resolves to the view at all — Django's URL
  resolver 404s before permission/ownership checks ever run, which still
  satisfies the "404, not 403, on a bad id" posture in §4.3, just one layer
  earlier than before.
- Every `id`, `pet_id`, `invoice_id` field in every response body is now a
  UUID string, not a number. Clients must not parse, sort, or do arithmetic
  on these values — they are opaque identifiers only (this was already
  implicitly true; it's now also enforced by the type).
- Reason: sequential ids leaked business volume (pet #4, appointment #armed
  count) to anyone reading a URL, and were ambiguous across the planned
  service split (CLAUDE.md target architecture) — a `pet_id: 7` is
  meaningless without knowing which service's sequence it came from. See
  `backend/appointments/migrations/0012_add_uuid_fields.py` through
  `0014_finalize_uuid_pks.py` for the migration itself, and `0014`'s
  docstring for the SQLite-specific mechanics (why it has to be one
  migration, not one per model).
- Not changed: field *names* (`id`, `pet_id`, `invoice_id`, ...), route
  *paths* (aside from the id format), response *shapes*, or any business
  logic.

**AMENDED 2026-08-21 (post-launch audit fixes).** Summary of changes — see the
relevant sections below for full detail:
- `Appointment.VISIT_TYPES` extended with `Hydrotherapy` and `LaserTherapy`
  (existing codes unchanged); new `GET /appointment-options` exposes the
  canonical list (§3 Appointments).
- `visit_type_display` is now derived server-side from `visit_type` on
  create — it is no longer a dead column that always read "Initial
  Consultation" (§3 Appointments).
- `POST /appointments/:id/reschedule` (doctor route) now actually moves
  `date`/`time` and sets `status: "Rescheduled"`, instead of enqueuing an
  owner-style reschedule request against itself (§3 Appointments).
- `POST /appointments/:id/reschedule-reject` no longer clears
  `reschedule_reason` (§3 Appointments).
- `POST /pets` now links the new pet to a matching `OWNER` account when
  `owner_phone` unambiguously matches exactly one such account (§2, Pet
  ownership note).
- New: `POST /appointments/:id/confirm` (doctor, Pending → Confirmed), `POST
  /owner/appointments/:id/cancel`, `GET /owner/invoices/:id`.
- Doctor-facing list/aggregate endpoints (`GET /pets`, `GET /appointments`,
  `GET /invoices`, `GET /revenue`, `GET /queries/inbox`, the money tiles on
  `GET /dashboard/stats`) are now scoped to the requesting doctor (§4 AuthZ).
- `GET /queries/inbox` only returns threads with at least one message; a
  plain `GET` on a pet's thread no longer creates a persistent empty thread
  (§3 Queries).

## How this document was derived

`frontend/src/lib/types.ts` and `frontend/src/api/*.ts` were written against a complete,
internally consistent API. The Django backend implements roughly 20% of it. Rather than
rewrite the SPA, **the frontend types are the contract and the backend conforms to them.**

Where this document and the code disagree, this document wins.

Base path: `/api/v1`. All responses JSON. All authenticated routes take
`Authorization: Bearer <access>`.

---

## 1. Data model (target)

New and reshaped models. `owner`/`doctor` are FKs to `UserProfile` — these are what make
CLAUDE.md rule 4 (object-level authZ) implementable.

| Model | Key fields |
|---|---|
| `UserProfile` | existing + `role`, `phone`, clinic fields |
| `Pet` | + `owner` FK→UserProfile (null=True during backfill), `doctor` FK→UserProfile null |
| `Appointment` | + `doctor` FK→UserProfile, `pet` FK **required** |
| `DiagnosticReport` | `pet` FK, `report_type` (XRAY/MRI/CT/ULTRASOUND/BLOOD/OTHER), `file`, `original_filename`, `size`, `mime`, `notes`, `uploaded_at` |
| `TreatmentPlan` (reshape) | `pet` FK, `therapies` JSON list, `frequency`, `frequency_custom`, `duration`, `duration_custom`, `start_date`, `end_date`, `status` (ACTIVE/COMPLETED/PAUSED), `completed_at`, `created_at`, `updated_at` |
| `ProgressNote` | `plan` FK, `session_no`, `notes`, `created_at` |
| `Invoice` (reshape) | `invoice_no` unique, `pet` FK, `owner` FK, `subtotal`, `tax`, `total`, `payment_status` (PAID/PENDING/PARTIALLY_PAID), `payment_mode` (post_treatment/pre_payment/package), `created_at` |
| `LineItem` (was InvoiceItem) | `invoice` FK, `description`, `quantity`, `unit_price`, `amount` |
| `Payment` | `invoice` FK, `amount_paid`, `gateway_ref`, `status`, `paid_at`, **`idempotency_key` unique null** |
| `Package` | `invoice` OneToOne, `total_sessions`, `used_sessions`; `remaining_sessions` computed |
| `Notification` | `user` FK, `type`, `message`, `is_read`, `created_at`, `link` |
| `QueryThread` | `pet` FK **unique** |
| `QueryMessage` | `thread` FK, `sender` FK→UserProfile, `sender_role`, `sender_name`, `message`, `sent_at` |
| `QueryAttachment` | `message` FK, `file`, `original_filename`, `mime`, `size` (max 5 per message) |
| `NotificationPref` | existing; key on `owner_phone` |

**Ownership backfill.** A data migration must populate `Pet.owner` by matching
`Pet.owner_phone` against `UserProfile.phone`, and `Invoice.owner` from its pet. Rows that
don't match stay null and are visible to doctors only — never to a random owner.
`Appointment.doctor` backfills to the single existing DOCTOR user.

**Idempotency (rule 6).** `Payment.idempotency_key` is unique. A repeated POST with the
same key returns the original payment and does not double-credit.

---

## 2. Response shapes

Field names are **exactly** as in `frontend/src/lib/types.ts`. Do not rename, do not add a
parallel alias, do not drop a field because it seems redundant. Notable traps:

- Invoice is `invoice_no`, `payment_status`, `subtotal`, `tax`, `total`, `line_items`,
  `amount_paid`, `balance_due` — **not** `invoice_number`, `status`, `items`.
- `Diagnosis` in the frontend is a **diagnostic report file upload**, not a text diagnosis.
  The current text-based `Diagnosis` model does not satisfy it.
- `TreatmentPlan.therapies` is a **list of strings**, not free text.
- Money fields serialize as numbers or numeric strings; `currency` is `"INR"`.
- `Appointment` includes `species` and `pet_type` (added 2026-08-21) — **read-only,
  derived** from the linked `Pet` (`source="pet.species"` / `"pet.pet_type"`, the same
  `read_only` pattern as `pet_id`), not stored columns on `Appointment` itself. Added
  so the frontend can render the correct animal icon on the patient list, calendar,
  and inbox screens without a second `GET /pets` round trip purely to look up species
  by `pet_id`. A client-supplied `species`/`pet_type` in a `POST /appointments` or
  `POST /owner/appointments` body is silently ignored — same as `pet_id`, it cannot
  be used to spoof or reassign the appointment's actual pet. `GET /appointments` and
  `GET /owner/appointments` use `select_related("pet")` to serve this without an N+1
  query per row. The same addition was made to `QueryThread.pet` (see Queries below)
  for the identical reason — the doctor's inbox had the same icon bug.
- **`Pet.pet_type` vs `Pet.species` vs `Pet.breed` (findings, 2026-08-21 — no schema
  change made).** Investigated while fixing the icon bug above; flagged for the Tech
  Lead to decide whether to deprecate one. `Pet` has all three columns. The doctor
  pet-creation form (`frontend/src/screens/PetFormScreen.tsx`) submits `pet_type` as
  a **byte-for-byte copy of `species`** (`formData.append('pet_type', species)`) —
  every pet created through that form has `pet_type === species`, and `breed` is
  submitted separately as genuine free text. So for real, form-created pets,
  `pet_type` carries zero information `species` doesn't already have; `breed` is the
  only field actually holding breed-level detail. `seed_data.py`, however, populates
  `pet_type` with breed-like strings instead ("Golden Retriever", "Persian Cat",
  "Labrador Retriever" — sometimes matching `breed`, sometimes not: Luna is
  `pet_type="Persian Cat"` but `breed="Persian"`), which is inconsistent with what the
  live form writes and is the direct root cause of the icon bug this session fixed:
  code that inferred species from `pet_type` worked for Luna only because her breed
  string happens to contain the word "Cat", and failed for every dog. Recommendation
  for consideration: `pet_type` looks like a deprecation candidate (drop it, or stop
  the frontend form from writing `species` into it and give it a real, distinct
  purpose) — `species` + `breed` already cover the same ground without the
  duplication. Not changed here per instruction; this is a finding, not an action.
- `Pet` includes `doctor_name` — a **read-only, derived** display string
  (`first_name + " " + last_name`, falling back to `username` when both are blank),
  built from `Pet.doctor`. It is `null` when `Pet.doctor` is unset. It is
  serializer-derived, not a stored column, and cannot be set via `POST /pets` or
  `PATCH /pets/:id` — a client-supplied `doctor_name` in the body is silently ignored.
  Only the doctor's name is exposed; their id/email/phone are not (CLAUDE.md rule 4).
- `Pet.doctor` assignment on creation (fixed 2026-08-21, previously unset on both
  paths): `POST /pets` (doctor-facing) always assigns `doctor = request.user` — the
  caller is guaranteed a DOCTOR by role. `POST /owner/pets` has no creating doctor to
  assign, so it inherits the doctor from the owner's *other* pets **only when
  unambiguous** (all of the owner's existing pets share exactly one doctor);
  otherwise (no existing pets, or more than one distinct doctor among them) `doctor`
  stays `null` and `doctor_name` renders as "Not yet assigned" until a doctor claims
  the pet some other way. A client-supplied `doctor` field in the POST body is
  ignored on both paths (not a serializer field).
- `Pet.owner` assignment on `POST /pets` (fixed 2026-08-21 — B4). A doctor-created
  pet previously never had `owner` set, so it never showed up in that pet owner's
  own portal (`GET /owner/pets`) even when the doctor entered the owner's exact
  phone number. The view now links the new pet when the entered `owner_phone`
  unambiguously matches **exactly one** `UserProfile` with `role="OWNER"`.
  `UserProfile.phone` is not unique — 0 or >1 matches leave `owner` `null` rather
  than guessing. Migration `0010_backfill_pet_owner_by_phone` applies the same rule
  to pre-existing rows. `POST /owner/pets` is unaffected (it already force-assigns
  `owner = request.user`).

---

## 3. Endpoints

### Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/auth/me` | — | `User` |
| POST | `/auth/login` | `{username, password, role?}` | `{access, refresh, ...User}` |
| POST | `/auth/signup` | `{username, password, email, first_name, last_name, phone?}` | `{access, refresh, ...User}` |
| POST | `/auth/refresh` | `{refresh}` | `{access, refresh}` — **rotates** |
| POST | `/auth/logout` | `{refresh}` | 204, refresh blacklisted |
| PATCH | `/auth/profile` | partial `User` | `User` |
| POST | `/auth/password-reset/request` | `{email}` | 200, **always the same body** whether or not `email` matches an account (see amendment below) — `AllowAny` |
| POST | `/auth/password-reset/confirm` | `{token, new_password}` | 200 on success; 400 (RFC-7807, real `detail`) on an invalid/expired/already-used token or a password that fails validation — `AllowAny` |

**AMENDED 2026-09-02 — password reset added.** `POST /auth/password-reset/request`
returns an **identical 200 body regardless of whether `email` belongs to an account** —
a different response for a known vs unknown address is a user-enumeration oracle
against a database of clinical records, and is not permitted even as a different
error shape or a timing difference. On a match it creates a single-use,
30-minute-expiry `PasswordResetToken` (only a SHA-256 hash of the token is ever
stored — see `appointments/models.py`) and emails a link to
`{FRONTEND_BASE_URL}/reset-password?token=...` (`django.core.mail`; console backend
in `DEBUG`, real `EMAIL_BACKEND`/`DEFAULT_FROM_EMAIL` required via env otherwise,
same fail-fast posture as `SECRET_KEY`). Requesting a new token invalidates any
older unused one for that user. The endpoint is rate-limited per email and per IP
(Django cache; 429 on both paths, so a 429 leaks nothing about existence either).
`POST /auth/password-reset/confirm` enforces the same password floor as
`SignupSerializer` (min length 6) plus this project's configured
`AUTH_PASSWORD_VALIDATORS`, and on success **blacklists every outstanding refresh
token for that user** (same blacklist path `/auth/logout` uses) — a password reset
must end sessions an attacker may hold.

**AMENDED 2026-08-20 after QA round 1.** Two blocking defects were traced to this
document, not to the implementation:

1. **Public signup must NOT accept `role`.** The original row listed it, and the
   engineer implemented it faithfully — which let anyone on the internet POST
   `role: "DOCTOR"` and immediately read every patient's name, phone, medical history
   and billing, because doctor routes are clinic-wide. Public signup now **always
   creates an OWNER**; a `role` in the body is ignored, never honoured. Doctor accounts
   are provisioned out-of-band (admin/management command).
2. **`role` is read-only on `PATCH /auth/profile`.** It was writable, so any owner
   could escalate to doctor with a single request and reuse their existing JWT —
   `IsDoctor` reads `user.role` live from the DB. `role`, `username`, `id`,
   `is_staff`, `is_superuser` are all read-only on that endpoint.
3. **`/auth/refresh` is added.** It was omitted, and `/token/refresh` was deleted as
   unused — leaving the SPA storing a refresh token it had no way to spend and a hard
   45-minute silent logout. See §6.7.
4. **`/auth/refresh` ROTATES (amended again after QA round 2).** It returns a new
   `refresh` alongside the new `access`, and blacklists the presented one.
   `ROTATE_REFRESH_TOKENS`/`BLACKLIST_AFTER_ROTATION` were set to `True` in settings and
   CLAUDE.md claimed a rotating posture, but **no code path actually rotated** — the
   original `{refresh} → {access}` shape made the settings dead configuration and left a
   stolen refresh token replayable for its full 7 days. The client must store both
   returned tokens.
5. **Uploads must be content-sniffed (added after QA round 2).** Validating only the
   client-supplied `Content-Type` header stops an honest browser and stops an attacker
   from nothing — the SVG restriction is bypassable by relabelling the part `image/png`.
   Compare the leading bytes against the signature for the declared type and reject a
   mismatch with 400. Serve media with `Content-Disposition: attachment`.

**`/auth/login` MUST call `django.contrib.auth.authenticate()` and return 401 on bad
credentials.** No username-only lookup. No role fallback. No anonymous default user
anywhere in the codebase.

### Dashboard
| GET | `/dashboard/stats` | — | `DashboardStats` |

`today_appointments` = today's appointments for the requesting doctor.
`active_treatments` = TreatmentPlan status ACTIVE (clinic-wide — not doctor-scoped;
out of scope for the 2026-08-21 L1 fix, which covered the money tiles specifically —
flagged for the Tech Lead as a related follow-on). `pending_payments` = sum of
`balance_due` over unpaid invoices
**for the requesting doctor** (amended 2026-08-21 — L1; same `pet__doctor` / orphan
posture as `/invoices`). `today_revenue` / `monthly_revenue` = sum of
`Payment.amount_paid` in range, same doctor-scoping. **All computed from the
database. No constants.** Before this amendment the "today's visits" tile was
doctor-scoped but the three money tiles were not — an inconsistency within the same
endpoint; verified as a no-op against the (single-doctor) seed data.

### Pets
| GET | `/pets?q=` | search name/breed/owner_name/owner_phone | `Pet[]` — **doctor-scoped** (amended 2026-08-21, L1; see §4.6 for the `doctor=NULL` claimable-pool rule) |
| POST | `/pets` | multipart, `photo` optional | `Pet` |
| GET | `/pets/:id` | — | `Pet` — **doctor-scoped, same as the list** (amended 2026-08-21, L1 follow-up: previously reachable by any doctor by ID even after the list was scoped) |
| PATCH | `/pets/:id` | partial | `Pet` — same scoping as `GET` |

### Appointments
| GET | `/appointments?pet=&owner=&date=` | | `Appointment[]` — **doctor-scoped** (amended 2026-08-21, L1; see §4.6 for the `doctor=NULL` claimable-pool rule) |
| POST | `/appointments` | `{pet, visit_type, date, time, reason_notes?}` | `Appointment` |
| GET | `/appointments/:id` | | `Appointment` — **doctor-scoped, same as the list** (amended 2026-08-21, L1 follow-up) |
| POST | `/appointments/:id/reschedule` | `{date, time}` | `Appointment` — doctor-scoped |
| POST | `/appointments/:id/complete` | | `Appointment` — doctor-scoped |
| POST | `/appointments/:id/confirm` | | `Appointment` — **new, 2026-08-21 (G1)**, doctor-scoped |
| POST | `/appointments/:id/reschedule-approve` | | `Appointment` — doctor-scoped |
| POST | `/appointments/:id/reschedule-reject` | | `Appointment` — doctor-scoped |
| GET | `/appointments/:id/share` | | `{whatsapp_url, sms_url, pet_name, owner_name, owner_phone}` — doctor-scoped |
| GET | `/appointment-options` | | `{visit_types: [{value, label}]}` — **new, 2026-08-21 (B1/B2)** |

**`species`/`pet_type` (added 2026-08-21).** `Appointment` responses now include
read-only `species` and `pet_type`, derived from the linked `Pet` — see §2 above for
the full rationale and the N+1 note.

**`visit_type` codes (amended 2026-08-21 — B1/B2).** `Appointment.VISIT_TYPES` is
`Initial` / `Followup` / `Reassessment` / `Hydrotherapy` / `LaserTherapy`. The first
three are unchanged from launch; the last two were added because the clinic offers
hydrotherapy and laser therapy and the model never had codes for them — every
booking attempting one of those services 400'd. `GET /appointment-options` (any
authenticated role) returns the canonical `{value, label}` list so the frontend has
one source of truth instead of three independently hardcoded vocabularies (the
actual root cause of the original defect).

**`visit_type_display` (amended 2026-08-21 — B5).** Previously a stored column that
defaulted to `"Initial Consultation"` and was never written by the API (read-only in
the serializer, only ever populated by `seed_data`) — every appointment booked
through the API displayed "Initial Consultation" regardless of its real
`visit_type`. `AppointmentSerializer.create` now derives it from `VISIT_TYPES`.
Migration `0009_backfill_visit_type_display` corrects pre-existing rows the same way.

**Doctor reschedule vs. owner reschedule-request (amended 2026-08-21 — B3).**
`POST /appointments/:id/reschedule` is a **doctor-only** route and moves `date`/
`time` directly, sets `status: "Rescheduled"`, and clears any stale
`requested_date`/`requested_time`. It is **not** the same flow as
`POST /owner/appointments/:id/reschedule-request` (owner-only, sets
`status: "Reschedule Requested"` and leaves the change pending until the doctor
calls `reschedule-approve`/`reschedule-reject`) — that flow is unchanged.

**`reschedule-reject` preserves `reschedule_reason` (amended 2026-08-21 — D8).**
Declining a reschedule request used to wipe `reschedule_reason`, destroying the only
record of what the owner had asked for. It is now left in place; only the pending
`requested_date`/`requested_time` are cleared and `status` returns to `Confirmed`.

**`POST /appointments/:id/confirm` (new, 2026-08-21 — G1).** Doctor-only, scoped to
the requesting doctor's own appointments (a mismatch is **404**, not 403 — this
codebase's "existence must not leak" posture applies here too even though it's a
doctor route). Only a `Pending` appointment (i.e. one created via
`POST /owner/appointments`) can be confirmed; confirming anything else is a 400.
Moves `status: "Pending"` → `"Confirmed"`.

### Diagnostic reports
| GET | `/pets/:id/diagnoses` | | `Diagnosis[]` — **doctor-scoped via the pet** (amended 2026-08-21, L1 follow-up) |
| POST | `/pets/:id/diagnoses` | multipart `{file, report_type, notes?}` | `Diagnosis` — same scoping as `GET` |
| DELETE | `/diagnoses/:id` | | 204 — **doctor-scoped via `pet__doctor`** (amended 2026-08-21, L1 follow-up: previously any doctor could delete another practice's diagnostic report by ID) |

Validate upload: max 10 MB, allow `image/*` + `application/pdf` + `application/dicom`.
Reject anything else with 400. Store `original_filename`, `size`, `mime` from the upload.

### Treatment plans
| GET | `/pets/:id/treatment-plans` | | `TreatmentPlan[]` — **doctor-scoped via the pet** (amended 2026-08-21, L1 follow-up) |
| POST | `/pets/:id/treatment-plans` | plan body | `TreatmentPlan` — same scoping as `GET` |
| GET | `/treatment-plans/:id` | | `TreatmentPlan` — **doctor-scoped via `pet__doctor`** (amended 2026-08-21, L1 follow-up) |
| POST | `/treatment-plans/:id/progress-notes` | `{session_no?, notes}` | `ProgressNote` — same scoping |

### Billing
| GET | `/invoices?pet=` | | `Invoice[]` — **doctor-scoped** (amended 2026-08-21, L1: `pet__doctor`, plus invoices with no `pet` at all — see below) |
| POST | `/invoices` | `{pet_id, line_items[], tax?, payment_mode?, total_sessions?}` | `Invoice` — the `pet_id` lookup is doctor-scoped too (amended 2026-08-21, L1 follow-up) |
| GET | `/invoices/:id` | | `Invoice` — **doctor-scoped, same as the list** (amended 2026-08-21, L1 follow-up: previously reachable by any doctor by ID) |
| POST | `/invoices/:id/payments` | `{amount_paid, gateway_ref?, idempotency_key?}` | `Payment` — doctor-scoped (a money-touching mutation; previously any doctor could take payment on another practice's invoice by ID) |

**Doctor-scoping and orphan invoices (amended 2026-08-21 — L1, extended to detail
routes the same day).** `Invoice` has no direct `doctor` FK; doctor-scoping on
`GET/POST /invoices`, `GET /invoices/:id`, `POST /invoices/:id/payments`, and `GET
/revenue` all join through `Invoice.pet.doctor` via the shared `_doctor_scoped()`
helper. An invoice with `pet = null` (the handful of legacy rows an ownership
backfill couldn't match — see §1) is not linked to any doctor either; per §4.6's
NULL-doctor "claimable pool" decision, it remains visible to **every** doctor
rather than being hidden from all of them — the same rule now applies uniformly
whether the invoice is reached via the list or by ID. Verified against the
(single-doctor) seed data and base test fixtures: this is a no-op there, since
neither creates a `pet = null` invoice.

**Money guards (added after QA round 1).** `amount_paid` must be `> 0` **and
`<= invoice.balance_due`** — overpayment is rejected with 400, never allowed to drive
`balance_due` negative. `unit_price` and `quantity` on a line item must be `>= 0`;
a negative `unit_price` previously minted a negative invoice and dragged
`/revenue.total_revenue` below zero. `invoice_no` must be derived from
`Max(invoice_no)` inside `select_for_update()` (or a DB sequence) — a `COUNT()`-based
scheme collides after any delete and races under concurrent POSTs, returning 500.
| GET | `/revenue?range=today\|month\|year` | | `{range, total_revenue, collected, pending, currency, series[]}` — **doctor-scoped** (amended 2026-08-21, L1; same `pet__doctor` / orphan-invoice posture as `/invoices`) |

Server computes `subtotal` from line items, `total = subtotal + tax`,
`amount_paid = sum(payments)`, `balance_due = total - amount_paid`, and derives
`payment_status` (PAID / PARTIALLY_PAID / PENDING). **Never trust a client-sent total.**
`/revenue` returns real sums — if there is no revenue it returns zeros, never a placeholder.

### Notifications
| GET | `/notifications` | | `{results: NotificationItem[], unread_count}` |
| POST | `/notifications/mark-all-read` | | 204 |
| GET | `/notification-prefs?owner_phone=` | | pref |
| PUT | `/notification-prefs` | `{owner_phone, sms_opt_out}` | pref |

### Queries
| GET | `/queries/inbox` | | `{results: QueryThread[]}` — **doctor-scoped, messages-only** (amended 2026-08-21, D3 + L1) |
| GET | `/pets/:id/queries` | | `QueryThread` — **doctor-scoped** (amended 2026-08-21, L1 follow-up: previously any doctor could read/post into another practice's patient conversation by pet ID) |
| POST | `/pets/:id/queries` | multipart `{message, attachments[]}` (max 5) | `QueryMessage` — same scoping as `GET` |

Threads are append-only. No edit, no delete — messages are audit-retained.
`sender_name` is derived from `request.user`, **never** taken from the request body.

**No phantom threads (amended 2026-08-21 — D3).** A plain `GET` on
`/pets/:id/queries` or `/owner/pets/:id/queries` no longer creates a `QueryThread`
row as a side effect — it used to call `get_or_create`, so merely *viewing* a
patient with no prior conversation created a permanent empty thread that then
showed up in `GET /queries/inbox` forever. GET now reads without creating, and
returns the same `QueryThread` shape (`messages: []`, `message_count: 0`,
`awaiting_reply: false`) whether or not a thread row exists yet; `POST` is
unaffected and still creates the thread on first use. `GET /queries/inbox` itself
only returns threads with **at least one message**, and is scoped to the
requesting doctor's own patients (`pet__doctor=request.user`).

**`QueryThread.pet.species` (added 2026-08-21).** The nested `pet` object
(`{id, name, pet_type, owner_name}`) now also carries `species`. `pet_type` holds
breed-level text (e.g. "Golden Retriever", "Persian Cat"), not the `Dog`/`Cat`
species value — most dog breed strings contain no dog-related word, so any caller
picking an animal icon off `pet_type` misidentified every dog while a cat breed
happened to work only when its text coincidentally contained "Cat". `species` is
the field that actually answers "what animal is this". `pet_type` is left in the
payload for existing callers; new code should prefer `species`. See §2 for the
identical addition on `Appointment`, and the `pet_type`/`species`/`breed`
redundancy note there.

### Owner portal
| GET | `/owner/pets` | | `Pet[]` — only `owner=request.user` |
| POST | `/owner/pets` | multipart | `Pet`, owner forced to `request.user` |
| GET | `/owner/pets/:id` | | `Pet & {diagnoses[], treatment_plans[]}` |
| POST | `/owner/pets/:id/diagnoses` | multipart | `Diagnosis` |
| POST | `/owner/pets/:id/history` | `{medical_history?, complaint?, notes?, age?, weight?}` | `Pet` |
| GET | `/owner/appointments` | | `Appointment[]` — own pets only |
| POST | `/owner/appointments` | `{pet_id, date, time, visit_type, reason_notes?}` | `Appointment` |
| POST | `/owner/appointments/:id/accept` | | `Appointment` |
| POST | `/owner/appointments/:id/reschedule-request` | `{date, time, reason}` | `Appointment` |
| POST | `/owner/appointments/:id/cancel` | | `Appointment` — **new, 2026-08-21 (G2)** |
| GET | `/owner/invoices` | | `Invoice[]` — own only |
| GET | `/owner/invoices/:id` | | `Invoice` — own only — **new, 2026-08-21 (G3)** |
| GET | `/owner/pets/:id/queries` | | `QueryThread` |
| POST | `/owner/pets/:id/queries` | multipart | `QueryMessage` |

**`POST /owner/appointments/:id/cancel` (new, 2026-08-21 — G2).** Owner-only,
object-scoped — a cross-owner request is **404**, not 403 (§4.3). Moves any
non-terminal status to `"Cancelled"` (already a valid `Appointment.STATUS_CHOICES`
value). Rejected with 400: an appointment that is already `Completed` or
`Cancelled` (nothing left to undo — and "cancelling" a visit that already happened
would corrupt the clinical/billing record), or one whose `date` is in the past.

**`GET /owner/invoices/:id` (new, 2026-08-21 — G3).** Owner-only, object-scoped
(cross-owner is 404). Read-only — same `Invoice` shape as the doctor-facing
`GET /invoices/:id` (line items, `amount_paid`, `balance_due`, etc.); no payment
capability here.

---

## 4. AuthZ rules (rule 4 — non-negotiable)

1. Default DRF permission is `IsAuthenticated`. `AllowAny` is permitted on exactly five
   routes: `/auth/login`, `/auth/signup`, `/auth/refresh`,
   `/auth/password-reset/request`, and `/auth/password-reset/confirm` (widened
   2026-09-02 — the two password-reset routes legitimately join the list; see §3 Auth).
   **`/auth/refresh` is necessarily `AllowAny`** — the access token has expired, which is
   the entire point — but `AllowAny` at the permission layer must never mean
   unauthenticated token issuance: the view fully verifies the refresh token's signature,
   expiry, `token_type` claim, and blacklist status before minting anything. The two
   password-reset routes are `AllowAny` for the identical reason: a locked-out caller
   cannot be expected to hold a valid access token either, and neither view mints a
   session token — `confirm` only changes a password and revokes existing sessions.
2. Doctor routes require `role == "DOCTOR"`. Owner routes require `role == "OWNER"`.
3. Every `/owner/*` handler filters by `request.user` in `get_queryset()`. An owner
   requesting another owner's pet gets **404**, not 403 — do not leak existence.
4. There is no anonymous fallback user. Delete every
   `UserProfile.objects.filter(role="DOCTOR").first()` default.
5. Object-level checks live in the view, not only in the queryset — a detail route
   re-verifies ownership before mutating.
6. **Doctor-scoping (added 2026-08-21 — L1; completed 2026-08-21 in a same-day
   follow-up).** Every doctor-facing route that fetches a `Pet`, `Appointment`,
   `DiagnosticReport`, `TreatmentPlan`, `Invoice`, `Payment`, or `QueryThread` —
   list **and** single-object (detail/action) — is scoped to the requesting
   doctor via the shared `_doctor_scoped()` helper in `views.py`. This includes
   every list endpoint in this document already marked "doctor-scoped" above,
   **and** every by-ID detail/action route on those same resources: `GET/PATCH
   /pets/:id`, `GET/POST /pets/:id/diagnoses`, `DELETE /diagnoses/:id`, `GET/POST
   /pets/:id/treatment-plans`, `GET /treatment-plans/:id`, `POST
   /treatment-plans/:id/progress-notes`, `GET /appointments/:id`, `POST
   /appointments/:id/{reschedule,complete,confirm,reschedule-approve,
   reschedule-reject}`, `GET /appointments/:id/share`, `GET /invoices/:id`, `POST
   /invoices/:id/payments`, the `pet_id` lookup inside `POST /invoices`, and
   `GET/POST /pets/:id/queries`. A mismatch is **404**, not 403, on every one of
   these (§4.3's "existence must not leak" posture, applied here even though
   these are doctor routes rather than owner ones).

   The initial L1 pass fixed only the list endpoints; a second doctor could
   still read, reschedule, complete, invoice, and take payment on another
   practice's patient by ID — objectively worse than being uniformly unscoped,
   because the fixed list endpoints made it look closed. This is now closed
   uniformly across list and detail.

   **NULL-doctor decision (deliberate, not a guess).** A row whose doctor FK
   (`doctor` directly, or `pet__doctor`/`invoice__pet__doctor` where the model
   has no direct FK) is `NULL` is a **claimable pool**: visible to **any**
   doctor, not hidden from all of them. Rationale: a brand-new owner's first
   pet has `doctor = null` whenever `owner_pets_view` can't unambiguously infer
   one (see §2, Pet ownership note), and nothing else in this codebase ever
   lets a doctor claim a patient afterwards — treating `NULL` as "nobody's"
   would make that pet, and everything hanging off it (appointments, its
   diagnostic reports, its treatment plans, its invoices), permanently
   unreachable by any doctor the moment scoping is strict. This mirrors, and is
   now applied consistently with, the pre-existing "doctor-visible to all,
   never owner-visible" posture already used for orphan (`pet = null`)
   invoices. `_doctor_scoped(Model, request, lookup=...)` implements this as
   `Q(**{lookup: request.user}) | Q(**{f"{lookup}__isnull": True})` for both
   the list queryset and the `get_object_or_404` base queryset, so list and
   detail can never drift apart on this again.

   `DiagnosticReport` and `TreatmentPlan` have no direct `doctor` FK and are
   scoped via `pet__doctor`; `Invoice`/`Payment` via `pet__doctor` /
   `invoice__pet__doctor` respectively — `pet__doctor__isnull=True` correctly
   matches both "the pet has no doctor" and "there is no pet at all" through
   the same LEFT OUTER JOIN, so no separate `pet__isnull=True` clause is
   needed.

## 5. Configuration (rule 1)

`SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `DATABASE_URL` all read
from the environment. `DEBUG` defaults to `False`. When `DEBUG` is false and `SECRET_KEY`
is unset, the app **raises `ImproperlyConfigured` at startup** — fail fast, never fall back
to a baked-in default. `CORS_ALLOW_ALL_ORIGINS` is removed; dev origins come from env.
Password hashing: bcrypt with cost ≥ 12 as the first entry in `PASSWORD_HASHERS`.

**Added 2026-09-02 (password reset).** `EMAIL_BACKEND`, `DEFAULT_FROM_EMAIL`, and
`FRONTEND_BASE_URL` follow the identical fail-fast posture: in `DEBUG` they default to
Django's console email backend, `noreply@petphysiovet.local`, and
`http://localhost:5173` respectively; when `DEBUG` is false, all three are **required**
and their absence raises `ImproperlyConfigured` at startup — a silently no-op mailer or
a wrong SPA base URL would look like "reset email sent" while never reaching the user.
No SMTP provider is configured or invented; `EMAIL_BACKEND`/credentials for a real
provider are supplied via env/OCI Vault at deploy time.

**Production headers (added after QA round 1).** Behind `if not DEBUG:` set
`SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS`, `SECURE_HSTS_INCLUDE_SUBDOMAINS`,
`SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`. `manage.py check --deploy` must report
zero warnings.

## 6. Frontend rules

1. **No fabricated fallbacks.** `Number(x || 15200)` and every sibling pattern is deleted.
   A missing value renders an explicit empty/error state, never an invented number.
2. Wrap the router in an **ErrorBoundary** so one bad field cannot white-screen the app.
3. Every `useQuery` renders three states: loading, error (with retry), and empty.
4. Read fields defensively (`inv.payment_status?.toLowerCase()`) so a contract drift
   degrades one badge instead of unmounting the tree.
5. The login form collects and submits a real password.
6. Remove the unused `bcryptjs` and `jsonwebtoken` dependencies — hashing and signing are
   server-side concerns.
7. **Token lifecycle (added after QA round 1).** `logout()` must send
   `{refresh: getRefreshToken()}` — it currently sends an empty body, so the backend
   400s and the refresh token is **never blacklisted**. `http.ts` gains a 401
   interceptor that calls `POST /auth/refresh` once, stores the new access token, and
   retries the original request; only if that fails does it clear tokens and bounce to
   `/login`. Without this the app hard-logs-out at 45 minutes with no warning.
   Because refresh now rotates, the interceptor must store **both** returned tokens
   (`setTokens(access, refresh)`), not just the access token — otherwise the second
   refresh presents a blacklisted token and the user is logged out anyway.
8. Error bodies: the backend `problem()` helper must set `detail` as well as `title` —
   `http.ts` reads `detail || message || statusText`, so every hand-rolled 400
   currently renders as a bare "Bad Request".
