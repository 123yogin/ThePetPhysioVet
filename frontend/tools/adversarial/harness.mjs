// Adversarial test harness. Drives the real app in the emulator over CDP and
// records what the product ACTUALLY did, not what it should have done.
import { connect } from '../drive.mjs';

export const results = [];
export function record(phase, name, expected, actual, verdict, detail) {
  results.push({ phase, name, expected, actual, verdict, detail });
  const mark = verdict === 'PASS' ? 'ok  ' : verdict === 'BUG' ? 'BUG ' : 'note';
  console.log(`${mark} [${phase}] ${name}${verdict === 'PASS' ? '' : `  — got: ${actual}`}`);
}

export async function open() {
  const page = await connect();
  await page.evaluate(`
    window.__setValue = (el, v) => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    window.__go = async (p) => {
      history.pushState({}, '', p);
      dispatchEvent(new PopStateEvent('popstate'));
      await new Promise(r => setTimeout(r, 1800));
      return location.pathname;
    };
    // Speaks to the API exactly as the app does — same base, same bearer token.
    window.__api = async (path, opts = {}) => {
      const base = document.querySelector('meta[name="api-base"]')?.content ?? '';
      const t = window.__token;
      const res = await fetch((base || window.__apiBase) + '/api/v1' + path, {
        method: opts.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      let json = null;
      try { json = await res.json(); } catch {}
      return { status: res.status, json };
    };
    return true;
  `);
  return page;
}

export async function login(page, username, password) {
  return page.evaluate(`
    await window.__go('/login');
    const i = [...document.querySelectorAll('.auth-shell input')];
    window.__setValue(i[0], ${JSON.stringify(username)});
    window.__setValue(i[1], ${JSON.stringify(password)});
    i[0].closest('form').requestSubmit();
    await new Promise(r => setTimeout(r, 3500));
    const err = document.querySelector('.auth-shell .alert-danger');
    return JSON.stringify({ route: location.pathname, error: err ? err.innerText.trim() : null });
  `).then(JSON.parse);
}
