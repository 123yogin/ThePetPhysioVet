// Sprint 4 billing new-screen capture (QA round 2). Log into the React SPA as
// the seeded doctor, visit each billing screen, screenshot to parity-shots/s4-r2/,
// and record browser console errors / page errors + whether vet.css applies.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const REACT = "http://127.0.0.1:5173";
const OUT = path.resolve("parity-shots/s4-r2");
const VIEWPORT = { width: 1280, height: 800 };
const DOCTOR = { username: "drmeadow", password: "MeadowPhysio!2026" };

const SCREENS = [
  ["billing_invoices", "/billing"],
  ["billing_invoice_new", "/billing/invoices/new"],
  ["billing_invoice_detail_paid", "/billing/invoices/6"],
  ["billing_invoice_detail_partial", "/billing/invoices/7"],
  ["billing_invoice_detail_package", "/billing/invoices/8"],
  ["billing_revenue", "/billing/revenue"],
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
    const p = await ctx.newPage();
    attach(p, "_login");
    await p.goto(`${REACT}/login`, { waitUntil: "networkidle" });
    await p.fill("#id_username", DOCTOR.username);
    await p.fill("#id_password", DOCTOR.password);
    await Promise.all([
      p.waitForURL("**/dashboard", { waitUntil: "networkidle" }),
      p.click("button[type=submit]"),
    ]);
    await p.close();
  }

  const results = [];
  for (const [name, route] of SCREENS) {
    const p = await ctx.newPage();
    attach(p, name);
    await p.goto(`${REACT}${route}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(700);
    try { await p.evaluate(() => document.fonts && document.fonts.ready); } catch {}
    await p.waitForTimeout(200);
    const buf = await p.screenshot({ clip: { x: 0, y: 0, ...VIEWPORT } });
    fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
    const usesVet = await p.evaluate(() => {
      const bg = getComputedStyle(document.body).backgroundColor || "";
      const font = getComputedStyle(document.body).fontFamily || "";
      const hasGlass = !!document.querySelector(".glass-card, .panel, .page-title, .btn");
      // DM Sans is the vet.css font; the radial-gradient bg is on <body>.
      const dmSans = /DM Sans/.test(font);
      return { bg, font, hasGlass, dmSans };
    });
    results.push({ name, route, errors: errors[name] || [], usesVet });
    await p.close();
  }

  fs.writeFileSync(path.join(OUT, "_console.json"), JSON.stringify({ login: errors._login, results }, null, 2));
  let clean = true;
  for (const r of results) {
    if (r.errors.length) clean = false;
    console.log(`${r.name}: consoleErrors=${r.errors.length} vetApplied=${r.usesVet.hasGlass} dmSans=${r.usesVet.dmSans} bodyBg=${r.usesVet.bg}`);
    r.errors.forEach((e) => console.log("   " + e));
  }
  console.log("login console errors:", (errors._login || []).length);
  if ((errors._login || []).length) clean = false;
  console.log("\nNEW-SCREEN SUMMARY:", clean ? "CLEAN (no console errors, vet.css applied)" : "ISSUES FOUND");
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
