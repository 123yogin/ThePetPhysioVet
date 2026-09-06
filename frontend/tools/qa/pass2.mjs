import { API, call, login, check, summary, created } from './prod.mjs';
const DRPW = process.env.DRPW, TAG = process.env.QA_TAG;
const doc = await login('dr_dhanvi', DRPW);
const a = await login(TAG + 'a', 'QaBrutal2026!x');
const b = await login(TAG + 'b', 'QaBrutal2026!x');
const T = doc.token, A = a.token;
const mine = await call('/owner/pets', { token: A });
const petA = mine.json?.[0]?.id;

// ---------- C: validation ----------
const C = async (id, name, expected, path, body, ok, sev='SEV-2', token=T, method='POST') => {
  const r = await call(path, { method, token, body });
  return check(id,'Q3',name,expected,`${r.status}${r.detail?' '+r.detail.slice(0,70):''}`, ok(r), sev);
};
await C('C1a','patient with an empty body','400','/pets',{}, r=>r.status===400,'SEV-2');
await C('C1b','patient named only spaces','400','/pets',{name:'   ',owner_name:'X',owner_phone:'9000000001'}, r=>r.status===400);
await C('C2','1000-character patient name','400','/pets',{name:'Z'.repeat(1000),owner_name:'X',owner_phone:'9000000001'}, r=>r.status===400);
await C('C4','invented visit type','400','/owner/appointments',{pet_id:petA,date:'2027-07-01',time:'10:00',visit_type:'Acupuncture'}, r=>r.status===400,'SEV-2',A);
await C('C5','garbage date and time','400','/owner/appointments',{pet_id:petA,date:'not-a-date',time:'99:99',visit_type:'Followup'}, r=>r.status===400,'SEV-2',A);
await C('C6','booking dated 2020','400 — the fix just deployed','/owner/appointments',{pet_id:petA,date:'2020-01-01',time:'10:00',visit_type:'Followup'}, r=>r.status===400,'SEV-1',A);
await C('C6b','omitting the appointment type','400','/owner/appointments',{pet_id:petA,date:'2027-07-02',time:'10:00'}, r=>r.status===400,'SEV-2',A);

const pet = await call('/pets', { method:'POST', token:T, body:{ name:TAG+'DocPet', owner_name:'QA Owner', owner_phone:'9000000099' }});
if (pet.json?.id) created.pets.push(pet.json.id);
const P = pet.json?.id;
await C('C7a','invoice with a negative quantity','400','/invoices',{pet:P,line_items:[{description:'S',quantity:-5,unit_price:'100'}]}, r=>r.status===400,'SEV-1');
await C('C7b','invoice with a negative price','400','/invoices',{pet:P,line_items:[{description:'S',quantity:1,unit_price:'-9999'}]}, r=>r.status===400,'SEV-1');
await C('C8','invoice overflowing the decimal field','400','/invoices',{pet:P,line_items:[{description:'S',quantity:999999999,unit_price:'999999999'}]}, r=>r.status===400,'SEV-1');
await C('C9','invoice with no line items','400','/invoices',{pet:P,line_items:[]}, r=>r.status===400);

const plan = await call(`/pets/${P}/treatment-plans`, { method:'POST', token:T,
  body:{ therapies:['Hydrotherapy'], frequency:'Weekly', duration:'4 Weeks', start_date:'2026-09-06' }});
const PL = plan.json?.id;
if (PL) {
  await C('C10a','pain score of 99','400',`/treatment-plans/${PL}/progress-notes`,{notes:'x',pain_score:99}, r=>r.status===400);
  await C('C10b','lameness grade 9','400',`/treatment-plans/${PL}/progress-notes`,{notes:'x',lameness_score:9}, r=>r.status===400);
  await C('C11','range of motion with no joint','400',`/treatment-plans/${PL}/progress-notes`,{notes:'x',rom_degrees:'120'}, r=>r.status===400);
}

// ---------- D: concurrency ----------
const slot = { pet_id: petA, date:'2027-08-08', time:'14:00', visit_type:'Followup' };
const both = await Promise.all([
  call('/owner/appointments',{method:'POST',token:A,body:slot}),
  call('/owner/appointments',{method:'POST',token:A,body:slot}),
]);
const list = await call('/owner/appointments',{ token:A });
const dupes = (list.json||[]).filter(x=>x.date==='2027-08-08' && String(x.time).startsWith('14:00')).length;
check('D1','Q4','two identical bookings fired in parallel','exactly one appointment',
  `statuses=${both.map(x=>x.status)} rows=${dupes}`, dupes === 1, 'SEV-1',
  dupes > 1 ? 'DUPLICATE BOOKING UNDER RACE' : null);
for (const x of (list.json||[])) if (x.id) created.appointments.push(x.id);

const five = await Promise.all([0,1,2,3,4].map(i =>
  call('/owner/appointments',{method:'POST',token:A,body:{...slot,time:`1${i}:00`}})));
check('D3','Q4','five bookings at once from one owner','all 201',
  `${five.map(x=>x.status)}`, five.every(x=>x.status===201), 'SEV-2');

// ---------- E: deployment surface ----------
const cors = async origin => {
  const res = await fetch(`${API}/auth/login`, { method:'OPTIONS',
    headers:{ Origin:origin, 'Access-Control-Request-Method':'POST', 'Access-Control-Request-Headers':'content-type' }});
  return res.headers.get('access-control-allow-origin');
};
check('E1a','Q5','CORS admits capacitor://localhost','echoed', String(await cors('capacitor://localhost')),
  (await cors('capacitor://localhost')) === 'capacitor://localhost', 'SEV-2');
check('E1b','Q5','CORS admits https://localhost','echoed', String(await cors('https://localhost')),
  (await cors('https://localhost')) === 'https://localhost', 'SEV-2');
check('E1c','Q5','CORS refuses an arbitrary origin','no header', String(await cors('https://evil.example.com')),
  !(await cors('https://evil.example.com')), 'SEV-1');

const e3 = await call('/pets', { method:'POST', token:T, body:{} });
check('E3','Q5','error bodies are RFC-7807','type/title/status/detail',
  `keys=${Object.keys(e3.json||{})}`, ['type','title','status','detail'].every(k=>k in (e3.json||{})), 'SEV-3');

const missing = await call('/pets/00000000-0000-0000-0000-000000000000', { token:T });
const notMine = await call(`/pets/${(await call('/owner/pets',{token:b.token})).json?.[0]?.id}`, { token:T });
check('E4','Q2','404 wording identical for missing and not-yours','same body',
  `missing=${missing.status}:${missing.detail} notMine=${notMine.status}:${notMine.detail}`,
  missing.detail === notMine.detail, 'SEV-2');

console.log(JSON.stringify({ created }, null, 1));
summary();
