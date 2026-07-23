// Sprint-3 NEW-screen checks (Diagnosis §3.4 / Treatment §3.5).
// Run FROM clients/web: `node parity-s3-r1.cjs`
// These screens have NO Django golden, so there is no pixel diff. Instead we:
//  (1) screenshot each new screen into parity-shots/s3-r1/,
//  (2) assert it reuses the vet.css design system (— :root tokens loaded +
//      a .panel/.glass-card + .page-title present, DM Sans font),
//  (3) assert ZERO console errors / pageerrors while it renders.
// React on the Vite dev server :5173 (the /api + /media proxy to Django :8000).
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const REACT = "http://127.0.0.1:5173";
const OUT = path.resolve("parity-shots/s3-r1");
const VIEWPORT = { width: 1280, height: 800 };
const DOCTOR = { username: "drmeadow", password: "MeadowPhysio!2026" };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: "light",
    reducedMotion: "reduce",
  });

  // Login the SPA (real POST /api/v1/auth/login via the proxy).
  {
    const p = await ctx.newPage();
    await p.goto(`${REACT}/login`, { waitUntil: "networkidle" });
    await p.fill("#id_username", DOCTOR.username);
    await p.fill("#id_password", DOCTOR.password);
    await Promise.all([
      p.waitForURL("**/dashboard", { waitUntil: "networkidle" }),
      p.click("button[type=submit]"),
    ]);
    await p.close();
  }

  // Discover a real pet, diagnosis id, and plan id via the authenticated API.
  const probe = await ctx.newPage();
  await probe.goto(`${REACT}/dashboard`, { waitUntil: "networkidle" });
  const petId = 1;
  const diagId = await probe.evaluate(async (pid) => {
    const r = await fetch(`/api/v1/pets/${pid}/diagnoses`, { credentials: "include", headers: { Accept: "application/json" } });
    const j = await r.json();
    return j.length ? j[0].id : null;
  }, petId);
  const planId = await probe.evaluate(async (pid) => {
    const r = await fetch(`/api/v1/pets/${pid}/treatment-plans`, { credentials: "include", headers: { Accept: "application/json" } });
    const j = await r.json();
    return j.length ? j[0].id : null;
  }, petId);
  await probe.close();
  console.log(`probe: petId=${petId} diagId=${diagId} planId=${planId}`);

  const SCREENS = [
    ["pet_detail", `/patients/${petId}`],
    ["diagnosis_detail", diagId ? `/patients/${petId}/diagnoses/${diagId}` : null],
    ["treatment_form_new", `/patients/${petId}/plans/new`],
    ["treatment_detail", planId ? `/patients/${petId}/plans/${planId}` : null],
  ];

  const results = [];
  for (const [name, route] of SCREENS) {
    if (!route) {
      results.push({ screen: name, screenshot: null, uses_vetcss: false, no_console_errors: false, note: "no id available" });
      console.log(`SKIP ${name}: no id`);
      continue;
    }
    const p = await ctx.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    p.on("pageerror", (e) => pageErrors.push(String(e)));
    await p.goto(`${REACT}${route}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(500);
    try { await p.evaluate(() => document.fonts && document.fonts.ready); } catch {}

    // vet.css markers: :root tokens loaded + a glass panel + page title + DM Sans.
    const markers = await p.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const cream = cs.getPropertyValue("--cream").trim();
      const radius = cs.getPropertyValue("--radius").trim();
      const shadow = cs.getPropertyValue("--shadow").trim();
      const panel = document.querySelector(".panel, .glass-card");
      const title = document.querySelector(".page-title");
      const bodyFont = getComputedStyle(document.body).fontFamily || "";
      let panelStyled = false;
      if (panel) {
        const ps = getComputedStyle(panel);
        panelStyled = ps.borderRadius !== "0px" && ps.boxShadow !== "none";
      }
      return {
        cream, radius, shadow,
        hasPanel: !!panel,
        panelStyled,
        hasTitle: !!title,
        dmSans: /DM Sans/i.test(bodyFont),
        bodyFont,
      };
    });
    const usesVetCss = !!markers.cream && !!markers.radius && markers.hasPanel &&
      markers.panelStyled && markers.hasTitle && markers.dmSans;

    const shot = path.join(OUT, `${name}.react.png`);
    await p.screenshot({ path: shot, clip: { x: 0, y: 0, ...VIEWPORT } });
    await p.close();

    const noErrors = consoleErrors.length === 0 && pageErrors.length === 0;
    results.push({
      screen: name,
      screenshot: shot,
      uses_vetcss: usesVetCss,
      no_console_errors: noErrors,
      markers,
      consoleErrors,
      pageErrors,
    });
    console.log(`${name}: vetcss=${usesVetCss} noErrors=${noErrors} cream=${markers.cream} panelStyled=${markers.panelStyled} dmSans=${markers.dmSans}`);
    if (consoleErrors.length) console.log("   console errors:", consoleErrors);
    if (pageErrors.length) console.log("   page errors:", pageErrors);
  }

  fs.writeFileSync(path.join(OUT, "_results.json"), JSON.stringify(results, null, 2));
  await browser.close();
  const bad = results.filter((r) => !r.uses_vetcss || !r.no_console_errors);
  console.log("\nSUMMARY: " + (bad.length ? "FAIL -> " + bad.map((b) => b.screen).join(", ") : "ALL NEW SCREENS OK"));
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
