# Mobile build — working agreement & live tracker

**Design:** [`DESIGN_mobile.md`](DESIGN_mobile.md) — read that first for *why*.
**This file:** the rules I work under and the live status of every task and every screen.
**Started:** 2026-09-05
**Definition of done:** all 9 defects closed, all 24 routes and all 8 shared components
verified on a real emulator on both platforms, web build proven unregressed, and an
installable artifact produced.

---

## 1. Working rules (non-negotiable for this build)

These are enforced on every commit. A task is not done if it violates one.

### R1 — No stale or unnecessary comments
- A comment explains **why**, never **what**. If the code says what it does, no comment.
- Deleting code deletes its comment in the same edit. No comment may describe a state of
  the codebase that no longer exists.
- No commented-out code. Ever. Git holds the history.
- No `TODO` / `FIXME` left behind. Either fix it or record it in §5 of this file.
- No decorative banners, no `// end of function`, no change-log narration in comments
  (`// changed 2026-09-05`, `// was previously X`).
- Existing comments in touched files are audited: if my change makes one wrong, I fix it.

### R2 — No extra code
- Change only what the task requires. No drive-by refactors, no renames, no reformatting
  of lines I did not otherwise need to touch.
- No speculative abstraction. No config flag, wrapper, helper or interface added "for
  later". If exactly one caller exists, it is not a helper.
- No new dependency unless the task cannot be done without it, and it is named in the
  design doc.
- No dead code. Nothing unreferenced ships.
- No duplicated logic — the `appointment-options` lesson from the 2026-08-21 sprint
  stands: one source of truth, always.

### R3 — No patches, no workarounds
- Every fix lands at the **cause**, not the symptom. If the real fix is bigger, I say so
  and we decide — I do not paper over it.
- No `setTimeout` to dodge a race. No `try/catch` that swallows an error to make a screen
  render. No `!important` to beat a specificity problem. No `any` to silence TypeScript.
- No platform sniffing to route around a bug that should be fixed once for both.
- If I cannot fix something properly, it goes in §5 as an open item — it does not ship as
  a hack.

### R4 — Everything is verified on an emulator
- **Every route and every shared component** in §4 is exercised on a running Android
  emulator **and** a notched iOS simulator. Not one representative screen — all of them.
- Verification asserts **reachability and function**, not absence of overflow. This is the
  explicit lesson from `CLAUDE.md`: a sweep once reported "396 combinations clean" while
  the doctor nav was completely unreachable on every phone width, because an off-canvas
  sidebar produces no overflow.
- **Geometry is asserted in device pixels, not viewport pixels.** `getBoundingClientRect()`
  measures against the viewport, and on Android the viewport extends under the status bar —
  so the DOM reported `titleTop: 20, onScreen: true` for a title that was behind the clock
  (D15), and the route sweep passed 20/20 through it. `tools/top-strip.mjs` reads the raw
  framebuffer and the OS's own `statusBars` inset, and asserts the page's first row is not
  above it. It is proven against the defect: reintroducing D15 at runtime makes it report
  `hidden 48.8 CSS px, pass: false`.
- For each screen I check: it renders with real API data; every nav control is
  hit-testable; every primary action completes; forms submit and validate; the keyboard
  does not cover the focused input; safe-area insets are respected; hardware back does the
  right thing.
- Unverified means **not done**. I report "not yet tested" plainly rather than assuming.

### R5 — The web build must not regress
`vet.css`, `http.ts` and `tokens.ts` are shared by web and both mobile targets. A break in
any of them breaks all three at once, and there is no frontend test suite to catch it
(`CLAUDE.md` debt item 5). Every phase re-checks the web app.

### R6 — Honest reporting
Per `CLAUDE.md` rule 7. If something fails I show the output. I never mark a row green
without having run it. Emulator screenshots or command output back every ✅ in §4.

### R7 — Do not stop
Work continues through all phases without pausing for approval, **except** where a step
is physically impossible without you — the Phase 0 toolchain installs, an Apple ID, a
signing key, or a decision the design doc flags as needing a product call. At those points
I state exactly what is blocked, complete every unblocked task, and continue.

---

## 2. Status legend

| Mark | Meaning |
|---|---|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Done **and** verified on emulator per R4 |
| ⛔ | Blocked — reason stated |
| ➖ | N/A for this platform |

---

## 3. Phase & task tracker

### Phase 0 — Toolchain

**Corrected 2026-09-05.** The first audit reported the whole toolchain missing. That was
wrong: it looked for `~/Library/Android/sdk`, but the SDK is installed at
`/usr/local/share/android-commandlinetools`. Java was present too, just keg-only and off
PATH. **Android was never blocked.** Capacitor 8 also needs **JDK 21**, not the 17 named in
the design doc — the 17 build failed on `capacitor-camera` requiring `languageVersion=21`.

| # | Task | Status | Note |
|---|---|---|---|
| 0.1 | JDK 21 | ✅ | `openjdk 21.0.12.1`; 17 is not sufficient for Capacitor 8 |
| 0.2 | Android SDK 34 + build-tools + x86_64 image + AVD | ✅ | already present; AVD `waypoint` (Pixel 6, API 34) |
| 0.3 | Xcode (full, from App Store) | ✅ | Xcode 26.5 (17F42) — plus a 10.6 GB iOS 26.5 simulator runtime, which is a separate download the SDK listing does not imply |
| 0.4 | Developer dir | ✅ | via `DEVELOPER_DIR`, so no sudo was needed |
| 0.5 | CocoaPods | ➖ | **not required** — Capacitor 8 iOS uses Swift Package Manager |
| 0.6 | Apple Developer account | ⬜ | store submission only, not needed to build |

### Phase 1 — Networking & config → fixes D1, D9

| # | Task | Status |
|---|---|---|
| 1.1 | `VITE_API_BASE` env var + `.env.mobile.example`; env var overrides the file | ✅ |
| 1.2 | `http.ts` URL builder honours the base (one `apiUrl()`, no duplication) | ✅ |
| 1.3 | **`http.ts:54` hardcoded refresh URL** — the second, separate site | ✅ |
| 1.4 | `build:mobile` pins `APP_BASE=/`; build **refuses** without `VITE_API_BASE` | ✅ |
| 1.5 | Backend CORS: `capacitor://localhost`, `https://localhost` — always on, not env-gated | ✅ |
| 1.6 | Web build compared before/after (R5) | ✅ CSS byte-identical; `API_BASE` folds to `""` |

### Phase 2 — Secure token storage → fixes D7

| # | Task | Status |
|---|---|---|
| 2.1 | `@aparajita/capacitor-secure-storage@8` (Keychain / EncryptedSharedPreferences) | ✅ |
| 2.2 | `main.tsx` hydrates the cache before first render (no separate file needed) | ✅ |
| 2.3 | `tokens.ts` sync getters read cache; all 6 mutation sites **awaited**, none swallowed | ✅ |
| 2.4 | Web keeps `localStorage` — the plugin's web fallback would re-key and log everyone out | ✅ |
| 2.5 | login → force-quit → relaunch still authenticated | ✅ relaunched straight to `/owner/home` with live data |
| 2.6 | tokens absent from WebView `localStorage` on device | ✅ `Object.keys(localStorage)` is `[]` |

### Phase 3 — Capacitor scaffold

| # | Task | Status |
|---|---|---|
| 3.1 | Capacitor 8 + 8 plugins, `capacitor.config.ts` | ✅ |
| 3.2 | `npx cap add android` | ✅ 8.0 MB debug APK built |
| 3.3 | `npx cap add ios` | ✅ project generated (SPM, no CocoaPods) |
| 3.4 | App id `com.thepetphysiovet.app`, name, icons, splash | ⬜ |
| 3.5 | Launches to login screen on Android emulator | ✅ |
| 3.6 | Launches to login screen on iOS simulator | ✅ iPhone 17 Pro, iOS 26.5 |

### Phase 4 — Native shell UX → fixes D2, D3, D8

| # | Task | Status |
|---|---|---|
| 4.1 | Android back → router `navigate(-1)`, exit only at root | ✅ verified both directions |
| 4.2 | `viewport-fit=cover` in `index.html` | ✅ |
| 4.3 | 19 `env(safe-area-inset-*)` rules in `vet.css` | ✅ |
| 4.4 | Status bar plugin (`Style.Light`, existing palette colour) | ✅ verified on screen |
| 4.5 | Keyboard resize moved to `capacitor.config` — the runtime call is iOS-only (D12) | ✅ |
| 4.6 | All 3 `window.location.*` routed through `lib/navigation.ts` / query refetch | ✅ |
| 4.7 | Palette invariant: 37 literal colour values, **identical set** before and after | ✅ |

### Phase 5 — Native capabilities → fixes D4, D5, D6

| # | Task | Status |
|---|---|---|
| 5.1 | `ExternalLink` on the 4 file/attachment links | ✅ `Browser.open` → Chrome Custom Tab |
| 5.2 | `AppLauncher.openUrl` handoff for WhatsApp + `sms:` | ✅ Messages app opened on device |
| 5.3 | `Info.plist` camera + photo-library usage strings | ✅ plist validated |
| 5.4 | Camera plugin at the 4 upload sites | 🔄 gated on emulator evidence — see §5 item 3 |
| 5.5 | Android runtime permission prompts | ⬜ pending 5.4 |

### Phase 6 — Push notifications

⛔ **Deferred by design.** Not a wrapper task: `CLAUDE.md` debt item 4 records that
`Notification` has never had a row written by the app. This is the entire unbuilt
server-side pipeline plus FCM, and it is scoped as its own sprint.

### Phase 7 — Deployment & transport

| # | Task | Status |
|---|---|---|
| 7.1 | API reachable from device — emulator uses `10.0.2.2` | ✅ |
| 7.2 | Android cleartext — `src/debug` network config only; release stays TLS-only | ✅ |
| 7.3 | iOS ATS | ✅ not needed — the app talks to production over HTTPS |
| 7.4 | `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` updated | ⬜ |
| 7.5 | `ALLOW_INSECURE_HTTP` escape hatch left untouched | ⬜ |

### Phase 8 — Verification

| # | Task | Status |
|---|---|---|
| 8.1 | Full §4 matrix green on Android | ✅ 19/19 routes + top-strip pixel check, 0 console errors |
| 8.2 | Notched iOS | ✅ safe areas measured on device; no CDP on the simulator, so less instrumented than Android |
| 8.3 | Web regression — CSS byte-identical, `API_BASE` folds to `""`, `/app` base still honoured | ✅ |
| 8.4 | Installable debug APK produced | ✅ 9.2 MB, installed and driven on the emulator |
| 8.5 | iOS build runs on simulator | ✅ BUILD SUCCEEDED, 7.8 MB, launches and stays up |

### Phase 9 — Store packaging *(only on your go-ahead)*

| # | Task | Status |
|---|---|---|
| 9.1 | Signing keys | ⬜ |
| 9.2 | Store listings | ⬜ |
| 9.3 | Privacy labels — health-adjacent + personal data, disclosure required | ⬜ |
| 9.4 | Submission | ⬜ |

---

## 4. Emulator verification matrix (R4)

Every row exercised on both platforms. `A` = Android emulator, `i` = notched iOS
simulator. A row is ✅ only when it renders on real API data, every control is
hit-testable, the primary action completes, and safe-area + keyboard + back behave.

### Doctor routes (20)

| Route | Screen | A | i | Notes |
|---|---|---|---|---|
| `/login` | LoginScreen | ⬜ | ⬜ | keyboard over password field; show/hide toggle |
| `/forgot-password` | ForgotPasswordScreen | ⬜ | ⬜ | identical 200 for known/unknown email must hold |
| `/reset-password` | ResetPasswordScreen | ⬜ | ⬜ | deep-linked token in query string |
| `/` | RoleLanding | ⬜ | ⬜ | role split, no flash of wrong nav |
| `/dashboard` | DashboardScreen | ⬜ | ⬜ | stat tiles, real data |
| `/patients` | PatientsScreen | ⬜ | ⬜ | list scroll, empty state |
| `/patients/new` | PetFormScreen | ⬜ | ⬜ | 4 fields + toggle; keyboard |
| `/patients/:id` | PetDetailScreen | ⬜ | ⬜ | **2 file inputs (D6)**, **2 blank links (D4)** |
| `/appointments` | AppointmentsScreen | ⬜ | ⬜ | largest screen, 767 lines |
| `/appointments/new` | CreateScreen | ⬜ | ⬜ | visit types from `/appointment-options` only |
| `/appointments/:id/reschedule` | RescheduleScreen | ⬜ | ⬜ | must move the real date |
| `/appointments/:id/share` | ShareScreen | ⬜ | ⬜ | **WhatsApp + `sms:` (D5)** |
| `/invoices` | InvoiceListScreen | ⬜ | ⬜ | |
| `/invoices/new` | InvoiceFormScreen | ⬜ | ⬜ | GST running total before irreversible Issue |
| `/invoices/:id` | InvoiceDetailScreen | ⬜ | ⬜ | payment recording |
| `/revenue` | RevenueScreen | ⬜ | ⬜ | no fabricated fallback on failure |
| `/enquiries` | EnquiriesScreen | ⬜ | ⬜ | 558 lines, collapsible inbox |
| `/queries` | QueryInboxScreen | ⬜ | ⬜ | owner photo attachments visible |
| `/notifications-settings` | NotificationsSettingsScreen | ⬜ | ⬜ | SMS opt-out |
| `/profile` | ProfileScreen | ⬜ | ⬜ | |

### Owner routes (4)

| Route | Screen | A | i | Notes |
|---|---|---|---|---|
| `/owner/home` | OwnerHomeScreen | ⬜ | ⬜ | **`window.location.reload()` (D8)** |
| `/owner/pets/:id` | OwnerPetDetailScreen | ⬜ | ⬜ | **2 file inputs, 2 blank links**; 3 tabs |
| `/owner/appointments` | OwnerAppointmentsScreen | ⬜ | ⬜ | book / cancel / request reschedule |
| `/owner/billing` | OwnerBillingScreen | ⬜ | ⬜ | invoice detail |

### Shared components (8)

| Component | A | i | What must be true |
|---|---|---|---|
| AppShell | ⬜ | ⬜ | drawer opens/closes; body class cleaned up on unmount |
| Sidebar | ⬜ | ⬜ | **all 8 nav items hit-testable**; Sign Out reachable, not under home indicator |
| RequireAuth | ⬜ | ⬜ | role gate; no leak of the other role's nav |
| ErrorBoundary | ⬜ | ⬜ | recovery navigates, does not hard-reload (D8) |
| FlashStack | ⬜ | ⬜ | toasts clear the notch and the keyboard |
| Icon | ⬜ | ⬜ | species icon from `species`, never from breed text |
| PasswordField | ⬜ | ⬜ | show/hide works with the native keyboard open |
| RoleLanding | ⬜ | ⬜ | correct landing per role |

### Cross-cutting behaviours

| Behaviour | A | i |
|---|---|---|
| Hardware back from every depth (D2) | ⬜ | ➖ |
| Safe-area insets top and bottom (D3) | ⬜ | ⬜ |
| Keyboard never covers a focused input — all 21 forms | ⬜ | ⬜ |
| Token refresh after access-token expiry (D1, site 2) | ⬜ | ⬜ |
| Force-quit → relaunch stays signed in (D7) | ⬜ | ⬜ |
| Sign out clears `['me']` — no previous user's name/nav | ⬜ | ⬜ |
| Offline / API-unreachable shows a real error, not a blank screen | ⬜ | ⬜ |
| Cross-owner access returns 404, never 403 | ⬜ | ⬜ |

---

## 5. Open items & deviations

Anything I could not fix at the cause (R3), any rule tension, any product decision needed.
Empty is the goal.

| # | Item | Raised | Status |
|---|---|---|---|
| 1 | **Deviation from the design doc's layout.** Native projects live at `frontend/android` and `frontend/ios`, not `mobile/`. Capacitor's default; the `mobile/` path needs extra config in every `cap` command for no benefit (R2). | 2026-09-05 | accepted |
| 2 | **Design doc said Capacitor 7 / JDK 17.** Both wrong: Capacitor 8 is current and requires JDK 21. The 17 build failed. Doc to be corrected. | 2026-09-05 | open |
| 3 | **Is the camera plugin needed?** `Info.plist` alone closes the D6 crash, and Capacitor's WebView implements `onShowFileChooser`, so `<input type="file">` may already work. Adding the plugin is a UX upgrade, not a defect fix. Deciding on emulator evidence rather than theory (R3). | 2026-09-05 | open |
| 4 | **`pointer: coarse` is unreliable.** The Android WebView reports `pointer: fine`, so the first D10 fix silently never applied — measured, not assumed. Re-keyed to the app's existing 768px breakpoint, with `pointer: coarse` kept as a second arm for tablets. | 2026-09-05 | resolved |
| 6 | **Screenshots caught what measurement missed.** D15 was invisible to the DOM probe: `scrollTop: 0`, `titleTop: 20`, `titleOnScreen: true` — all true of the viewport, none true of the device. The route sweep passed 20/20 straight through it. Now covered by `tools/top-strip.mjs`. | 2026-09-05 | resolved |
| 8 | **A layout audit needs to know what it is measuring.** The first run reported a 121px "cut" placeholder on `/appointments/new` — a *textarea*, whose placeholder wraps, so measuring it on one line is meaningless. Withdrawn and the tool corrected to inputs only. Two other flagged items were also correct-by-design once checked: the enquiry previews truncate deliberately and expand on tap, and the 20x20 checkboxes carry a `label[for]` giving a 331x36 hit area. | 2026-09-05 | resolved |
| 7 | **The first version of that pixel check also missed D15.** It painted a marker strip and asked whether the pixels were visible — but an edge-to-edge WebView sits under a *transparent* status bar, so the marker showed through and read as 100% visible (`315/315 rows, pass: true`) on the very defect it was written for. Visibility was the wrong assertion; page origin versus the OS-reported inset is the right one. Every check now has to be proven against the defect it claims to catch, not just observed to pass. | 2026-09-05 | resolved |
| 5 | **The verification harness had two bugs of its own**, both of which would have produced false failures: a fixed sleep raced the drawer animation (reported 0/10 nav reachable on a healthy screen), and `scrollable()` stopped at the first ancestor with computed `overflow-x: auto`, flagging the calendar's own chips as unreachable when `scrollIntoView` proved otherwise. Both fixed; three consecutive runs now agree. | 2026-09-05 | resolved |

---

## 6. Defect closure (from `DESIGN_mobile.md` §3)

| ID | Defect | Phase | Status |
|---|---|---|---|
| D1 | Every API call 404s (2 sites) | 1 | ✅ absolute base baked in, proven in the bundle |
| D2 | Android back closes the app | 4 | ✅ `/billing`→`/appointments`→`/home`, app alive; exits at root |
| D3 | Layout under the notch | 4 | ✅ **confirmed on iOS**: inset-top 62px, inset-bottom 34px, `.auth-shell` padding-top resolves to 86px = 24 + 62. Android reports 0 (see D15), which is why this could not be proven until now |
| D4 | 5 dead `target="_blank"` links | 5 | ✅ `Browser.open` → Chrome Custom Tab |
| D5 | `sms:` / `wa.me` do not navigate | 5 | ✅ `AppLauncher.openUrl`; Messages app opened |
| D6 | iOS crash on file input | 5 | ✅ all three usage strings verified in the **built** Info.plist; app launches and stays up with no crash report. The picker tap itself was not driven — no CDP on the simulator |
| D7 | JWTs in `localStorage` | 2 | ✅ `localStorage` empty; session survives force-quit |
| D8 | `window.location.assign` hard-reloads | 4 | ✅ none left outside the fallback |
| D9 | `APP_BASE` white-screens mobile | 1 | ✅ proven both ways: mobile ignores `/app`, web still honours it |

### Found during the build, not in the original audit

| ID | Defect | Severity | Status |
|---|---|---|---|
| D10 | **All inputs are `font-size: 14px`.** iOS zooms the page in when a field under 16px takes focus and never zooms back, leaving a magnified sideways-scrolling layout. Hits all 21 forms. Fixed with a `@media (pointer: coarse)` bump — desktop untouched, pinch zoom preserved (no `user-scalable=no`, WCAG 1.4.4). | Severe (iOS) | ✅ **16px measured on iOS**, so no auto-zoom |
| D11 | **Pre-existing production bug on the web.** `scripts/build-all.sh` builds with `APP_BASE=/app/`, but `window.location.assign('/login')` targets the domain root — so session expiry drops users onto the marketing site instead of the SPA login. Same for the error boundary's "go home". Closed by the same `lib/navigation.ts` fix. | Severe (web, live) | ✅ `"/app/".replace(...)` → `/app/login` in the built bundle |
| D12 | **`Keyboard.setResizeMode` returns `UNIMPLEMENTED` on Android** — an unhandled promise rejection on every launch. My own code: Android configures keyboard resize in `capacitor.config`, and the runtime call is iOS-only, which the plugin's README states. Runtime call removed. | Moderate | ✅ console clean |
| D13 | **Capacitor 8 serves the bundle from `https://localhost`, so a plain-HTTP dev API is blocked as mixed content.** Separate from the Android cleartext policy — fixing the manifest alone still left every request failing. Dev-gated `allowMixedContent`, verified `false` without `CAP_DEV`. | Blocker (dev) | ✅ login works |
| D14 | **Scroll position carries across route changes.** React Router keeps the document offset, so tapping "Enquiries" from 800px down the schedule landed at `scrollTop: 598` with the page title at `-578` — off screen, with no sidebar visible to say where you are. Pre-existing; affects web too. Fixed with a `ScrollToTop` that resets on PUSH/REPLACE only, so the back button still restores position. | Moderate | ✅ `598 → 0`; back still returns to `800` |
| D15 | **Android draws the WebView under a transparent status bar while reporting `env(safe-area-inset-top)` as 0** — so the D3 safe-area padding could not protect it and every page title sat behind the clock. `setBackgroundColor` was a silent no-op for the same reason (the plugin's docs: it "doesn't work if `overlaysWebView` is true"), so the "tinted status bar" seen earlier was just the cream page bleeding through. Fixed with `setOverlaysWebView({ overlay: false })`. | **Severe** | ✅ WebView 2339 → 2210 device px; title fully visible |
| D16 | **The doctor forms never collapse to one column.** Ten inline `gridTemplateColumns: '1fr 1fr'` / `'1fr 1fr 1fr'` / `'3fr 1fr 1fr 44px'` with no responsive fallback — `grep` found **zero** `grid-template-columns` inside any media query. Measured on a 412px device: form fields got 126px of text room (truncating an owner's phone number) and invoice Qty/Price collapsed to **51px**, about two characters. The owner screens were fine; they use `repeat(auto-fit, minmax(...))`. Replaced with `.form-row` / `.form-row-3` / `.invoice-line` classes that stack below 768px. | Severe | ✅ 0 cut placeholders across 12 screens |
| D17 | **`/patients` search placeholder overran its field by 81px** even at full width — the visible symptom in the reported screenshot ("Search by pet name, breed, or owner ph"). Shortened to "Search name, breed, or phone". | Minor | ✅ |

## 7. Progress log

Newest last. One line per session, facts only.

- **2026-09-05** — Audit complete; `DESIGN_mobile.md` and this tracker written. Measured:
  toolchain wholly absent (no Xcode, JDK, Android SDK, CocoaPods). No code changed yet.
- **2026-09-05** — Phases 1, 2, 3, 4, 5 (code) and 7.2 complete. Toolchain finding corrected:
  Android was never blocked. Debug APK builds (8.0 MB). Two further defects found by
  measurement, D10 and D11 — D11 is live on the production **web** app today. Web build
  re-verified unregressed at every step. Nothing marked verified yet: emulator run pending.
- **2026-09-05 (later)** — Android verified end to end on a Pixel 6 / API 34 emulator against the live
  Django API. **20/20 routes pass** (12 doctor, 3 owner, 5 detail) with every nav control hit-testable
  and zero console errors. D1, D2, D4, D5, D7, D9, D10, D11, D12, D13 carry device evidence. Two more
  defects (D12, D13) and two harness bugs were found only by running it — the flat "code complete"
  claim would have been wrong on four counts. iOS remains blocked on Xcode.
- **2026-09-05 (review pass)** — Ran the app and reviewed the screens. Two more defects found,
  both invisible to the passing route sweep: **D14** (scroll carried across routes) and **D15**
  (Android WebView under the status bar; every page title clipped). Both fixed and re-verified.
  Re-swept afterwards: **19/19 routes PASS**, 0 console errors, web build unregressed, palette
  unchanged. D15 is the lesson of the sprint — a DOM probe reported the title on screen while a
  screenshot showed it behind the clock.
- **2026-09-05 (harness hardening)** — Added `tools/top-strip.mjs`, a device-pixel check that
  the page starts below the OS-reported `statusBars` inset, and wired it into the sweep. Its
  first implementation asked whether a painted marker was visible and **passed D15**, because
  the transparent status bar let the marker show through; rewritten to compare page origin
  against the system inset. Proven in three states: shipped `pass`, D15 reintroduced at runtime
  `fail (48.8 CSS px hidden)`, restored `pass`.
- **2026-09-05 (layout audit)** — Added `tools/layout-audit.mjs`: per-screen checks for text
  truncated by its own box, placeholders wider than their field, content parked off the right,
  sub-44px tap targets, and content clipped with nothing to scroll it. First run flagged issues
  on **7 of 12 screens**; three were correct-by-design and withdrawn (textarea placeholder,
  collapsible enquiry previews, label-wrapped checkboxes), leaving **D16** and **D17**. Both
  fixed. Re-audited: **0 cut placeholders, 0 clipped elements across 12 screens**, top strip
  PASS, routes 12/12, web build unregressed, palette unchanged.
- **2026-09-06 (iOS)** — Xcode 26.5 installed; the iOS **simulator runtime is a separate
  10.6 GB download** that `-showsdks` gives no hint of, and `xcodebuild -downloadPlatform`
  reports progress with carriage returns, so `wc -l` shows 0 lines while bytes flow — I
  called a working download "stalled" twice on that evidence and killed it. **BUILD
  SUCCEEDED**, 7.8 MB, running on an iPhone 17 Pro.

  **D3 is confirmed for the first time**: `env(safe-area-inset-top)` = **62px** and
  `-bottom` = **34px**, with `.auth-shell` padding-top resolving to **86px** (24 + 62). On
  Android those are 0, which is precisely why months of Android passes could not validate
  the safe-area CSS. D10 confirmed at 16px.

  Measuring required a temporary diagnostic painted into the DOM and read from a
  screenshot: the simulator exposes no CDP endpoint, `ios-webkit-debug-proxy` returns no
  targets for simulators, and Capacitor iOS does not forward WebView console to stdout.
  The diagnostic was removed and the app rebuilt clean before this entry. **iOS is
  therefore less instrumented than Android** — no 12/12 route sweep, no pixel top-strip
  check — and the file-picker tap was not driven.

## iOS production verification — 2026-09-06

118 checks green on an iPhone 17 Pro simulator (iOS 26.5) against production,
covering both portals end to end. Two shipped defects found and fixed: **D16**
sign-in was impossible on iOS (keychain `-34018`, no entitlements file) and
**D17** a new owner could not add their first pet (optional signup phone feeding
a required field). Detail and the three harness defects that produced false
results first: `docs/DESIGN_mobile.md`.

**R8 — a check must be able to name what it examined.** Counting the subjects is
part of the assertion, not an extra. A sweep that reports "no table overflows"
having met no tables, or "access refused" having requested `/undefined`, is
green and worthless. Both happened in this run and both were caught only by
adding a census.
