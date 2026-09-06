import { open, login, record, results } from './harness.mjs';
const page = await open();

// --- G1: sign out through the drawer, as a user actually does.
await login(page, 'dr_dhanvi', 'dhanvi@123');
let r = await page.evaluate(`
  document.querySelector('.sidebar-toggle').click();
  await new Promise(r=>setTimeout(r,900));
  const out = [...document.querySelectorAll('.sidebar button, .sidebar a')]
    .find(b => /sign out|logout/i.test(b.textContent||''));
  if (!out) return JSON.stringify({ found:false });
  out.click();
  await new Promise(r=>setTimeout(r,3000));
  return JSON.stringify({ found:true, route: location.pathname, storage: Object.keys(localStorage) });
`).then(JSON.parse);
record('OWNER-UI', 'sign out from the doctor drawer', '/login, storage cleared',
  `route=${r.route} localStorage=${JSON.stringify(r.storage)}`,
  r.route === '/login' && r.storage.length === 0 ? 'PASS' : 'BUG');

// --- G2: a signed-out user forcing a doctor URL.
r = await page.evaluate(`return await window.__go('/dashboard');`);
record('OWNER-UI', 'signed-out user forces /dashboard', 'bounced to /login', r,
  r === '/login' ? 'PASS' : 'BUG');

// --- G3: owner logs in.
r = await login(page, 'asha.brutal', 'AshaRehab2026');
record('OWNER-UI', 'owner login lands in the owner portal', '/owner/home',
  `${r.route} err=${JSON.stringify(r.error)}`, r.route === '/owner/home' ? 'PASS' : 'BUG');

// --- G4: what does the owner's nav actually contain? Must be owner-only.
r = await page.evaluate(`
  document.querySelector('.sidebar-toggle').click();
  await new Promise(r=>setTimeout(r,900));
  const items = [...document.querySelectorAll('.sidebar .nav-item')].map(a=>(a.textContent||'').trim());
  const back = document.querySelector('.sidebar-backdrop'); if (back) back.click();
  await new Promise(r=>setTimeout(r,600));
  return JSON.stringify(items);
`).then(JSON.parse);
const leaked = r.filter(i => /revenue|enquir|patient|invoice.*billing|dashboard/i.test(i) && !/my /i.test(i));
record('OWNER-UI', 'owner nav contains no doctor destinations',
  'only owner items', JSON.stringify(r),
  leaked.length === 0 ? 'PASS' : 'BUG', leaked.length ? `leaked: ${leaked}` : null);

// --- G5: THE one that matters — owner types another owner's pet URL.
r = await page.evaluate(`
  const mine = await (await fetch('http://10.0.2.2:8000/api/v1/owner/pets',
    {headers:{Authorization:'Bearer '+(await (await fetch('http://10.0.2.2:8000/api/v1/auth/login',
      {method:'POST',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({username:'asha.brutal',password:'AshaRehab2026'})})).json()).access}})).json();
  const v = await (await fetch('http://10.0.2.2:8000/api/v1/owner/pets',
    {headers:{Authorization:'Bearer '+(await (await fetch('http://10.0.2.2:8000/api/v1/auth/login',
      {method:'POST',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({username:'vikram.brutal',password:'VikramRehab26'})})).json()).access}})).json();
  return JSON.stringify({ mine: mine.map(p=>p.id), theirs: v.map(p=>p.id), theirNames: v.map(p=>p.name) });
`).then(JSON.parse);

const victim = r.theirs[0];
const seen = await page.evaluate(`
  await window.__go('/owner/pets/${victim}');
  await new Promise(r=>setTimeout(r,2500));
  const t = (document.querySelector('.main-panel')?.innerText || '').replace(/\\s+/g,' ');
  return JSON.stringify({ route: location.pathname, showsVictimName: /VikramDog/i.test(t), text: t.slice(0,150) });
`).then(JSON.parse);
record('OWNER-UI', "owner opens another owner's pet by URL",
  "no data — error or redirect, never the other pet's record",
  `route=${seen.route} showsTheirPet=${seen.showsVictimName} "${seen.text.slice(0,80)}"`,
  seen.showsVictimName ? 'BUG' : 'PASS');

console.log('\n=== failures ===');
console.log(JSON.stringify(results.filter(x=>x.verdict==='BUG'), null, 1));
page.close();
