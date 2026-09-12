const [user, pass] = [process.argv[2], process.argv[3]];
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(x => x.webSocketDebuggerUrl);
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id=0; const p=new Map();
const send=(m,pr={})=>new Promise(r=>{const i=++id;p.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:pr}));});
ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id&&p.has(d.id)){p.get(d.id)(d.result);p.delete(d.id);}});
await new Promise(r=>ws.addEventListener('open',r));
const ev=async x=>(await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true})).result?.value;

const out = await ev(`(async () => {
  const R=[]; const ok=(i,n,pa,no)=>R.push({i,n,pa:!!pa,no:no??''});
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=(fn,ms=30000)=>new Promise(res=>{const d=Date.now()+ms;
    (function q(){let v;try{v=fn();}catch(e){v=null;}
      if(v)return res(v);if(Date.now()>d)return res(null);setTimeout(q,150);})();});
  const setV=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);
    el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
  const tap=el=>{el.scrollIntoView({block:'center'});
    el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));el.click();};
  let _l=-1,_s=0;
  const settled=r=>{ if(!location.pathname.includes('/'+r))return false;
    if(!document.querySelector('h1,h2,.page-title'))return false;
    if(document.querySelector('.app-booting,.skeleton'))return false;
    if(/Loading/i.test(document.body.innerText))return false;
    const n=document.body.innerText.length;
    if(n===_l){_s++;}else{_s=0;_l=n;} return _s>=2; };
  async function drawer(){ if(document.body.classList.contains('sidebar-open'))return true;
    for(const c of [...document.querySelectorAll('button,[role=button]')]){tap(c);await sleep(300);
      if(document.body.classList.contains('sidebar-open'))return true;} return false; }
  async function go(route,label){ let l=document.querySelector('a[href$="/'+route+'"]');
    if(!l){await drawer();l=await wait(()=>document.querySelector('a[href$="/'+route+'"]'),5000);}
    if(!l){ok(label,label+' reachable',false,'no nav link');return false;}
    tap(l); const a=await wait(()=>settled(route));
    ok(label,label+' renders with its data',!!a,(document.querySelector('h1,h2,.page-title')||{}).textContent);
    await sleep(500); return !!a; }

  const u=await wait(()=>document.querySelector('#username, input[name=username]'));
  if(!u){ok('X','login form',false);return R;}
  setV(u, ${JSON.stringify(user)});
  setV(document.querySelector('#password, input[type=password]'), ${JSON.stringify(pass)});
  tap(document.querySelector('form button[type=submit]'));
  const landed=await wait(()=>/owner/.test(location.pathname)&&document.querySelector('.sidebar'));
  ok('O1','owner signs in and lands in the owner portal',!!landed,location.pathname);
  if(!landed)return R;
  await wait(()=>settled('owner/home'));

  const body=()=>document.body.innerText.replace(/\\s+/g,' ');
  ok('O2','their pet is listed by name',/Biscuit/.test(body()),(body().match(/Biscuit[^|]{0,40}/)||[''])[0].trim());
  ok('O3','the breed shows, not a placeholder',/Indie/.test(body()),'Indie');
  const raw=()=>(document.body.textContent||'').replace(/\\s+/g,' ');
  ok('O4','no raw enum leaks to the owner',!/PARTIALLY_PAID|IN_PROGRESS|Followup|XRAY/.test(raw()),
     (raw().match(/PARTIALLY_PAID|IN_PROGRESS|Followup|XRAY/)||[''])[0]);

  await go('owner/appointments','owner-appointments');
  ok('O5','their booked visit appears',/21 Sep|Sep 21|2026-09-21|11:30/.test(body()),
     (body().match(/[^|]{0,30}(?:21 Sep|Sep 21|11:30)[^|]{0,20}/)||[''])[0].trim());
  ok('O6','the visit type reads in plain English',/Follow-?up/i.test(body()),
     (body().match(/Follow-?up[^|]{0,20}/i)||[''])[0]);

  await go('owner/billing','owner-billing');
  ok('O7','their invoice appears',/INV-2026-001/.test(body()),(body().match(/INV-[0-9-]+/)||[''])[0]);
  ok('O8','the total is shown correctly (2272.50)',/2,?272\\.50/.test(body()),
     (body().match(/[₹Rs.]*\\s?2,?272\\.50/)||[''])[0]);
  const vd=[...document.querySelectorAll('a,button')].find(e=>/view details/i.test(e.textContent||''));
  ok('O9a','the invoice opens its detail',!!vd,'View details');
  if(vd){ tap(vd);
    // Waiting for 'INV-' was satisfied before the click — the list already
    // shows it — so the wait returned instantly and read a collapsed panel.
    // Wait for something only the expanded detail renders.
    await wait(()=>/Subtotal/i.test(document.body.innerText)&&/Balance Due/i.test(document.body.innerText));
    await sleep(800);
    ok('O9','GST appears on the invoice detail',/22\\.50/.test(body()),(body().match(/[^ ]*22\\.50/)||[''])[0]); }

  const leaked=['/patients','/revenue','/invoices','/enquiries','/dashboard']
    .filter(h=>!!document.querySelector('a[href$="'+h+'"]'));
  ok('O10','no doctor route offered in the owner nav',leaked.length===0,leaked.join(' '));

  // try to reach a doctor route directly
  history.pushState({},'','/dashboard'); dispatchEvent(new PopStateEvent('popstate'));
  await sleep(2500);
  ok('O11','typing a doctor URL does not show the clinic dashboard',
     !/Clinic Dashboard/.test(body()),location.pathname+' -> '+(document.querySelector('h1,h2')||{}).textContent);
  return R;
})()`);

const rows = out ?? [];
for (const r of rows) console.log(`${r.pa?'ok  ':'FAIL'} ${String(r.i).padEnd(5)} ${r.n}${r.no?'  ['+r.no+']':''}`);
console.log(`\n${rows.length} checks, ${rows.filter(r=>!r.pa).length} failed`);
ws.close();
