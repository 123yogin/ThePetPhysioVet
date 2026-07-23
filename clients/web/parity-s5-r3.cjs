// Sprint 5 new-screen capture (QA round 1). Log into the React SPA as the seeded
// doctor, visit the notification UI (dashboard feed + /notifications settings),
// screenshot to parity-shots/s5-r3/, record console/page errors + vet.css usage.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const REACT = "http://127.0.0.1:5173";
const OUT = path.resolve("parity-shots/s5-r3");
const VIEWPORT = { width: 1280, height: 800 };
const DOCTOR = { username: "drmeadow", password: "MeadowPhysio!2026" };

const SCREENS = [
  ["dashboard_with_feed", "/dashboard"],
  ["notifications_settings", "/notifications"],
  ["notifications_settings_lookup", "/notifications?owner_phone=%2B91%2098765%2043210"],
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light", reducedMotion: "reduce" });
  const errors = {};
  const attach = (page, name) => {
    errors[name] = errors[name] || [];
    page.on("console", (m) => { if (m.type() === "error") errors[name].push("console.error: " + m.text()); });
    page.on("pageerror", (e) => errors[name].push("pageerror: " + e.message));
  };
  {
    const p = await ctx.newPage(); attach(p, "_login");
    await p.goto(`${REACT}/login`, { waitUntil: "networkidle" });
    await p.fill("#id_username", DOCTOR.username); await p.fill("#id_password", DOCTOR.password);
    await Promise.all([p.waitForURL("**/dashboard", { waitUntil: "networkidle" }), p.click("button[type=submit]")]);
    await p.close();
  }
  const results = [];
  for (const [name, route] of SCREENS) {
    const p = await ctx.newPage(); attach(p, name);
    await p.goto(`${REACT}${route}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(800);
    try { await p.evaluate(() => document.fonts && document.fonts.ready); } catch {}
    await p.waitForTimeout(200);
    const buf = await p.screenshot({ fullPage: true });
    fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
    const info = await p.evaluate(() => {
      const font = getComputedStyle(document.body).fontFamily || "";
      const bg = getComputedStyle(document.body).backgroundColor || "";
      return {
        font, bg,
        dmSans: /DM Sans/.test(font),
        hasGlass: !!document.querySelector(".glass-card, .panel, .page-title, .btn"),
        feedPresent: !!document.querySelector('[data-testid="notif-feed"]'),
        feedItems: document.querySelectorAll('[data-testid="notif-item"]').length,
        bodyText: (document.body.innerText || "").slice(0, 300),
      };
    });
    results.push({ name, route, errors: errors[name] || [], info });
    await p.close();
  }
  fs.writeFileSync(path.join(OUT, "_console.json"), JSON.stringify({ login: errors._login, results }, null, 2));
  let clean = true;
  for (const r of results) {
    if (r.errors.length) clean = false;
    console.log(`${r.name}: consoleErrors=${r.errors.length} vetGlass=${r.info.hasGlass} dmSans=${r.info.dmSans} feedPresent=${r.info.feedPresent} feedItems=${r.info.feedItems}`);
    r.errors.forEach((e) => console.log("   " + e));
    console.log("   bodyText:", JSON.stringify(r.info.bodyText.slice(0, 160)));
  }
  console.log("login console errors:", (errors._login || []).length);
  if ((errors._login || []).length) clean = false;
  console.log("\nNEW-SCREEN SUMMARY:", clean ? "CLEAN" : "ISSUES FOUND");
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
