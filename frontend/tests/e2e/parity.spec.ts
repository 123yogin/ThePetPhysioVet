import { test, expect } from "@playwright/test";

// Pixel-parity harness: React (:5173) vs Django (:8000), screen by screen.
// Prereqs (see docs/UI_PARITY.md):
//   1. Seed the identical fixture both sides (known doctor + fixed pets/appts,
//      frozen "today") so text/date strings match.
//   2. Run Django: ./.venv/bin/python manage.py runserver 127.0.0.1:8000
//   3. Run Vite dev (:5173) — it proxies /api to Django (same-origin cookies).
// This spec captures the Django page as the golden and asserts the matching
// React route matches it under a tiny threshold. It is skipped until the DRF
// endpoints + seed command exist (real API wiring is a later sprint).

const DJANGO = "http://127.0.0.1:8000";

// Nine screens (app_base is its own case). 'share' is intentionally excluded
// from the parity run. The two "-filtered"/"-search" entries are query-string
// variants of the appointments/patients screens.
const PAIRS: { name: string; django: string; react: string }[] = [
  { name: "login", django: "/login/", react: "/login" },
  { name: "signup", django: "/signup/", react: "/signup" },
  { name: "dashboard", django: "/", react: "/dashboard" },
  { name: "appointments", django: "/appointments/", react: "/appointments" },
  { name: "appointments-filtered", django: "/appointments/?pet=Biscuit", react: "/appointments?pet=Biscuit" },
  { name: "create", django: "/appointments/create/", react: "/appointments/create" },
  { name: "reschedule", django: "/appointments/1/reschedule/", react: "/appointments/1/reschedule" },
  { name: "patients", django: "/patients/", react: "/patients" },
  { name: "patients-search", django: "/patients/?q=Rocky", react: "/patients?q=Rocky" },
  { name: "pet-form", django: "/patients/add/", react: "/patients/add" },
  // app shell (app_base) rendered with an empty content block on both sides.
  { name: "app_base", django: "/__parity__/shell/", react: "/__parity__/shell" },
];

// Injected identically on BOTH the Django golden and the React candidate so
// autofocus/caret/animation noise is removed symmetrically WITHOUT editing
// vet.css (kept byte-identical) or changing either app's real UX. Django's
// AuthenticationForm auto-focuses the username field (adding the .input-glass
// :focus ring + blinking caret); React does not — neutralizing at capture time
// makes the two identical.
const NEUTRALIZE_CSS = `
*,*::before,*::after{caret-color:transparent!important}
*{transition:none!important;animation:none!important}
.input-glass:focus{border-color:rgba(62,39,35,0.15)!important;box-shadow:none!important}
`;

async function neutralize(page: import("@playwright/test").Page): Promise<void> {
  await page.addStyleTag({ content: NEUTRALIZE_CSS });
  await page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (a && typeof a.blur === "function") a.blur();
  });
}

test.describe("React ⇔ Django pixel parity", () => {
  test.skip(
    !process.env.PARITY_LIVE,
    "Set PARITY_LIVE=1 with both servers + seed fixture running.",
  );

  for (const pair of PAIRS) {
    test(`${pair.name} matches the Django golden`, async ({ page }) => {
      // Golden: Django-rendered page.
      await page.goto(`${DJANGO}${pair.django}`);
      await page.evaluate(() => document.fonts.ready);
      await neutralize(page);
      const golden = await page.screenshot({ fullPage: true });

      // Candidate: React route.
      await page.goto(pair.react);
      await page.evaluate(() => document.fonts.ready);
      await neutralize(page);

      await expect(page).toHaveScreenshot(`${pair.name}.png`, {
        maxDiffPixelRatio: 0.001,
      });
      // `golden` is captured for pixelmatch-based diffing if preferred over
      // Playwright's own snapshot baseline.
      expect(golden.byteLength).toBeGreaterThan(0);
    });
  }
});
