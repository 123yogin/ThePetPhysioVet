# API Contract — v1 (authoritative)

**Status:** approved by Tech Lead, 2026-08-20. Supersedes ad-hoc endpoint invention.
**Traceability:** SRS §3.1–§3.9; PRODUCT_PLAN phases 2–7. CLAUDE.md rules 1, 2, 4, 6.

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
`active_treatments` = TreatmentPlan status ACTIVE. `pending_payments` = sum of
`balance_due` over unpaid invoices. `today_revenue` / `monthly_revenue` = sum of
`Payment.amount_paid` in range. **All computed from the database. No constants.**

### Pets
| GET | `/pets?q=` | search name/breed/owner_name/owner_phone | `Pet[]` |
| POST | `/pets` | multipart, `photo` optional | `Pet` |
| GET | `/pets/:id` | — | `Pet` |
| PATCH | `/pets/:id` | partial | `Pet` |

### Appointments
| GET | `/appointments?pet=&owner=&date=` | | `Appointment[]` |
| POST | `/appointments` | `{pet, visit_type, date, time, reason_notes?}` | `Appointment` |
| GET | `/appointments/:id` | | `Appointment` |
| POST | `/appointments/:id/reschedule` | `{date, time}` | `Appointment` |
| POST | `/appointments/:id/complete` | | `Appointment` |
| POST | `/appointments/:id/reschedule-approve` | | `Appointment` |
| POST | `/appointments/:id/reschedule-reject` | | `Appointment` |
| GET | `/appointments/:id/share` | | `{whatsapp_url, sms_url, pet_name, owner_name, owner_phone}` |

### Diagnostic reports
| GET | `/pets/:id/diagnoses` | | `Diagnosis[]` |
| POST | `/pets/:id/diagnoses` | multipart `{file, report_type, notes?}` | `Diagnosis` |
| DELETE | `/diagnoses/:id` | | 204 |

Validate upload: max 10 MB, allow `image/*` + `application/pdf` + `application/dicom`.
Reject anything else with 400. Store `original_filename`, `size`, `mime` from the upload.

### Treatment plans
| GET | `/pets/:id/treatment-plans` | | `TreatmentPlan[]` |
| POST | `/pets/:id/treatment-plans` | plan body | `TreatmentPlan` |
| GET | `/treatment-plans/:id` | | `TreatmentPlan` |
| POST | `/treatment-plans/:id/progress-notes` | `{session_no?, notes}` | `ProgressNote` |

### Billing
| GET | `/invoices?pet=` | | `Invoice[]` |
| POST | `/invoices` | `{pet_id, line_items[], tax?, payment_mode?, total_sessions?}` | `Invoice` |
| GET | `/invoices/:id` | | `Invoice` |
| POST | `/invoices/:id/payments` | `{amount_paid, gateway_ref?, idempotency_key?}` | `Payment` |

**Money guards (added after QA round 1).** `amount_paid` must be `> 0` **and
`<= invoice.balance_due`** — overpayment is rejected with 400, never allowed to drive
`balance_due` negative. `unit_price` and `quantity` on a line item must be `>= 0`;
a negative `unit_price` previously minted a negative invoice and dragged
`/revenue.total_revenue` below zero. `invoice_no` must be derived from
`Max(invoice_no)` inside `select_for_update()` (or a DB sequence) — a `COUNT()`-based
scheme collides after any delete and races under concurrent POSTs, returning 500.
| GET | `/revenue?range=today\|month\|year` | | `{range, total_revenue, collected, pending, currency, series[]}` |

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
| GET | `/queries/inbox` | | `{results: QueryThread[]}` |
| GET | `/pets/:id/queries` | | `QueryThread` |
| POST | `/pets/:id/queries` | multipart `{message, attachments[]}` (max 5) | `QueryMessage` |

Threads are append-only. No edit, no delete — messages are audit-retained.
`sender_name` is derived from `request.user`, **never** taken from the request body.

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
| GET | `/owner/invoices` | | `Invoice[]` — own only |
| GET | `/owner/pets/:id/queries` | | `QueryThread` |
| POST | `/owner/pets/:id/queries` | multipart | `QueryMessage` |

---

## 4. AuthZ rules (rule 4 — non-negotiable)

1. Default DRF permission is `IsAuthenticated`. `AllowAny` is permitted on exactly three
   routes: `/auth/login`, `/auth/signup`, and `/auth/refresh`.
   **`/auth/refresh` is necessarily `AllowAny`** — the access token has expired, which is
   the entire point — but `AllowAny` at the permission layer must never mean
   unauthenticated token issuance: the view fully verifies the refresh token's signature,
   expiry, `token_type` claim, and blacklist status before minting anything.
2. Doctor routes require `role == "DOCTOR"`. Owner routes require `role == "OWNER"`.
3. Every `/owner/*` handler filters by `request.user` in `get_queryset()`. An owner
   requesting another owner's pet gets **404**, not 403 — do not leak existence.
4. There is no anonymous fallback user. Delete every
   `UserProfile.objects.filter(role="DOCTOR").first()` default.
5. Object-level checks live in the view, not only in the queryset — a detail route
   re-verifies ownership before mutating.

## 5. Configuration (rule 1)

`SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `DATABASE_URL` all read
from the environment. `DEBUG` defaults to `False`. When `DEBUG` is false and `SECRET_KEY`
is unset, the app **raises `ImproperlyConfigured` at startup** — fail fast, never fall back
to a baked-in default. `CORS_ALLOW_ALL_ORIGINS` is removed; dev origins come from env.
Password hashing: bcrypt with cost ≥ 12 as the first entry in `PASSWORD_HASHERS`.

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
