import { open } from '../brutal/harness.mjs';
const page = await open();
// Poll for the form rather than trusting a fixed sleep — the same mistake this
// session has already made three times.
await page.evaluate(`
  await window.__go('/login');
  for (let i = 0; i < 40; i++) {
    const f = document.querySelectorAll('.auth-shell input');
    if (f.length >= 2) break;
    await new Promise(r => setTimeout(r, 100));
  }
  const i = [...document.querySelectorAll('.auth-shell input')];
  window.__setValue(i[0], 'dr_dhanvi');
  window.__setValue(i[1], 'DoctorPass123!');
  i[0].closest('form').requestSubmit();
  for (let n = 0; n < 60 && location.pathname !== '/dashboard'; n++) {
    await new Promise(r => setTimeout(r, 100));
  }
  return location.pathname;
`);

const routes = [
  ['/patients', 'Patients'],
  ['/invoices', 'Invoices'],
  ['/appointments', 'Appointments (List View)', 'List View'],
];
for (const [route, label, clickFirst] of routes) {
  await page.evaluate(`await window.__go('${route}');`);
  if (clickFirst) await page.evaluate(`
    const b=[...document.querySelectorAll('.main-panel button')].find(x=>x.textContent.trim()==='${clickFirst}');
    if(b){b.click(); await new Promise(r=>setTimeout(r,1800));} return true;`);
  const r = await page.evaluate(`
    const wrap = document.querySelector('.table-wrap');
    if (!wrap) return JSON.stringify({ label:'${label}', table:false });
    const t = wrap.querySelector('table');
    const heads = [...t.querySelectorAll('th')].map(th => ({
      text: th.innerText.trim(),
      right: Math.round(th.getBoundingClientRect().right),
      offscreen: th.getBoundingClientRect().right > innerWidth + 1,
    }));
    const firstRow = t.querySelector('tbody tr');
    const cells = firstRow ? [...firstRow.querySelectorAll('td')].map(td => ({
      w: Math.round(td.getBoundingClientRect().width),
      offscreen: td.getBoundingClientRect().right > innerWidth + 1,
    })) : [];
    return JSON.stringify({
      label: '${label}', table:true, viewport: innerWidth,
      tableWidth: Math.round(t.getBoundingClientRect().width),
      hiddenPx: wrap.scrollWidth - wrap.clientWidth,
      rows: t.querySelectorAll('tbody tr').length,
      columnsOffscreen: heads.filter(h=>h.offscreen).map(h=>h.text),
      heads: heads.map(h=>h.text+'@'+h.right),
      firstRowCellWidths: cells.map(c=>c.w),
    });
  `).then(JSON.parse);
  console.log(JSON.stringify(r, null, 1));
}
page.close();
