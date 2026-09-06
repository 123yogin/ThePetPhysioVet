import { open, record, results } from './harness.mjs';
const page = await open();

const openForm = () => page.evaluate(`
  await window.__go('/owner/home');
  const b = [...document.querySelectorAll('.main-panel button')].find(x=>/book appointment/i.test(x.textContent||''));
  if (!b) return JSON.stringify({ opened:false });
  b.click(); await new Promise(r=>setTimeout(r,2000));
  const m = document.querySelector('.main-panel');
  const sels = [...m.querySelectorAll('select')].map(s=>[...s.options].map(o=>o.value).filter(Boolean));
  return JSON.stringify({ opened:true, forms:m.querySelectorAll('form').length,
    inputs:[...m.querySelectorAll('input')].map(i=>i.type), selects:sels });
`).then(JSON.parse);

let r = await openForm();
record('BOOKING', 'the Book Appointment form opens', 'form with pet + visit-type selects',
  `forms=${r.forms} inputs=${JSON.stringify(r.inputs)} selects=${JSON.stringify(r.selects)}`,
  r.opened && r.forms > 0 ? 'PASS' : 'BUG');

const visitTypes = (r.selects || []).find(s => s.some(v => /CONSULT|FOLLOW|THERAPY|ASSESS/i.test(v))) || [];
record('BOOKING', 'visit types come from the API, not a hardcoded list',
  'non-empty — the B1/B2 defect CLAUDE.md records', JSON.stringify(visitTypes),
  visitTypes.length > 0 ? 'PASS' : 'BUG');

// --- submit with everything blank
r = await page.evaluate(`
  const f = document.querySelector('.main-panel form');
  f.requestSubmit();
  await new Promise(r=>setTimeout(r,2500));
  const t=(document.querySelector('.main-panel')?.innerText||'');
  return JSON.stringify({ stillOnForm: !!document.querySelector('.main-panel form'),
                          err: /required|please|select|error|invalid/i.test(t) });
`).then(JSON.parse);
record('BOOKING', 'submit the booking form entirely blank', 'refused',
  `stillOnForm=${r.stillOnForm} showedValidation=${r.err}`, r.stillOnForm ? 'PASS' : 'BUG');

// --- a date in the past
r = await page.evaluate(`
  const f = document.querySelector('.main-panel form');
  const d = f.querySelector('input[type=date]'), t = f.querySelector('input[type=time]');
  const sels = [...f.querySelectorAll('select')];
  if (d) window.__setValue(d, '2020-01-01');
  if (t) window.__setValue(t, '10:00');
  for (const s of sels) { const o=[...s.options].find(x=>x.value); if(o){ s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true})); } }
  await new Promise(r=>setTimeout(r,400));
  f.requestSubmit();
  await new Promise(r=>setTimeout(r,3500));
  const txt=(document.querySelector('.main-panel')?.innerText||'').replace(/\\s+/g,' ');
  return JSON.stringify({ booked2020: /2020/.test(txt), sample: txt.slice(0,150) });
`).then(JSON.parse);
record('BOOKING', 'book an appointment dated 2020', 'refused — you cannot attend the past',
  `appearsInList=${r.booked2020} "${r.sample.slice(0,90)}"`,
  r.booked2020 ? 'BUG' : 'PASS', r.booked2020 ? 'a six-year-old booking was accepted' : null);

// --- a real booking, then the same one again immediately
r = await page.evaluate(`
  await window.__go('/owner/home');
  const b=[...document.querySelectorAll('.main-panel button')].find(x=>/book appointment/i.test(x.textContent||''));
  b.click(); await new Promise(r=>setTimeout(r,1800));
  const f=document.querySelector('.main-panel form');
  const d=f.querySelector('input[type=date]'), t=f.querySelector('input[type=time]');
  if(d) window.__setValue(d,'2027-03-15'); if(t) window.__setValue(t,'11:30');
  for (const s of [...f.querySelectorAll('select')]) { const o=[...s.options].find(x=>x.value); if(o){s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));} }
  await new Promise(r=>setTimeout(r,400));
  f.requestSubmit(); f.requestSubmit();           // double-tap
  await new Promise(r=>setTimeout(r,4500));
  await window.__go('/owner/appointments');
  await new Promise(r=>setTimeout(r,2500));
  const txt=(document.querySelector('.main-panel')?.innerText||'');
  return JSON.stringify({ count: (txt.match(/2027-03-15|15 Mar 2027|Mar 15, 2027/g)||[]).length, sample: txt.replace(/\\s+/g,' ').slice(0,160) });
`).then(JSON.parse);
record('BOOKING', 'double-tap Book on the same slot', 'exactly one appointment',
  `occurrences=${r.count} "${r.sample.slice(0,100)}"`,
  r.count <= 1 ? 'PASS' : 'BUG', r.count > 1 ? 'double-tap created duplicates' : null);

console.log('\n=== failures ===');
console.log(JSON.stringify(results.filter(x=>x.verdict==='BUG'), null, 1));
page.close();
