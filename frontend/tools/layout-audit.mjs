// Per-screen layout audit, run against the device rather than the viewport.
//
// The route sweep proves controls are reachable; it says nothing about whether
// text is legible or cut in half. This adds the things a person notices at a
// glance: content hidden behind a system bar, text truncated by its own box,
// content scrolled off the right with no affordance, and tap targets too small
// to hit.
import { connect } from './drive.mjs';
import { checkTopStrip } from './top-strip.mjs';
import { execFileSync } from 'node:child_process';

const ADB = process.env.ADB ?? '/usr/local/share/android-commandlinetools/platform-tools/adb';

function navBarInsetPx() {
  const dump = execFileSync(ADB, ['shell', 'dumpsys', 'window'], { maxBuffer: 64e6 }).toString();
  const m = dump.match(/type=navigationBars frame=\[\d+,(\d+)\]\[\d+,(\d+)\]/);
  return m ? Number(m[2]) - Number(m[1]) : 0;
}

const PROBE = `
window.__audit = () => {
  const panel = document.querySelector('.main-panel') || document.querySelector('.auth-shell');
  const vw = innerWidth;
  const label = (el) => {
    const t = (el.textContent || el.placeholder || '').trim().replace(/\\s+/g, ' ');
    return (el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '')
      + (t ? ' "' + t.slice(0, 38) + '"' : ''));
  };

  // Text cut off by its own box: nowrap/ellipsis/hidden with more content than room.
  const truncated = [...panel.querySelectorAll('*')].filter((el) => {
    if (el.children.length || !(el.textContent || '').trim()) return false;
    const cs = getComputedStyle(el);
    const clips = cs.textOverflow === 'ellipsis' || cs.whiteSpace === 'nowrap' ||
                  cs.overflowX === 'hidden' || cs.overflow === 'hidden';
    return clips && el.scrollWidth > el.clientWidth + 1;
  }).map((el) => ({ el: label(el), lostPx: el.scrollWidth - el.clientWidth }));

  // A placeholder wider than its field reads as a half-sentence. Inputs only:
  // a textarea wraps its placeholder, so measuring it on one line is a false
  // positive — this reported 121px "cut" on a textarea that renders fine.
  const ctx = document.createElement('canvas').getContext('2d');
  const cutPlaceholders = [...panel.querySelectorAll('input[placeholder]')]
    .map((el) => {
      const cs = getComputedStyle(el);
      ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      const textW = ctx.measureText(el.placeholder).width;
      const roomW = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return { el: label(el), lostPx: Math.round(textW - roomW) };
    })
    .filter((r) => r.lostPx > 2);

  // Content parked off the right inside a scroller. Legitimate, but only if the
  // user can tell: report how far it runs and whether a scrollbar is drawn.
  const scrollers = [...panel.querySelectorAll('*')].filter((el) => {
    const ox = getComputedStyle(el).overflowX;
    return (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1;
  }).map((el) => ({
    el: label(el).slice(0, 40),
    offscreenPx: el.scrollWidth - el.clientWidth,
    hasVisibleScrollbar: el.offsetHeight - el.clientHeight > 0,
  }));

  // 44x44 is the smallest reliably tappable target.
  const smallTargets = [...panel.querySelectorAll('a[href], button, input, select, textarea')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 24);
    })
    .map((el) => { const r = el.getBoundingClientRect();
      return { el: label(el), size: Math.round(r.width) + 'x' + Math.round(r.height) }; });

  // Anything painted past the right edge with nothing able to scroll it.
  const scrollable = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 1) return true;
    }
    return false;
  };
  const clipped = [...panel.querySelectorAll('*')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > vw + 1 && !scrollable(el);
  }).map(label);

  return {
    viewport: vw + 'x' + innerHeight,
    pageBottom: Math.round(document.scrollingElement.scrollHeight),
    truncated, cutPlaceholders, scrollers, smallTargets, clipped,
  };
};
return true;`;

const ROUTES = process.env.ROUTES
  ? process.env.ROUTES.split(',')
  : ['/dashboard', '/patients', '/patients/new', '/appointments', '/appointments/new',
     '/invoices', '/invoices/new', '/revenue', '/enquiries', '/queries',
     '/notifications-settings', '/profile'];

const page = await connect();
await page.evaluate(PROBE);
const topStrip = await checkTopStrip(page);
const navInset = navBarInsetPx();

const report = [];
for (const route of ROUTES) {
  await page.evaluate(`history.pushState({}, '', '${route}'); dispatchEvent(new PopStateEvent('popstate'));
    await new Promise(r => setTimeout(r, 2400)); return true;`);
  report.push({ route, ...(await page.evaluate('return window.__audit();')) });
}
console.log(JSON.stringify({ topStrip, navBarInsetPx: navInset, report }, null, 1));
page.close();
