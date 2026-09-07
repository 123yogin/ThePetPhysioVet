const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(x => x.webSocketDebuggerUrl);
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p={}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({id:i,method:m,params:p})); });
ws.addEventListener('message', e => { const d = JSON.parse(e.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } });
await new Promise(r => ws.addEventListener('open', r));
const ev = async x => (await send('Runtime.evaluate', {expression:x, returnByValue:true, awaitPromise:true})).result?.value;
await send('Page.enable'); await send('Page.reload');
const t0 = Date.now(); const log = [];
for (let i = 0; i < 45; i++) {
  await new Promise(r => setTimeout(r, 80));
  const s = await ev(`(() => {
    const el = document.querySelector('.splash');
    const body = (document.body.innerText||'').replace(/\\s+/g,' ').slice(0,40);
    if (!el) return { gone: true, body };
    const cs = getComputedStyle(el); const img = el.querySelector('img'); const w = el.querySelector('.splash-word');
    return { cls: el.className, bg: cs.backgroundColor, op: cs.opacity,
             imgW: img ? Math.round(img.getBoundingClientRect().width) : null,
             wordOp: w ? Number(getComputedStyle(w).opacity).toFixed(2) : null, body };
  })()`);
  log.push([Date.now()-t0, s]);
}
const first = log.find(([,s]) => s && !s.gone);
const last  = [...log].reverse().find(([,s]) => s && !s.gone);
console.log("splash first seen:", first ? first[0]+"ms" : "NEVER");
console.log("splash last seen :", last ? last[0]+"ms" : "-");
if (first) console.log("visible for      :", (last[0]-first[0])+"ms");
console.log("\nsamples:");
for (const [ms, s] of log.filter((_,i)=>i%4===0))
  console.log(`  ${String(ms).padStart(5)}ms  ${s.gone ? 'no splash  body="'+s.body+'"' : `${s.cls}  img=${s.imgW}px opacity=${s.op} word=${s.wordOp}`}`);
ws.close();
