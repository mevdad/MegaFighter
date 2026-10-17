// usage: node scripts/clips-audit/sheet.mjs <clip> <out.png> f1,f2,f3...   (позы: AUDIT_POSE_DIR или scripts/clips-audit/pose; временный HTML и PNG по умолчанию в out/)   (рисует боковой вид (Z вправо = вперёд, Y вверх) и вид спереди (X) стик-фигуры по FK FBX)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, '..', '..', 'package.json'));
const { chromium } = require('playwright');
const OUT = process.env.AUDIT_OUT ?? path.join(HERE, 'out');
const POSE = process.env.AUDIT_POSE_DIR ?? path.join(HERE, 'pose');
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
const [clip, outArg, fr] = process.argv.slice(2);
const out = path.isAbsolute(outArg) || outArg.includes('/') ? outArg : path.join(OUT, 'img', outArg);
const frames = fr.split(',').map(Number);
const d = JSON.parse(fs.readFileSync(path.join(POSE, `${clip}.json`)));
const data = { names: d.names, parent: d.parent, pos: frames.map(f => d.pos[f]), frames };
const html = `<html><body style="margin:0;background:#fff"><canvas id=c></canvas><script>
const D=${JSON.stringify(data)};
const cols=D.frames.length, W=190, Hh=230, c=document.getElementById('c'); c.width=cols*W; c.height=Hh*2+20; const g=c.getContext('2d');
g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
// диапазон по всем кадрам: общий масштаб
let mnz=1e9,mxz=-1e9,mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9;
for(const P of D.pos)for(const p of P){mnz=Math.min(mnz,p[2]);mxz=Math.max(mxz,p[2]);mnx=Math.min(mnx,p[0]);mxx=Math.max(mxx,p[0]);mny=Math.min(mny,p[1]);mxy=Math.max(mxy,p[1]);}
const S=Math.min((W-20)/Math.max(mxz-mnz,mxx-mnx,0.6),(Hh-30)/(Math.max(mxy,1.0)-Math.min(mny,0)));
D.pos.forEach((P,k)=>{
 for(let v=0;v<2;v++){
  const ox=k*W+W/2, oy=(v+1)*Hh+(v?20:0)-10;
  const cx=v===0?(mnz+mxz)/2:(mnx+mxx)/2;
  const X=p=>ox+((v===0?p[2]:-p[0])-(v===0?cx:-cx))*S, Y=p=>oy-p[1]*S;
  g.strokeStyle='#bbb';g.beginPath();g.moveTo(k*W+5,oy);g.lineTo(k*W+W-5,oy);g.stroke();
  D.names.forEach((n,i)=>{const pi=D.parent[i];if(pi<0)return;g.strokeStyle=n.includes('Left')?'#1565c0':n.includes('Right')?'#c62828':'#222';g.lineWidth=2;g.beginPath();g.moveTo(X(P[pi]),Y(P[pi]));g.lineTo(X(P[i]),Y(P[i]));g.stroke();});
  const hd=D.names.indexOf('mixamorig:Head');g.fillStyle='#222';g.beginPath();g.arc(X(P[hd]),Y(P[hd]),4,0,7);g.fill();
 }
 g.fillStyle='#000';g.font='12px sans-serif';g.fillText('f'+D.frames[k]+' ('+(D.frames[k]/30).toFixed(2)+'s) side(Z>)',k*W+6,14);g.fillText('front (X, L=blue on right)',k*W+6,Hh+16);
});
</script></body></html>`;
const TMP = path.join(OUT, 'img', '_tmp.html');
fs.writeFileSync(TMP, html);
const executablePath = process.env.CHROMIUM_PATH ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: Math.max(400, frames.length * 190), height: 500 } });
await page.goto('file://' + TMP);
const el = await page.$('#c');
await el.screenshot({ path: out });
await browser.close();
