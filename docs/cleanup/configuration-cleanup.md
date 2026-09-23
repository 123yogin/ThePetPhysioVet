# Configuration Cleanup

## Constraint
`.env`, `.env.*` and `.env.example` are blocked from access in this working
environment (a secrets guard denies reads/`ls`). Findings are therefore limited
to what is verifiable from tracked filenames and from `settings.py`'s env reads —
no `.env` contents were read, printed, or copied.

## Verified
- Exactly one env template is tracked: **`.env.example`** (repo root). There is
  **no `backend/.env.example`**, yet `README.md` linked to that path — a broken
  reference, now fixed to `.env.example`.

## Not changed (no evidence to act on safely)
- A full "declared env var vs. read-by-code" diff was **not** completed because
  reading `.env.example` is blocked here. The comparison should be run by someone
  with file access: list keys in `.env.example`, list `os.environ[...]` reads in
  `backend/petphysio/settings.py`, and remove any example key no longer read.
  Recorded in `remaining-work.md`.
- Multiple deployment configs exist (`vercel.json`, `docker-compose.yml`,
  `docker-compose.coolify.yml`, `Dockerfile`, `docker/`). No duplication was
  removed — they describe three legitimate, separately-used deploy topologies
  (documented in `docs/architecture/deployment-and-cicd.md`). Removing any needs
  confirmation of which topologies are still live. See `remaining-work.md`.

## Feature flags
None found. Repo-wide search shows no feature-flag system, so there are no dead
flags to remove.

## Secrets
No secrets were read or exposed. The only secret-handling note (from the existing
architecture analysis) is that the live DB credential lives in Vercel's
`DATABASE_URL` and nowhere in the repo — left exactly as is.
