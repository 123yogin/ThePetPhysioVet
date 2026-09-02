# Design — Unify the owner portal onto the doctor's sidebar shell

**Author:** Tech Lead · **Date:** 2026-08-21
**Traceability:** SRS §3.1 (role-based access), §3.9 (owner portal); PRODUCT_PLAN §1.4a
(React SPA, web only). Closes audit findings P0, P1, P1b, P2 from 2026-08-21.

## Decision

The owner portal adopts the doctor's sidebar shell verbatim. `OwnerShell` is deleted,
not refactored — a second shell component is what allowed the two sides to drift.

This was the product owner's explicit call after being shown the trade-off (an owner
sidebar carries only 3 links and will look sparse). Recorded here so the sparseness
reads as a decision, not an oversight.

## Why this is worth doing beyond consistency

Measured on 2026-08-21, Chromium + WebKit, at 390 / 600 / 768 / 820 / 900px:

| Finding | Evidence |
|---|---|
| **P0** Doctor nav unreachable ≤768px | `nav 0/8 reachable`, `toggleInDOM=false`, no Sign Out |
| **P1** Owner screens outside the wrap safety net | `.main-panel` absent; 8/11 rows `nowrap` |
| **P1b** OwnerShell is 100% inline styles | 0 structural CSS classes |
| **P2** Hardcoded placeholder in UI | `Attending Specialist: your vet` |
| **P1c** Sign Out below the fold on long desktop pages | `navHittable 8/9` on `/appointments`, `/patients/new`, `/invoices/1` |

**P1c** was found by the baseline harness, not by inspection. `.app-shell` is a flex row
with `min-height: 100vh`, so the sidebar *stretches to the content height*. On a long
page the `sidebar-spacer` pushes Sign Out to the bottom of the **document** rather than
the viewport — the user must scroll a 3000px page to log out. Fix by making the sidebar
`position: sticky; top: 0; height: 100vh` at desktop widths, with `overflow-y: auto`
inside so a tall nav still scrolls.

The unification fixes all four as a side effect, because both roles finally run
through one code path.

## Scope

### In

1. **`Sidebar.tsx`** — nav items become data, selected by `user.role` from the existing
   `['me']` query (already warm; shared with `RequireAuth`, so no extra request).
2. **`AppShell.tsx`** — owns the mobile drawer: toggle button, backdrop, open/close state.
3. **`routes.tsx`** — owner route group renders `<AppShell />`.
4. **`OwnerShell.tsx`** — deleted.
5. **`vet.css`** — drawer visibility, backdrop, scroll lock. No new colour values.

### Out (deliberately)

- **Owner Profile screen.** `ProfileScreen` is doctor-flavoured (`clinic_name`,
  "veterinary clinic branding"). Making it role-aware is a separate story.
- **Owner Notifications screen.** `NotificationsSettingsScreen` looks up *any* owner's
  preferences **by phone number**. It is a doctor admin tool. Exposing it to owners
  would let one owner read and overwrite another's preferences — a direct violation of
  CLAUDE.md rule 4. **Must not be added to the owner nav.**
- Any change to screen bodies beyond what the container swap forces.

## Nav configuration

```
DOCTOR  Dashboard · Appointments · Patients · Invoices & Billing ·
        Revenue · Queries / Inbox · Notifications · Profile        (8 + Sign Out)
OWNER   My Pets · Appointments · Invoices                          (3 + Sign Out)
```

Brand line is identical for both roles: "Pet Physio Vet" over the signed-in user's own
name. This is what removes the hardcoded `your vet` — the owner sees their own name,
exactly as the doctor does.

## Mobile drawer contract

`vet.css` already slides `.sidebar` off-canvas below 768px and expects a
`.sidebar-toggle` and a `body.sidebar-open` class. **Neither is rendered by any
component.** Both halves must be built:

- Toggle button with `aria-expanded`, `aria-controls="app-sidebar"`, and a real
  accessible name. Already ≥44px in CSS (50×50).
- Backdrop that closes on click; visible only ≤768px.
- Close on route change (`useEffect` on `location.pathname`) — otherwise the drawer
  stays open over the screen the user just navigated to.
- Escape closes.
- **Remove `sidebar-open` from `document.body` on unmount.** The class lives on an
  element outside React's tree, so logging out with the drawer open otherwise leaks it
  onto `/login`.
- **Off-canvas sidebar must leave the tab order.** `transform: translateX(-100%)` keeps
  links focusable — a keyboard user tabs into invisible controls. Use `visibility:
  hidden` when closed at mobile widths, restored on open.

## Constraints

- **Palette frozen.** No new colour values anywhere. The backdrop must reuse
  `rgba(62, 39, 35, ...)`, already present in `.sidebar-toggle`'s `box-shadow`.
- No new dependencies.
- Touch targets ≥44px (WCAG 2.5.5).
- `tsc --noEmit` and `vite build` must pass.

## Known visual consequence

Owner content moves from a 1000px centred column to `.main-panel`'s 1280px. Owner cards
were composed for the narrower measure and will look wider. This is accepted as the
cost of consistency, and must be checked by screenshot rather than assumed.

## Verification

A before/after harness captures 627 combinations (3 engines × 11 widths × 19 routes)
measuring overflow, **nav reachability**, sign-out reachability, console errors, and
sub-44px targets.

Reachability is measured because the previous sweep did not. It reported "396
combinations clean" while the doctor nav was completely unreachable on every phone
width — an off-canvas sidebar produces zero overflow. Overflow-only probes cannot see
this class of defect.

---

## Outcome (2026-08-21)

Delivered. Verified by harness run `verified`: **627 combinations** (3 engines × 11 widths
× 19 routes), **zero failures** across all 13 checks — overflow, nav reachability (two-phase
through the drawer), sign-out reachability, drawer overflow, Escape, `aria-expanded`,
accessible name, 44px target, closed-drawer tab trap, console errors, landmark counts.

Before/after on the two defects this story existed to fix:

```
                              before        after
zero nav reachable            225 combos    0
Sign Out unreachable          264 combos    0
```

Palette: 47 distinct colour values before, 47 after, **identical sets** (comment text
excluded). Backend 203/203. `tsc --noEmit` clean, `vite build` clean.

### Found during review, beyond the original scope

| # | Severity | Finding | Status |
|---|---|---|---|
| P1c | — | Sign Out below the fold on long desktop pages | Fixed (sticky sidebar) |
| — | — | Keyboard: opening the drawer then Tab walked past the nav | Fixed by DOM order, not `focus()` |
| 1 | HIGH | Nothing ever assigned `Pet.doctor`, so `doctor_name` was null for every app-created pet | Fixed both POST paths |
| 2 | MEDIUM | `['me']` never cleared on logout — next user saw the previous user's name and nav | Fixed; **reproduced before fixing** |
| 3 | MEDIUM | `doctor_name` introduced an N+1 on unpaginated `/pets` | Fixed (`select_related`) |
| 4 | MEDIUM | Scroll lock named in this design was not implemented | Fixed |
| 5 | MEDIUM | Drawer state not reconciled on resize past the breakpoint | Fixed |
| 6 | LOW | `NAV_BY_ROLE[role]` unguarded, crashes outside the ErrorBoundary | Fixed |
| 9 | LOW | `read_only_fields` on a SerializerMethodField is inert; comment overclaimed | Comment corrected |

On #2 — the leak predates this change, but the owner portal previously had no
user-derived chrome, so the previous user's identity could not surface there. Unifying the
shells is what made it visible. Reproduced by disabling the fix: `owner_sarah` signing in
within 30s of `dr_dhanvi` signing out landed on `/dashboard` showing "Dr. Dhanvi Patel"
and all 8 doctor nav items.

### Still open

- **Owner-booked appointments for a pet with no doctor** get `doctor=None` and never appear
  in `dashboard_stats_view`. Narrower now that both POST paths assign a doctor, but a brand
  new owner's first pet can still be unassigned. Needs a product decision (clinic pool vs
  manual claim), not a one-line fix.
- **`docs/UI_PARITY.md` is stale** — it names `backend/appointments/static/` and
  `templates/`, both deleted, and a `frontend/parity-baseline/` that does not exist. The
  sticky-sidebar change alters a screen that doc calls parity-locked; that is intended
  (P1c), but the doc needs rewriting or retiring.
- **No frontend test suite.** All of the above was caught by an out-of-tree Playwright
  harness plus manual review. Nothing in `frontend/` prevents regression.
- **Real-device testing.** WebKit-under-Playwright is not iOS Safari.
