// Deterministic React<->Django pixel-parity capture + diff (round 2).
// Run FROM clients/web: `node parity-round2.cjs`
// Django golden on :8000 (DEBUG=true, seeded via seed_parity, PARITY_MODE=1,
// PARITY_TODAY=2026-07-22). React on the Vite DEV server :5173 (the /api proxy
// makes the SPA same-origin with Django so the session + csrftoken cookies are
// first-party). The SPA is logged in as the seeded doctor via the real login
// form (POST /api/v1/auth/login) so the protected screens capture live data.
const { chromium } = require("playwright");
const { PNG } = require("playwright-core/lib/utilsBundle");
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");

const DJANGO = "http://127.0.0.1:8000";
const REACT = "http://127.0.0.1:5173";
const OUT = path.resolve("parity-shots/s3-r1/regression");
const VIEWPORT = { width: 1280, height: 800 };
const DOCTOR = { username: "drmeadow", password: "MeadowPhysio!2026" };

// name, djangoPath, reactPath, authed(Django needs login). app_base is its own
// case; 'share' is intentionally excluded. All NINE planned screens.
const SCREENS = [
  ["app_base", "/__parity__/shell/", "/__parity__/shell", true],
  ["login", "/login/", "/login", false],
  ["signup", "/signup/", "/signup", false],
  ["dashboard", "/dashboard/", "/dashboard", true],
  ["appointments", "/appointments/", "/appointments", true],
  ["create", "/appointments/create/", "/appointments/create", true],
  ["reschedule", "/appointments/1/reschedule/", "/appointments/1/reschedule", true],
  ["patients", "/patients/", "/patients", true],
  ["pet_form", "/patients/add/", "/patients/add", true],
];

const NEUTRALIZE_CSS = `
*,*::before,*::after{caret-color:transparent!important}
*{transition:none!important;animation:none!important}
.input-glass:focus{border-color:rgba(62,39,35,0.15)!important;box-shadow:none!important}
`;

async function prep(page) {
  try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch {}
  await page.addStyleTag({ content: NEUTRALIZE_CSS });
  await page.evaluate(() => {
    const a = document.activeElement;
    if (a && typeof a.blur === "function") a.blur();
  });
  await page.waitForTimeout(250);
}

function diffImages(aBuf, bBuf) {
  const a = PNG.sync.read(aBuf);
  const b = PNG.sync.read(bBuf);
  const dimsMatch = a.width === b.width && a.height === b.height;
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const out = new PNG({ width: Math.max(a.width, b.width), height: Math.max(a.height, b.height) });
  out.data.fill(0);
  const threshold = 0.1;
  const maxDelta = 35215 * threshold * threshold;
  let diff = 0;
  const total = Math.max(a.width, b.width) * Math.max(a.height, b.height);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const oi = (out.width * y + x) * 4;
      if (x >= w || y >= h) {
        out.data[oi] = 255; out.data[oi + 3] = 255; diff++; continue;
      }
      const ai = (a.width * y + x) * 4;
      const bi = (b.width * y + x) * 4;
      const delta = colorDelta(a.data, b.data, ai, bi);
      if (delta > maxDelta) {
        out.data[oi] = 255; out.data[oi + 1] = 0; out.data[oi + 2] = 0; out.data[oi + 3] = 255;
        diff++;
      } else {
        const g = grayPixel(a.data, ai);
        out.data[oi] = g; out.data[oi + 1] = g; out.data[oi + 2] = g; out.data[oi + 3] = 255;
      }
    }
  }
  return { diffPixels: diff, ratio: diff / total, dimsMatch,
           aDims: `${a.width}x${a.height}`, bDims: `${b.width}x${b.height}`,
           diffBuf: PNG.sync.write(out) };
}

function grayPixel(data, i) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  return 255 + (rgb2y(r, g, b) - 255) * 0.1 * (data[i + 3] / 255) | 0;
}
function rgb2y(r, g, b) { return r * 0.29889531 + g * 0.58662247 + b * 0.11448223; }
function rgb2i(r, g, b) { return r * 0.59597799 - g * 0.2741761 - b * 0.32180189; }
function rgb2q(r, g, b) { return r * 0.21147017 - g * 0.52261711 + b * 0.31114694; }
function colorDelta(a, b, ai, bi) {
  let ar = a[ai], ag = a[ai + 1], ab = a[ai + 2], aa = a[ai + 3];
  let br = b[bi], bg = b[bi + 1], bb = b[bi + 2], ba = b[bi + 3];
  if (aa < 255) { aa /= 255; ar = blend(ar, aa); ag = blend(ag, aa); ab = blend(ab, aa); }
  if (ba < 255) { ba /= 255; br = blend(br, ba); bg = blend(bg, ba); bb = blend(bb, ba); }
  const y = rgb2y(ar, ag, ab) - rgb2y(br, bg, bb);
  const i = rgb2i(ar, ag, ab) - rgb2i(br, bg, bb);
  const q = rgb2q(ar, ag, ab) - rgb2q(br, bg, bb);
  return 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
}
function blend(c, a) { return 255 + (c - 255) * a; }

// Static guards that must hold before any pixel diff is trusted.
function staticAssertions() {
  // (1) No USE_MOCK flag / mock-data import may survive anywhere in src.
  const srcRoot = path.resolve("src");
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const txt = fs.readFileSync(full, "utf8");
        if (/\bUSE_MOCK\b/.test(txt) || /["'][^"']*\/mock\/data["']/.test(txt) || /from ["'][.\/]*mock/.test(txt)) {
          offenders.push(path.relative(srcRoot, full));
        }
      }
    }
  };
  walk(srcRoot);
  if (offenders.length) {
    throw new Error("USE_MOCK / mock import still present in: " + offenders.join(", "));
  }
  if (fs.existsSync(path.join(srcRoot, "mock"))) {
    throw new Error("src/mock still exists — the mock fixture must be deleted.");
  }

  // (2) vet.css must be byte-identical to appointments/static/vet.css.
  const reactCss = path.resolve("src/styles/vet.css");
  const djangoCss = path.resolve("../../appointments/static/vet.css");
  const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  const a = sha(reactCss);
  const b = sha(djangoCss);
  if (a !== b) {
    throw new Error(`vet.css checksum mismatch: react ${a} !== django ${b}`);
  }
  console.log(`OK static guards: no USE_MOCK/mock import; vet.css sha256 matches (${a.slice(0, 12)}…)`);
}

async function main() {
  staticAssertions();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  const reactCtx = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light", reducedMotion: "reduce" });
  const djGuest = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light", reducedMotion: "reduce" });
  const djAuth = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light", reducedMotion: "reduce" });

  {
    const p = await djAuth.newPage();
    await p.goto(`${DJANGO}/login/`, { waitUntil: "networkidle" });
    await p.fill("#id_username", "drmeadow");
    await p.fill("#id_password", "MeadowPhysio!2026");
    await Promise.all([
      p.waitForNavigation({ waitUntil: "networkidle" }),
      p.click('button[type=submit]'),
    ]);
    const url = p.url();
    if (/\/login\/?$/.test(url)) throw new Error("Django login failed, still on " + url);
    await p.close();
  }

  // Log the React SPA in as the same seeded doctor so the reactCtx session +
  // csrftoken cookies are set (via the Vite /api proxy) before capturing the
  // protected screens.
  {
    const p = await reactCtx.newPage();
    await p.goto(`${REACT}/login`, { waitUntil: "networkidle" });
    await p.fill("#id_username", DOCTOR.username);
    await p.fill("#id_password", DOCTOR.password);
    await Promise.all([
      p.waitForURL("**/dashboard", { waitUntil: "networkidle" }),
      p.click('button[type=submit]'),
    ]);
    await p.close();
  }

  const results = [];
  for (const [name, dj, rt, authed] of SCREENS) {
    const djCtx = authed ? djAuth : djGuest;
    const dp = await djCtx.newPage();
    await dp.goto(`${DJANGO}${dj}`, { waitUntil: "networkidle" });
    await prep(dp);
    const djBuf = await dp.screenshot({ clip: { x: 0, y: 0, ...VIEWPORT } });
    fs.writeFileSync(path.join(OUT, `${name}.django.png`), djBuf);
    await dp.close();

    const rp = await reactCtx.newPage();
    await rp.goto(`${REACT}${rt}`, { waitUntil: "networkidle" });
    await rp.waitForTimeout(300);
    await prep(rp);
    const rtBuf = await rp.screenshot({ clip: { x: 0, y: 0, ...VIEWPORT } });
    fs.writeFileSync(path.join(OUT, `${name}.react.png`), rtBuf);
    await rp.close();

    const d = diffImages(djBuf, rtBuf);
    const pass = d.dimsMatch && d.ratio <= 0.001;
    if (!pass) fs.writeFileSync(path.join(OUT, `${name}.diff.png`), d.diffBuf);
    delete d.diffBuf;
    const row = { name, pass, ...d };
    results.push(row);
    console.log(`${pass ? "PASS" : "FAIL"} ${name}  diffPixels=${d.diffPixels} ratio=${d.ratio.toFixed(6)} dims a=${d.aDims} b=${d.bDims}`);
  }

  fs.writeFileSync(path.join(OUT, "_results.json"), JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).map((r) => r.name);
  console.log("\nSUMMARY: " + (failed.length ? "FAIL -> " + failed.join(", ") : "ALL PASS"));
}

main().catch((e) => { console.error(e); process.exit(1); });
