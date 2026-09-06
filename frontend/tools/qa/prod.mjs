// Production QA harness. Talks to the live API exactly as the app does.
// Every identity it creates is prefixed `qa` and its id recorded for cleanup.
export const API = 'https://petphysio.vercel.app/api/v1';
export const findings = [];
export const created = { users: [], pets: [], appointments: [], invoices: [] };

export function check(id, question, name, expected, actual, ok, sev = 'SEV-2', note) {
  const verdict = ok ? 'PASS' : 'FAIL';
  findings.push({ id, question, name, expected, actual, verdict, sev, note });
  if (!ok) console.log(`FAIL ${id} [${sev}] ${name}\n       expected: ${expected}\n       actual:   ${actual}`);
  else console.log(`ok   ${id} ${name}`);
  return ok;
}

export async function call(path, opts = {}, attempt = 1) {
  try {
    return await _call(path, opts);
  } catch (e) {
    // Vercel cold start / Neon resume can time out the first read.
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 2000 * attempt));
      return call(path, opts, attempt + 1);
    }
    return { status: 0, json: null, text: String(e), detail: 'network: ' + String(e) };
  }
}

async function _call(path, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, detail: json?.detail ?? null };
}

export async function login(username, password) {
  const r = await call('/auth/login', { method: 'POST', body: { username, password } });
  return { status: r.status, token: r.json?.access, refresh: r.json?.refresh, role: r.json?.role, detail: r.detail };
}

export async function signupOwner(tag) {
  const email = `${tag}@qa.petphysiovet.invalid`;
  const body = { first_name: tag, last_name: 'QA', email, phone: '9' + String(Date.now()).slice(-9),
                 password: 'QaBrutal2026!x', username: tag };
  const r = await call('/auth/signup', { method: 'POST', body });
  if (r.status === 201) created.users.push(tag);
  return { status: r.status, token: r.json?.access, username: tag, email, password: body.password, detail: r.detail };
}

export function summary() {
  const fails = findings.filter(f => f.verdict === 'FAIL');
  const bySev = s => fails.filter(f => f.sev === s).length;
  console.log(`\n=== ${findings.length} checks · ${fails.length} failures `
    + `(SEV-1 ${bySev('SEV-1')}, SEV-2 ${bySev('SEV-2')}, SEV-3 ${bySev('SEV-3')}) ===`);
  for (const f of fails) console.log(`  ${f.sev} ${f.id} ${f.name} — ${f.actual}`);
  return fails;
}
