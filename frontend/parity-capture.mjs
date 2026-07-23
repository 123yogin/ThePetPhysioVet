// Deterministic React<->Django pixel-parity capture + diff.
// Run FROM clients/web: `node parity-capture.mjs`
// Django golden on :8000 (seeded, PARITY_MODE+PARITY_TODAY), React preview on :4173.
import { chromium } from "playwright";
import { PNG } from "playwright-core/lib/utilsBundle";
import fs from "node:fs";
import path from "node:path";

const DJANGO = "http://127.0.0.1:8000";
const REACT = "http://127.0.0.1:4173";
const OUT = path.resolve("parity-shots/round1");
const VIEWPORT = { width: 1280, height: 800 };

// name, djangoPath, reactPath, authed(Django needs login)
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

// pixelmatch-style YIQ diff. Returns {diffPixels, diffPng}.
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
      if (x >= w || y >= h) { // area outside overlap = diff
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

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // --- React context (mock data; no auth needed) ---
  const reactCtx = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light", reducedMotion: "reduce" });
  // --- Django unauthenticated context (login/signup) ---
  const djGuest = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light", reducedMotion: "reduce" });
  // --- Django authenticated context ---
  const djAuth = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light", reducedMotion: "reduce" });

  // Log the doctor into djAuth.
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
    await rp.waitForTimeout(300); // let react-query mock resolve + render
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
