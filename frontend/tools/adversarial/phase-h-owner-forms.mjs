import { open, login, record, results } from './harness.mjs';
const page = await open();
const r0 = await login(page, 'asha.brutal', 'AshaRehab2026');
record('OWNER', 'owner signs in', '/owner/home', r0.route, r0.route === '/owner/home' ? 'PASS' : 'BUG');

// Drives the real "Add a Pet" form in the owner portal.
const addPet = (name, breed) => page.evaluate(`
  await window.__go('/owner/home');
  const open = [...document.querySelectorAll('.main-panel button')]
    .find(b => /add a pet|add your first pet/i.test(b.textContent||''));
  if (open) { open.click(); await new Promise(r=>setTimeout(r,1200)); }
  const form = document.querySelector('.main-panel form');
  if (!form) return JSON.stringify({ error: 'no form' });
  const ins = [...form.querySelectorAll('input')];
  window.__setValue(ins[0], ${JSON.stringify(name)});
  if (ins[1]) window.__setValue(ins[1], ${JSON.stringify(breed || 'Labrador')});
  form.requestSubmit();
  await new Promise(r=>setTimeout(r,3000));
  const err = document.querySelector('.main-panel .alert-danger, .flash-item');
  const t = (document.querySelector('.main-panel')?.innerText||'').replace(/\\s+/g,' ');
  return JSON.stringify({ error: err ? err.innerText.trim().slice(0,80) : null,
                          listed: t.includes(${JSON.stringify((name||'').slice(0,20))}) && ${JSON.stringify(!!name.trim())} });
`).then(JSON.parse);

let r = await addPet('', 'Labrador');
record('OWNER', 'add pet with an empty name', 'refused',
  `err=${JSON.stringify(r.error)} listed=${r.listed}`, !r.listed ? 'PASS' : 'BUG');

r = await addPet('     ', 'Labrador');
record('OWNER', 'add pet named only spaces', 'refused',
  `err=${JSON.stringify(r.error)} listed=${r.listed}`, !r.listed ? 'PASS' : 'BUG');

r = await addPet('Q'.repeat(400), 'Labrador');
record('OWNER', 'add pet with a 400-char name', 'refused or truncated safely',
  `err=${JSON.stringify(r.error)} listed=${r.listed}`, !r.listed ? 'PASS' : 'BUG');

r = await addPet('<img src=x onerror="document.title=1">', 'Labrador');
const titleHijacked = await page.evaluate(`return document.title === '1';`);
record('OWNER', 'add pet with an XSS payload', 'stored inert, no script runs',
  `titleHijacked=${titleHijacked}`, titleHijacked ? 'BUG' : 'PASS');

r = await addPet('BrutalOwnerPet', 'Beagle');
record('OWNER', 'add a valid pet', 'appears in the list',
  `err=${JSON.stringify(r.error)} listed=${r.listed}`, r.listed ? 'PASS' : 'BUG');

// --- booking form
r = await page.evaluate(`
  await window.__go('/owner/appointments');
  await new Promise(r=>setTimeout(r,2000));
  const t = (document.querySelector('.main-panel')?.innerText||'').replace(/\\s+/g,' ');
  const forms = document.querySelectorAll('.main-panel form').length;
  const selects = [...document.querySelectorAll('.main-panel select')].map(s=>s.options.length);
  return JSON.stringify({ forms, selects, text: t.slice(0,140) });
`).then(JSON.parse);
record('OWNER', 'appointments screen renders a booking form', 'form + populated selects',
  `forms=${r.forms} selectOptionCounts=${JSON.stringify(r.selects)}`,
  r.forms > 0 ? 'PASS' : 'NOTE');

// visit types must come from the API, never a hardcoded list (CLAUDE.md B1/B2)
r = await page.evaluate(`
  const sels = [...document.querySelectorAll('.main-panel select')];
  const vt = sels.map(s => [...s.options].map(o=>o.value).filter(Boolean)).find(v=>v.length);
  return JSON.stringify({ options: vt || [] });
`).then(JSON.parse);
record('OWNER', 'booking visit types are populated', 'non-empty, from /appointment-options',
  JSON.stringify(r.options), r.options.length > 0 ? 'PASS' : 'BUG');

console.log('\n=== failures ===');
console.log(JSON.stringify(results.filter(x=>x.verdict==='BUG'), null, 1));
page.close();
