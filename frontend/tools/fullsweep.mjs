// Full-app sweep of the running Android build, over CDP.
// Drives the REAL UI: taps the real controls, waits for each screen's query to
// settle, and measures geometry in device pixels. Read-only against production
// except for a clearly prefixed owner account, which the caller cleans up.
const PORT = process.env.CDP_PORT || 9222;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find(x => x.webSocketDebuggerUrl);
if (!target) { console.error('no CDP target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.addEventListener('message', e => { const d = JSON.parse(e.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } });
await new Promise(r => ws.addEventListener('open', r));
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.value;

const TAG = process.argv[2] || ('sw' + String(Date.now()).slice(-6));

const out = await ev(`(async () => {
  const R = [], TAG = ${JSON.stringify(TAG)};
  const ok = (id, name, pass, note) => R.push({ id, name, pass: !!pass, note: note ?? '' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const wait = (fn, ms = 30000) => new Promise(res => { const d = Date.now() + ms;
    (function p(){ let v; try { v = fn(); } catch (e) { v = null; }
      if (v) return res(v); if (Date.now() > d) return res(null); setTimeout(p, 150); })(); });
  const setV = (el, v) => { Object.getOwnPropertyDescriptor(
      el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')
      .set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true })); };
  const tap = el => { el.scrollIntoView({ block: 'center' });
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    el.click(); };
  // A screen is settled once its query has resolved AND its content has stopped
  // growing. Heading-only was not enough: every screen renders its title before
  // the list arrives, so geometry and content assertions ran against a half-built
  // page and reported absent data that was merely late.
  let _lastLen = -1, _stable = 0;
  const settled = route => {
    if (!location.pathname.includes('/' + route)) return false;
    if (!document.querySelector('h1,h2,.page-title')) return false;
    if (document.querySelector('.app-booting, .skeleton')) return false;
    if (/Loading/i.test(document.body.innerText)) return false;
    const len = document.body.innerText.length;
    if (len === _lastLen) { _stable++; } else { _stable = 0; _lastLen = len; }
    return _stable >= 2;          // unchanged across three consecutive polls
  };
  // innerText returns CSS-transformed text, so a badge styled with
  // text-transform uppercase reads as PENDING even though the DOM says
  // "Pending". Enum-leak checks must use textContent or they false-positive.
  // NOTE: this whole body is a JS template literal -- no backticks in here, and
  // backslashes need doubling to survive into the evaluated string.
  const rawText = () => (document.body.textContent || '').replace(/\\s+/g, ' ');

  const census = { tables: 0, rows: 0, where: [] };
  function geometry(label) {
    const de = document.documentElement;
    ok(label + ':fit', label + ' — no horizontal overflow',
       de.scrollWidth <= innerWidth + 1, de.scrollWidth + '>' + innerWidth);
    const tables = document.querySelectorAll('table');
    const rows = document.querySelectorAll('table tbody tr');
    census.tables += tables.length; census.rows += rows.length;
    if (tables.length) census.where.push(label + ':' + tables.length);
    const wide = [...document.querySelectorAll('table,.table-wrap,pre,.card,.glass-card')]
      .filter(e => e.getBoundingClientRect().right > innerWidth + 1);
    ok(label + ':edge', label + ' — nothing past the right edge', wide.length === 0,
       wide.length ? wide[0].tagName + '.' + String(wide[0].className).slice(0, 20) : '');
    // The document-level check above misses an element that scrolls INSIDE its
    // own container: the appointments calendar was a 800px-wide grid in an
    // overflow-x wrapper, so four weekdays sat off-screen while the page itself
    // reported no overflow and this sweep passed it. Catch inner scrollers too.
    const scrollers = [...document.querySelectorAll('*')].filter(e => {
      if (e.scrollWidth <= e.clientWidth + 2) return false;
      const ov = getComputedStyle(e).overflowX;
      return ov === 'auto' || ov === 'scroll';
    });
    ok(label + ':inner', label + ' — nothing scrolls sideways inside the page',
       scrollers.length === 0,
       scrollers.length
         ? scrollers[0].tagName + '.' + String(scrollers[0].className).slice(0, 24)
           + ' ' + scrollers[0].scrollWidth + '>' + scrollers[0].clientWidth
         : '');
    const small = [...document.querySelectorAll('button,a.btn,[role=button]')]
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 44; });
    ok(label + ':tap', label + ' — tap targets >= 44px', small.length === 0,
       small.length ? small.length + ' small, first "' + small[0].textContent.trim().slice(0, 16) + '"' : '');
    const bad = /Something went wrong|Bad Request|No Pet matches|NaN|undefined|\\[object Object\\]/;
    const hit = document.body.innerText.match(bad);
    ok(label + ':err', label + ' — no raw error text', !hit, hit ? hit[0] : '');
  }
  async function openDrawer() {
    if (document.body.classList.contains('sidebar-open')) return true;
    for (const c of [...document.querySelectorAll('button,[role=button]')]) {
      tap(c); await sleep(350);
      if (document.body.classList.contains('sidebar-open')) return true;
    }
    return false;
  }
  async function go(route, label) {
    let link = document.querySelector('a[href$="/' + route + '"]');
    if (!link) { await openDrawer(); link = await wait(() => document.querySelector('a[href$="/' + route + '"]'), 5000); }
    if (!link) { ok(label, label + ' — reachable from the nav', false, 'no nav link'); return false; }
    tap(link);
    const arrived = await wait(() => settled(route));
    ok(label, label + ' — renders with its data', !!arrived,
       (document.querySelector('h1,h2,.page-title') || {}).textContent + (arrived ? '' : ' STILL LOADING'));
    await sleep(400); geometry(label);
    return !!arrived;
  }

  // ---------- sign in ----------
  const u = await wait(() => document.querySelector('#username, input[name=username]'));
  ok('A1', 'login screen reached', !!u, location.pathname);
  if (!u) return { R, census };
  ok('A2', 'clinic mark on the login card',
     !!document.querySelector('.auth-brand img[src*="logo.svg"]'),
     (document.querySelector('.auth-brand img') || {}).naturalWidth + 'px natural');
  const zoomy = [...document.querySelectorAll('input')].filter(e => parseFloat(getComputedStyle(e).fontSize) < 16);
  ok('A3', 'inputs >= 16px (no iOS/Android focus zoom)', zoomy.length === 0, zoomy.length + ' under 16px');
  geometry('login');

  setV(u, 'wrong_user'); setV(document.querySelector('#password, input[type=password]'), 'wrong');
  tap(document.querySelector('form button[type=submit]'));
  // The API's own wording: "Incorrect username or password." A regex that did
  // not include it once failed this check against a perfectly correct app.
  const refused = await wait(() => /incorrect username or password|check your username|login failed/i.test(document.body.innerText), 20000);
  ok('A4', 'bad credentials refused with a readable message', !!refused,
     (document.body.innerText.match(/[^.!]*(?:ncorrect username|check your username|ogin failed)[^.!]*[.!]?/i) || [''])[0].trim().slice(0, 70));
  ok('A4b', 'the refusal does not say whether the username exists',
     !/no such user|user not found|does not exist|no account with/i.test(document.body.innerText),
     'user-enumeration check');

  setV(document.querySelector('#username, input[name=username]'), 'dr_dhanvi');
  setV(document.querySelector('#password, input[type=password]'), 'dhanvi@123');
  tap(document.querySelector('form button[type=submit]'));
  const landed = await wait(() => /dashboard/.test(location.pathname) && document.querySelector('.sidebar'));
  ok('A5', 'doctor signs in', !!landed, location.pathname);
  if (!landed) return { R, census };
  await wait(() => settled('dashboard'));
  ok('A6', 'greets the real user', /Dhanvi/.test(document.body.innerText), (document.body.innerText.match(/Welcome[^!]*!/) || [''])[0]);
  geometry('dashboard');

  // ---------- every doctor route ----------
  for (const [route, label] of [
    ['patients','patients'], ['appointments','appointments'], ['invoices','invoices'],
    ['revenue','revenue'], ['enquiries','enquiries'], ['queries','messages'],
    ['notifications-settings','sms-settings'], ['profile','profile'],
  ]) await go(route, label);

  // real data actually rendered?
  await go('patients', 'patients2');
  ok('B1', 'the real patient roster is listed', /Coco/.test(document.body.innerText),
     (document.body.innerText.match(/Coco[^\\n]{0,40}/) || [''])[0]);
  await go('enquiries', 'enquiries2');
  // Not a row count: this asserted ">= 3" and broke the day four test
  // enquiries were cleaned out of production. A sweep must not depend on how
  // much data happens to exist. Either rows render, or a real empty state does.
  const enq = document.querySelectorAll('table tbody tr, .enquiry-card, .glass-card').length;
  const emptyState = /no enquir|nothing here|all caught up|no new/i.test(document.body.innerText);
  ok('B2', 'the enquiry inbox shows rows or a proper empty state',
     enq > 0 || emptyState, enq + ' rows/cards' + (emptyState ? ' + empty state' : ''));

  // ---------- sign out ----------
  await openDrawer();
  const so = [...document.querySelectorAll('a,button')].find(e => /sign ?out/i.test(e.textContent || ''));
  ok('C1', 'Sign Out reachable on a phone', !!so, so ? 'y=' + Math.round(so.getBoundingClientRect().top) + ' vh=' + innerHeight : 'not found');
  if (so) { tap(so); ok('C2', 'sign out returns to login', !!(await wait(() => document.querySelector('#username, input[name=username]'), 15000)), location.pathname); }

  // ---------- owner portal, on a throwaway account ----------
  const reg = [...document.querySelectorAll('button')].find(b => /New Owner Registration/i.test(b.textContent));
  ok('D1', 'owner registration tab exists', !!reg);
  if (reg) {
    tap(reg); await sleep(600);
    const ph = document.querySelector('#phone');
    ok('D2', 'phone is marked required at signup', ph ? ph.required : false,
       (document.querySelector('label[for=phone]') || {}).textContent);
    setV(document.querySelector('#firstName'), TAG);
    setV(document.querySelector('#email'), TAG + '@qa.invalid');
    setV(document.querySelector('#regPassword') || document.querySelector('input[type=password]'), 'SweepQa2026!x');
    const form = document.querySelector('form');
    ok('D3', 'signup blocked while phone is empty', !form.checkValidity(), 'form.checkValidity()');
    setV(ph, '9800' + String(Date.now()).slice(-6));
    tap([...document.querySelectorAll('form button[type=submit]')].pop());
    const owner = await wait(() => /owner/.test(location.pathname) && document.querySelector('.sidebar'));
    ok('D4', 'new owner signs up and lands in their portal', !!owner, location.pathname);
    if (owner) {
      await wait(() => !/Loading/i.test(document.body.innerText));
      geometry('owner-home');
      const leaked = ['/patients','/revenue','/invoices','/enquiries']
        .filter(h => !!document.querySelector('a[href$="' + h + '"]'));
      ok('D5', 'no doctor nav leaks to an owner', leaked.length === 0, leaked.join(' '));
      for (const [r,l] of [['owner/appointments','owner-appts'], ['owner/billing','owner-billing'], ['owner/home','owner-home2']])
        await go(r, l);
    }
  }

  ok('E1', 'the sweep actually met tables to check', census.tables > 0,
     census.tables + ' tables, ' + census.rows + ' rows across ' + (census.where.join(' ') || 'none'));
  return { R, census, tag: TAG };
})()`);

const rows = out?.R ?? [];
const fails = rows.filter(r => !r.pass);
for (const r of rows) console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.id.padEnd(22)} ${r.name}${r.note ? '  [' + r.note + ']' : ''}`);
console.log(`\n${rows.length} checks, ${fails.length} failed` + (out?.tag ? `  (test account: ${out.tag})` : ''));
ws.close();
process.exit(fails.length ? 1 : 0);
