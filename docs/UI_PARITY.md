# UI Parity — React must match the current Django HTML exactly

**Goal:** the React doctor web app must look **pixel-identical** to the current
Django-rendered pages — same layout, same colors, same fonts, same spacing.

## Source of truth (do not invent styles)
- **Stylesheet:** `backend/appointments/static/vet.css` (564 lines) — the single source of all
  styling. **Reuse it verbatim** in React (copy it into the React app as a global CSS
  file and import it once at the app root). Do not re-derive or "clean up" the styles.
- **Markup:** `backend/appointments/templates/vet/*.html` — mirror the DOM structure and the
  exact CSS class names for each screen so `vet.css` applies unchanged.
- **Font:** DM Sans via the Google Fonts `@import` already in `vet.css`.

## Design tokens (from vet.css `:root` — for reference only; use the CSS vars, don't hardcode)
```
--cream:       #faf6f1     --brown-900: #3e2723
--cream-deep:  #f0e6dc     --brown-700: #5d4037
--white(glass) rgba(255,255,255,0.72)   --brown-500: #8d6e63
--glass-border rgba(255,255,255,0.35)
--shadow       0 8px 32px rgba(62,39,35,0.12)
--radius       18px        --font: "DM Sans", "Segoe UI", system-ui, sans-serif
background:    radial-gradient(120% 80% at 10% 0%, #fff9f4 0%, var(--cream) 45%, #e8ddd4 100%)
accents:       green #2e7d32 · red #b71c1c/#c62828 · blue #1565c0
key classes:   .glass-card .auth-shell .auth-brand .alert(.alert-success/-error/-info)
```

## Screens to port (1:1 with templates)
`login`, `signup` (base_auth), `dashboard`, `appointments`, `create`, `reschedule`,
`patients`, `pet_form`, `share`, app shell (`app_base`).

## Baseline exception: dashboard (updated Sprint 5)
The **dashboard intentionally diverged** from the Django template: it now shows the
SRS §3.2 **notification feed** widget, which the Django template (being retired) never
had. So the dashboard is **no longer diffed against Django** — its approved golden is
`frontend/parity-baseline/dashboard.png` (the accepted React render, feed included).
The header/stats above the fold still match Django exactly; only the feed region (lower
half) differs, and that is intended. The other 8 screens still diff against Django.
As more React screens gain features Django lacks, migrate them to a committed React
baseline the same way (Django UI is API-only in the target).

## Browser parity check (Playwright — installed)
1. Run Django: `./.venv/bin/python manage.py runserver` (renders the current HTML).
2. Run React dev server (Vite).
3. For each screen, Playwright navigates both, sets the same viewport, and captures
   screenshots (seed a test doctor user for authenticated pages).
4. Diff React vs Django screenshots; flag any visual delta. Parity check must pass
   before the screen is "done".
