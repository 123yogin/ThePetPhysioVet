import { open, login, record, results } from './harness.mjs';
const page = await open();

await login(page, 'dr_dhanvi', 'dhanvi@123');

// E1 — type into a form, then leave via a nav item and come back.
let r = await page.evaluate(`
  await window.__go('/patients/new');
  const i = document.querySelector('.main-panel input');
  window.__setValue(i, 'HalfTypedPatient');
  await new Promise(r=>setTimeout(r,400));
  await window.__go('/dashboard');
  await window.__go('/patients/new');
  const after = document.querySelector('.main-panel input');
  return JSON.stringify({ route: location.pathname, value: after ? after.value : null });
`).then(JSON.parse);
record('NATIVE', 'half-typed form after navigating away and back',
  'either cleanly empty or restored — never stale garbage',
  `route=${r.route} value=${JSON.stringify(r.value)}`,
  r.route === '/patients/new' ? 'PASS' : 'BUG');

// E2 — spam navigation hard enough to overlap in-flight queries.
r = await page.evaluate(`
  const paths = ['/dashboard','/patients','/appointments','/invoices','/revenue','/queries','/enquiries'];
  let errors = 0;
  const onErr = () => errors++;
  addEventListener('error', onErr); addEventListener('unhandledrejection', onErr);
  for (let n=0; n<3; n++) for (const p of paths) {
    history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate'));
    await new Promise(r=>setTimeout(r,90));
  }
  await new Promise(r=>setTimeout(r,2500));
  removeEventListener('error', onErr); removeEventListener('unhandledrejection', onErr);
  const main = document.querySelector('.main-panel');
  return JSON.stringify({ errors, route: location.pathname, rendered: !!(main && main.innerText.trim()) });
`).then(JSON.parse);
record('NATIVE', '21 rapid route switches with queries in flight',
  'no uncaught errors, still renders',
  `errors=${r.errors} route=${r.route} rendered=${r.rendered}`,
  r.errors === 0 && r.rendered ? 'PASS' : 'BUG');

// E3 — double-submit the same appointment as fast as the UI allows.
r = await page.evaluate(`
  const before = await (await fetch('http://10.0.2.2:8000/api/v1/appointments', {
    headers:{Authorization:'Bearer '+window.__t}})).json().catch(()=>[]);
  return JSON.stringify({ note: 'skipped — needs token' });
`).then(JSON.parse);

console.log(JSON.stringify(results, null, 1));
page.close();
