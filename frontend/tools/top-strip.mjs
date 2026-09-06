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

const near = (a, b, tolerance = 24) =>
  Math.abs(a.r - b.r) <= tolerance && Math.abs(a.g - b.g) <= tolerance && Math.abs(a.b - b.b) <= tolerance;

export async function checkTopStrip(page) {
  const dpr = await page.evaluate('return devicePixelRatio;');

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
    if (near(at(y), MARKER)) {
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
