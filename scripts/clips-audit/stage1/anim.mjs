import fs from 'node:fs';
const f=process.argv[2];
const b=fs.readFileSync(f);
const jl=b.readUInt32LE(12);
const json=JSON.parse(b.slice(20,20+jl).toString());
const bin=b.slice(20+jl+8);
const CT={5126:Float32Array,5123:Uint16Array,5121:Uint8Array,5120:Int8Array,5122:Int16Array,5125:Uint32Array};
const NC={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function acc(i){const a=json.accessors[i];const bv=json.bufferViews[a.bufferView];const n=NC[a.type];
 const off=(bv.byteOffset||0)+(a.byteOffset||0);const C=CT[a.componentType];
 const buf=new Uint8Array(bin.buffer,bin.byteOffset+off,a.count*n*C.BYTES_PER_ELEMENT).slice();
 return {d:new C(buf.buffer),n,count:a.count};}
console.log('FILE',f,'asset',JSON.stringify(json.asset),'extensionsUsed',json.extensionsUsed,'scenes',JSON.stringify(json.scenes));
console.log('nodes top-level');
const sc=json.scenes[json.scene||0];
function pr(i,d=0,max=2){const n=json.nodes[i];if(d>max)return;console.log(' '.repeat(d*2)+i,n.name,'T',n.translation,'R',n.rotation,'S',n.scale,n.mesh!==undefined?'mesh':'',n.skin!==undefined?'skin':'');(n.children||[]).forEach(c=>pr(c,d+1,max));}
sc.nodes.forEach(i=>pr(i,0,2));
if(json.skins)json.skins.forEach(s=>console.log('skin',s.name,'joints',s.joints.length,'skeleton',s.skeleton));
for(const a of json.animations||[]){
 let dur=0;const rows=[];
 const ts=new Set();
 for(const ch of a.channels){const s=a.samplers[ch.sampler];const inp=acc(s.input);dur=Math.max(dur,inp.d[inp.count-1]);ts.add(inp.count);}
 // fps from first sampler
 const s0=acc(a.samplers[a.channels[0].sampler].input);
 const dts=[];for(let i=1;i<s0.count;i++)dts.push(s0.d[i]-s0.d[i-1]);
 const dt=dts.length?dts.reduce((x,y)=>x+y,0)/dts.length:0;
 console.log(`\nANIM ${a.name} dur=${dur.toFixed(4)} keys/sampler=${[...ts]} t0=${s0.d[0]} dt~${dt.toFixed(5)} fps~${(1/dt).toFixed(2)} dtMin=${Math.min(...dts).toFixed(5)} dtMax=${Math.max(...dts).toFixed(5)} channels=${a.channels.length} interp=${[...new Set(a.samplers.map(s=>s.interpolation||'LINEAR'))]}`);
 // translation channels
 const tr=a.channels.filter(c=>c.target.path==='translation');
 const sc_=a.channels.filter(c=>c.target.path==='scale');
 console.log(' translation channels:',tr.map(c=>json.nodes[c.target.node].name).join(', '),'| scale channels:',sc_.length);
 for(const c of tr){const s=a.samplers[c.sampler];const o=acc(s.output);const n=o.count;const d=o.d;
  const first=[d[0],d[1],d[2]],last=[d[(n-1)*3],d[(n-1)*3+1],d[(n-1)*3+2]];
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let i=0;i<n;i++)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],d[i*3+k]);mx[k]=Math.max(mx[k],d[i*3+k]);}
  console.log('  T',json.nodes[c.target.node].name,'first',first.map(x=>+x.toFixed(4)),'last',last.map(x=>+x.toFixed(4)),'delta',first.map((x,k)=>+(last[k]-x).toFixed(4)),'range',mn.map((x,k)=>+(mx[k]-x).toFixed(4)));}
 const hips=a.channels.filter(c=>json.nodes[c.target.node].name.endsWith('Hips'));
 console.log(' hips channels:',hips.map(c=>c.target.path).join(','));
 for(const c of hips.filter(c=>c.target.path==='rotation')){const o=acc(a.samplers[c.sampler].output);const d=o.d;console.log('  hips rot first',[...d.slice(0,4)].map(x=>+x.toFixed(3)),'last',[...d.slice((o.count-1)*4,o.count*4)].map(x=>+x.toFixed(3)));}
}
