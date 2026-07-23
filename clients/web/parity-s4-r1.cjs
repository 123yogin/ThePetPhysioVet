// Sprint 4 billing new-screen capture: log into the React SPA as the seeded
// doctor, visit each billing screen, screenshot to parity-shots/s4-r1/, and
// record any browser console errors / page errors per screen.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const REACT = "http://127.0.0.1:5173";
const OUT = path.resolve("parity-shots/s4-r1");
const VIEWPORT = { width: 1280, height: 800 };
const DOCTOR = { username: "drmeadow", password: "MeadowPhysio!2026" };

const SCREENS = [
  ["billing_invoices", "/billing"],
  ["billing_invoice_new", "/billing/invoices/new"],
  ["billing_invoice_detail", "/billing/invoices/1"],
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

  // Login
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
    await p.waitForTimeout(600);
    try { await p.evaluate(() => document.fonts && document.fonts.ready); } catch {}
    await p.waitForTimeout(200);
    const buf = await p.screenshot({ clip: { x: 0, y: 0, ...VIEWPORT } });
    fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
    // does the vet.css stylesheet actually apply? check a known token.
    const usesVet = await p.evaluate(() => {
      const bg = getComputedStyle(document.body).backgroundColor || "";
      const hasGlass = !!document.querySelector(".glass-card, .panel, .page-title, .btn");
      return { bg, hasGlass };
    });
    results.push({ name, route, errors: errors[name] || [], usesVet });
    await p.close();
  }

  fs.writeFileSync(path.join(OUT, "_console.json"), JSON.stringify({ login: errors._login, results }, null, 2));
  for (const r of results) {
    console.log(`${r.name}: consoleErrors=${r.errors.length} vetApplied=${r.usesVet.hasGlass} bodyBg=${r.usesVet.bg}`);
    r.errors.forEach((e) => console.log("   " + e));
  }
  console.log("login console errors:", (errors._login || []).length);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
