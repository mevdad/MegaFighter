import fs from 'node:fs';
const f=process.argv[2];
const b=fs.readFileSync(f);
const jl=b.readUInt32LE(12);
const json=JSON.parse(b.slice(20,20+jl).toString());
const bin=b.slice(20+jl+8);
const CT={5126:Float32Array,5123:Uint16Array,5121:Uint8Array};
const NC={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function acc(i){const a=json.accessors[i];const bv=json.bufferViews[a.bufferView];const n=NC[a.type];
 const off=(bv.byteOffset||0)+(a.byteOffset||0);const C=CT[a.componentType];
 const buf=new Uint8Array(bin.buffer,bin.byteOffset+off,a.count*n*C.BYTES_PER_ELEMENT).slice();
 return {d:new C(buf.buffer),n,count:a.count};}
// mat4 column-major
const I=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function mul(a,b){const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
function trs(t=[0,0,0],q=[0,0,0,1],s=[1,1,1]){const [x,y,z,w]=q;const m=I();
 m[0]=(1-2*(y*y+z*z))*s[0];m[1]=(2*(x*y+z*w))*s[0];m[2]=(2*(x*z-y*w))*s[0];
 m[4]=(2*(x*y-z*w))*s[1];m[5]=(1-2*(x*x+z*z))*s[1];m[6]=(2*(y*z+x*w))*s[1];
 m[8]=(2*(x*z+y*w))*s[2];m[9]=(2*(y*z-x*w))*s[2];m[10]=(1-2*(x*x+y*y))*s[2];
 m[12]=t[0];m[13]=t[1];m[14]=t[2];return m;}
function slerp(a,b,t){let d=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];if(d<0){b=b.map(x=>-x);d=-d;}
 if(d>0.9995){const r=a.map((x,i)=>x+(b[i]-x)*t);const l=Math.hypot(...r);return r.map(x=>x/l);}
 const th=Math.acos(d),s=Math.sin(th);const wa=Math.sin((1-t)*th)/s,wb=Math.sin(t*th)/s;return a.map((x,i)=>x*wa+b[i]*wb);}
const N=json.nodes;const parent={};N.forEach((n,i)=>(n.children||[]).forEach(c=>parent[c]=i));
const byName={};N.forEach((n,i)=>byName[n.name]=i);
const hipsName=N.find(n=>/Hips$/.test(n.name))?.name;
const nm=(s)=>N.findIndex(n=>n.name===s||n.name.endsWith(':'+s));
function sample(anim,t){ // returns map node-> {t,r,s}
 const pose={};
 for(const ch of anim.channels){const s=anim.samplers[ch.sampler];const inp=acc(s.input),out=acc(s.output);
  const times=inp.d;let i=0;while(i<inp.count-1&&times[i+1]<=t)i++;
  const j=Math.min(i+1,inp.count-1);const step=s.interpolation==='STEP';
  const u=(t<=times[0]||i===j||step)?0:(t-times[i])/(times[j]-times[i]);
  const n=out.n;const get=k=>[...out.d.slice(k*n,k*n+n)];
  const a=get(t<times[0]?0:i),bb=get(j);
  const v=ch.target.path==='rotation'?slerp(a,bb,u):a.map((x,k)=>x+(bb[k]-x)*u);
  (pose[ch.target.node]??={})[ch.target.path]=v;}
 return pose;}
function world(i,pose){const n=N[i];const p=pose[i]||{};
 const m=trs(p.translation||n.translation,p.rotation||n.rotation,p.scale||n.scale);
 return parent[i]===undefined?m:mul(world(parent[i],pose),m);}
const pos=(m)=>[m[12],m[13],m[14]].map(x=>+x.toFixed(4));
const label=process.argv[2].split('/').pop();
console.log('#####',label,'generator',json.asset.generator,'nodes',N.length,'skins',(json.skins||[]).length,'joints',(json.skins||[]).map(s=>s.joints.length),'scene roots',json.scenes[json.scene||0].nodes.map(i=>N[i].name));
// roots & non-identity top-level scale
const rootsInfo=[];N.forEach((n,i)=>{if(parent[i]===undefined)rootsInfo.push(`${n.name} T${JSON.stringify(n.translation)} R${JSON.stringify(n.rotation)} S${JSON.stringify(n.scale)}`)});
console.log('root nodes:',rootsInfo.join(' | '));
const sc=N.map((n,i)=>[n.name,n.scale]).filter(x=>x[1]&&x[1].some(v=>Math.abs(v-1)>0.01));console.log('nodes w/ scale!=1:',sc.length,sc.slice(0,5).map(x=>x[0]+JSON.stringify(x[1].map(v=>+v.toFixed(4)))).join(' '));
const hi=nm('Hips');const hips=hi>=0?hi:-1;
console.log('hips node',hips,N[hips]?.name,'parent',N[parent[hips]]?.name,'local T',N[hips]?.translation?.map(x=>+x.toFixed(4)),'bindWorld hips',pos(world(hips,{})));
const mat0=world(hips,{});
const bindP=(n)=>{const k=nm(n);return k>=0?pos(world(k,{})):null};
console.log('bind: Head',bindP('Head'),'HeadTop_End',bindP('HeadTop_End'),'LFoot',bindP('LeftFoot'),'LToe',bindP('LeftToeBase'),'LToeEnd',bindP('LeftToe_End'),'RHand',bindP('RightHand'),'LHand',bindP('LeftHand'),'LShoulder',bindP('LeftShoulder'),'RShoulder',bindP('RightShoulder'));
for(const a of json.animations||[]){
 let dur=0,maxk=0;for(const ch of a.channels){const inp=acc(a.samplers[ch.sampler].input);dur=Math.max(dur,inp.d[inp.count-1]);maxk=Math.max(maxk,inp.count);}
 const hc=a.channels.find(c=>c.target.node===hips&&c.target.path==='translation');
 let fps='?',t0='?',keys='?';
 if(a.channels.length){const big=a.channels.map(c=>acc(a.samplers[c.sampler].input)).sort((x,y)=>y.count-x.count)[0];keys=big.count;t0=big.d[0];if(big.count>1)fps=+(1/((big.d[big.count-1]-big.d[0])/(big.count-1))).toFixed(2);}
 const ntr=a.channels.filter(c=>c.target.path==='translation').length;
 const nodesAnimated=new Set(a.channels.map(c=>c.target.node)).size;
 let row=`ANIM "${a.name}" dur=${dur.toFixed(3)}s keys=${keys} t0=${(+t0).toFixed(3)} fps=${fps} ~frames@fps=${typeof fps==='number'?Math.round(dur*fps):'?'} ch=${a.channels.length} nodes=${nodesAnimated} Tchannels=${ntr}`;
 console.log(row);
 if(!hc){console.log('   no hips translation channel');}
 // world hips pos start/end/min/max over sampled frames
 const ts=[];const n=Math.max(2,Math.round(dur*30)+1);for(let k=0;k<n;k++)ts.push(Math.min(dur,k*dur/(n-1)));
 const P=ts.map(t=>{const pose=sample(a,t);return {t,pose,h:pos(world(hips,pose))};});
 const first=P[0].h,last=P[P.length-1].h;
 const mn=[0,1,2].map(k=>Math.min(...P.map(p=>p.h[k]))),mx=[0,1,2].map(k=>Math.max(...P.map(p=>p.h[k])));
 console.log('   hips world(start)',first,'end',last,'delta',last.map((x,k)=>+(x-first[k]).toFixed(4)),'min',mn.map(x=>+x.toFixed(3)),'max',mx.map(x=>+x.toFixed(3)),'vs bind',pos(mat0));
 // loop check: max rotation difference first vs last
 let md=0;const pa=P[0].pose,pz=P[P.length-1].pose;for(const k in pa){if(pa[k].rotation&&pz[k]?.rotation){const d=Math.abs(pa[k].rotation.reduce((s,x,i)=>s+x*pz[k].rotation[i],0));md=Math.max(md,1-d);}}
 console.log('   loop seam max(1-|dot|) first vs last rotation:',md.toExponential(2));
 // extremities
 const ext=['LeftFoot','RightFoot','LeftHand','RightHand','Head'].map(s=>nm(s));
 const names=['LFoot','RFoot','LHand','RHand','Head'];
 const lines=ext.map((e,ii)=>{if(e<0)return null;const ps=P.map(p=>pos(world(e,p.pose)));return `${names[ii]} start${JSON.stringify(ps[0])} maxZ${Math.max(...ps.map(p=>p[2])).toFixed(3)} minZ${Math.min(...ps.map(p=>p[2])).toFixed(3)} maxX${Math.max(...ps.map(p=>p[0])).toFixed(3)} minX${Math.min(...ps.map(p=>p[0])).toFixed(3)} maxY${Math.max(...ps.map(p=>p[1])).toFixed(3)}`}).filter(Boolean);
 console.log('   '+lines.join('\n   '));
}
if(process.argv[3]==='timeline'){
 for(const a of json.animations){
  if(!['kick_high','punch_body','punch_heavy'].includes(a.name))continue;
  let dur=0;for(const ch of a.channels){const inp=acc(a.samplers[ch.sampler].input);dur=Math.max(dur,inp.d[inp.count-1]);}
  const n=Math.round(dur*30);const rows=[];
  for(let k=0;k<=n;k+=1){const t=Math.min(dur,k/30+ (a.name?0:0));const pose=sample(a,t);
   const hp=pos(world(hips,pose));const lf=pos(world(nm('LeftFoot'),pose));const rh=pos(world(nm('RightHand'),pose));const lh=pos(world(nm('LeftHand'),pose));
   rows.push({t:+t.toFixed(3),hipsZ:hp[2],lfZ:lf[2],lfY:lf[1],rhZ:rh[2],lhZ:lh[2]});}
  const mx=(key)=>rows.reduce((b,r)=>r[key]>b[key]?r:b,rows[0]);
  console.log(a.name,'peak hipsZ@',mx('hipsZ').t,mx('hipsZ').hipsZ,'| LFoot peakZ@',mx('lfZ').t,mx('lfZ').lfZ,'peakY@',mx('lfY').t,mx('lfY').lfY,'| RHand peakZ@',mx('rhZ').t,mx('rhZ').rhZ,'| LHand peakZ@',mx('lhZ').t,mx('lhZ').lhZ);
  console.log('  hipsZ every 5 frames:',rows.filter((_,i)=>i%5===0).map(r=>r.t+':'+r.hipsZ).join(' '));
 }
}
