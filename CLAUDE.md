# Pet Physio Vet — Project Context (shared by all team agents)

This file is read by every agent. It is the shared source of truth for what this
project is, where it stands, and the rules everyone follows.

## What this is
A veterinary physiotherapy & rehabilitation platform connecting **Doctors**
(vets/physios) and **Pet Owners**. Full requirements: `SRS` (in repo/notes) and the
build-out roadmap in `PRODUCT_PLAN.md`.

## Current reality (as of the last audit)
- Stack today: a **single Django template monolith** (`backend/petphysio/` project, one
  `backend/appointments/` app), SQLite/Postgres, server-rendered HTML.
- Only ~1 of 12 SRS areas exists (basic single-doctor appointment CRUD).
- Only 2 of 13 data entities exist: `DoctorProfile`, `Appointment`. **No Owner, no Pet.**
- Auth = Django sessions + PBKDF2 (SRS wants JWT + bcrypt≥12).

## Target architecture (approved)
Full **microservices on OCI (OKE)** per the system diagram:
- Services: **Auth**, **Core API**, **Notification**, **Scheduler (OCI Functions)**.
- Data: PostgreSQL primary + read replica, Redis, OCI Object Storage + CDN,
  OCI Queue/Streaming (event backbone), OCI Logging/Monitoring (audit).
- Edge: OCI Load Balancer → API Gateway (JWT validation, rate limit) → services.
- Client: **React doctor web app only (SPA).** Mobile (React Native) is **out of scope
  for now** — do not build it.
  **Frontend decision (confirmed):** the current Django HTML templates are being
  *replaced* by the React SPA. Django becomes **API-only** (DRF/JSON) — no server-rendered
  HTML in the target. See `PRODUCT_PLAN.md` §1.4a for the template→React migration.
  Owner-facing access is deferred (revisit as responsive web later); current build
  focuses on the doctor web experience.
- Integrations: Razorpay (payments), FCM (push), Twilio/MSG91 (SMS).
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
  Python 3.12 venv `backend/.venv/` and SQLite `backend/db.sqlite3` (both git-ignored).
- **`frontend/`** — React/Vite SPA (renamed from `clients/web`). Playwright is local here.
- **They connect over HTTP** — no shared code. Dev: the Vite proxy forwards
  `/api → http://127.0.0.1:8000`. Prod: a gateway / reverse-proxy routes `/api` to Django.
- All Django paths below are relative to `backend/`; `vet.css` lives at
  `backend/appointments/static/vet.css` and its verbatim copy at `frontend/src/styles/vet.css`.

## Local dev — run both (two terminals)
- **Backend:** `cd backend && DEBUG=true ./.venv/bin/python manage.py runserver 127.0.0.1:8000`
  (use `backend/.venv/bin/python` — NOT system `python3`, which is 3.9 and too old for Django 6).
- **Frontend:** `cd frontend && npm run dev` → http://localhost:5173 (proxies `/api` to :8000).
- **Migrate / seed:** `cd backend && ./.venv/bin/python manage.py migrate` (or `seed_parity`).

## Team (see .claude/agents/)
- `product-manager` — backlog, user stories, acceptance criteria, sprint scope, sign-off.
- `tech-lead` — technical design, task breakdown, code review, architecture calls.
- `backend-engineer` — services, APIs, DB, events.
- `frontend-engineer` — React doctor web app (web only).
- `qa-security-engineer` — tests, AC verification, security review.

## The loop (see .claude/skills/sdlc-sprint + .claude/workflows/sdlc-sprint.js)
Plan (PM) → Design (Tech Lead) → Build (Backend ‖ Frontend) → Test (QA) →
Review (Tech Lead) → Accept & re-plan (PM) → repeat.
