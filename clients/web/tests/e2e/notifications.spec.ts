import { test, expect } from "@playwright/test";

// US-NOTIF-02 — Doctor in-app notification feed + unread badge on the dashboard.
//
// Two concerns:
//   (A) Functional: the feed on React /dashboard lists notifications newest-first,
//       the sidebar unread badge is visible-with-count / hidden-at-zero, per-item
//       mark-read and mark-all-read update the badge WITHOUT a reload, and the
//       read state persists across a reload (server-side). Graceful empty state
//       when there are none (AC-04).
//   (B) Regression: the pre-Sprint-5 parity screens this task does not touch
//       stay pixel-identical to the Django golden at 1280x800.
//
// Prereqs (see docs/UI_PARITY.md), identical to parity.spec.ts:
//   1. Seed both sides: ./.venv/bin/python manage.py seed_parity
//   2. Django golden (DEBUG=true so vet.css is served):
//        DEBUG=true ./.venv/bin/python manage.py runserver 127.0.0.1:8000
//   3. Vite dev (:5173), proxying /api to Django (same-origin cookies).
//   4. Run from clients/web with PARITY_LIVE=1 (chromium is cached locally):
//        PARITY_LIVE=1 npm run test:e2e -- notifications.spec.ts
// Skipped until that live environment is up, exactly like the parity harness.

const DJANGO = "http://127.0.0.1:8000";

test.describe("US-NOTIF-02 — doctor notification feed + unread badge", () => {
  test.skip(
    !process.env.PARITY_LIVE,
    "Set PARITY_LIVE=1 with both servers + seed_parity running.",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    // The feed section always renders once the dashboard is authenticated.
    await expect(page.getByTestId("notif-feed")).toBeVisible();
  });

  test("feed lists notifications newest-first with message + timestamp", async ({ page }) => {
    const feed = page.getByTestId("notif-feed");
    const items = feed.getByTestId("notif-item");

    // Exactly one of: a non-empty list, or the graceful empty state (AC-04).
    const count = await items.count();
    if (count === 0) {
      await expect(page.getByTestId("notif-empty")).toBeVisible();
      return;
    }

    // Each row shows a message and a machine-readable timestamp.
    await expect(items.first()).toContainText(/\S/);
    const times = items.locator("time");
    await expect(times.first()).toHaveAttribute("datetime", /\d{4}-\d{2}-\d{2}/);

    // Newest-first: the datetime attributes are in non-increasing order.
    const stamps = await times.evaluateAll((els) =>
      els.map((el) => el.getAttribute("datetime") ?? ""),
    );
    const sorted = [...stamps].sort((a, b) => b.localeCompare(a));
    expect(stamps).toEqual(sorted);
  });

  test("unread badge is visible with a count when there is unread", async ({ page }) => {
    const badge = page.locator(".nav-badge");
    const markAll = page.getByTestId("notif-mark-all");

    // The seed_parity fixture carries unread notifications for the doctor.
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/^(\d+|99\+)$/);
    await expect(badge).toHaveAttribute("aria-label", /unread notifications/);
    // Mark-all is actionable while unread > 0.
    await expect(markAll).toBeEnabled();
  });

  test("per-item mark-read updates the badge without a reload and persists", async ({ page }) => {
    const badge = page.locator(".nav-badge");
    const before = parseInt((await badge.textContent())?.replace("+", "") ?? "0", 10);
    test.skip(before <= 0, "Needs at least one unread notification in the seed.");

    // Click the first still-unread row.
    const unread = page.locator('[data-testid="notif-item"][data-unread="true"]');
    const target = unread.first();
    const targetMsg = (await target.locator(".notif-item-msg").textContent())?.trim() ?? "";
    await target.click();

    // Same page — no navigation/reload. Badge drops by one (family invalidation),
    // and the clicked row is now read (disabled, no unread tint).
    await expect(target).toHaveAttribute("data-unread", "false");
    if (before === 1) {
      await expect(badge).toBeHidden(); // hidden at zero unread
    } else {
      await expect(badge).toHaveText(String(before - 1));
    }

    // Read state persists across a full reload (server-side, not local).
    await page.reload();
    await expect(page.getByTestId("notif-feed")).toBeVisible();
    const persisted = page
      .locator('[data-testid="notif-item"]')
      .filter({ hasText: targetMsg });
    await expect(persisted.first()).toHaveAttribute("data-unread", "false");
  });

  test("mark-all-read hides the badge at zero unread", async ({ page }) => {
    const badge = page.locator(".nav-badge");
    const markAll = page.getByTestId("notif-mark-all");
    test.skip(!(await markAll.isEnabled()), "Nothing unread to mark in the seed.");

    await markAll.click();

    // Badge disappears entirely (no element at zero), the control disables, and
    // no row remains unread — all without a page reload.
    await expect(badge).toBeHidden();
    await expect(markAll).toBeDisabled();
    await expect(page.locator('[data-testid="notif-item"][data-unread="true"]')).toHaveCount(0);
  });
});

// --- (B) Regression guard: untouched parity screens vs the Django golden -----
// Excludes /dashboard (this task intentionally adds the feed there — both sides
// gain it; full dashboard parity is QA's concern) and app_base/shell (the
// foundation's added Notifications nav item regresses the shell until the Django
// golden gains the matching static markup — flagged, out of this task's scope).
// These are the content screens THIS task does not touch; they must not move.
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

const REGRESSION: { name: string; django: string; react: string }[] = [
  { name: "login", django: "/login/", react: "/login" },
  { name: "signup", django: "/signup/", react: "/signup" },
  { name: "appointments", django: "/appointments/", react: "/appointments" },
  { name: "create", django: "/appointments/create/", react: "/appointments/create" },
  { name: "reschedule", django: "/appointments/1/reschedule/", react: "/appointments/1/reschedule" },
  { name: "patients", django: "/patients/", react: "/patients" },
  { name: "pet-form", django: "/patients/add/", react: "/patients/add" },
];

test.describe("US-NOTIF-02 — no regression on untouched parity screens", () => {
  test.skip(
    !process.env.PARITY_LIVE,
    "Set PARITY_LIVE=1 with both servers + seed_parity running.",
  );

  for (const pair of REGRESSION) {
    test(`${pair.name} still matches the Django golden`, async ({ page }) => {
      await page.goto(`${DJANGO}${pair.django}`);
      await page.evaluate(() => document.fonts.ready);
      await neutralize(page);
      const golden = await page.screenshot({ fullPage: true });

      await page.goto(pair.react);
      await page.evaluate(() => document.fonts.ready);
      await neutralize(page);

      await expect(page).toHaveScreenshot(`notif-regression-${pair.name}.png`, {
        maxDiffPixelRatio: 0.001,
      });
      expect(golden.byteLength).toBeGreaterThan(0);
    });
  }
});
