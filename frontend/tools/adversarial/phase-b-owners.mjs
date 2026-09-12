import { open, record, results } from './harness.mjs';
const page = await open();
const API = 'http://10.0.2.2:8000/api/v1';

// Mirrors LoginScreen.tsx:64 — the UI derives a username from the email when the
// field is left blank, so a test that omits it is testing the wrong thing.
const signup = (o) => page.evaluate(`
  const body = ${JSON.stringify(o)};
  body.username = body.username || body.email.split('@')[0];
  const res = await fetch('${API}/auth/signup', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  let j=null; try { j = await res.json(); } catch {}
  return JSON.stringify({ status: res.status, detail: (j&&j.detail)||null, access: !!(j&&j.access), username: body.username });
`).then(JSON.parse);

const owners = [
  { first_name:'Asha',  last_name:'Rao',   email:'asha.brutal@example.com',   password:'AshaRehab2026',  phone:'9000000011' },
  { first_name:'Vikram',last_name:'Singh', email:'vikram.brutal@example.com', password:'VikramRehab26',  phone:'9000000012' },
  { first_name:'Neha',  last_name:'Iyer',  email:'neha.brutal@example.com',   password:'NehaRehab2026',  phone:'9000000013' },
];

const created = [];
for (const o of owners) {
  const r = await signup(o);
  created.push({ email:o.email, username:r.username, status:r.status });
  record('SIGNUP', `create owner ${o.first_name}`, '201 + token', `${r.status} token=${r.access}`,
    r.status === 201 && r.access ? 'PASS' : 'BUG', r.detail);
}

let r = await signup(owners[0]);
record('SIGNUP', 'same email twice', '400, no second account', `${r.status} ${r.detail}`,
  r.status === 400 ? 'PASS' : 'BUG');

// Two different people whose emails share a local part both derive the SAME
// username. The second is rejected — but for a reason that names the username,
// a field they were told to leave blank.
r = await signup({ first_name:'Asha', last_name:'Menon', email:'asha.brutal@gmail.com',
                   password:'AshaMenon2026', phone:'9000000015' });
record('SIGNUP', 'different email, colliding derived username',
  'either succeed with a unique username, or explain clearly',
  `${r.status} ${r.detail}`,
  r.status === 201 ? 'PASS' : 'BUG', 'asha.brutal@example.com vs asha.brutal@gmail.com');

r = await signup({ first_name:'<img src=x onerror=alert(1)>', last_name:'X',
                   email:'xss.brutal@example.com', password:'XssRehab2026', phone:'9000000014' });
record('SIGNUP', 'XSS payload as first name', 'accepted but inert', `${r.status}`,
  r.status === 201 ? 'PASS' : 'BUG');

console.log('\n' + JSON.stringify({ created, results: results.filter(x=>x.verdict!=='PASS') }, null, 1));
page.close();
