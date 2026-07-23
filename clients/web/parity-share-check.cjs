// Standalone share-screen parity check (share is excluded from the main harness).
const { chromium } = require("playwright");
const { PNG } = require("playwright-core/lib/utilsBundle");
const fs = require("node:fs");
const path = require("node:path");
const DJANGO = "http://127.0.0.1:8000", REACT = "http://127.0.0.1:5173";
const OUT = path.resolve("parity-shots/s2-r1");
const VIEWPORT = { width: 1280, height: 800 };
const NEUTRALIZE_CSS = `*,*::before,*::after{caret-color:transparent!important}*{transition:none!important;animation:none!important}`;
function rgb2y(r,g,b){return r*0.29889531+g*0.58662247+b*0.11448223;}
function rgb2i(r,g,b){return r*0.59597799-g*0.2741761-b*0.32180189;}
function rgb2q(r,g,b){return r*0.21147017-g*0.52261711+b*0.31114694;}
function blend(c,a){return 255+(c-255)*a;}
function colorDelta(a,b,ai,bi){let ar=a[ai],ag=a[ai+1],ab=a[ai+2],aa=a[ai+3],br=b[bi],bg=b[bi+1],bb=b[bi+2],ba=b[bi+3];if(aa<255){aa/=255;ar=blend(ar,aa);ag=blend(ag,aa);ab=blend(ab,aa);}if(ba<255){ba/=255;br=blend(br,ba);bg=blend(bg,ba);bb=blend(bb,ba);}const y=rgb2y(ar,ag,ab)-rgb2y(br,bg,bb),i=rgb2i(ar,ag,ab)-rgb2i(br,bg,bb),q=rgb2q(ar,ag,ab)-rgb2q(br,bg,bb);return 0.5053*y*y+0.299*i*i+0.1957*q*q;}
function diffImages(aBuf,bBuf){const a=PNG.sync.read(aBuf),b=PNG.sync.read(bBuf);const w=Math.min(a.width,b.width),h=Math.min(a.height,b.height);const maxDelta=35215*0.1*0.1;let diff=0;const total=Math.max(a.width,b.width)*Math.max(a.height,b.height);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const ai=(a.width*y+x)*4,bi=(b.width*y+x)*4;if(colorDelta(a.data,b.data,ai,bi)>maxDelta)diff++;}const dimsMatch=a.width===b.width&&a.height===b.height;return{diffPixels:diff,ratio:diff/total,dimsMatch,aDims:`${a.width}x${a.height}`,bDims:`${b.width}x${b.height}`};}
async function prep(p){try{await p.evaluate(()=>document.fonts&&document.fonts.ready);}catch{}await p.addStyleTag({content:NEUTRALIZE_CSS});await p.waitForTimeout(250);}
(async()=>{
  const browser=await chromium.launch();
  const react=await browser.newContext({viewport:VIEWPORT,colorScheme:"light",reducedMotion:"reduce"});
  const dj=await browser.newContext({viewport:VIEWPORT,colorScheme:"light",reducedMotion:"reduce"});
  let p=await dj.newPage();await p.goto(`${DJANGO}/login/`,{waitUntil:"networkidle"});await p.fill("#id_username","drmeadow");await p.fill("#id_password","MeadowPhysio!2026");await Promise.all([p.waitForNavigation({waitUntil:"networkidle"}),p.click('button[type=submit]')]);await p.close();
  p=await react.newPage();await p.goto(`${REACT}/login`,{waitUntil:"networkidle"});await p.fill("#id_username","drmeadow");await p.fill("#id_password","MeadowPhysio!2026");await Promise.all([p.waitForURL("**/dashboard",{waitUntil:"networkidle"}),p.click('button[type=submit]')]);await p.close();
  const dp=await dj.newPage();await dp.goto(`${DJANGO}/appointments/1/share/`,{waitUntil:"networkidle"});await prep(dp);const djBuf=await dp.screenshot({clip:{x:0,y:0,...VIEWPORT}});fs.writeFileSync(path.join(OUT,"share.django.png"),djBuf);await dp.close();
  const rp=await react.newPage();await rp.goto(`${REACT}/appointments/1/share`,{waitUntil:"networkidle"});await rp.waitForTimeout(300);await prep(rp);const rtBuf=await rp.screenshot({clip:{x:0,y:0,...VIEWPORT}});fs.writeFileSync(path.join(OUT,"share.react.png"),rtBuf);await rp.close();
  const d=diffImages(djBuf,rtBuf);const pass=d.dimsMatch&&d.ratio<=0.001;
  console.log(`${pass?"PASS":"FAIL"} share  diffPixels=${d.diffPixels} ratio=${d.ratio.toFixed(6)} dims a=${d.aDims} b=${d.bDims}`);
  await browser.close();process.exit(pass?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
