import { test, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

// US-NOTIF-07 (UI) — Notification settings / SMS opt-out (/notifications).
//
// New screen, NO Django golden — so this is a behavioural spec, not a pixel
// diff. It runs against the React dev server ONLY (Vite :5173, the config
// baseURL); the backend is fully mocked via page.route, so it is testable
// offline without Django. Run it with the dev server up:
//
//   npm run dev                       # in one shell (serves :5173)
//   E2E_LIVE=1 npm run test:e2e -- notification-settings
//
// Gated on E2E_LIVE (mirroring parity.spec's PARITY_LIVE gate) so a plain
// `npm run test:e2e` with no server running does not hard-fail.

const ME = {
  id: 1,
  username: "drwho",
  email: "dr@example.com",
  first_name: "Dana",
  last_name: "Vet",
  clinic_name: "Paws Clinic",
};

// Wires up a mocked backend for the always-mounted app shell (auth + unread
// badge) plus an in-memory SMS-opt-out store so GET reads back what POST wrote —
// which is exactly what lets us assert the toggle persists across a reload.
async function mockBackend(page: Page): Promise<void> {
  const store: Record<string, boolean> = {};

  // RequireAuth -> GET /auth/me must succeed or the route redirects to /login.
  await page.route("**/api/v1/auth/me", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ME) }),
  );

  // Sidebar UnreadBadge is always mounted -> keep it at zero (badge hidden).
  await page.route("**/api/v1/notifications/unread-count", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ unread_count: 0 }),
    }),
  );

  // The opt-out preference: GET reads the store, POST writes it. This single
  // handler covers both the ?owner_phone= query GET and the JSON POST.
  await page.route("**/api/v1/notifications/prefs**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const body = req.postDataJSON() as { owner_phone: string; sms_opt_out: boolean };
      store[body.owner_phone] = body.sms_opt_out;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    }
    const phone = new URL(req.url()).searchParams.get("owner_phone") ?? "";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ owner_phone: phone, sms_opt_out: store[phone] ?? false }),
    });
  });
}

test.describe("Notification settings — SMS opt-out", () => {
  test.skip(
    !process.env.E2E_LIVE,
    "Set E2E_LIVE=1 with the Vite dev server (npm run dev) running.",
  );

  const PHONE = "9876543210";

  test("toggling SMS opt-out persists across a reload", async ({ page }) => {
    await mockBackend(page);

    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Notification settings" })).toBeVisible();

    // Look up the owner by phone.
    await page.getByLabel("Owner phone:").fill(PHONE);
    await page.getByRole("button", { name: "Look up" }).click();

    // Default state: receiving SMS (not opted out).
    const toggle = page.getByTestId("sms-opt-out");
    // The native checkbox is visually hidden (clip), so it is driven via its
    // wrapping label — exactly how a user operates the accessible switch.
    const toggleSwitch = page.locator("label.pref-toggle");
    await expect(toggle).not.toBeChecked();
    await expect(page.getByText("This number currently receives SMS notifications.")).toBeVisible();

    // Opt out -> saved confirmation, toggle now checked.
    await toggleSwitch.click();
    await expect(page.getByText("Preference saved.")).toBeVisible();
    await expect(toggle).toBeChecked();
    await expect(page.getByText("SMS to this number is currently suppressed.")).toBeVisible();

    // The looked-up phone lives in the URL, so a reload re-reads it and the
    // persisted (mocked-backend) value re-hydrates the toggle as CHECKED.
    await page.reload();
    const toggleAfter = page.getByTestId("sms-opt-out");
    await expect(toggleAfter).toBeChecked();
    await expect(page.getByText("SMS to this number is currently suppressed.")).toBeVisible();
  });

  test("shell chrome is intact — existing nav items render unchanged", async ({ page }) => {
    // A regression smoke check: the new screen + shared notification spine must
    // not disturb the existing sidebar. All the pre-Sprint-5 nav items still
    // render, and the Notifications item coexists (badge hidden at zero unread).
    await mockBackend(page);
    await page.goto("/notifications");

    const sidebar = page.locator("aside.sidebar");
    await expect(sidebar).toBeVisible();
    for (const label of [
      "Dashboard",
      "Patients",
      "Create appointment",
      "View appointments",
      "Notifications",
      "Logout",
    ]) {
      await expect(sidebar.getByRole("link", { name: label })).toBeVisible();
    }
    // Badge suppressed at zero unread -> the parity shell is unchanged.
    await expect(sidebar.locator(".nav-badge")).toHaveCount(0);
  });
});
