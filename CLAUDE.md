# Pet Physio Vet — Project Context (shared by all team agents)

This file is read by every agent. It is the shared source of truth for what this
project is, where it stands, and the rules everyone follows.

## What this is
A veterinary physiotherapy & rehabilitation platform connecting **Doctors**
(vets/physios) and **Pet Owners**. Full requirements: `SRS` (in repo/notes) and the
build-out roadmap in `PRODUCT_PLAN.md`.

## Current reality (audited 2026-08-20)
The build has run well ahead of this document; the notes below replace the earlier
"Django template monolith / 2 entities" description, which was stale.

**Stack today** — still a **single Django monolith**, but now **API-only**:
`backend/petphysio/` project + one `backend/appointments/` app, DRF + SimpleJWT,
SQLite (`backend/db.sqlite3`). **No Django templates remain** — the
template→React migration is done on the rendering side.

**Data model** — 15 models in `backend/appointments/models.py`:
`UserProfile`, `Pet`, `Appointment`, `DiagnosticReport`, `TreatmentPlan`,
`ProgressNote`, `Invoice`, `LineItem`, `Payment`, `Package`, `Notification`,
`NotificationPref`, `QueryThread`, `QueryMessage`, `QueryAttachment`.
Ownership FKs (`Pet.owner`, `Pet.doctor`, `Appointment.doctor`, `Invoice.owner`)
are what make rule 4 enforceable. Migrations `0001`–`0005`; `0003` backfills
ownership from the legacy `owner_phone` strings.
`Invoice.subtotal/total/amount_paid/balance_due/payment_status` are **computed
properties, not columns** — they cannot drift or be spoofed by a client.

**API** — ~40 routes in `backend/appointments/urls.py` across auth, dashboard,
pets, appointments, diagnostic reports, treatment plans, billing, notifications,
queries, and the owner portal. **The authoritative spec is
[`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)** — read it before adding or changing
an endpoint. Paths are registered **without trailing slashes** to match
`frontend/src/lib/http.ts`; a trailing-slash variant will 404.
`/token/` and `/token/refresh/` were removed (unused by the SPA).

**Frontend** — `frontend/` React 18 + Vite + TS + TanStack Query + react-router.
22 screen components wired in `frontend/src/routes.tsx`: 15 doctor routes
(dashboard, patients, appointments, invoices, revenue, queries, notification
settings, profile), **4 owner routes** under `/owner/*` (`OwnerHome`,
`OwnerPetDetail`, `OwnerAppointments`, `OwnerBilling`), plus `/login` and a
`RoleLanding` at `/`. Both role groups sit behind `RequireAuth` role gates.
`vet.css` reused verbatim.

**SRS coverage** — §3.1–§3.9 are implemented and serving real data. The
2026-08-20 remediation sprint closed the auth bypass, added the ownership model,
built every endpoint the SPA calls, and removed all fabricated fallback data.
A Playwright sweep of the 15 doctor routes runs **15/15 clean** (was 9/15).

## Remediation sprint — 2026-08-20 (what changed and what remains)

The ten critical defects previously listed here were fixed in one sprint. Kept as a
record so nobody reintroduces them:

**Closed.** Auth bypass (`login_view` skipped password verification entirely and fell
back to the first user of a role) → now calls `authenticate()`, 401 on failure.
`AllowAny` on every viewset → `IsAuthenticated` default, `AllowAny` survives only on
`/auth/login` and `/auth/signup`. Anonymous "first DOCTOR" fallback in
`current_user_view`/`update_profile_view` → deleted. No ownership model → FKs +
backfill + `IsDoctor`/`IsOwner`/`IsObjectOwner`, with cross-owner access returning
**404 not 403** so existence never leaks. Hardcoded `SECRET_KEY`/`DEBUG`/CORS → env
with `ImproperlyConfigured` fail-fast. Fake payments → real `Payment` model with a
unique `idempotency_key` (rule 6). PBKDF2 → bcrypt cost 12. Frontend fabricated
fallbacks (a hardcoded ₹15,200 shown whenever `/revenue` failed; a `pet_id || 1`
default that could book against another owner's pet; on-screen demo credentials) →
all removed. No error boundary → `ErrorBoundary` at router and shell level.

## Shell unification — 2026-08-21

The owner portal was migrated onto the doctor's sidebar shell; `OwnerShell` is deleted.
There is now **one** shell (`AppShell` + `Sidebar`), with nav items selected by role.
Design and evidence: [`docs/DESIGN_shell-unification.md`](docs/DESIGN_shell-unification.md).

Two severe defects were found by measurement during this work and fixed:
- **The doctor app was unusable on any phone.** `vet.css` slid the sidebar off-canvas
  below 768px and expected a `.sidebar-toggle` + `body.sidebar-open` that **no component
  ever rendered** — 0/8 nav items reachable at 360-768px in Chromium and WebKit, with no
  way to sign out. Both halves of the drawer now exist.
- **Sign Out sat below the fold on long desktop pages.** `.app-shell` is a flex row with
  `min-height: 100vh`, so the sidebar stretched to *content* height. `.sidebar` is now
  `position: sticky; height: 100vh`.

Also closed: `Pet.doctor` was never assigned by either creation path (so the new
`doctor_name` was null for every pet made through the app); `['me']` was never cleared on
logout, so the next user to sign in saw the previous user's name and nav.

**Note on verification.** An overflow-only sweep reported "396 combinations clean" while
the doctor nav was completely unreachable on every phone width — an off-canvas sidebar
produces no overflow. Any responsive check here must assert **reachability** (every nav
control hit-testable, through the drawer if necessary), not just overflow.

## Simplification sprint — 2026-08-21 (second pass)

A full feature audit (19 routes, 15 models, 39 endpoints) found that **booking did not
work**. `Appointment.VISIT_TYPES` allowed three values; three booking forms had each
invented their own vocabulary, so **every option on both owner forms and three of the
doctor's four returned HTTP 400**. Owners could not book at all.

Root cause was duplication, so the fix is a single source of truth: **`GET
/appointment-options`** now serves the list and all three forms read it. Never hardcode
visit types again.

**Also fixed and verified live:**
- Doctor "reschedule" did not reschedule — it wrote `requested_*`, left the real date
  untouched, claimed success, and sent the owner a WhatsApp message with the **old** time.
- Every appointment displayed "Initial Consultation" regardless of type
  (`visit_type_display` was written by nothing but the seeder). Migration 0009 backfills.
- **Doctor-created pets never reached the owner's portal** (`owner` was never set), so the
  clinic's main "add patient" flow produced records owners could not see. Now linked by
  unambiguous phone match; migration 0010 backfills.
- Doctors never saw photos owners attached to messages — silent clinical data loss.
- Viewing a patient created an empty message thread, so the inbox filled with every
  patient ever opened.
- `AppointmentSerializer.pet` accepted **any** pet id, so a doctor could book against
  another practice's patient they get a 404 for on the detail route. All doctor object
  routes are now scoped; **NULL-doctor rows are a deliberate claimable pool**, visible to
  any doctor, so a new owner's first pet is not stranded.
- Owner cancel, doctor confirm for Pending, and owner invoice detail added.

**Simplification:** owner pet page 5 tabs → 3 (13 buttons → 5 on a phone); patient form 11
fields → 4 with the rest behind a toggle; GST auto-computed with a running total before
the irreversible "Issue"; ~30 clinic-operations strings rewritten in plain English; raw
enums (`PARTIALLY_PAID`, `ACTIVE`, `XRAY`) removed from owner-facing screens; species icon
now derived from `species`, not `pet_type` (breed text — "Golden Retriever" contains no
animal, so every dog rendered as a generic paw while "Persian Cat" worked by coincidence).

**Palette unchanged: 47 distinct colour values before and after, identical sets.**

## Identity & recovery — 2026-09-02

**All 16 models are now on UUID primary keys** (migrations `0012`–`0014`). Sequential ids
leaked business volume in URLs and had already produced one shipped bug — a treatment plan
titled to the user as "Rehab Regimen #7", a primary key rendered as a label. The swap was
data-preserving: row counts and every relationship were diffed before and after, including
`token_blacklist_outstandingtoken` (612 rows), which had to be remapped with raw SQL because
it FKs to `UserProfile` from another app's migration state. **A UUID must be written as
`uuid.hex` there, not `str(uuid)`** — the hyphenated form silently fails SQLite's FK check.

The frontend had to change with it: `Number(id)` on a UUID is `NaN`, so seven detail screens
would have requested `/pets/NaN`. 61 numeric id declarations became strings; `useParams`
returns `string | undefined`, previously masked by that same `Number()`.

**Password reset now exists** (`POST /auth/password-reset/request` and `/confirm`). It was
absent entirely — a user who forgot their password was locked out permanently. Tokens are
`secrets.token_urlsafe(32)`, stored only as a SHA-256 hash, single-use, 30-minute expiry,
rate-limited per email and per IP; a reset blacklists the user's outstanding refresh tokens.
**The request endpoint returns an identical 200 for known and unknown addresses** — verified
byte-identical through the UI — because a different response is a user-enumeration oracle on
a product holding clinical records.

Both reset views set `authentication_classes([])`. This is load-bearing: DRF applies
JWTAuthentication globally and SimpleJWT *raises* on an expired bearer token, producing a 401
before `AllowAny` is consulted — so the route 401'd exactly the locked-out users who needed
it, and the SPA's refresh interceptor then bounced them to `/login`.

**Errors are now RFC-7807 everywhere** (`petphysio/exceptions.py`), closing the old debt item.
DRF validation errors previously had no `detail`, so the SPA fell through to `statusText` and
clinicians saw the literal words "Bad Request"; 404s leaked Django's "No Pet matches the given
query." 404 wording is deliberately identical for "missing" and "not yours".

## Production hardening — 2026-09-02

Three deployment blockers, each fixed at the cause rather than the symptom.

**`seed_data` could run against production.** `DEPLOYMENT.md` instructed it, and the command
had no environment guard — verified runnable with `DEBUG=False`. It creates
`dr_dhanvi / DoctorPass123!`, a full-access clinician login whose password is committed to
this repo. Fixed with `appointments/management/base.py::DevOnlyCommand`, which enforces the
rule in `execute()` (not `handle()`, so a subclass cannot skip it by forgetting `super()`).
**Anything that fabricates data or credentials subclasses that, never `BaseCommand`** — a
copied guard is a guard that gets forgotten on the next command.

**Rate limiting silently didn't work.** There was no `CACHES` setting, so Django used
per-process `LocMemCache` while the Dockerfile runs `gunicorn --workers 3`. "5 resets per
email per 15 minutes" was really up to 15, and reset on restart. Now env-selected —
`REDIS_URL` -> Redis, else the database cache (shared, no new infrastructure), LocMem only
under DEBUG — **plus a boot-time refusal if a deployed environment ever resolves to a
per-process backend.** `createcachetable` runs in the entrypoint.

**HTTPS was opt-in via three independent booleans.** Insecure was the default, and the flags
could disagree — secure cookies without the redirect makes the browser drop the session
cookie, so login fails with no visible error. Now one derived switch: HTTPS, secure cookies
and HSTS are **on by default** in production, and only `ALLOW_INSECURE_HTTP=true` turns all
three off together, with a `RuntimeWarning` at every boot.

Also found while correcting the docs: settings never read `EMAIL_HOST`/`PORT`/`USER`/
`PASSWORD`, so the SMTP backend would have used `localhost:25` and dropped every reset email
while the API still returned 200. Added, with a fail-fast when the SMTP backend has no host.

**Still NOT production-ready:** no payment gateway (Razorpay unwired — "record payment" is
manual entry), no SMS or push, uploaded media on local disk rather than object storage, no
frontend test suite, and `Notification`/`Package` still dead.

**`seed_data` is not idempotent** despite what the dev notes below imply: it keys on
`(pet, date, time)`, so running it on a different day adds a fresh generation of
appointments rather than updating the existing ones.

## Remediation sprint — still open

**Still open — do not assume these are done:**
1. **SRS §3.4 textual diagnosis has no home.** The old free-text `Diagnosis` model
   (diagnosis name, stage, clinical notes) was replaced by `DiagnosticReport`, which
   is a file upload. Both were empty so no data was lost, but the requirement is
   unimplemented.
2. **A brand-new owner's first pet has no doctor.** `owner_pets_view` inherits one only
   when the owner's existing pets unambiguously share a doctor, so the very first pet —
   and any appointment booked for it — is unrouted. Needs a product decision (clinic
   pool vs manual claim), not a one-line fix.
3. **Owner-booked appointments for a pet with no doctor** still get `doctor=None`.
   Narrowed a lot (both pet-creation paths assign one, and NULL-doctor rows are a
   claimable pool) but a brand-new owner's very first pet can still be unassigned.
4. **`Notification` and `Package` are dead weight.** Models, serializers and (for
   Notification) two live endpoints exist; **zero rows have ever been created by the
   app** — only by `seed_data`. Nothing writes a Notification anywhere, and the invoice
   form never sends the session count a Package needs. Either wire them or delete them.
5. **No frontend test suite.** No Vitest, no Playwright in `frontend/`. Every UI defect
   found so far was caught by an out-of-tree harness or by eye. This is the largest
   regression risk in the repo.
6. **Still a monolith.** None of the Auth/Core/Notification service split exists.

**Corrected 2026-08-21 — these were listed as open but were not:**
- "No refresh flow" — `POST /auth/refresh` exists and rotates (verified live: returns a
  new `access` *and* `refresh`), and `lib/http.ts` has a single-flight 401 interceptor.
- "`vet.css` defines no `.badge-*` classes" — 20 badge rules exist and every class the
  screens generate resolves.
- `docs/UI_PARITY.md` is stale: it names `backend/appointments/static/` and `templates/`,
  both deleted, and a `frontend/parity-baseline/` that was never created.
   SQLite, no Redis, no event bus, local `media/`, no Razorpay/FCM/Twilio.

## Target architecture (approved)
Full **microservices on OCI (OKE)** per the system diagram:
- Services: **Auth**, **Core API**, **Notification**, **Scheduler (OCI Functions)**.
  *None of this split exists yet — today is one Django app.*
- Data: PostgreSQL primary + read replica, Redis, OCI Object Storage + CDN,
  OCI Queue/Streaming (event backbone), OCI Logging/Monitoring (audit).
  *Today: SQLite, no cache, no event bus, local `media/` for uploads.*
- Edge: OCI Load Balancer → API Gateway (JWT validation, rate limit) → services.
- Client: **React web SPA.** Mobile (React Native) is **out of scope** — do not build it.
  Django stays **API-only** (DRF/JSON); no server-rendered HTML. See
  `PRODUCT_PLAN.md` §1.4a.
  **Owner-facing scope changed:** owner web screens were previously deferred but
  have since been **built** (4 routes under `/owner/*`). They are UI-complete and
  **authZ-incomplete** — see debt items 2–4.
- Integrations: Razorpay (payments), FCM (push), Twilio/MSG91 (SMS).
  *None wired; `NotificationPref` stores only an SMS opt-out flag.*
See `PRODUCT_PLAN.md` for the phased roadmap and per-phase acceptance criteria.

## Non-negotiable rules for all agents
1. **Security first.** Never commit secrets. The old `.env` leaked a live DB
   credential — secrets live in OCI Vault only. Fail-fast if a prod secret is missing.
2. **Traceability.** Every change maps to an SRS acceptance criterion (AC-xx) or a
   PRODUCT_PLAN phase. State which one in PR/commit descriptions.
3. **Data ownership.** One service owns its schema. No cross-service DB joins —
   integrate via API or events.
4. **AuthZ in depth.** Gateway validates JWT; each service re-checks role + object
   ownership (owner sees only their own pets, etc.).
5. **Tests + review gate.** No story is "done" until QA verifies it against its ACs.
6. **Idempotency** on money-touching mutations (payment webhooks) and event consumers.
7. Report honestly: if tests fail, say so with output; never mark work done unverified.

## ⚡ Permissions: restart once to activate zero-prompt mode
`.claude/settings.json` is set to `defaultMode: bypassPermissions` (auto-approve every
tool call, no prompts) with a blanket `Bash`/`WebFetch`/`WebSearch` allow. This reads
**only at session start**, so **restart Claude Code once** in this folder (or launch
`claude --dangerously-skip-permissions`) to make it live. After that: no permission
prompts on this project. Only `.env`/secrets stay blocked (silently, never prompts).
Trade-off: this disables all confirmations, including destructive commands — intended.

## Project layout (distributed: backend + frontend)
- **`backend/`** — Django API: `manage.py`, `petphysio/`, `appointments/`, plus the
  **Python 3.14** venv `backend/.venv/` and SQLite `backend/db.sqlite3` (both git-ignored).
  Pinned in `requirements.txt`: Django >=5.0,<6.1, DRF, SimpleJWT, corsheaders, Pillow.
- **`frontend/`** — React/Vite SPA (renamed from `clients/web`).
  **Playwright is NOT installed** — `npm run` offers only `dev`, `build`, `start`, `lint`
  (`lint` is `tsc --noEmit`). Install Playwright before promising e2e or parity runs.
- **They connect over HTTP** — no shared code. Dev: the Vite proxy forwards
  `/api → http://127.0.0.1:8000`. Prod: a gateway / reverse-proxy routes `/api` to Django.
- Django paths are relative to `backend/`. `vet.css` now lives **only** at
  `frontend/src/styles/vet.css` — the old `backend/appointments/static/vet.css`
  copy is gone along with the templates.
- Uploads land in the repo-root `media/` (`MEDIA_ROOT`), served locally, not on Object Storage.

## Local dev — run both (two terminals)
- **Backend:** `cd backend && DEBUG=true ./.venv/bin/python manage.py runserver 127.0.0.1:8000`
  **`DEBUG=true` is now required locally** — without it (and without `SECRET_KEY`) Django
  raises `ImproperlyConfigured` and refuses to boot. That is the intended fail-fast
  behaviour of rule 1, not a bug. Use `backend/.venv/bin/python`, NOT system `python3`.
- **Frontend:** `cd frontend && npm run dev` → http://localhost:5173 (proxies `/api` to :8000).
- **Migrate / seed:** `cd backend && DEBUG=true ./.venv/bin/python manage.py migrate`, then
  `DEBUG=true ./.venv/bin/python manage.py seed_data` (idempotent). There is **no**
  `seed_parity` command — `seed_data` is the only one.
- **Tests:** `cd backend && DEBUG=true ./.venv/bin/python manage.py test appointments`
- **Demo credentials** (created by `seed_data`; login now genuinely verifies passwords):
  `dr_dhanvi / DoctorPass123!` · `owner_sarah|owner_rahul|owner_priya / OwnerPass123!`

## Team (see .claude/agents/)
- `product-manager` — backlog, user stories, acceptance criteria, sprint scope, sign-off.
- `tech-lead` — technical design, task breakdown, code review, architecture calls.
- `backend-engineer` — services, APIs, DB, events.
- `frontend-engineer` — React web app (doctor + owner screens; no mobile).
- `qa-security-engineer` — tests, AC verification, security review.

## The loop (see .claude/skills/sdlc-sprint + .claude/workflows/sdlc-sprint.js)
Plan (PM) → Design (Tech Lead) → Build (Backend ‖ Frontend) → Test (QA) →
Review (Tech Lead) → Accept & re-plan (PM) → repeat.

> Sprint skills `sprint2`–`sprint8` in `.claude/skills/` describe flows that have
> partly run. Treat their descriptions as **intent, not evidence** — with no tests
> and no git history, nothing in them is independently verified.
