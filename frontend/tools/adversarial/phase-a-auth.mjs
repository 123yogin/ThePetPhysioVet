import { open, login, record, results } from './harness.mjs';
const page = await open();
await page.evaluate(`window.__apiBase='http://10.0.2.2:8000'; return true;`);

// --- A1-A4: login boundary
let r = await login(page, 'dr_dhanvi', 'wrong-password');
record('AUTH', 'wrong password is refused', 'stay on /login with an error',
  `${r.route} err=${JSON.stringify(r.error)}`,
  r.route === '/login' && r.error ? 'PASS' : 'BUG');

r = await login(page, 'DR_DHANVI', 'dhanvi@123');
record('AUTH', 'username case sensitivity', 'documented either way',
  `${r.route} err=${JSON.stringify(r.error)}`, 'NOTE');

r = await login(page, "' OR '1'='1", "' OR '1'='1");
record('AUTH', 'SQL-ish payload in username', 'refused, no crash',
  `${r.route} err=${JSON.stringify(r.error)}`,
  r.route === '/login' && r.error ? 'PASS' : 'BUG');

r = await login(page, '', '');
record('AUTH', 'empty credentials', 'refused',
  `${r.route} err=${JSON.stringify(r.error)}`,
  r.route === '/login' ? 'PASS' : 'BUG');

r = await login(page, 'dr_dhanvi', 'dhanvi@123');
record('AUTH', 'correct doctor login', '/dashboard', r.route,
  r.route === '/dashboard' ? 'PASS' : 'BUG');

// --- A5: does an owner-only route leak to a doctor?
const owner = await page.evaluate(`return await window.__go('/owner/home');`);
record('AUTHZ', 'doctor opening an OWNER route', 'bounced away from /owner/home', owner,
  owner === '/owner/home' ? 'BUG' : 'PASS');

console.log('\n' + JSON.stringify({ results }, null, 1));
page.close();
