# Pet Physio Vet — Product Engineering Plan (Build-Out to Target Architecture)

**Version:** 1.0 · **Date:** 2026-07-22 · **Author:** Product Engineering
**Target architecture:** Full microservices on Oracle Cloud Infrastructure (OKE), per the system diagram.
**Source of truth:** SRS v1.0 (June 2025) + Production Architecture diagram.

---

## 0. Where we are today (audited reality)

A code audit of `ThePetPhysioVet/` was performed against the SRS and the diagram. Summary:

| Dimension | SRS / Diagram target | Actual code today |
|---|---|---|
| Style | 10-service microservices on OKE | Single Django template monolith |
| Clients | React web (mobile out of scope) | Server-rendered Django templates only |
| API | REST API + API Gateway + LB | No REST layer (no DRF) |
| DB | PostgreSQL primary + read replica | SQLite file committed; settings point at one Neon Postgres |
| Cache/Queue | Redis + OCI Queue/Streaming | None |
| Auth | JWT + refresh, RBAC, bcrypt≥12 | Django sessions, PBKDF2, "is-a-vet" gate only |
| Roles | Doctor **and** Owner | Doctor only — no Owner, no Pet entity |
| Data model | 13 entities | 2 custom models (`DoctorProfile`, `Appointment`) |
| Notifications | FCM push + Twilio/MSG91 SMS + reminders | Manual `wa.me`/`sms:` share links |
| Payments | Razorpay/UPI, invoices, packages | None |
| Storage/CDN | OCI Object Storage + CDN | Local disk; WhiteNoise for static |

**Feature completeness: ~1 of 12 SRS areas** (basic single-doctor appointment CRUD). Everything owner-facing, clinical (pets/diagnosis/treatment), billing, messaging, and reminders is absent.

### 0.1 CRITICAL — do these before anything else (Phase 0, this week)
1. **Rotate the committed database credential.** `.env` contains a live Neon Postgres URL with a real password. Rotate it in Neon now; move all secrets to OCI Vault; scrub the value from any shared copies/zips/history.
2. **Fix the SECRET_KEY story.** Placeholder `your_secret_key_here` in `.env` + insecure fallback in `settings.py:21`. Generate a strong key, store in Vault, fail-fast if missing in prod.
3. **Auth-backend bug:** `EmailOrUsernameBackend` (`appointments/backends.py`) never checks `is_active` → deactivated users can log in. Add `user_can_authenticate()`.
4. **Email uniqueness** not enforced at DB level; login uses `.filter().first()` → account confusion. Add unique constraint + normalize email.
5. **Harden prod defaults:** `SECURE_SSL_REDIRECT` defaults False even in prod; `ssl_require=False`; `ALLOWED_HOSTS` wildcard `.onrender.com`; HSTS unset.

These are cheap, high-severity, and independent of the architecture rebuild.

---

## 1. Target architecture (mapping the diagram to concrete services)

Each box in the diagram becomes an owned, independently deployable component. Data ownership is strict: **one service owns its schema; others reach it only via API or events** (no shared tables).

### 1.1 Services (OKE workloads)

| Service | Responsibility | Owns (DB schema) | Sync deps | Async (events) |
|---|---|---|---|---|
| **Auth Service** | Registration, login, JWT issue/refresh, RBAC, password reset, session revocation | `users`, `doctors`, `owners`, `refresh_tokens`, `audit_login` | — | emits `user.registered` |
| **Core API Service** | Pets, medical history, diagnosis metadata, treatment plans, progress notes, appointments, invoices, packages, queries — the clinical + billing domain | `pets`, `medical_history`, `diagnoses`, `treatment_plans`, `progress_notes`, `appointments`, `invoices`, `payments`, `packages`, `queries` | Auth (token introspection/JWKS) | emits `appointment.*`, `invoice.*`, `diagnosis.uploaded`, `treatment.created`, `query.created`; publishes reminder-schedule requests |
| **Notification Service** | Fan-out of push (FCM), SMS (Twilio/MSG91), in-app notifications, delivery logging, opt-out prefs | `notifications`, `device_tokens`, `notification_prefs`, `delivery_log` | — | consumes all domain events; consumes `reminder.due` |
| **Scheduler / Job Worker** (OCI Functions) | Time-based reminder firing (24h/1h/30min), package expiry, retries, cleanup | `scheduled_jobs` (or uses Queue delay) | Core (read appt) | consumes `appointment.created/updated/cancelled`; emits `reminder.due` |

> The diagram draws Auth, Core, Notification as OKE pods and Scheduler as OCI Functions. We keep that split. Payment webhook handling lives in **Core API** (it owns invoices/payments); Razorpay calls back through the LB → API Gateway → Core.

### 1.2 Data stores

- **PostgreSQL Primary (OCI DB):** all writes. One logical DB per service (or one instance, separate schemas, to start) — but **no cross-service joins**.
- **PG Read Replica:** dashboards, reports, revenue aggregation, list endpoints → route read-heavy queries here (Core API uses a read router).
- **Redis (OCI Cache):** session/token blocklist (revoked JWTs), dashboard stat caching, rate-limit counters, idempotency keys for payment webhooks.
- **OCI Object Storage:** pet photos, diagnosis files (X-Ray/MRI/CT/DICOM/PDF), query attachments, generated invoice PDFs. Access via **pre-signed URLs** only.
- **OCI CDN:** fronts Object Storage for owner/doctor media delivery.
- **OCI Queue / Streaming:** event backbone (domain events + reminder scheduling). Streaming for the ordered event log; Queue for work items with visibility timeout + DLQ.
- **OCI Logging + Monitoring (Audit):** structured audit log sink for all create/update/delete with user id + timestamp (SRS §4 Audit).

### 1.3 Edge & platform
- **OCI Load Balancer** → **API Gateway** (authN at edge via JWT validation, rate limiting, routing to services) → services.
- **OKE (Kubernetes):** Auth, Core, Notification as Deployments (HPA on CPU/RPS); Ingress via the LB. Stateless pods (SRS §4 Scalability).
- **OCI Functions:** Scheduler workers, invoice-PDF generation, image resize (800×800) on upload event.

### 1.4 Clients
- **Doctor Web (the only client in scope):** React (Vite + TypeScript), React Query, component lib (e.g. Radix/shadcn), WCAG 2.1 AA. Talks only to API Gateway.
- **Owner Mobile — OUT OF SCOPE (deferred):** the React Native app is not being built now. Owner-facing access, if needed, is revisited later as responsive web. The current build targets the **doctor web experience only**.

### 1.4a Frontend migration: Django HTML templates → React (CONFIRMED)
The current UI is Django server-rendered templates. **In the target there is no
server-rendered HTML** — Django becomes an **API-only** service (DRF/JSON) and the
entire doctor-facing UI is a **React SPA (web only)** consuming the gateway APIs. The
existing templates are the functional reference for the first React screens, then
retired. (No React Native / mobile client — see §1.4.)

| Existing template | Becomes React | Notes |
|---|---|---|
| `login.html`, `base_auth.html` | Login page | Calls Auth Service; stores JWT + refresh |
| `signup.html` | Signup page(s) | Doctor signup now; **Owner signup added** (new) |
| `app_base.html` | App shell / layout | Nav, auth guard, protected routes |
| `dashboard.html` | Dashboard | Wired to real stats + notification feed |
| `appointments.html` | Appointments list | Filters, status lifecycle |
| `create.html` | Create appointment | Linked to real Pet records (not free text) |
| `reschedule.html` | Reschedule view | Now the request→approval workflow |
| `share.html` | Removed / replaced | Superseded by real push/SMS notifications |

Migration approach:
1. Add DRF to the Django service and expose the existing appointment/auth functionality
   as `/api/v1` JSON endpoints (Phase 2–3).
2. Stand up the React app (Vite + TS) and rebuild the screens above against those APIs.
3. Cut traffic to the SPA; **delete `appointments/templates/` and the template views**
   once parity + QA sign-off is reached. `static/app.js` is retired.
4. The `frontend-engineer` agent owns this; the `backend-engineer` provides the
   JSON endpoints. Track it as its own story set inside Phases 2–3.

---

## 2. Canonical data model (all 13 SRS entities)

Owned by **Auth**:
- **User**: `id, email(unique, citext), phone, password_hash(bcrypt cost≥12), role(DOCTOR|OWNER), is_active, created_at`
- **Doctor**: `user_id FK, specialisation, clinic_name, clinic_address, clinic_phone`
- **Owner**: `user_id FK, name, phone, email`  *(new — does not exist today)*

Owned by **Core**:
- **Pet**: `id, name, species, breed, age, sex, weight, photo_url, owner_id, doctor_id, medical_history_summary, complaint, complaint_started, referred_by, created_at`
- **MedicalHistory**: `id, pet_id, content(rich), created_at`
- **Diagnosis**: `id, pet_id, doctor_id, report_type(XRAY|MRI|CT|BLOOD|OTHER), file_url, mime, size, notes(rich), uploaded_at`
- **TreatmentPlan**: `id, pet_id, therapies(jsonb), frequency, start_date, end_date, status(ACTIVE|ON_HOLD|COMPLETED)`
- **ProgressNote**: `id, treatment_plan_id, session_no, notes(rich), created_at`
- **Appointment**: `id, pet_id, doctor_id, date, time, visit_type(INITIAL|FOLLOWUP|REVIEW|EMERGENCY), notes, status(PENDING|CONFIRMED|COMPLETED|CANCELLED|RESCHEDULE_REQUESTED), session_ref, reschedule_reason, created_at, updated_at`
- **Invoice**: `id, pet_id, doctor_id, invoice_no(seq), line_items(jsonb), subtotal, tax, total, payment_status(PENDING|PAID|PARTIALLY_PAID|FAILED), payment_mode, created_at`
- **Payment**: `id, invoice_id, amount_paid, gateway_ref, status, paid_at`
- **Package**: `id, invoice_id, total_sessions, used_sessions`
- **Query**: `id, pet_id, sender_id, message, attachments(jsonb), sent_at` (append-only, no delete)

Owned by **Notification**:
- **Notification**: `id, user_id, type, message, is_read, created_at`
- plus `DeviceToken`, `NotificationPref`, `DeliveryLog`.

**Migration note:** today's `Appointment.pet_name/pet_type/owner_name/owner_phone` (free text) must be replaced by real `pet_id`/relationships. A one-time backfill creates `Pet`+`Owner` rows from existing free-text data.

---

## 3. Delivery roadmap (phased, each phase ships something usable)

Sequencing principle: **stand up the platform spine first, migrate the existing monolith into the Core service, then add domains vertically** (each domain = model + API + React web + events). No mobile client.

### Phase 0 — Security & hygiene (Week 1)
- All items in §0.1. Add `tests.py` scaffolding + CI. Move secrets to OCI Vault.
- **Exit:** no live secrets in repo; auth bugs fixed; CI runs on every push.

### Phase 1 — Platform foundation (Weeks 2–4)
- Provision OCI: OKE cluster, PG primary+replica, Redis, Object Storage bucket, CDN, Queue/Streaming, LB, API Gateway, Logging/Monitoring. Terraform everything (IaC).
- Repo strategy: monorepo with `services/auth`, `services/core`, `services/notification`, `services/scheduler`, `clients/web`, `infra/`. (No `clients/mobile` — web only.)
- Containerize; base Helm charts; GitHub Actions → build → push to OCIR → deploy to OKE (staging).
- Event contracts v1 (schemas for `appointment.*`, `invoice.*`, etc.) in a shared `contracts/` package.
- **Exit:** "hello" versions of all 4 services deploy to OKE staging behind the gateway; event published on one and consumed on another.

### Phase 2 — Auth Service + identity (Weeks 4–6) — SRS §3.1, §4 security
- Port Django auth into a standalone **Auth Service** (DRF or FastAPI). JWT access (short TTL) + refresh (rotating, stored/revocable in Redis). bcrypt cost≥12. RBAC (DOCTOR/OWNER) claims in JWT.
- **Owner registration** (new): name, email, mobile, password → linked to pets later.
- API Gateway validates JWT (JWKS) at edge.
- **AC coverage:** AC-01 (dup email→409), AC-02 (JWT on login, 401 invalid), AC-03 (doctor profile fields), AC-05 (logout revokes token ≤5s via Redis blocklist).
- **Exit:** both roles can register/login/refresh/logout via gateway; RBAC enforced server-side.

### Phase 3 — Core migration: Pets + Appointments (Weeks 6–10) — SRS §3.3, §3.6
- Build **Core API Service**; migrate `Appointment` and introduce **Pet / Owner / MedicalHistory**. Backfill from existing data.
- Pet CRUD with all SRS fields; image upload → Object Storage; **OCI Function resizes to 800×800** on `pet.photo.uploaded` event. Owner-scoped read (AC-04: owner sees only own pets).
- Full appointment lifecycle: PENDING→CONFIRMED→COMPLETED/CANCELLED, **owner accept**, **reschedule request→doctor approval** workflow (fixes today's in-place edit). Visit types. Emit `appointment.*` events.
- **AC coverage:** §3.3 AC-01..04, §3.6 AC-01..04 (with events feeding Notification/Scheduler in later phases).
- **Exit:** doctors manage real pets + appointments on the React web app; owner-facing views are deferred (no mobile client).

### Phase 4 — Notification Service + Scheduler (Weeks 10–13) — SRS §3.7, §7
- Notification Service consumes domain events → in-app notifications, **FCM push**, **Twilio/MSG91 SMS**; delivery logged; **SMS opt-out** prefs.
- Scheduler (OCI Functions) consumes `appointment.created/updated` → schedules **24h/1h/30min** reminders via delayed Queue messages; emits `reminder.due`; **suppresses on cancel/reschedule**.
- Notification feed API for the doctor dashboard; unread badge.
- **AC coverage:** §3.7 AC-01 (±2 min), AC-02 (suppression), AC-03 (opt-out); §7 catalogue events.
- **Exit:** appointment lifecycle drives real push/SMS + reminders end-to-end.

### Phase 5 — Clinical: Diagnosis + Treatment (Weeks 13–17) — SRS §3.4, §3.5
- Diagnosis upload (type-validated, ≤20MB) to Object Storage via pre-signed URLs; owner visibility on upload; delete/replace; DICOM opens in browser tab (v1). CDN delivery.
- Treatment plans (therapy types, frequency, duration, status) + per-session progress notes; owner view incl. home exercises; archive on complete.
- Emit `diagnosis.uploaded`, `treatment.created` → Notification.
- **AC coverage:** §3.4 AC-01..04, §3.5 AC-01..03.
- **Exit:** full clinical record per pet, visible to owner.

### Phase 6 — REMOVED (Owner Mobile app is out of scope)
The React Native owner app has been dropped. The build is **web only**. If owner-facing
access is needed later, add it as responsive web against the same gateway APIs — track it
as a future phase, not part of this roadmap.

### Phase 7 — Payments & Billing (Weeks 17–21) — SRS §3.8
- Invoices (itemised, sequential no., tax/subtotal/total). Payment modes: advance, post-treatment, **package** (session counter decrements on Completed appt), partial.
- **Razorpay** integration: order create, **web checkout** (Razorpay web/JS), **webhook** into Core with **idempotency keys** (Redis) → invoice status ≤15s. No raw card data (PCI-DSS §4).
- Invoice **PDF** via OCI Function → Object Storage → downloadable receipts. Revenue dashboard (day/week/month) off read replica.
- Failed-payment retry notification.
- **AC coverage:** §3.8 AC-01..06.
- **Exit:** end-to-end billing; dashboard revenue widgets live.

### Phase 8 — Queries/Communication + Dashboard polish (Weeks 21–24) — SRS §3.2, §3.9
- Owner↔Doctor query threads: owner sends message + up to 5 images; doctor replies; **append-only** (no delete, audit). Push on new query/reply.
- Doctor dashboard fully wired: today's appts by status, total pets, active treatments, pending payments, today/monthly revenue, notification feed — cached in Redis, ≤2s load.
- **AC coverage:** §3.2 AC-01..03, §3.9 AC-01..04.

### Phase 9 — Hardening, compliance, GA (Weeks 24–28) — SRS §4
- PII encryption at rest (column-level for sensitive fields + storage encryption). DPDP: owner data-deletion/export flow. Full audit logging to OCI Logging. HSTS/TLS everywhere. Load test to **500 concurrent / p95 ≤500ms**; tune HPA + read-replica routing to hit **99.5% uptime**. WCAG 2.1 AA audit on web. Security review + pen test.
- **Exit:** production GA.

---

## 4. Cross-cutting engineering standards

- **API design:** versioned `/api/v1`, REST, JSON, cursor pagination, RFC-7807 problem+json errors, idempotency keys on mutations that touch money.
- **Events:** at-least-once delivery; consumers idempotent; DLQ + alerting; schema-versioned contracts.
- **AuthZ everywhere:** gateway validates JWT; each service re-checks role + object ownership (defense in depth — the current "queryset filtered by user" pattern is the right instinct, formalize it).
- **Testing:** unit + service-integration (per service) + contract tests on events + Cypress/Detox e2e on clients. CI gate: coverage floor, lint, type-check, SAST, dependency scan.
- **Observability:** structured logs → OCI Logging; metrics + traces (OpenTelemetry) → Monitoring; RED dashboards + SLO alerts per service.
- **CI/CD:** trunk-based, PR checks, auto-deploy to staging, gated promote to prod; DB migrations run as pre-deploy jobs; blue/green or rolling on OKE.
- **Secrets:** OCI Vault only; no `.env` in images; workload identity for OCI access.

---

## 5. Risks & decisions to watch

1. **Team size vs. topology.** Full microservices + OKE needs platform/devops capacity. If the team is <4 engineers, Phases 1–4 will dominate. (A modular-monolith intermediate was the alternative; this plan follows your choice of full microservices — revisit if timeline pressure hits.)
2. **Distributed data consistency.** No cross-service joins means dashboards aggregate via events/read-replica; budget for a read-model/reporting approach early (Phase 8 depends on it).
3. **DICOM viewer** is "browser tab" in v1 per SRS — keep it there; a real viewer is a later epic.
4. **Payment correctness** is the highest-stakes domain — idempotent webhooks + reconciliation job are non-negotiable.
5. **Migration risk** from the free-text appointment model to relational pets — do it behind a feature flag with a reversible backfill.

---

## 6. Immediate next actions (this week)
1. Execute Phase 0 security fixes (rotate Neon credential first).
2. Approve repo/monorepo layout and stand up `infra/` Terraform skeleton.
3. Define event contract v1 for `appointment.*` (unblocks Core↔Notification↔Scheduler).
4. Provision OCI staging (OKE, PG, Redis, Object Storage, Gateway).
5. Start Auth Service extraction (Phase 2) in parallel with infra.
