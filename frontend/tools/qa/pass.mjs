import { API, call, login, signupOwner, check, summary, findings, created } from './prod.mjs';

const DRPW = process.env.DRPW;
const stamp = process.env.QA_TAG || ('qa' + String(Date.now()).slice(-6));

// ---------- A: authentication ----------
let r = await login('dr_dhanvi', 'definitely-not-the-password');
check('A1','Q1','wrong password refused','401', `${r.status}`, r.status === 401, 'SEV-1');
r = await login('', '');
check('A2','Q1','empty credentials refused','400/401', `${r.status}`, r.status >= 400, 'SEV-1');
r = await login("' OR '1'='1", "' OR '1'='1");
check('A3','Q1','SQL-ish payload refused','401', `${r.status}`, r.status === 401, 'SEV-1');

const doc = await login('dr_dhanvi', DRPW);
check('A4','Q1','doctor signs in','200 + DOCTOR token', `${doc.status} role=${doc.role} token=${!!doc.token}`,
  doc.status === 200 && !!doc.token && doc.role === 'DOCTOR', 'SEV-1');

r = await call('/auth/refresh', { method:'POST', body:{ refresh: doc.refresh } });
check('A5','Q1','refresh rotates both tokens','new access AND refresh',
  `${r.status} access=${!!r.json?.access} refresh=${!!r.json?.refresh}`,
  r.status === 200 && !!r.json?.access && !!r.json?.refresh, 'SEV-2');

r = await call('/pets', { token: (doc.token||'').slice(0,-6)+'AAAAAA' });
check('A6','Q1','tampered token rejected','401', `${r.status}`, r.status === 401, 'SEV-1');

r = await call('/auth/password-reset/request', { method:'POST', body:{ email:'definitely-not-a-user@nowhere.invalid' }});
const unknown = { s: r.status, b: r.text.slice(0,200) };
r = await call('/auth/password-reset/request', { method:'POST', body:{ email:'parmaryogin04@gmail.com' }});
check('A8','Q1','password reset does not reveal whether an account exists','identical response',
  `unknown=${unknown.s} known=${r.status} same=${unknown.b === r.text.slice(0,200)}`,
  unknown.s === r.status && unknown.b === r.text.slice(0,200), 'SEV-2');

// ---------- two owners for the boundary work ----------
const a = await signupOwner(stamp + 'a');
const b = await signupOwner(stamp + 'b');
check('S1','Q2','two QA owners created','201 each', `${a.status}/${b.status} ${a.detail||''}`,
  a.status === 201 && b.status === 201, 'SEV-2');
if (!a.token || !b.token) { summary(); process.exit(0); }

const mk = (tok, name) => call('/owner/pets', { method:'POST', token: tok,
  body: { name, species:'Dog', breed:'Labrador', age:'3', sex:'Male' } });
const pa = await mk(a.token, stamp + 'PetA');
const pb = await mk(b.token, stamp + 'PetB');
if (pa.json?.id) created.pets.push(pa.json.id);
if (pb.json?.id) created.pets.push(pb.json.id);
check('S2','Q2','each owner has a pet','201 each', `${pa.status}/${pb.status}`,
  pa.status === 201 && pb.status === 201, 'SEV-2');

// ---------- B: authorisation ----------
const victim = pb.json?.id;
r = await call(`/owner/pets/${victim}`, { token: a.token });
check('B1','Q2',"owner A reads owner B's pet",'404 (never 403 — existence must not leak)',
  `${r.status}`, r.status === 404, 'SEV-1',
  r.status === 200 ? 'CROSS-OWNER DATA EXPOSURE' : r.status === 403 ? '403 confirms the record exists' : null);

r = await call(`/owner/pets/${victim}/queries`, { token: a.token });
check('B3','Q2',"owner A reads owner B's messages",'404', `${r.status}`, r.status === 404, 'SEV-1');

r = await call('/owner/appointments', { method:'POST', token: a.token,
  body:{ pet_id: victim, date:'2027-06-01', time:'10:00', visit_type:'Followup' }});
check('B4','Q2',"owner A books against owner B's pet",'4xx', `${r.status}`, r.status >= 400, 'SEV-1');

for (const [id, path, label] of [['B5','/pets','doctor patient roster'],
                                 ['B6','/dashboard/stats','dashboard stats'],
                                 ['B7','/revenue','clinic revenue'],
                                 ['B8','/enquiries','enquiry inbox']]) {
  const rr = await call(path, { token: a.token });
  check(id,'Q2',`owner reaches the ${label}`,'403/404', `${rr.status}`, rr.status !== 200, 'SEV-1');
}

r = await call('/auth/profile', { method:'PATCH', token: a.token, body:{ role:'DOCTOR' }});
const after = await call('/auth/me', { token: a.token });
check('B9','Q2','owner escalates their own role to DOCTOR','role stays OWNER',
  `patch=${r.status} role_now=${after.json?.role}`, after.json?.role === 'OWNER', 'SEV-1',
  after.json?.role === 'DOCTOR' ? 'PRIVILEGE ESCALATION' : null);

for (const [id, path] of [['B10a','/pets'],['B10b','/owner/pets'],['B10c','/revenue'],['B10d','/dashboard/stats']]) {
  const rr = await call(path);
  check(id,'Q2',`unauthenticated ${path}`,'401', `${rr.status}`, rr.status === 401, 'SEV-1');
}

console.log(JSON.stringify({ stamp, created }, null, 1));
summary();
