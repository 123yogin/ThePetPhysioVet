# Test Cleanup

## Baseline
- **Backend:** 18 test files, 420 tests. 1 failing at baseline
  (`test_every_spa_path_resolves`), now passing — see below.
- **Frontend / landing:** **no test suite exists** (no Vitest, Jest or
  Playwright). This is the single largest coverage gap in the repo.

## Tests removed
**None.** No duplicate, stale, or dead-functionality tests were found that
warranted deletion. The suite is coherent and each file maps to a real area.

## Tests changed
**None directly.** The one failing test now passes because the *application code*
it guards was corrected, not because the test was altered:

- `test_every_spa_path_resolves` (`test_config_and_routes.py`) scrapes API path
  literals from the SPA source and asserts each resolves against the URLconf. It
  was failing on `frontend/src/api/facility.ts`, which built its URL with an
  inline ternary the scraper couldn't parse. Fixing `facility.ts` (to match the
  `enquiries.ts` pattern) restored it. **Triage result: (C) the test was correct;
  the code was wrong.** The test was left untouched — it did its job.

## Tests added
**None in this pass.** Adding tests was out of scope for a behaviour-preserving
hygiene pass; the meaningful gaps are recorded below and in `remaining-work.md`.

## Broken / flaky tests
- No flaky tests identified. The suite ran deterministically across repeated runs
  this session.
- Minor smell (not fixed): a few tests import names they no longer use (cleaned
  via autoflake) and a couple hold unused locals; none affected assertions.

## Coverage gaps (Phase 8 — meaningful risk, not yet filled)
1. **Entire frontend + landing have zero automated tests.** Every UI regression
   so far was caught by eye or the out-of-tree `tools/` scripts. Highest risk.
2. **The facility booking concurrency guard** (dev-only feature) is correct on
   SQLite but not on Postgres; there is no test proving the Postgres-level guard
   because it isn't built yet. See `remaining-work.md`.
3. **Payment/notification paths** — none exist, so nothing to test yet.

These are documented, not silently actioned, per the task's "meaningful coverage,
not arbitrary 100%" instruction.
