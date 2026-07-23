# ADR 0001 — JSON API auth for the UI-parity sprint: DRF SessionAuthentication (JWT deferred)

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** Tech Lead, Backend Engineer
- **Context refs:** `CLAUDE.md` (target architecture), `PRODUCT_PLAN.md` §1.4a
  (template → React migration), `docs/UI_PARITY.md`

## Context

The current sprint delivers a React SPA (`frontend/`) that must look
pixel-identical to the existing Django template pages. To feed the SPA, Django
gains a JSON API at `/api/v1`. Django is still a single template monolith with
**Django sessions + PBKDF2** auth and the `EmailOrUsernameBackend`.

The approved OCI target (`CLAUDE.md`) calls for **microservices behind an API
Gateway that validates JWTs**, with a dedicated Auth service issuing
short-lived access + rotating refresh tokens and bcrypt (cost ≥ 12) hashing.
That is a large architectural change touching deployment topology, the gateway,
and password storage.

## Decision

For **this sprint only**, expose the `/api/v1` endpoints with **Django REST
Framework using `SessionAuthentication`** over the existing session/cookie +
CSRF stack:

- Reuse the current `EmailOrUsernameBackend` and the existing Django forms
  (`DoctorLoginForm`, `DoctorSignupForm`, `PetForm`, `AppointmentForm`,
  `RescheduleForm`) for validation, so the API and the template pages behave
  identically (important while the templates remain the parity golden).
- The Vite dev server proxies `/api` → `http://127.0.0.1:8000`, so the session
  cookie and CSRF token are **same-origin** in dev — no CORS, no cross-origin
  credentials.
- CSRF: safe requests are open; unsafe requests require `X-CSRFToken`. The
  `auth/me`, `auth/login`, and `auth/signup` responses set the `csrftoken`
  cookie (`ensure_csrf_cookie`) so the SPA can read it for mutations.
- AuthZ in depth is preserved: an `IsVet` permission mirrors the template-side
  `vet_required` guard, and every endpoint scopes its queryset to
  `request.user`; per-object endpoints 404 on records the caller does not own.

## Deferred (explicitly out of scope this sprint)

- **JWT** (access/refresh) issuance and rotation.
- **API-Gateway JWT validation** and rate limiting.
- **bcrypt (cost ≥ 12)** password hashing (still PBKDF2 today).
- Splitting a standalone **Auth service**.

These are tracked for the OCI microservices phase and will get their own ADR
when that work begins.

## Consequences

- **Positive:** minimal, low-risk change; unblocks the React parity work now;
  one validation path shared by API and templates; ownership checks already in
  depth, easing the later gateway migration.
- **Negative / risk:** session cookies (not bearer tokens) mean the SPA must be
  served same-origin (dev proxy today; a reverse proxy / same-origin deploy
  later) until JWT lands. Auth semantics will change when JWT is introduced —
  the `lib/http.ts` fetch wrapper and `IsVet`/authentication classes are the
  seams that will absorb that change.
- **Migration path:** swap DRF's `DEFAULT_AUTHENTICATION_CLASSES` to a JWT class
  and move validation to the gateway; endpoint-level ownership checks stay as-is.
