# Dependency Cleanup

Tooling: `depcheck` per package, then every flag **verified by grep/build**
before action. depcheck is known to false-positive on Capacitor native packages
and Tailwind-v4 CSS imports, so nothing was removed on its say-so alone.

## Removed (landing — verified unused, build re-passed)

| Package | Type | Evidence |
| --- | --- | --- |
| `dotenv` | dep | 0 references; prerender/build scripts use only node builtins |
| `express` | dep | 0 references; build is `vite build --ssr` + node prerender, no runtime server |
| `@types/express` | devDep | types for the unused `express` |
| `autoprefixer` | devDep | 0 references; no `postcss.config`; Tailwind v4 autoprefixes internally |
| `esbuild` | devDep | 0 direct references; present transitively via Vite |

`npm run build` (client + SSR + prerender) re-verified after removal — clean.

## Kept — depcheck false positives (verified in use)

| Package | Why it is actually used |
| --- | --- |
| `@capacitor/android`, `@capacitor/ios` (frontend) | Native platform packages; CLI-managed, never JS-imported. `android/` + `ios/` projects exist. Removing breaks native builds. |
| `tailwindcss` (landing) | Tailwind v4 CSS-first: `@import "tailwindcss"` in `index.css` + `@tailwindcss/vite` in `vite.config.ts`. |
| `motion` (landing) | Imported in 3 source files. |

## Needs validation — NOT removed

| Package | Note |
| --- | --- |
| `@capacitor/camera`, `@capacitor/share` (frontend) | Not imported in `src/`, but they are native plugins registered into the synced `android/`/`ios/` projects. Verify no native references, then remove **and run `npx cap sync`**. |
| `esbuild` (frontend devDep) | No direct use; removable but touches the lockfile and needs a clean `npm install` + build to confirm. Low risk, deferred. |

## Not done
No dependency **upgrades** were performed (out of scope — upgrades change
behaviour). No version-inconsistency remediation across the three `package.json`
files was attempted; noted in `remaining-work.md`.
