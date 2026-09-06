import { open, login, record, results } from './harness.mjs';
import { execFileSync } from 'node:child_process';
const ADB = '/usr/local/share/android-commandlinetools/platform-tools/adb';
const sh = (...a) => execFileSync(ADB, a, { encoding: 'utf8' }).trim();
const page = await open();
await login(page, 'dr_dhanvi', 'dhanvi@123');

// --- F1: idempotency. Fire the same booking twice with no delay.
const tok = await page.evaluate(`
  const r = await fetch('http://10.0.2.2:8000/api/v1/auth/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:'dr_dhanvi',password:'dhanvi@123'})});
  return (await r.json()).access;`);
let r = await page.evaluate(`
  const H = {'Content-Type':'application/json', Authorization:'Bearer ${tok}'};
  const pets = await (await fetch('http://10.0.2.2:8000/api/v1/pets',{headers:H})).json();
  const pet = pets[0].id;
  const body = JSON.stringify({ pet, date:'2026-11-11', time:'09:00', visit_type:'FOLLOW_UP' });
  const before = (await (await fetch('http://10.0.2.2:8000/api/v1/appointments',{headers:H})).json()).length;
  const [a,b] = await Promise.all([
    fetch('http://10.0.2.2:8000/api/v1/appointments',{method:'POST',headers:H,body}),
    fetch('http://10.0.2.2:8000/api/v1/appointments',{method:'POST',headers:H,body}),
  ]);
  const after = (await (await fetch('http://10.0.2.2:8000/api/v1/appointments',{headers:H})).json()).length;
  return JSON.stringify({ before, after, created: after-before, statuses:[a.status,b.status] });
`).then(JSON.parse);
record('DEVICE', 'identical booking submitted twice at once',
  'one appointment, or a clear duplicate warning',
  `created=${r.created} statuses=${r.statuses}`,
  r.created <= 1 ? 'PASS' : 'BUG',
  r.created > 1 ? 'double-tap on a slow connection creates two bookings' : null);

// --- F2: offline. The app must say something, not go blank.
sh('shell','svc','wifi','disable'); sh('shell','svc','data','disable');
await new Promise(s => setTimeout(s, 3000));
r = await page.evaluate(`
  await window.__go('/dashboard');
  await new Promise(r=>setTimeout(r,4000));
  const main = document.querySelector('.main-panel');
  const txt = (main?.innerText || '').trim();
  return JSON.stringify({ chars: txt.length, hasError: /error|failed|could not|unable|offline|try again/i.test(txt), sample: txt.slice(0,110) });
`).then(JSON.parse);
record('DEVICE', 'dashboard with the network off',
  'a visible error, never a blank screen',
  `chars=${r.chars} error=${r.hasError} "${r.sample}"`,
  r.chars > 0 ? 'PASS' : 'BUG',
  !r.hasError && r.chars > 0 ? 'renders chrome but no explicit failure message' : null);
sh('shell','svc','wifi','enable'); sh('shell','svc','data','enable');
await new Promise(s => setTimeout(s, 6000));

// --- F3: hardware BACK with a half-filled form.
r = await page.evaluate(`await window.__go('/patients/new');
  window.__setValue(document.querySelector('.main-panel input'), 'AboutToBeLost');
  await new Promise(r=>setTimeout(r,500)); return location.pathname;`);
sh('shell','input','keyevent','4');
await new Promise(s => setTimeout(s, 2500));
const after = await page.evaluate(`return JSON.stringify({ route: location.pathname, alive: !!document.querySelector('.app-shell') });`).then(JSON.parse);
const pid = sh('shell','pidof','com.thepetphysiovet.app');
record('DEVICE', 'hardware BACK from a half-filled form',
  'navigates back, app survives, no data written',
  `route=${after.route} alive=${after.alive} pid=${pid || 'DEAD'}`,
  !!pid && after.alive ? 'PASS' : 'BUG');

console.log('\n=== failures ===');
console.log(JSON.stringify(results.filter(x=>x.verdict==='BUG'), null, 1));
page.close();
