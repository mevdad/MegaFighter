// usage: node scripts/clips-audit/gltf_fk.mjs <in.glb> <out.json>   (FK по каналам GLB -> мировые позиции костей mixamorig:* по кадрам 30 fps; для validate.py: out/gltf_pose.json)
import fs from 'node:fs';
import path from 'node:path';
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

const pos=(m)=>[m[12],m[13],m[14]];
const names=N.map(n=>n.name).filter(n=>n.startsWith('mixamorig:'));
const out={names,bind:{},anims:{}};
const idx=names.map(n=>N.findIndex(x=>x.name===n));
out.bind=idx.map(i=>pos(world(i,{})));
out.nodeInfo=N.filter(n=>/Armature|Hips$/.test(n.name)).map(n=>({name:n.name,T:n.translation,R:n.rotation,S:n.scale}));
for(const a of json.animations){
  let dur=0,t0=1e9;for(const ch of a.channels){const inp=acc(a.samplers[ch.sampler].input);dur=Math.max(dur,inp.d[inp.count-1]);t0=Math.min(t0,inp.d[0]);}
  const nfr=Math.round((dur-t0)*30)+1;const fr=[];
  for(let k=0;k<nfr;k++){const pose=sample(a,t0+k/30);fr.push(idx.map(i=>pos(world(i,pose)).map(x=>+x.toFixed(6))));}
  out.anims[a.name]={t0,dur,frames:fr};
}
fs.mkdirSync(path.dirname(path.resolve(process.argv[3])),{recursive:true});
fs.writeFileSync(process.argv[3],JSON.stringify(out));
