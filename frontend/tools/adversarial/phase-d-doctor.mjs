import { open, record, results } from './harness.mjs';
const page = await open();
const API = 'http://10.0.2.2:8000/api/v1';

const tok = await page.evaluate(`
  const r = await fetch('${API}/auth/login', {method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({username:'dr_dhanvi',password:'dhanvi@123'})});
  return (await r.json()).access || '';`);

const call = (path, opts = {}) => page.evaluate(`
  const res = await fetch('${API}${path}', {
    method: ${JSON.stringify(opts.method || 'GET')},
    headers: {'Content-Type':'application/json', Authorization:'Bearer ${tok}'},
    ${opts.body !== undefined ? `body: JSON.stringify(${JSON.stringify(opts.body)}),` : ''}
  });
  let j=null; try { j = await res.json(); } catch {}
  return JSON.stringify({ status: res.status, detail: (j&&j.detail)||null, id: (j&&j.id)||null });
`).then(JSON.parse);

const P = (name, expected, r, ok, note) =>
  record('DOCTOR', name, expected, `${r.status}${r.detail ? ' ' + r.detail.slice(0,90) : ''}`, ok ? 'PASS' : 'BUG', note);

// --- patients
let r = await call('/pets', { method:'POST', body:{} });
P('patient with empty body', '400', r, r.status === 400);

r = await call('/pets', { method:'POST', body:{ name:'   ', owner_name:'X', owner_phone:'9000000001' } });
P('patient named only spaces', '400 — whitespace is not a name', r, r.status === 400);

r = await call('/pets', { method:'POST', body:{ name:'Z'.repeat(1000), owner_name:'X', owner_phone:'9000000001' } });
P('1000-char patient name', '400 (max_length enforced)', r, r.status === 400);

r = await call('/pets', { method:'POST', body:{ name:'<script>alert(1)</script>', owner_name:'X', owner_phone:'9000000001' } });
P('script tag as patient name', 'stored inert or rejected', r, r.status === 201 || r.status === 400);

r = await call('/pets', { method:'POST', body:{ name:'BrutalPatient', owner_name:'Asha Rao', owner_phone:'9000000011' } });
P('valid patient', '201', r, r.status === 201);
const petId = r.id;

// --- appointments
r = await call('/appointments', { method:'POST', body:{ pet: petId, date:'1990-01-01', time:'10:00', visit_type:'FOLLOW_UP' } });
P('appointment in 1990', 'rejected, or accepted deliberately', r, r.status === 400, r.status===201?'accepted a 36-year-old booking':null);

r = await call('/appointments', { method:'POST', body:{ pet: petId, date:'2026-12-01', time:'10:00', visit_type:'NOT_A_REAL_TYPE' } });
P('invented visit_type', '400', r, r.status === 400);

r = await call('/appointments', { method:'POST', body:{ pet: petId, date:'not-a-date', time:'99:99', visit_type:'FOLLOW_UP' } });
P('garbage date and time', '400', r, r.status === 400);

// --- invoices
r = await call('/invoices', { method:'POST', body:{ pet: petId, line_items:[{description:'Session', quantity:-5, unit_price:'100'}] } });
P('invoice with negative quantity', '400 — must not create a credit', r, r.status === 400);

r = await call('/invoices', { method:'POST', body:{ pet: petId, line_items:[{description:'Session', quantity:1, unit_price:'-9999'}] } });
P('invoice with negative price', '400', r, r.status === 400);

r = await call('/invoices', { method:'POST', body:{ pet: petId, line_items:[{description:'Session', quantity:999999999, unit_price:'999999999'}] } });
P('invoice overflowing the decimal field', '400, not a silent wrong total', r, r.status === 400);

r = await call('/invoices', { method:'POST', body:{ pet: petId, line_items:[] } });
P('invoice with no line items', '400', r, r.status === 400);

// --- treatment plan + the new outcome measures
r = await call(`/pets/${petId}/treatment-plans`, { method:'POST',
  body:{ therapies:['Hydrotherapy'], frequency:'Weekly', duration:'4 Weeks', start_date:'2026-09-06' } });
P('valid treatment plan', '201', r, r.status === 201);
const planId = r.id;

if (planId) {
  r = await call(`/treatment-plans/${planId}/progress-notes`, { method:'POST', body:{ notes:'ok', pain_score: 99 } });
  P('pain score of 99', '400 (scale is 0-10)', r, r.status === 400);

  r = await call(`/treatment-plans/${planId}/progress-notes`, { method:'POST', body:{ notes:'ok', pain_score: -3 } });
  P('negative pain score', '400', r, r.status === 400);

  r = await call(`/treatment-plans/${planId}/progress-notes`, { method:'POST', body:{ notes:'ok', rom_degrees:'120' } });
  P('range of motion with no joint', '400', r, r.status === 400);

  r = await call(`/treatment-plans/${planId}/progress-notes`, { method:'POST', body:{ notes:'ok', lameness_score: 9 } });
  P('lameness grade 9 (scale is 0-4)', '400', r, r.status === 400);

  r = await call(`/treatment-plans/${planId}/progress-notes`, { method:'POST', body:{ notes:'' } });
  P('progress note with empty text', '400', r, r.status === 400);
}

console.log('\n=== failures ===');
console.log(JSON.stringify(results.filter(x => x.verdict === 'BUG'), null, 1));
page.close();
