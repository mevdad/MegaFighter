import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
// usage: node scripts/clips-audit/pilot_shoot.mjs   (env CHROMIUM_PATH; AUDIT_OUT)
// Нужно заранее: npm run build:clips (итоговый GLB) и бандл харнесса:
//   npx esbuild scripts/clips-audit/harness/pilot.ts --bundle --format=iife --external:node:worker_threads --outfile=scripts/clips-audit/out/harness/pilot.js
// Пишет docs/pilot-clips.png (кадры четырёх пилотных клипов в движке, вид сбоку и 3/4) и docs/pilot-clips-compare.png
// (старые kick_high/punch_heavy из базы против новых martelo_2/cross_punch на пиковом кадре). Печатает сверку позы движка с FK по GLB.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { chromium } = require('playwright');
const OUT = process.env.AUDIT_OUT ?? path.join(HERE, 'out');
const BUNDLE = path.join(OUT, 'harness', 'pilot.js');
const GLB = { new: path.join(ROOT, 'public', 'models', 'warrior3.glb'), base: path.join(ROOT, 'assets', 'rig-source', 'terraks', 'terraks-base.glb') };
for (const f of [BUNDLE, ...Object.values(GLB)]) if (!fs.existsSync(f)) { console.error('нет файла: ' + f); process.exit(1); }

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const m = u.pathname.match(/^\/glb\/(\w+)\.glb$/);
  let file = m && GLB[m[1]] ? GLB[m[1]] : u.pathname === '/pilot.js' ? BUNDLE : u.pathname === '/' ? path.join(HERE, 'harness', 'pilot.html') : null;
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });

// FK по итоговому GLB для сверки позы движка
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-shoot-'));
execFileSync(process.execPath, [path.join(HERE, 'gltf_fk.mjs'), GLB.new, path.join(tmp, 'fk.json')]);
const FK = JSON.parse(fs.readFileSync(path.join(tmp, 'fk.json'), 'utf8'));
fs.rmSync(tmp, { recursive: true });
const bi = (n) => FK.names.indexOf('mixamorig:' + n);

const SHOTS = [
  { clip: 'fighting_idle', frames: [[0, 'f0'], [51, 'f51 (середина)']], note: 'fighting_idle, loop 0-101' },
  { clip: 'jab', frames: [[0, 'f0 = FBX 11'], [6, 'f6 = FBX 17 пик'], [15, 'f15 = FBX 26']], note: 'jab, FBX 11-26' },
  { clip: 'cross_punch', frames: [[0, 'f0 = FBX 24'], [10, 'f10 = FBX 34 пик'], [21, 'f21 = FBX 45']], note: 'cross_punch, FBX 24-45' },
  { clip: 'martelo_2', frames: [[0, 'f0 = FBX 3'], [6, 'f6 = FBX 9'], [12, 'f12 = FBX 15 пик'], [17, 'f17 = FBX 20 конец active'], [32, 'f32 = FBX 35']], note: 'martelo_2, FBX 3-35 (Z заперт)' },
];
const VIEWS = [['side', 'вид сбоку'], ['three', '3/4']];
let worst = 0, worstWhat = '';
const cells = {}; // key -> dataURL
async function run(page, list, glbName, old) {
  for (const s of list) for (const [fr] of s.frames) for (const [v] of VIEWS) {
    const r = await page.evaluate((o) => window.shot(o), { glb: `/glb/${glbName}.glb`, clip: s.clip, frame: fr, view: v, old });
    const buf = await page.locator('#gl').screenshot();
    cells[`${old ? 'old:' : ''}${s.clip}|${fr}|${v}`] = 'data:image/png;base64,' + buf.toString('base64');
    if (!old && s.clip !== 'fighting_idle' || !old) {
      const fkClip = FK.anims[s.clip];
      const fr0 = fkClip.frames[fr];
      const h = bi('Hips');
      for (const b of ['RightHand', 'LeftHand', 'LeftToeBase', 'RightToeBase', 'Head']) {
        const eng = Math.hypot(...[0, 1, 2].map((c) => r.bones[b][c] - r.hips[c])) / r.scale;
        const fk = Math.hypot(...[0, 1, 2].map((c) => fr0[bi(b)][c] - fr0[h][c]));
        const d = Math.abs(eng - fk) * 1000;
        if (process.env.VERBOSE) console.log(s.clip, fr, b, d.toFixed(2));
        if (d > worst) { worst = d; worstWhat = `${s.clip} f${fr} ${b}: движок ${eng.toFixed(4)} м, FK ${fk.toFixed(4)} м`; }
      }
    }
  }
}
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 840 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[console ${m.type()}]`, m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.ready || window.err, null, { timeout: 90000 });
  const err = await page.evaluate(() => window.err);
  if (err) throw new Error(err);
  await run(page, SHOTS, 'new', false);
  console.log(`сверка позы движка с FK по GLB (расстояния кисть/носок/голова от Hips): макс. расхождение ${worst.toFixed(3)} мм (${worstWhat})`);
  const CMP = [
    { old: { clip: 'kick_high', frame: 15 }, neu: { clip: 'martelo_2', frame: 12 }, title: 'hk: kick_high (Blender) / martelo_2 (FBX), FBX кадр 15' },
    { old: { clip: 'punch_heavy', frame: 34 }, neu: { clip: 'cross_punch', frame: 10 }, title: 'hp: punch_heavy (Blender) / cross_punch (FBX), FBX кадр 34' },
  ];
  for (const c of CMP) for (const [v] of VIEWS) {
    const r = await page.evaluate((o) => window.shot(o), { glb: '/glb/base.glb', clip: c.old.clip, frame: c.old.frame, view: v, old: true });
    cells[`old:${c.old.clip}|${c.old.frame}|${v}`] = 'data:image/png;base64,' + (await page.locator('#gl').screenshot()).toString('base64');
    void r;
  }
  // композиция
  const comp = await browser.newPage({ viewport: { width: 1500, height: 800 } });
  const cell = (key, label) => `<div class="c"><img src="${cells[key]}"><div class="l">${label}</div></div>`;
  let html = '<style>body{margin:0;background:#12141c;color:#dfe3f0;font:15px monospace}.row{display:flex}.c{flex:none;position:relative;width:300px;height:420px;overflow:hidden}.c img{width:300px;height:420px;display:block}.l{position:absolute;left:6px;top:4px;background:#000a;padding:2px 5px}h3{margin:6px 8px;font-size:16px}</style>';
  for (const s of SHOTS) {
    for (const [v, vn] of VIEWS) {
      html += `<h3>${s.note} — ${vn}</h3><div class="row">` + s.frames.map(([fr, lb]) => cell(`${s.clip}|${fr}|${v}`, lb)).join('') + '</div>';
    }
  }
  await comp.setContent(html);
  await comp.waitForTimeout(500);
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  await comp.screenshot({ path: path.join(ROOT, 'docs', 'pilot-clips.png'), fullPage: true });
  let html2 = '<style>body{margin:0;background:#12141c;color:#dfe3f0;font:15px monospace}.row{display:flex}.c{flex:none;position:relative;width:300px;height:420px;overflow:hidden}.c img{width:300px;height:420px;display:block}.l{position:absolute;left:6px;top:4px;background:#000a;padding:2px 5px}h3{margin:6px 8px;font-size:16px}</style>';
  for (const c of CMP) for (const [v, vn] of VIEWS) {
    html2 += `<h3>${c.title} — ${vn}</h3><div class="row">${cell(`old:${c.old.clip}|${c.old.frame}|${v}`, 'СТАРЫЙ ' + c.old.clip)}${cell(`${c.neu.clip}|${c.neu.frame}|${v}`, 'НОВЫЙ ' + c.neu.clip)}</div>`;
  }
  const comp2 = await browser.newPage({ viewport: { width: 620, height: 800 } });
  await comp2.setContent(html2);
  await comp2.waitForTimeout(500);
  await comp2.screenshot({ path: path.join(ROOT, 'docs', 'pilot-clips-compare.png'), fullPage: true });
} finally { await browser.close(); server.close(); }
console.log('done');
