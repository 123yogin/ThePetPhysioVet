// Walks every route in the running app and reports whether each one actually
// works on the device: did it render, is every nav control hit-testable, does
// anything overflow, did the console report an error.
//
// Reachability is the point. An off-canvas drawer produces no overflow, so an
// overflow-only sweep once passed this app while its nav was unusable on every
// phone width (see CLAUDE.md, shell unification).
import { connect } from './drive.mjs';
import { checkTopStrip } from './top-strip.mjs';

const DOCTOR_ROUTES = [
  ['/dashboard', 'DashboardScreen'],
  ['/patients', 'PatientsScreen'],
  ['/patients/new', 'PetFormScreen'],
  ['/appointments', 'AppointmentsScreen'],
  ['/appointments/new', 'CreateScreen'],
  ['/invoices', 'InvoiceListScreen'],
  ['/invoices/new', 'InvoiceFormScreen'],
  ['/revenue', 'RevenueScreen'],
  ['/enquiries', 'EnquiriesScreen'],
  ['/queries', 'QueryInboxScreen'],
  ['/notifications-settings', 'NotificationsSettingsScreen'],
  ['/profile', 'ProfileScreen'],
];

const OWNER_ROUTES = [
  ['/owner/home', 'OwnerHomeScreen'],
  ['/owner/appointments', 'OwnerAppointmentsScreen'],
  ['/owner/billing', 'OwnerBillingScreen'],
];

const PUBLIC_ROUTES = [
  ['/login', 'LoginScreen'],
  ['/forgot-password', 'ForgotPasswordScreen'],
  ['/reset-password', 'ResetPasswordScreen'],
];

const probe = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  window.__setValue = (el, value) => {
    const proto = Object.getPrototypeOf(el);
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  window.__go = async (path) => {
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await sleep(1400);
  };

  // An element counts as reachable only if a tap at its centre actually lands on
  // it. Being in the DOM, or even visible, is not the same thing.
  window.__hittable = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    const hit = document.elementFromPoint(x, y);
    return !!hit && (el === hit || el.contains(hit) || hit.contains(el));
  };

  window.__report = async (path) => {
    const main = document.querySelector('.main-panel') || document.querySelector('.auth-shell');
    const toggle = document.querySelector('.sidebar-toggle');

    let navTotal = 0;
    let navHittable = 0;
    if (toggle && window.__hittable(toggle)) {
      toggle.click();
      // Poll instead of guessing at the 250ms drawer transition: a fixed sleep
      // raced it and reported 0/10 reachable on a screen that was fine.
      const items = () => [...document.querySelectorAll('.sidebar .nav-item, .sidebar button')];
      for (let i = 0; i < 40; i++) {
        const list = items();
        if (list.length && list.every(window.__hittable)) break;
        await sleep(50);
      }
      const list = items();
      navTotal = list.length;
      navHittable = list.filter(window.__hittable).length;
      const backdrop = document.querySelector('.sidebar-backdrop');
      if (backdrop) backdrop.click(); else toggle.click();
      for (let i = 0; i < 40 && document.body.classList.contains('sidebar-open'); i++) {
        await sleep(50);
      }
      await sleep(300);
    }

    // Content wider than the screen is only a defect if nothing can scroll it.
    // Wide tables and the calendar grid deliberately sit in an overflow-x: auto
    // container; counting those makes the whole check noise, and a check nobody
    // trusts is how the nav stayed unreachable through a "396 combinations
    // clean" sweep.
    // Keep walking the whole chain. Stopping at the first ancestor whose
    // computed overflow-x is auto reports false negatives: a cell with
    // overflow-y: hidden computes overflow-x to auto without being scrollable,
    // which flagged the calendar's own appointment chips as unreachable when
    // scrollIntoView proves they are not.
    const scrollable = (el) => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 1) return true;
      }
      return false;
    };
    const clipped = [...document.querySelectorAll('.main-panel *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !scrollable(el);
    });
    const overflow = clipped.length;
    const clippedSample = clipped.slice(0, 3).map(
      (el) => el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 30)
    );

    const text = (main?.innerText || '').trim();
    return {
      path,
      route: location.pathname,
      rendered: text.length > 0,
      chars: text.length,
      heading: document.querySelector('.page-title')?.innerText?.slice(0, 40) ?? null,
      navTotal,
      navHittable,
      overflow,
      clippedSample,
      bodyScrollX: document.documentElement.scrollWidth > innerWidth + 1,
      safeTop: getComputedStyle(main || document.body).paddingTop,
      errorPanel: !!document.querySelector('.alert-danger'),
    };
  };
  return true;
`;

const page = await connect();
await page.evaluate(probe);

const consoleErrors = [];
await page.evaluate(`
  window.__errors = [];
  const orig = console.error;
  console.error = (...a) => { window.__errors.push(a.map(String).join(' ')); orig(...a); };
  addEventListener('unhandledrejection', (e) => window.__errors.push('unhandledrejection: ' + e.reason));
  return true;
`);

async function login(username, password) {
  await page.evaluate(`await window.__go('/login'); return true;`);
  const ok = await page.evaluate(`
    const inputs = [...document.querySelectorAll('.auth-shell input')];
    if (inputs.length < 2) return 'no inputs found';
    window.__setValue(inputs[0], ${JSON.stringify(username)});
    window.__setValue(inputs[1], ${JSON.stringify(password)});
    const form = inputs[0].closest('form');
    if (!form) return 'no form';
    form.requestSubmit();
    await new Promise((r) => setTimeout(r, 3500));
    return location.pathname;
  `);
  return ok;
}

const results = [];
async function walk(routes, label) {
  for (const [path, screen] of routes) {
    await page.evaluate(`await window.__go(${JSON.stringify(path)}); return true;`);
    const r = await page.evaluate(`return await window.__report(${JSON.stringify(path)});`);
    results.push({ ...r, screen, group: label });
  }
}

// Detail routes need a real id. Following a link from the list screen tests the
// navigation path a user actually takes, rather than a guessed URL.
async function walkDetails(pairs) {
  for (const [listPath, hrefPattern, screen, clickFirst] of pairs) {
    await page.evaluate(`await window.__go(${JSON.stringify(listPath)}); return true;`);
    if (clickFirst) {
      await page.evaluate(`
        const btn = [...document.querySelectorAll('.main-panel button')]
          .find((b) => (b.innerText || '').trim() === ${JSON.stringify(clickFirst)});
        if (btn) { btn.click(); await new Promise((r) => setTimeout(r, 1200)); }
        return !!btn;
      `);
    }
    const href = await page.evaluate(`
      const re = new RegExp(${JSON.stringify(hrefPattern)});
      const link = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).find((h) => re.test(h));
      return link ?? null;
    `);
    if (!href) {
      results.push({ path: listPath + ' -> ' + hrefPattern, screen, group: 'detail', rendered: false,
        navTotal: 0, navHittable: 0, overflow: 0, bodyScrollX: false, note: 'no link found on list screen' });
      continue;
    }
    await page.evaluate(`await window.__go(${JSON.stringify('')} + ${JSON.stringify(href)}); return true;`);
    const r = await page.evaluate(`return await window.__report(${JSON.stringify(href)});`);
    results.push({ ...r, screen, group: 'detail' });
  }
}

const target = process.argv[2] ?? 'doctor';
if (target === 'public') {
  await walk(PUBLIC_ROUTES, 'public');
} else if (target === 'doctor') {
  const landed = await login('dr_dhanvi', 'DoctorPass123!');
  console.log('login ->', landed);
  await walk(DOCTOR_ROUTES, 'doctor');
} else if (target === 'owner') {
  const landed = await login('owner_sarah', 'OwnerPass123!');
  console.log('login ->', landed);
  await walk(OWNER_ROUTES, 'owner');
} else if (target === 'doctor-details') {
  console.log('login ->', await login('dr_dhanvi', 'DoctorPass123!'));
  await walkDetails([
    ['/patients', '^/patients/(?!new)', 'PetDetailScreen'],
    ['/invoices', '^/invoices/(?!new)', 'InvoiceDetailScreen'],
    // Those two links only exist in List View; the screen opens on Calendar View.
    ['/appointments', '/reschedule$', 'RescheduleScreen', 'List View'],
    ['/appointments', '/share$', 'ShareScreen', 'List View'],
  ]);
} else {
  console.log('login ->', await login('owner_sarah', 'OwnerPass123!'));
  await walkDetails([['/owner/home', '^/owner/pets/', 'OwnerPetDetailScreen']]);
}

// Window-level, not per-route: whether the WebView starts below the status bar
// is a property of the app's configuration, so once per sweep is enough.
const topStrip = await checkTopStrip(page);

const errs = await page.evaluate('return window.__errors;');
console.log(JSON.stringify({ results, topStrip, consoleErrors: errs }, null, 1));
page.close();
