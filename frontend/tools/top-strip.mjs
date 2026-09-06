// Pixel-level check that the page starts below the system status bar.
//
// getBoundingClientRect() is measured against the viewport, and the Android
// WebView's viewport happily extends underneath a transparent status bar. That is
// how D15 shipped past a 20/20 route sweep: the DOM reported `titleTop: 20,
// onScreen: true` while the title sat behind the clock.
//
// Note what does NOT work: painting a strip and asking whether its pixels are
// visible. Under an edge-to-edge WebView the status bar is transparent, so the
// strip shows straight through it and reads as fully visible — the first version
// of this check passed the defect it was written to catch. What actually matters
// is where the page's first row lands relative to the inset the system reserves,
// so that is what is asserted here, with the inset read from the OS rather than
// assumed.
import { execFileSync } from 'node:child_process';

const ADB = process.env.ADB ?? '/usr/local/share/android-commandlinetools/platform-tools/adb';
const MARKER = { r: 255, g: 0, b: 255 };
const MARKER_CSS_HEIGHT = 120;

function statusBarInsetPx() {
  const dump = execFileSync(ADB, ['shell', 'dumpsys', 'window'], { maxBuffer: 64e6 }).toString();
  const m = dump.match(/type=statusBars frame=\[\d+,\d+\]\[\d+,(\d+)\]/);
  if (!m) throw new Error('could not read the statusBars inset from dumpsys');
  return Number(m[1]);
}

// `screencap` without -p returns the raw framebuffer, so there is no PNG to
// decode: width, height, format, then (Android 9+) a colour-space word.
function grabFrame() {
  const buf = execFileSync(ADB, ['exec-out', 'screencap'], { maxBuffer: 512e6 });
  const width = buf.readUInt32LE(0);
  const height = buf.readUInt32LE(4);
  for (const header of [16, 12]) {
    if (buf.length - header === width * height * 4) return { width, height, header, buf };
  }
  throw new Error(`unrecognised screencap layout: ${buf.length} bytes for ${width}x${height}`);
}

// Match the marker by HUE, not by absolute value. An emulator (or a real
// phone) dims its screen, and every captured colour scales with it: this check
// once read rgb(102,0,102) for a pure magenta marker and reported the page
// origin as "not found", which looked exactly like a layout regression. Magenta
// is red and blue roughly equal with almost no green, at any brightness.
const near = (px) => {
  const { r, g, b } = px;
  if (r < 30 || b < 30) return false;               // too dark to judge
  if (g > r * 0.35 || g > b * 0.35) return false;    // green means not magenta
  return Math.abs(r - b) < Math.max(r, b) * 0.3;     // red and blue in balance
};

export async function checkTopStrip(page) {
  const dpr = await page.evaluate('return devicePixelRatio;');

  // Establish a known state first. The route sweep can leave the nav drawer
  // open, and this check then measured a screen with a drawer over it and found
  // no marker at all — reporting a failure that was purely test ordering.
  await page.evaluate(`
    const backdrop = document.querySelector('.sidebar-backdrop');
    if (backdrop) backdrop.click();
    for (let i = 0; i < 30 && document.body.classList.contains('sidebar-open'); i++) {
      await new Promise(r => setTimeout(r, 50));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 400));
    return true;
  `);

  await page.evaluate(`
    const el = document.createElement('div');
    el.id = '__topstrip';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;height:${MARKER_CSS_HEIGHT}px;' +
      'background:rgb(${MARKER.r},${MARKER.g},${MARKER.b});z-index:2147483647;pointer-events:none;';
    document.body.appendChild(el);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return true;
  `);

  const { width, height, header, buf } = grabFrame();
  const x = Math.floor(width / 2);
  const at = (y) => {
    const o = header + (y * width + x) * 4;
    return { r: buf[o], g: buf[o + 1], b: buf[o + 2] };
  };

  let pageOriginRow = -1;
  for (let y = 0; y < Math.min(height, MARKER_CSS_HEIGHT * dpr * 3); y++) {
    if (near(at(y))) {
      pageOriginRow = y;
      break;
    }
  }

  await page.evaluate(`document.getElementById('__topstrip')?.remove(); return true;`);

  const inset = statusBarInsetPx();
  const hiddenPx = Math.max(0, inset - pageOriginRow);
  return {
    screen: `${width}x${height}`,
    statusBarInsetPx: inset,
    pageOriginRow,
    hiddenDevicePx: hiddenPx,
    hiddenCssPx: +(hiddenPx / dpr).toFixed(1),
    pass: pageOriginRow >= inset,
  };
}
