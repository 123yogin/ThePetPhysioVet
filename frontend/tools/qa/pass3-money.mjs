import { call, login, check, summary, created } from './prod.mjs';
const DRPW = process.env.DRPW, TAG = process.env.QA_TAG;
const doc = await login('dr_dhanvi', DRPW);
const T = doc.token;
const pets = await call('/pets', { token:T });
const P = (pets.json||[]).find(p => p.name?.startsWith(TAG))?.id || pets.json?.[0]?.id;

// D5 — totals must be computed server-side, never taken from the client.
let r = await call('/invoices', { method:'POST', token:T, body:{
  pet: P,
  line_items:[{description:'Hydrotherapy session', quantity:2, unit_price:'800.00'}],
  subtotal:'1.00', total:'1.00', tax:'0.00', amount_paid:'9999.00', balance_due:'0.00',
}});
const inv = r.json;
if (inv?.id) created.invoices.push(inv.id);
check('D5a','Q3','client-supplied totals are ignored','subtotal 1600, not the 1.00 sent',
  `status=${r.status} subtotal=${inv?.subtotal} total=${inv?.total}`,
  r.status === 201 && Number(inv?.subtotal) === 1600, 'SEV-1',
  Number(inv?.subtotal) === 1 ? 'CLIENT CAN DICTATE AN INVOICE TOTAL' : null);

check('D5b','Q3','client-supplied amount_paid is ignored','amount_paid 0',
  `amount_paid=${inv?.amount_paid} balance_due=${inv?.balance_due}`,
  Number(inv?.amount_paid) === 0, 'SEV-1',
  Number(inv?.amount_paid) > 0 ? 'AN INVOICE CAN BE BORN PAID' : null);

check('D5c','Q3','tax rate applied by the server','recorded for the GST question',
  `tax=${inv?.tax} on subtotal ${inv?.subtotal}`, true, 'SEV-3',
  `effective rate ${inv?.subtotal ? (Number(inv.tax)/Number(inv.subtotal)*100).toFixed(1) : '?'}% — research says veterinary clinical services are Nil-rated`);

// D4 — payment idempotency (CLAUDE.md rule 6).
const key = 'qa-idem-' + Date.now();
const pay = { amount_paid:'500.00', idempotency_key:key };   // the field is amount_paid
const twice = await Promise.all([
  call(`/invoices/${inv.id}/payments`, { method:'POST', token:T, body:pay }),
  call(`/invoices/${inv.id}/payments`, { method:'POST', token:T, body:pay }),
]);
const after = await call(`/invoices/${inv.id}`, { token:T });
check('D4a','Q3','the same payment key submitted twice in parallel','charged once',
  `statuses=${twice.map(x=>x.status)} amount_paid=${after.json?.amount_paid} payments=${(after.json?.payments||[]).length}`,
  Number(after.json?.amount_paid) === 500, 'SEV-1',
  Number(after.json?.amount_paid) > 500 ? 'DOUBLE CHARGE' : null);

const seq = await call(`/invoices/${inv.id}/payments`, { method:'POST', token:T, body:pay });
const after2 = await call(`/invoices/${inv.id}`, { token:T });
check('D4b','Q3','replaying the same key later','still charged once',
  `status=${seq.status} amount_paid=${after2.json?.amount_paid}`,
  Number(after2.json?.amount_paid) === 500, 'SEV-1');

// Overpayment and negative payment.
r = await call(`/invoices/${inv.id}/payments`, { method:'POST', token:T,
  body:{ amount_paid:'999999.00', idempotency_key:'qa-over-'+Date.now() }});
const over = await call(`/invoices/${inv.id}`, { token:T });
check('D4c','Q3','paying far more than the balance','refused, or balance never negative',
  `status=${r.status} balance_due=${over.json?.balance_due}`,
  r.status >= 400 || Number(over.json?.balance_due) >= 0, 'SEV-2');

r = await call(`/invoices/${inv.id}/payments`, { method:'POST', token:T,
  body:{ amount_paid:'-500.00', idempotency_key:'qa-neg-'+Date.now() }});
check('D4d','Q3','a negative payment','400', `${r.status}`, r.status >= 400, 'SEV-1');

// An owner must not be able to record a payment on their own invoice.
const a = await login(TAG+'a','QaBrutal2026!x');
r = await call(`/invoices/${inv.id}/payments`, { method:'POST', token:a.token,
  body:{ amount_paid:'1000.00', idempotency_key:'qa-owner-'+Date.now() }});
check('D4e','Q3','an owner marks an invoice paid','403/404',
  `${r.status}`, r.status >= 400, 'SEV-1',
  r.status < 400 ? 'OWNER CAN SETTLE THEIR OWN BILL' : null);

console.log(JSON.stringify({ invoice: inv?.id, created }, null, 1));
summary();
