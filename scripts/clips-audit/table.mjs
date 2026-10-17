// usage: node scripts/clips-audit/table.mjs [frames.json]   (по умолчанию out/frames.json от shoot.mjs, иначе эталон frames.json рядом со скриптом)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.AUDIT_OUT ?? path.join(HERE, 'out');
const cand = [process.argv[2], path.join(OUT, 'shoot', 'frames.json'), path.join(HERE, 'frames.json')].filter(Boolean);
const framesPath = cand.find((p) => fs.existsSync(p));
console.error('frames:', framesPath);
const d=JSON.parse(fs.readFileSync(framesPath));
const f2=x=>x.toFixed(2).padStart(6);
// bones in world coords (game x = world x since fighter.x=0, facing +1 -> model +Z maps to +X)
console.log('frame t(s)  | hipsDX f0 f06 f10 | LankleDX  f0 f06 f10 | LankleY f0 f10 | LtoeDX f0 f06 f10 | RankleDX f0 f06 f10 | RankleY f0 f10');
for(let n=0;n<=42;n++){
 const r=k=>d[k][n];
 console.log(String(n).padStart(2),r('f0').clipT.toFixed(3),'|',['f0','f06','f10'].map(k=>f2(r(k).hips[0])).join(' '),'|',['f0','f06','f10'].map(k=>f2(r(k).lf[0])).join(' '),'|',f2(r('f0').lf[1]),f2(r('f10').lf[1]),'|',['f0','f06','f10'].map(k=>f2(r(k).lt[0])).join(' '),'|',['f0','f06','f10'].map(k=>f2(r(k).rf[0])).join(' '),'|',f2(r('f0').rf[1]),f2(r('f10').rf[1]));
}
const fe=d.f0[0].frontEdge;console.log('hurtbox front edge dx',fe);
for(const k of ['f0','f06','f10']){
 const rows=d[k];const mx=(key,i)=>rows.reduce((b,r)=>r[key][i]>b[key][i]?r:b,rows[0]);
 const pk=mx('lf',0);const pkh=mx('hips',0);
 console.log(k,'L ankle max dx',pk.lf[0],'@frame',pk.n,'t',pk.clipT.toFixed(3),'y',pk.lf[1],'| L toe max dx',mx('lt',0).lt[0],'| hips max dx',pkh.hips[0],'@',pkh.n,'| R(support) ankle dx first',rows[0].rf[0],'min',Math.min(...rows.map(r=>r.rf[0])),'max',Math.max(...rows.map(r=>r.rf[0])),'| frames where L ankle dx > hurtbox front edge:',rows.filter(r=>r.lf[0]>fe).length);
 const sl=[];for(let i=1;i<rows.length;i++)sl.push(Math.abs(rows[i].rf[0]-rows[i-1].rf[0]));console.log('   support(R) ankle max per-tick slide',Math.max(...sl).toFixed(3),'| R ankle y min/max',Math.min(...rows.map(r=>r.rf[1])).toFixed(3),Math.max(...rows.map(r=>r.rf[1])).toFixed(3),'| hips y',rows[0].hips[1],Math.min(...rows.map(r=>r.hips[1])));
}
// active frames: any foot/toe inside hitbox rect? hitbox center 1.0608 w .9984 -> x 0.5616..1.5600, y .. center 1.18, h .46 -> .95..1.41
for(const k of ['f0','f06','f10']){
 const inbox=(p)=>p[0]>=0.5616&&p[0]<=1.56&&p[1]>=0.95&&p[1]<=1.41;
 console.log(k,'active frames 14..17: L ankle',d[k].slice(14,18).map(r=>`(${r.lf[0].toFixed(2)},${r.lf[1].toFixed(2)})${inbox(r.lf)?'IN':'out'}`).join(' '),'toe',d[k].slice(14,18).map(r=>`(${r.lt[0].toFixed(2)},${r.lt[1].toFixed(2)})${inbox(r.lt)?'IN':'out'}`).join(' '));
}
