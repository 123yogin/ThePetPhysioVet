# Codebase Cleanup Report

**Scope:** safe, behaviour-preserving hygiene only. No redesign, no new
architecture, no product-behaviour changes, no dependency upgrades, no
infrastructure execution. When usage could not be ruled out, the item was
preserved and documented rather than deleted.

**Branches used (not committed — left in the working tree for review):**
- parent repo: `chore/codebase-cleanup`
- `landing/` submodule: `chore/dep-cleanup`

---

## Executive summary

A focused pass targeting the highest-confidence, verifiable debt:

- **Backend dead imports** removed from 20 files — the duplicated "import every
  model + serializer" blocks copied into each view module during the historical
  `views.py` split. Verified by the 420-test suite (still green).
- **One consistency defect fixed** in `frontend/src/api/facility.ts` that was
  failing a guard test (`test_every_spa_path_resolves`).
- **5 verified-unused dependencies** removed from the `landing` site; build
  re-verified.
- **3 false/broken documentation statements** in `README.md` corrected.

Deliberately **not** done (documented in `remaining-work.md`): frontend
dependency removals needing native validation, the backend URLconf double-mount,
removal of the out-of-tree `frontend/tools/` QA scripts, and any dependency
upgrade.

---

## Baseline (Phase 1)

Established before any change, and re-checked after each group.

| Check | Command | Baseline | After cleanup |
| --- | --- | --- | --- |
| Backend tests | `manage.py test appointments` | 420 tests, **1 failing** | 420 tests, **0 failing** |
| Backend system check | `manage.py check` | 0 issues | 0 issues |
| Frontend types | `npm run lint` (`tsc --noEmit`) | clean | clean |
| Frontend build | `npm run build` | clean | clean |
| Landing types | `npm run lint` (`tsc --noEmit`) | clean | clean |
| Landing build | `npm run build` | clean | clean (deps removed) |

**Note on the baseline failure:** `test_every_spa_path_resolves` was failing at
baseline because `frontend/src/api/facility.ts` built its URL with an inline
ternary whose whitespace defeated the test's static path-extractor. This is
in-tree code; the fix (below) restored green. No linter is configured for the
backend (no ruff/flake8/eslint); "lint" for the backend is `manage.py check` +
the suite, and for the frontends `tsc --noEmit`.

---

## What changed

### Removed (dead code)
- Unused imports across **20 backend files** (see `dead-code.md`). Chiefly the
  bulk `from ..models import (...)` / `from ..serializers import (...)` blocks in
  11 view modules — e.g. `views/auth.py` imported 18 models + 20 serializers and
  used 2 + 4. Also unused imports in 8 test files and `seed_data.py`.
- **5 unused dependencies** from `landing/package.json`: `dotenv`, `express`,
  `@types/express`, `autoprefixer`, `esbuild` (see `dependency-cleanup.md`).

### Consolidated / made consistent
- `frontend/src/api/facility.ts` now builds its query string the same way
  `api/enquiries.ts` does (`?` inside the `query` variable), fixing the guard
  test and removing an inconsistent implementation.

### Documentation
- `README.md`: removed the false claim that payment/SMS/push integrations exist
  "behind mock providers" (repo-wide grep confirms none exist); corrected the
  Configuration section likewise; fixed a broken link to `backend/.env.example`
  (only a root `.env.example` is tracked).

### Tests
- No test files were deleted. The one failing test now passes because the code
  it guards was fixed (not because the test was weakened). See `test-cleanup.md`.

### Dependencies
- Landing: 5 removed (above). Frontend: **none removed** — every depcheck flag
  was a false positive or needs native validation. See `dependency-cleanup.md`.

### Configuration
- No config values changed. `.env*` files are guarded from access in this
  environment; findings are limited to what is verifiable without reading them.
  See `configuration-cleanup.md`.

---

## Validation

- Backend: `manage.py test appointments` → **420 passed, 0 failed**; `check` clean.
- Frontend: `tsc --noEmit` clean; `vite build` clean.
- Landing: `tsc --noEmit` clean; full `build` (client + ssr + prerender) clean
  after dependency removal — 17 indexable routes generated.

## Behavioural changes
**None.** All changes are dead-import removal, one URL-construction refactor that
produces the identical URL, unused-dependency removal, and documentation text.
No API, contract, model, migration, permission, or runtime behaviour changed.

## Remaining technical debt / manual review
See `remaining-work.md`. Highlights: no frontend test suite (largest risk), no
CI, the facility overbooking guard (dev-only feature), and infra items (pooled
DB connection, object storage) — all pre-existing and out of scope for a
behaviour-preserving cleanup.
