# ThePetPhysioVet

A veterinary physiotherapy & rehabilitation platform connecting **Doctors**
(vets/physios) and **Pet Owners**. This repository is a distributed monorepo:
a Django REST API backend and a React SPA frontend that communicate over HTTP.

> Project context and rules for contributors live in [`CLAUDE.md`](CLAUDE.md).
> The phased roadmap and per-phase acceptance criteria live in
> [`PRODUCT_PLAN.md`](PRODUCT_PLAN.md). Architecture decisions are in [`docs/`](docs/).

## Repository layout

```
.
├── backend/          Django 6 + DRF API
│   ├── manage.py
│   ├── petphysio/    project package (settings, urls, wsgi/asgi)
│   ├── appointments/ the application (models, api, tests, migrations)
│   └── requirements.txt
├── frontend/         React + Vite + TypeScript SPA
│   ├── src/          components / screens / lib / styles
│   ├── tests/e2e/    Playwright end-to-end + parity tests
│   ├── index.html
│   └── package.json
├── docs/             architecture notes and ADRs
├── tools/            repo-level developer tooling
├── CLAUDE.md         shared project context
└── PRODUCT_PLAN.md   roadmap
```

## Tech stack

- **Backend:** Python 3.12, Django 6, Django REST Framework, SimpleJWT, SQLite (dev).
- **Frontend:** React 18, Vite 5, TypeScript, React Router, TanStack Query.
- **Integrations:** Razorpay (payments), FCM (push), Twilio / MSG91 (SMS) — all
  behind mock providers by default so the app runs offline with no real keys.

## Getting started

### Backend

```bash
cd backend
python3.12 -m venv .venv          # first time only
./.venv/bin/pip install -r requirements.txt
cp .env.example .env              # then edit values
DEBUG=true ./.venv/bin/python manage.py migrate
DEBUG=true ./.venv/bin/python manage.py runserver 127.0.0.1:8000
```

Use `backend/.venv/bin/python` — the system `python3` is too old for Django 6.

### Frontend

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173 (proxies /api → :8000)
```

## Build & checks

```bash
# Backend: Django system checks
cd backend && DEBUG=true ./.venv/bin/python manage.py check

# Frontend: type-check + production build
cd frontend && npm run build
```

## Configuration

Backend configuration is read from environment variables (see
[`backend/.env.example`](backend/.env.example) for the full list). Secrets are
never committed — payment/notification providers default to in-process mocks.
