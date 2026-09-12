# Mobile app — design & delivery plan

**Status:** built and verified on Android; iOS blocked on Xcode. Live status in
[`MOBILE_BUILD_TRACKER.md`](MOBILE_BUILD_TRACKER.md).
**Date:** 2026-09-05
**Approach:** Capacitor 8 native wrapper around the existing Vite SPA
**Targets:** Android (Play) + iOS (App Store)
**Supersedes:** the "Mobile (React Native) is **out of scope** — do not build it" line in
`CLAUDE.md` §Target architecture and `PRODUCT_PLAN.md` §1.4a. Both are updated by Phase 1.

---

## 1. Decision

Wrap `frontend/` in a Capacitor 8 native shell rather than rewriting in React Native.

**Why.** The SPA is 8,420 lines across 23 screens, 48 wired API routes, and an 805-line
`vet.css` whose palette has been deliberately held stable (47 colour values, unchanged
across two sprints). A React Native port throws all of that away and produces a second
codebase to keep in sync with the first — every future clinical screen would have to be
built twice. Capacitor keeps one codebase serving web, iOS and Android, and the
2026-08-21 shell-unification sprint already made the app work at 360px, so the responsive
groundwork is done.

**What we give up.** Scroll and transition feel is WebView-grade, not UIKit-grade. That is
an acceptable trade for a clinical records tool that is form- and list-heavy; it would not
be for a game or a media app.

**This is not a repackaging exercise.** The audit below found nine defects that appear
*only* once the app runs inside a WebView, four of which are silent failures — a dead
button, not an error message. They are the actual work.

---

## 2. Current state (measured 2026-09-05, not assumed)

| Thing | Count | Where |
|---|---|---|
| Screens | 23 (19 doctor, 4 owner) | `frontend/src/screens/` |
| Frontend source | 8,420 lines | incl. 805-line `vet.css` |
| API routes | 48 | `backend/appointments/urls.py` |
| `<Link>` / `useNavigate` | 35 / 16 | react-router v6 |
| `<form>` elements | 21 | across all screens |
| `<input type="file">` | 4 | `PetDetailScreen` ×2, `OwnerPetDetailScreen` ×2 |
| `target="_blank"` links | 5 | `ShareScreen` ×1, `PetDetailScreen` ×2, `OwnerPetDetailScreen` ×2 |
| `localStorage` call sites | 7 | all inside `lib/tokens.ts` |
| `window.location.*` | 3 | `http.ts:28`, `ErrorBoundary.tsx:46`, `OwnerHomeScreen.tsx:328` |
| `env()` / `safe-area-inset` rules in `vet.css` | **0** | — |

**Toolchain — first reading, and what it actually was:**

```
xcodebuild  → requires Xcode (only Command Line Tools)   ← still true, iOS blocked
java        → Unable to locate a Java Runtime            ← WRONG: keg-only, off PATH
~/Library/Android/sdk → No such file or directory        ← WRONG: wrong path
pod         → command not found                          ← irrelevant: Capacitor 8 uses SPM
node v26.5.0 / npm 11.17.0 → OK
```

The SDK is at `/usr/local/share/android-commandlinetools` with android-34, build-tools, an
x86_64 system image and a Pixel 6 AVD. Only iOS was ever blocked.

**Already correct, no work needed:** media URLs are absolute — `serializers.py` uses
`request.build_absolute_uri()` for pet photos, diagnostic report files and query
attachments, so images resolve from a native origin without change.

---

## 3. The WebView defects

Nine found by audit (D1-D9), ordered by severity. Four more (D10-D13) were found later,
three of them only by running the app on a device — see §9 and the tracker.

### D1 — Every API call 404s (blocker)
`lib/http.ts:100-105` builds relative URLs (`/api/v1/...`). In a Capacitor WebView the
document origin is `capacitor://localhost` (iOS) or `http://localhost` (Android), not the
API host, and there is no Vite dev proxy. Every request resolves against the bundled app
and fails.

Second, independent site: `http.ts:54` hardcodes `fetch('/api/v1/auth/refresh')` outside
the `http()` helper. Fixing only the helper leaves token refresh broken **on native
only** — the app works for the first ~5 minutes of a session, then logs the user out.

### D2 — Android hardware back button closes the app (severe)
Nothing anywhere listens for the Android back event. Capacitor's default is to exit the
app. A doctor three screens deep into a patient record presses back and the app
terminates with unsaved form state. Affects all 21 forms.

### D3 — Layout runs under the notch and home indicator (severe)
`vet.css` has zero `env(safe-area-inset-*)` rules, and uses `position: fixed` + `height:
100vh` for the sidebar (lines 83, 174, 197-201, 238, 662). On any notched iPhone the
sidebar header sits under the status bar and the sign-out control sits under the home
indicator. `index.html` also lacks `viewport-fit=cover`, without which `env()` returns 0
even once the rules exist.

### D4 — All five `target="_blank"` links are dead (silent)
A WebView opens no popup. Diagnostic report PDFs, invoice documents and the WhatsApp
share link render as buttons that do nothing when tapped. No error, no console message.

### D5 — `sms:` share link does not navigate (silent)
`ShareScreen` uses `sms:{phone}?body=...` from `views/scheduling.py`
(`appointment_share_view`). WebViews do not follow
non-http schemes without native URL handling. Also affects `https://wa.me/...`, which
should hand off to the installed WhatsApp app rather than loading a web page in-frame.

### D6 — iOS crashes on tapping a file input (severe)
The 4 `<input type="file">` sites trigger the system picker. On iOS, doing so without
`NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` in `Info.plist` is an
immediate hard crash, not a permission denial. Pet photo upload and diagnostic report
upload are both affected.

### D7 — JWTs sit in `localStorage` (security)
`lib/tokens.ts` stores access and refresh tokens in WebView `localStorage`: unencrypted at
rest, and evictable by the OS under storage pressure — the user is silently signed out.
For a product holding clinical records the tokens belong in Keychain /
EncryptedSharedPreferences.

**The hard part:** native secure storage is **async**, but `getAccessToken()` is
synchronous and is called synchronously at `http.ts:107` on every request. Making it async
changes the signature of every call site.
*Design decision:* hydrate an in-memory cache once at boot, before first render. The sync
getters keep reading the cache, so the request path and the refresh interceptor are
unchanged. The setters became async and are **awaited** at all 6 call sites — every one
already sat in an async function, so nothing is fire-and-forget and no write is swallowed.

### D8 — `window.location.assign()` hard-reloads the WebView (moderate)
`http.ts:28` (session expiry → `/login`) and `ErrorBoundary.tsx:46` (crash recovery →
`/`). In a native shell this reloads the bundled document and destroys all React state.
It also interacts with D9.

### D9 — `APP_BASE` white-screens the mobile build (blocker, easy to miss)
`vite.config.ts` sets `base: process.env.APP_BASE || '/'`, and `routes.tsx:47` derives
`BrowserRouter basename` from it, because the production web app is served under `/app`.
Capacitor serves from the root of `webDir`. A mobile bundle built with the production
`APP_BASE=/app` loads a blank screen. The mobile build must pin `APP_BASE=/`, and the
build script must make that impossible to forget.

---

## 4. Target layout

As built. Native projects sit at Capacitor's default paths rather than the `mobile/`
directory originally proposed — every `cap` command expects them there, and moving them
buys nothing.

```
ThePetPhysioVet/
├── frontend/
│   ├── src/lib/http.ts            one apiUrl(), used by the helper AND refresh (D1)
│   ├── src/lib/tokens.ts          secure store behind a sync cache (D7)
│   ├── src/lib/navigation.ts      NEW — navigate from outside React (D8, D11)
│   ├── src/components/PlatformBridge.tsx  NEW — back button, status bar (D2)
│   ├── src/components/ExternalLink.tsx    NEW — in-app browser / handoff (D4, D5)
│   ├── src/main.tsx               hydrates the token cache before first render
│   ├── src/styles/vet.css         + 19 safe-area rules, palette untouched (D3, D10)
│   ├── .env.mobile.example        committed template; env var overrides it
│   ├── capacitor.config.ts        NEW
│   ├── android/                   generated Gradle project
│   │   └── app/src/debug/         cleartext + manifest, DEBUG ONLY (7.2)
│   ├── ios/                       generated Xcode project (SPM, no CocoaPods)
│   └── tools/                     NEW — CDP-driven route verifier
├── backend/petphysio/settings.py  native origins in CORS, always on
└── docs/                          this file + MOBILE_BUILD_TRACKER.md
```

Capacitor's `webDir` points at `frontend/dist`. There is no duplicated source.

---

## 5. Phases

Each phase is independently verifiable. Nothing is marked done without the stated evidence.

### Phase 0 — Toolchain (you, not me)
Blocking for any real build. Nothing else in this plan depends on it, so Phases 1-5 can
proceed in parallel with the downloads.

**Corrected after measuring.** The first audit reported the toolchain missing; it had
looked in `~/Library/Android/sdk` while the SDK lives at
`/usr/local/share/android-commandlinetools`. Android was never blocked.

- **Android:** already present. Needs **JDK 21**, not 17 — Capacitor 8's
  `capacitor-camera` requires `languageVersion=21` and the 17 build fails.
- **iOS:** full Xcode from the App Store (~7 GB, must be you — it needs your Apple ID),
  then `sudo xcode-select -s /Applications/Xcode.app`. **CocoaPods is not required**:
  Capacitor 8 uses Swift Package Manager.
- **iOS store submission only:** an Apple Developer account, $99/yr. Not needed to build
  and run on a simulator or your own device.

*Android needs no account to sideload an APK, so Android is the faster feedback loop and I
suggest we verify there first.*

### Phase 1 — Networking & config (fixes D1, D9)
- `VITE_API_BASE` env var; `http.ts` prefixes it; **both** the helper and the hardcoded
  refresh call at line 54.
- `.env.development` leaves it empty so the Vite proxy and the web build are unchanged.
- `build:mobile` script pins `APP_BASE=/`.
- Backend: add `capacitor://localhost` and `http://localhost` to `CORS_ALLOWED_ORIGINS`.
  `CORS_ALLOW_ALL_ORIGINS` stays removed per the existing settings comment.
- **Evidence:** web build byte-compared before/after; mobile bundle hits a real API host.

### Phase 2 — Secure token storage (fixes D7)
- `@capacitor/preferences` + Keychain-backed plugin; in-memory sync cache hydrated in a
  new `bootstrap.ts` awaited before `createRoot().render()`.
- Web path falls back to `localStorage` — identical behaviour, zero web regression.
- **Evidence:** login → force-quit → relaunch still authenticated; tokens absent from
  WebView `localStorage` on device.

### Phase 3 — Capacitor scaffold
- `@capacitor/core` + `cli`, `capacitor.config.ts`, `npx cap add ios android`.
- App id `com.thepetphysiovet.app`, name, icons, splash screen from the existing logo.
- **Evidence:** app launches to the login screen on an Android emulator.

### Phase 4 — Native shell UX (fixes D2, D3, D8)
- Android back button → `@capacitor/app` listener → router `navigate(-1)`, exiting only at
  a root route.
- `viewport-fit=cover` + additive `env(safe-area-inset-*)` padding on `.app-shell`,
  `.sidebar` and the fixed footer. **No colour values touched** — the 47-value palette
  invariant holds.
- `@capacitor/status-bar` and `@capacitor/keyboard` (resize mode, so the keyboard does not
  cover inputs in the 21 forms).
- Replace the two `window.location.assign` calls with router navigation.
- **Evidence:** per the `CLAUDE.md` warning about the overflow-only sweep that missed a
  completely unreachable nav — verification asserts **every nav control is hit-testable**
  on a notched device profile, not that nothing overflows.

### Phase 5 — Native capabilities (fixes D4, D5, D6)
- `@capacitor/browser` for the 5 `target="_blank"` links (in-app browser, keeps the auth
  context).
- `@capacitor/share` + native URL open for the WhatsApp/SMS share.
- `@capacitor/camera` for the 4 upload sites, with the existing `<input type="file">` kept
  as the web fallback; `Info.plist` usage strings added **before** any picker ships.
- **Evidence:** each of the 9 defects re-tested on device and shown fixed.

### Phase 6 — Push notifications *(recommend deferring — read this)*
This is **not** a wrapper task. `CLAUDE.md` debt item 4 records that `Notification` is dead
weight: the model, serializers and two endpoints exist but **zero rows have ever been
created by the app** — only by `seed_data`. Nothing writes a Notification anywhere. So
"add push" means building the entire server-side notification pipeline (event producers on
appointment/invoice/payment lifecycle, FCM credentials, device-token registration, delivery
and retry) and only then the client. That is its own sprint, comparable in size to Phases
1-5 combined. I recommend shipping the app without push and scoping this separately.

### Phase 7 — Deployment & transport
- The API must be reachable from a device — not `127.0.0.1`. iOS ATS blocks cleartext HTTP
  and Android 9+ blocks it too, so dev against a plain-HTTP server needs an explicit
  debug-only exception, and production needs real TLS.
- `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` updated for the API hostname.
- The existing `ALLOW_INSECURE_HTTP` escape hatch stays untouched.

### Phase 8 — Verification
`CLAUDE.md` debt item 5: there is **no frontend test suite at all** — no Vitest, no
Playwright. Every UI defect so far was caught out-of-tree or by eye. Shipping a binary to
two app stores with zero automated coverage is the single largest risk in this plan.
Minimum bar I propose:
- A scripted smoke pass over all 23 screens on one Android device profile and one notched
  iOS profile, asserting reachability of every nav and primary action.
- An explicit regression check that the **web** build is unchanged.

### Phase 9 — Store packaging *(only after you decide to publish)*
Signing keys, store listings, privacy nutrition labels (this app handles health-adjacent
and personal data — both stores require disclosure), review submission.

---

## 6. Estimate

| Phase | Scope | Rough effort |
|---|---|---|
| 0 | Toolchain — **yours** | ~1-2 h of downloads |
| 1-3 | Networking, storage, scaffold | 2-3 days |
| 4-5 | The nine defects | 3-4 days |
| 7-8 | Deploy + verification | 2-3 days |
| **Ship-ready (no push)** | | **~1.5-2 weeks** |
| 6 | Push pipeline | separate sprint |
| 9 | Store submission | +review latency |

---

## 7. Risks

1. **Zero existing frontend tests** (debt item 5). A regression in `http.ts` or
   `tokens.ts` breaks web *and* both mobile targets at once, and nothing would catch it.
   Phase 8 is the mitigation and I do not recommend cutting it.
2. **Phase 0 gates everything real.** Until Xcode and the Android SDK exist I can write
   and configure all the code but cannot produce or verify a running binary. I will say so
   plainly rather than reporting untested work as done.
3. **iOS review risk.** A WebView-wrapped app can be rejected under App Store guideline
   4.2 ("minimum functionality") if it reads as a repackaged website. Native camera,
   share, secure storage and push materially reduce that risk; Phase 6 being deferred
   slightly increases it.
4. **`vet.css` is shared with the web app.** Safe-area changes are additive and
   media-query-scoped so the desktop rendering is untouched, but this file has a
   deliberately stable palette and any change to it needs review.

---

## 8. Traceability

Per `CLAUDE.md` rule 2. This work implements no new SRS acceptance criterion — it is a new
delivery channel for the existing §3.1-§3.9 surface. It amends `PRODUCT_PLAN.md` §1.4a
(mobile out of scope) and touches open debt items 4 (Notification dead weight — Phase 6)
and 5 (no frontend tests — Phase 8).

---

## 9. What running it actually changed

Four things in this document were wrong, and each was caught by putting the app on a
device rather than by reading code:

1. The toolchain audit was wrong — Android was never blocked (wrong search path).
2. JDK 17 does not build Capacitor 8; JDK 21 does.
3. CocoaPods is not needed; Capacitor 8 iOS uses SPM.
4. Two further defects existed that no amount of code reading would have found: a
   `Keyboard.setResizeMode` call that returns `UNIMPLEMENTED` on Android (D12), and
   mixed-content blocking from the `https://localhost` origin, which is a *different*
   rule from the Android cleartext policy and survived fixing that one (D13).

A fifth: the first D10 fix used `@media (pointer: coarse)`, which measured `false` in the
Android WebView and so never applied. It is now keyed on the app's own 768px breakpoint.

A sixth, found only by *looking* at the running app rather than querying it: **D15**. Android
draws the WebView under a transparent status bar and reports `env(safe-area-inset-top)` as 0,
so the D3 safe-area rules protected nothing there and every page title sat behind the clock.
The DOM probe said `titleTop: 20, titleOnScreen: true` — true of the viewport, false of the
device — and the 20/20 route sweep passed straight through it. `setOverlaysWebView({ overlay:
false })` fixes it, and also makes `setBackgroundColor` work, which is a documented no-op while
the status bar overlays.

The wider lesson for §8: an automated sweep proves reachability, not appearance. Both are
needed.

## iOS production verification — 2026-09-06

The Android harness attaches over the Chrome DevTools Protocol. iOS has no
equivalent: the simulator exposes no CDP endpoint, `ios-webkit-debug-proxy`
finds no targets for simulators, and Capacitor iOS does not forward the WebView
console to stdout. So the suite was **injected into the page** and drove the
real components from the inside, rendering its report to the DOM where a
screenshot could read it. The harness lived only in `index.html` during the run
and is not in the shipped bundle (asserted against `dist/index.html`).

Run on an iPhone 17 Pro simulator (iOS 26.5, 402×874 @3x) against
`https://petphysio.vercel.app`. Final result: **118 checks, 0 failed**, covering
authentication, cross-owner authorisation, booking integrity, GST and payment
idempotency, clinical validation, and a UI sweep of all 9 doctor routes and all
4 owner routes.

### D16 — sign-in was impossible on iOS
`POST /auth/login` returned 200 and the app stayed on `/login` showing **"An OS
error occurred (-34018)"** — `errSecMissingEntitlement`. `setTokens` awaits the
keychain; the keychain refused every write because Capacitor's iOS template
ships no entitlements file, so the login mutation rejected after a perfectly
successful authentication. **No API-level test could have caught this**: they
never touch token storage. Fixed with `App.entitlements`
(`keychain-access-groups`) plus a token store that prefers the keychain instead
of requiring it — see `src/lib/tokens.ts`.

### D17 — a new owner could not add their first pet
`UserProfile.phone` was `blank=True`, so signup generated an optional field, but
`Pet.owner_phone` is not blank and `owner_pets_view` filled it from that value.
An owner who left the optional box empty got `400 owner_phone: This field may
not be blank` on the first thing they do, naming a control their form never
rendered. Phone is required at signup now, and the add-pet form collects it for
accounts that predate the change.

### Three harness defects that produced false results first
Recorded because each is the same failure mode the project has been bitten by
before — a green check that asserted nothing.

1. **Trivially-passing authZ.** Round 1 reported "owner A cannot read B's pet"
   as a pass. Owner B's pet had failed to be created, so the request was
   `/owner/pets/undefined` and the 404 meant "no such route shape", not "access
   refused". Every dependent check now fails loudly when its prerequisite is
   missing rather than asserting against `undefined`.
2. **Tapping the wrong control.** The login screen has two "Sign In" elements —
   the segmented tab and the form's submit button. Selecting by text picked the
   tab, so the form was never submitted and 12 checks failed against a defect
   that did not exist. The selector now requires `type=submit`.
3. **Measuring a spinner.** The route sweep waited for a heading, which appears
   before the data does, so geometry was asserted against empty screens. This
   was only caught by adding a **table census**: the sweep reported "no table
   runs past the right edge" on all 9 routes while having encountered *zero
   tables*. After waiting for the query to settle the census reads
   `1 table, 20 rows on patients` — the assertion now has a subject.

**The rule this reinforces (see also the 2026-08-21 note above): a check that
cannot say what it examined is not evidence.** Assert reachability and count the
subjects, never just the absence of a symptom.
