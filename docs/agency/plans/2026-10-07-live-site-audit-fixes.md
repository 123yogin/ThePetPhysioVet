# Live-Site Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the conversion, SEO and AI-visibility defects found in the 2026-10-07 audits of https://www.thepetphysiovet.com.

**Architecture:** One backend fix (slot availability in `backend/appointments/views/facility.py`), then landing-site changes in `landing/` (React + Vite, prerendered). SEO metadata is generated centrally in `landing/src/seo/metadata.ts` from entities in `landing/src/data/clinicData.ts`; `landing/scripts/seo-check.mjs` is the regression gate and is extended so each SEO fix gets a failing check first.

**Tech Stack:** Django 6 + DRF (backend tests: `DEBUG=true ./.venv/bin/python manage.py test appointments`), React 18 + Vite 6 + TypeScript (landing: `npm run lint`, `npm run build`, `npm run seo:check`).

**Spec:** The three audit reports in this conversation (CRO, SEO, AEO, all 2026-10-07). Key evidence is quoted per task.

## Agent map

| Task | Agency agent / skill |
|---|---|
| 1 Past slots bookable | `engineering:backend-implementer` → review `engineering:python-reviewer` |
| 2 Booking UI hides past slots | `engineering:frontend-implementer` |
| 3 Hero H1, title, value prop | `growth:copywriting` skill → `engineering:frontend-implementer` |
| 4 Trust stats (honest numbers, no "0") | `engineering:frontend-implementer` (+ `engineering:react-reviewer`) |
| 5 FAQ + hours copy for India | `growth:copywriting` skill → `engineering:minimal-change-engineer` |
| 6 Hand-written SEO titles/descriptions | `growth:seo-specialist` |
| 7 Hydrotherapy + acupuncture pages | `growth:seo-specialist` (content) → `engineering:frontend-implementer` |
| 8 Self-host hotlinked images + fonts | `engineering:performance-optimizer` |
| 9 React hydration error #418 | `core-workflow:systematic-debugging` → `engineering:react-reviewer` |
| 10 WhatsApp CTA | `engineering:frontend-implementer` |
| 11 Schema, sameAs, llms.txt | `growth:aeo-strategist` |
| 12 Off-site presence (no code) | `growth:aeo-strategist` + `growth:seo-specialist` → checklist for owner |
| 13 Ship | `engineering:preship-reviewer` → `engineering:deploy-verifier` |

## Open decisions (owner must answer before the blocked task starts)

| # | Question | Blocks |
|---|---|---|
| D1 | Real figures for pets treated, sessions, years of practice, success rate — and is "India's first pet rehabilitation center" sourceable? | Task 4 |
| D2 | First-assessment price in ₹ (or "from ₹X") | Task 5 |
| D3 | Which Indian insurers (if any) reimburse; otherwise use the generic receipt wording | Task 5 |
| D4 | Indoor Facility hours: truly 24×7, or 09:30–13:30 supervised? | Task 5 |
| D5 | WhatsApp number (same as +91 72840 73241?) | Task 10 |
| D6 | Pool details (size, temperature, underwater treadmill y/n) and acupuncture credential wording | Task 7 |
| D7 | Facebook / YouTube / Justdial profile URLs that exist today | Task 11 |

## Global Constraints

- Timezone for every "today/now" decision: `Asia/Kolkata` (`backend/petphysio/settings.py:180`). Use `django.utils.timezone.localdate()` / `localtime()`, never `date.today()`.
- Title length 25–60 chars, description 120–160 chars (`landing/scripts/seo-check.mjs` `TITLE_MIN/MAX`, `DESC_MIN/MAX`).
- Brand string: `The Pet Physio Vet`. Phone: `+91 72840 73241`. Locality: `Shilaj, Ahmedabad`.
- No invented stats, reviews, ratings or insurer names. Only figures from D1–D7.
- No dark patterns: no fake scarcity ("3 of 3 left" must be real counts), no pre-ticked consent.
- Every task ends with `npm run lint && npm run build && npm run seo:check` green in `landing/` (and backend tests green for Task 1).

## Review Focus

1. A visitor at 13:31 IST picks today: no slot may be offered or holdable. → Task 1 test `test_a_started_slot_today_is_refused`, Task 2 Step 3.
2. Server clock in UTC while IST has already rolled to tomorrow (00:00–05:30 IST): "today" must be the IST date. → Task 1 test `test_today_is_the_clinic_date_not_the_server_date`.
3. JS disabled or reduced-motion: stats must show final numbers, never `0`. → Task 4 Step 1.
4. A future edit renames an entity and re-creates "Rehab Rehabilitation"-style doubles. → Task 6 seo-check rule `no repeated word stem in <title>`.
5. Hotlinked `googleusercontent.com` URLs creeping back in. → Task 8 seo-check rule `no third-party image hosts`.

---

### Task 1: Refuse past slots in the facility API

**Files:**
- Modify: `backend/appointments/views/facility.py:68-108` (`_validate_slots`, `_availability_payload`)
- Modify: `backend/appointments/models/facility.py` (add helper)
- Test: `backend/appointments/tests/test_facility_booking.py`

**Interfaces:**
- Produces: `slot_has_started(date_value: date, slot_index: int, now: datetime | None = None) -> bool` in `models/facility.py`. Availability payload gains per-slot `"past": bool`; a past slot reports `"available": 0`.

- [ ] **Step 1: Write failing tests** in `test_facility_booking.py` (freeze time with `unittest.mock.patch("django.utils.timezone.now")`):
  - `test_a_started_slot_today_is_refused`: now = today 10:00 IST → `_book([0])` (09:30 slot) → 400, title `"Slot has started"`; `_book([1])` (10:30) → 201.
  - `test_hold_refuses_a_started_slot`: same as above against the hold endpoint → 400.
  - `test_availability_marks_started_slots_past`: now = today 11:45 IST → GET availability for today → slots 0,1 have `past: True, available: 0`; slots 2,3 `past: False`.
  - `test_today_is_the_clinic_date_not_the_server_date`: now = `2026-10-07T20:00Z` (01:30 IST on 10-08) → booking date `2026-10-07` → 400 `"Date in the past"`.
- [ ] **Step 2: Run** `cd backend && DEBUG=true ./.venv/bin/python manage.py test appointments.tests.test_facility_booking -v 2` → the 4 new tests FAIL.
- [ ] **Step 3: Implement** `slot_has_started` (compare `timezone.localtime(now)` with the slot's `start` on `date_value`). In `_validate_slots` replace `date_cls.today()` with `timezone.localdate()` and add problem `400, "Slot has started", "That time has already begun today — choose a later slot or another day."` In `_availability_payload` add `past` and zero `available` for started slots.
- [ ] **Step 4: Run** the full suite `DEBUG=true ./.venv/bin/python manage.py test appointments` → all PASS.
- [ ] **Step 5: Commit** `fix(facility): refuse and hide slots that have already started (IST)`

### Task 2: Booking UI hides past slots and opens on the next bookable day

**Files:**
- Modify: `landing/src/components/FacilitySlotBooking.tsx` (`Slot` type line ~35, slot grid render)
- Modify: `landing/src/components/IndoorFacilityBooking.tsx` (same pattern, if it renders slots)

**Interfaces:**
- Consumes: Task 1 `slot.past: boolean`.

- [ ] **Step 1:** Add `past?: boolean` to the `Slot` type; render past slots disabled with label `Started` and exclude them from selection.
- [ ] **Step 2:** If every slot for the chosen date is past or full, show `No times left on this day` and set the date input to the next day automatically.
- [ ] **Step 3: Verify in browser** (Playwright, 390px) against local backend with time after 13:30 IST: today shows no selectable slot; date advances to tomorrow; "Hold 1 slot" never enables for a past slot.
- [ ] **Step 4:** `npm run lint && npm run build` green. **Commit** `fix(booking): hide started slots and default to next bookable day`

### Task 3: Hero says what, where, who

**Files:**
- Modify: `landing/src/components/Hero.tsx:100-135`
- Modify: `landing/src/seo/metadata.ts:185` (home title)
- Modify: `landing/scripts/seo-check.mjs` (new rule)

- [ ] **Step 1: Failing check** — add to `seo-check.mjs`: home `<h1>` text must contain `Physiotherapy` and `Ahmedabad`; home `<title>` must contain `The Pet Physio Vet`. Run `npm run build && npm run seo:check` → FAIL.
- [ ] **Step 2: Copy** (via `growth:copywriting`): H1 `Vet-led physiotherapy & hydrotherapy for dogs and cats in Ahmedabad`; slogan "Life is movement, movement is life." moves to the eyebrow line; subhead names Dr. Dhanvi Patel, M.V.Sc., Shilaj clinic + home visits. Remove "India's first…" unless D1 supplies a source.
- [ ] **Step 3:** Home title → `Dog & Cat Physiotherapy in Ahmedabad | The Pet Physio Vet` (≤60 chars). Move the "What are you noticing?" condition links directly under the H1.
- [ ] **Step 4:** Lint, build, seo:check green. **Commit** `feat(hero): plain-language H1 and brand-led home title`

### Task 4: Honest trust stats that never render as 0

**Blocked by:** D1

**Files:**
- Modify: `landing/src/components/TrustMetrics.tsx:5-10`
- Modify: `landing/src/motion/index.tsx:247-275` (`CountUp`)

- [ ] **Step 1: Failing check** — Playwright at 390px, load `/`, do NOT scroll: the four stat values must equal the configured strings (e.g. `500+`). Currently reads `0+`.
- [ ] **Step 2:** In `CountUp`, set `el.textContent = fmt(0)` only inside the `observe` callback (when the element actually enters view), so the pre-intersection and no-JS state is the final value.
- [ ] **Step 3:** Replace the four stats with D1 figures; drop any figure the owner can't support.
- [ ] **Step 4:** Re-run Step 1 → PASS; also with `prefers-reduced-motion`. Lint/build green. **Commit** `fix(trust): real figures, never show 0 before scroll`

### Task 5: FAQ, price and hours copy for Indian visitors

**Blocked by:** D2, D3, D4

**Files:**
- Modify: `landing/src/data/clinicData.ts:~440-470` (FAQ answers)
- Modify: `landing/src/components/IndoorFacilityBooking.tsx:273`, `landing/src/data/bookableServices.ts` (24×7 wording)
- Modify: `landing/src/components/Hero.tsx` (price line near CTA)

- [ ] **Step 1:** Insurance answer → no US/UK insurer names; use D3 list or `We provide itemised receipts you can submit to your insurer.`
- [ ] **Step 2:** Referral answer adds `No referral? Call us — we'll coordinate with your vet.`
- [ ] **Step 3:** Hours: one statement from D4 used identically in footer, services card and booking panel.
- [ ] **Step 4:** Add `First assessment · 60 min · ₹{D2}` beside "Book Assessment".
- [ ] **Step 5:** `grep -rn "Trupanion\|Nationwide\|Healthy Paws" landing/src` → no hits. Lint/build/seo:check green. **Commit** `content: India-specific FAQ, consistent hours, assessment price`

### Task 6: Hand-written titles and descriptions

**Files:**
- Modify: `landing/src/data/clinicData.ts` (add optional `seoTitle`, `seoDescription` to each condition and treatment)
- Modify: `landing/src/types.ts` (fields)
- Modify: `landing/src/seo/metadata.ts:99-125` (prefer `seoTitle` over template)
- Modify: `landing/scripts/seo-check.mjs`

**Interfaces:**
- Produces: `seoTitle?: string; seoDescription?: string` on condition and service entity types.

- [ ] **Step 1: Failing checks** in `seo-check.mjs`: (a) fail if a `<title>` contains the same word stem twice (`/\b(rehab)\w*\b.*\b\1\w*\b/i`); (b) fail if a condition/treatment `<title>` lacks `Ahmedabad`; (c) warn if description < 140 chars. Build + seo:check → FAIL on post-surgical, obesity-rehab, neurological, specialised.
- [ ] **Step 2:** `growth:seo-specialist` writes `seoTitle`/`seoDescription` for all 8 conditions + 5 treatments, pattern `[Condition] Physiotherapy for Dogs & Cats in Ahmedabad` (≤60 chars, may drop brand suffix when needed). Rename treatment `Specialised` → `Acupuncture & Hydrotherapy` (title, H1, nav; keep URL until Task 7 adds redirects).
- [ ] **Step 3:** `metadata.ts` uses `entity.seoTitle ?? template`.
- [ ] **Step 4:** seo:check green. **Commit** `seo: hand-written titles and descriptions with locality`

### Task 7: Dedicated hydrotherapy and acupuncture pages

**Blocked by:** D6

**Files:**
- Modify: `landing/src/data/clinicData.ts` (split `Specialised` into `hydrotherapy`, `acupuncture` treatments)
- Modify: `landing/src/seo/routes.ts` (new routes, 301 `/treatments/specialised` → `/treatments/hydrotherapy`)
- Modify: `landing/src/seo/schema.ts` (Service nodes)
- Expand: treatment entries for manual therapy, electrophysical, home care, indoor physiotherapy to ≥800 words with an FAQ block each (`landing/src/data/conditionFaqs.ts` pattern)

- [ ] **Step 1: Failing check** — `seo-check.mjs`: sitemap must include `/treatments/hydrotherapy` and `/treatments/acupuncture`; every `/treatments/*` page ≥ 700 words in `#root`.
- [ ] **Step 2:** Content from D6 only (no invented equipment). Each page: what it treats, session flow, length, contraindications, 4–6 FAQs with FAQPage schema.
- [ ] **Step 3:** Redirect + sitemap + internal links from conditions (e.g. IVDD → hydrotherapy).
- [ ] **Step 4:** seo:check green; `curl -I` local preview of `/treatments/specialised` → 301. **Commit** `feat(seo): hydrotherapy and acupuncture pages, deeper treatment pages`

### Task 8: Self-host hotlinked images and fonts

**Files:**
- Modify: `landing/src/data/clinicData.ts`, `landing/src/data/legalContent.ts` (6+ `lh3.googleusercontent.com/aida-public` URLs)
- Create: `landing/public/photos/*.webp`
- Modify: `landing/index.html:45-48` (Google Fonts → self-hosted `@font-face` in `src/index.css`, `font-display: swap`, preload the two woff2 files)
- Modify: `landing/scripts/seo-check.mjs`

- [ ] **Step 1: Failing check** — fail if any built HTML contains `googleusercontent.com` or `fonts.googleapis.com`. → FAIL.
- [ ] **Step 2:** Confirm each hotlinked image is licensed/owned; replace any that is AI placeholder art with a real clinic photo from `public/photos/`, else download → WebP ≤ 120 KB with width/height.
- [ ] **Step 3:** Self-host Fraunces + Figtree subsets (latin). Update CSP in `vercel.json` if it lists Google Fonts.
- [ ] **Step 4:** Baseline and after: Lighthouse mobile LCP + total bytes on `/` (performance-optimizer records both). seo:check green. **Commit** `perf: self-host images and fonts`

### Task 9: Fix React hydration error #418

**Files:** discovered during debugging (likely a component rendering time/date/random or `window`-dependent text during SSR — `FacilitySlotBooking` date default, `CountUp`, gallery).

- [ ] **Step 1:** Reproduce with the dev (non-minified) build: `npm run build:client -- --mode development` + prerender, load `/`, read the full mismatch message.
- [ ] **Step 2:** Fix the single mismatching node (render the client-only value in `useEffect`).
- [ ] **Step 3:** Production build, load `/` → console has 0 errors. **Commit** `fix(ssr): resolve hydration mismatch #418`

### Task 10: WhatsApp contact

**Blocked by:** D5

**Files:**
- Modify: `landing/src/components/MobileActionBar.tsx`, `landing/src/components/Footer.tsx`
- Modify: `landing/src/seo/siteConfig.ts` (add `whatsapp: '917284073241'`)

- [ ] **Step 1:** Add `https://wa.me/<D5>?text=Hi%2C%20I'd%20like%20to%20book%20a%20physio%20assessment` button to the mobile action bar and footer, label `WhatsApp us`.
- [ ] **Step 2:** Browser check 390px: bar shows Call · WhatsApp · Book; link opens wa.me. **Commit** `feat(contact): WhatsApp click-to-chat`

### Task 11: Schema, sameAs and llms.txt

**Blocked by:** D7

**Files:**
- Modify: `landing/src/seo/schema.ts`, `landing/src/seo/siteConfig.ts`
- Modify: llms.txt source (find via `grep -rn "llms" landing/scripts landing/public`)

- [ ] **Step 1:** `sameAs` gains every D7 URL. Remove the `emergency` ContactPoint (same number as main). Remove empty `{"@type":"Audience"}` objects or give `audienceType: "Pet owners"`. Add `areaServed` + `provider` `@id` to each Service.
- [ ] **Step 2:** llms.txt: add hydrotherapy/acupuncture pages, D2 price, D4 hours; remove "India's first" unless sourced.
- [ ] **Step 3:** Validate built JSON-LD with `node -e` parse over every page (seo-check already parses) + Google Rich Results Test on `/` and one condition page. **Commit** `seo(schema): sameAs, services, llms.txt refresh`

### Task 12: Off-site presence checklist (owner action, no code)

- [ ] `growth:aeo-strategist` produces `docs/agency/offsite-checklist.md`: Google Business Profile (primary category "Animal physical therapy"/"Veterinarian", identical NAP, hours, photos, review link), Search Console + Bing Webmaster verification and sitemap submit, Justdial/Sulekha/Facebook/Apple Business Connect listings with identical NAP, review-request script for the clinic, and a 20-prompt AI-citation baseline to re-run monthly.

### Task 13: Review and ship

- [ ] `engineering:preship-reviewer` over the branch → SHIP / SHIP WITH FIXES / DO NOT SHIP.
- [ ] `engineering:deploy-verifier`: deploy backend (Task 1) before landing (Task 2 depends on `past`); confirm live `/api/v1/facility/availability?date=<today>` returns `past` and the live homepage serves the new H1 and no `googleusercontent.com`.
- [ ] Re-run the three audits (`growth:seo-specialist`, `growth:aeo-strategist`, `page-cro`) on the live site and compare with the 2026-10-07 baseline.
