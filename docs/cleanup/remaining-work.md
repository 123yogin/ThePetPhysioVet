# Remaining Work — Requires Product/Technical Review

Nothing below was changed automatically. Each needs a human decision or an
action that a behaviour-preserving cleanup must not take on its own.

## Dependencies
- **`@capacitor/camera`, `@capacitor/share` (frontend):** not imported in `src/`,
  but native plugins. Verify no native references in `android/`/`ios/`, then
  remove **and run `npx cap sync`**. Do not remove without the sync.
- **`esbuild` (frontend devDep):** removable (transitive via Vite) but touches
  the lockfile; do it with a clean `npm install` + build.
- **Version inconsistencies across the three `package.json` files** (React 18 in
  `frontend`, React 19 in `landing`, differing Vite majors). Intentional today;
  not reconciled. Review before any shared-tooling consolidation.
- **No dependency upgrades were performed** — explicitly out of scope.

## Backend
- **URLconf is mounted twice** (`/api/v1/*` and `/api/*`, same include). Appears
  intentional (mobile vs web). Confirm both prefixes are still consumed before
  removing either — a `test_contract`/route test likely pins this.
- **`Notification` and `Package` models are dead weight** (per `CLAUDE.md`): rows
  only ever created by `seed_data`, nothing in the app writes them. Either wire or
  delete — a product decision, not a hygiene deletion.
- **f-strings without placeholders / two unused locals** — trivial, left to avoid
  semantic risk from `--remove-unused-variables`.

## Tests / CI
- **No frontend/landing test suite.** Highest-risk gap. Recommend Vitest +
  React Testing Library for the booking and auth flows at minimum.
- **No CI is configured.** The 420-test backend suite runs only when invoked by
  hand. Recommend a CI workflow running the suite + `tsc` on both frontends.

## Tooling
- **`frontend/tools/` — 20 ad-hoc CDP `.mjs` QA scripts** + an `adversarial/`
  suite. Operational, not wired to anything. Decide: promote to a real suite,
  document, or remove. Not touched (operational scripts are not removed on the
  basis of "not referenced by app code").

## Configuration
- Run the **env-var declared-vs-used diff** (blocked here by the secrets guard).
- **Consolidate/retire deployment configs** once the live topologies are known
  (Vercel vs Compose vs single-container).

## Infrastructure (pre-existing, from the architecture analysis)
- **Pooled Postgres connection** (Neon pgBouncer) before real traffic — serverless
  connection storms otherwise.
- **Object storage** for uploads — serverless disk is ephemeral; uploads are lost.
- **Facility overbooking guard** (dev-only feature) needs a Postgres-level
  constraint before it ships. None of this is repo hygiene; listed for continuity.

## Documentation conflict (from architecture analysis, not resolved here)
- `CLAUDE.md` says "Mobile (React Native) out of scope"; a Capacitor mobile app
  exists and shipped. Reconcile the wording — a doc decision.
