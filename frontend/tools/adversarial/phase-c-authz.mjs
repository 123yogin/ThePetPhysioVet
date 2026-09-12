import { open, record, results } from './harness.mjs';
const page = await open();
const API = 'http://10.0.2.2:8000/api/v1';

const call = (token, path, opts = {}) => page.evaluate(`
  const res = await fetch('${API}${path}', {
    method: ${JSON.stringify(opts.method || 'GET')},
    headers: { 'Content-Type':'application/json' ${token ? `, Authorization:'Bearer ${token}'` : ''} },
    ${opts.body ? `body: JSON.stringify(${JSON.stringify(opts.body)}),` : ''}
  });
  let j=null; try { j = await res.json(); } catch {}
  return JSON.stringify({ status: res.status, detail: (j&&j.detail)||null, id: (j&&j.id)||null });
`).then(JSON.parse);

const tokenFor = (u, p) => page.evaluate(`
  const res = await fetch('${API}/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({username:${JSON.stringify(u)}, password:${JSON.stringify(p)}}) });
  const j = await res.json();
  return j.access || '';
`);

const asha = await tokenFor('asha.brutal', 'AshaRehab2026');
const vikram = await tokenFor('vikram.brutal', 'VikramRehab26');
const doctor = await tokenFor('dr_dhanvi', 'dhanvi@123');
record('SETUP', 'tokens issued for 2 owners + doctor', 'all non-empty',
  `asha=${!!asha} vikram=${!!vikram} doctor=${!!doctor}`,
  asha && vikram && doctor ? 'PASS' : 'BUG');

// Each owner gets a pet.
const mk = async (tok, name) => (await call(tok, '/owner/pets', { method:'POST',
  body: { name, species:'Dog', breed:'Labrador', age:'3', sex:'Male' } }));
const aPet = await mk(asha, 'AshaDog');
const vPet = await mk(vikram, 'VikramDog');
record('SETUP', 'each owner creates a pet', '201 each', `${aPet.status}/${vPet.status}`,
  aPet.status === 201 && vPet.status === 201 ? 'PASS' : 'BUG', aPet.detail || vPet.detail);

const aId = aPet.id;
const vId = vPet.id;

// --- THE boundary: owner A reaching owner B's pet.
let r = await call(asha, `/owner/pets/${vId}`);
record('AUTHZ', "owner A reads owner B's pet", '404 (never 403 — existence must not leak)',
  `${r.status} ${r.detail}`, r.status === 404 ? 'PASS' : r.status === 200 ? 'BUG' : 'NOTE');

r = await call(asha, `/owner/pets/${vId}/history`);
record('AUTHZ', "owner A reads owner B's clinical history", '404',
  `${r.status}`, r.status === 404 ? 'PASS' : r.status === 200 ? 'BUG' : 'NOTE');

r = await call(asha, `/owner/pets/${vId}/queries`);
record('AUTHZ', "owner A reads owner B's messages", '404',
  `${r.status}`, r.status === 404 ? 'PASS' : r.status === 200 ? 'BUG' : 'NOTE');

// Book against someone else's pet — the exact defect CLAUDE.md records fixing.
r = await call(asha, '/owner/appointments', { method:'POST',
  body: { pet_id: vId, date:'2026-12-01', time:'10:00', visit_type:'FOLLOW_UP' } });
record('AUTHZ', "owner A books against owner B's pet", '4xx, no appointment created',
  `${r.status} ${r.detail}`, r.status >= 400 ? 'PASS' : 'BUG');

// --- role separation
r = await call(asha, '/pets');
record('AUTHZ', 'owner hits the DOCTOR patient list', '403/404, never the roster',
  `${r.status}`, r.status === 200 ? 'BUG' : 'PASS');

r = await call(asha, '/dashboard/stats');
record('AUTHZ', 'owner hits doctor dashboard stats', '403/404',
  `${r.status}`, r.status === 200 ? 'BUG' : 'PASS');

r = await call(asha, '/revenue');
record('AUTHZ', 'owner hits clinic revenue', '403/404 — financials must not leak',
  `${r.status}`, r.status === 200 ? 'BUG' : 'PASS');

r = await call(asha, '/enquiries');
record('AUTHZ', 'owner hits the enquiry inbox (other clinics leads)', '403/404',
  `${r.status}`, r.status === 200 ? 'BUG' : 'PASS');

// --- token integrity
r = await call('', '/owner/pets');
record('AUTHZ', 'no token at all', '401', `${r.status}`, r.status === 401 ? 'PASS' : 'BUG');

r = await call(asha.slice(0, -6) + 'AAAAAA', '/owner/pets');
record('AUTHZ', 'tampered signature', '401', `${r.status}`, r.status === 401 ? 'PASS' : 'BUG');

r = await call('Bearer', '/owner/pets');
record('AUTHZ', 'garbage token', '401', `${r.status}`, r.status === 401 ? 'PASS' : 'BUG');

console.log('\n--- ids ---', JSON.stringify({ aId, vId }));
console.log(JSON.stringify(results.filter(x => x.verdict !== 'PASS'), null, 1));
page.close();
