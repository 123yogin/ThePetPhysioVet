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

## Remediation sprint — still open

**Still open — do not assume these are done:**
1. **No refresh flow.** `/token/refresh` was removed and nothing calls the refresh
   token the SPA still stores. Access tokens expire in 45 min → silent logout.
2. **SRS §3.4 textual diagnosis has no home.** The old free-text `Diagnosis` model
   (diagnosis name, stage, clinical notes) was replaced by `DiagnosticReport`, which
   is a file upload. Both were empty so no data was lost, but the requirement is
   unimplemented.
3. **Owner-booked appointments for a pet with no doctor** get `doctor=None` and never
   appear in `dashboard_stats_view`. Narrowed (both pet-creation paths now assign a
   doctor) but a brand-new owner's first pet can still be unassigned. Needs a product
   decision, not a one-line fix.
4. **Doctor list endpoints are not per-doctor scoped** (single-doctor assumption).
   Multi-doctor clinics will leak across practices.
5. **Owner-created appointments default to `Pending`** with no doctor-confirm route.
6. **RFC-7807 error shape is partial** — hand-rolled errors only; DRF validation
   errors still use the stock `{field: [...]}` shape.
7. **Still a monolith.** None of the Auth/Core/Notification service split exists.
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
