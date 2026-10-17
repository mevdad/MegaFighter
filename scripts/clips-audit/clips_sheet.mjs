import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
// usage: node scripts/clips-audit/clips_sheet.mjs [out.png]   (env CHROMIUM_PATH; AUDIT_OUT; VERBOSE=1)
// Нужно заранее: npm run build:clips и бандл харнесса:
//   npx esbuild scripts/clips-audit/harness/clip.ts --bundle --format=iife --external:node:worker_threads --outfile=scripts/clips-audit/out/harness/clip.js
// Контактный лист кадров ключевых клипов итогового GLB (вид сбоку, масштаб 1 = метры рига, боец смотрит вправо, жёлтые метки на земле через 0,25 м)
// в РЕАЛЬНОМ движке через harness/clip.ts. Печатает сверку позы движка с FK по GLB (кисти, носки, голова от Hips) и таблицу высот
// (Hips, самая низкая из стоп/носков, голова), по которой видно «лежит / ноги на земле».
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { chromium } = require('playwright');
const OUT = process.env.AUDIT_OUT ?? path.join(HERE, 'out');
const BUNDLE = path.join(OUT, 'harness', 'clip.js');
const GLB = path.join(ROOT, 'public', 'models', 'warrior3.glb');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'clips', 'terraks.json'), 'utf8'));
const outPng = path.resolve(process.argv[2] ?? path.join(OUT, 'clips-sheet.png'));
for (const f of [BUNDLE, GLB]) if (!fs.existsSync(f)) { console.error('нет файла: ' + f); process.exit(1); }

// [клип, локальные кадры]; кадр FBX = trim.start + локальный
const SHOTS = [
  ['fighting_idle', [0]], ['walk_fwd', [0, 10, 20]], ['walk_back', [0, 13]], ['dash', [0, 3, 6]],
  ['crouch_in', [0, 9, 17]], ['jump_up', [0, 8]], ['jump_air', [0, 8, 15]], ['jump_land', [0, 7]],
  ['block_hold_18', [0]], ['block_hold_43', [0]], ['hit_head', [0, 8, 16]], ['hit_body', [0, 10, 20]],
  ['knockdown', [0, 39, 93]], ['getup', [0, 30, 54]], ['victory', [0, 60]], ['intro', [0, 40, 85]],
  ['punching_1', [0, 6, 17]], ['mma_kick', [0, 8, 9, 11, 26]],
];
const frameOf = (clip) => CFG.clips.find((c) => c.id === clip).trim.start;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const file = u.pathname === '/m.glb' ? GLB : u.pathname === '/clip.js' ? BUNDLE : u.pathname === '/' ? path.join(HERE, 'harness', 'clip.html') : null;
  if (!file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = server.address().port;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clips-sheet-'));
execFileSync(process.execPath, [path.join(HERE, 'gltf_fk.mjs'), GLB, path.join(tmp, 'fk.json')]);
const FK = JSON.parse(fs.readFileSync(path.join(tmp, 'fk.json'), 'utf8'));
fs.rmSync(tmp, { recursive: true });
const bi = (n) => FK.names.indexOf('mixamorig:' + n);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const cells = [];
let worst = 0, worstWhat = '';
const rows = [];
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.ready || window.err, null, { timeout: 90000 });
  const err = await page.evaluate(() => window.err);
  if (err) throw new Error(err);
  for (const [clip, frames] of SHOTS) {
    const start = frameOf(clip);
    const loop = !!CFG.clips.find((c) => c.id === clip).loop;
    for (const fr of frames) {
      const r = await page.evaluate((o) => window.shot(o), { glb: '/m.glb', clip, time: fr / 30, loop, cx: 0.1, halfH: 0.75 });
      const buf = await page.locator('#gl').screenshot();
      const fk = FK.anims[clip].frames[fr];
      for (const b of ['RightHand', 'LeftHand', 'LeftToeBase', 'RightToeBase', 'Head']) {
        const eng = Math.hypot(...[0, 1, 2].map((c) => r.bones[b][c] - r.bones.Hips[c]));
        const ref = Math.hypot(...[0, 1, 2].map((c) => fk[bi(b)][c] - fk[bi('Hips')][c]));
        const d = Math.abs(eng - ref) * 1000;
        if (d > worst) { worst = d; worstWhat = `${clip} f${fr} ${b}`; }
      }
      const low = Math.min(...['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftToe_End', 'RightToe_End'].map((n) => fk[bi(n)][1]));
      const top = Math.max(...FK.names.map((_, i) => fk[i][1]));
      rows.push({ clip, fr, fbx: start + fr, hipsY: fk[bi('Hips')][1], lowFoot: low, headY: fk[bi('Head')][1], top });
      cells.push({ img: 'data:image/png;base64,' + buf.toString('base64'), label: `${clip} f${fr} (FBX ${start + fr})` });
    }
  }
  console.log(`сверка позы движка с FK по GLB (кисти, носки, голова от Hips) по ${cells.length} кадрам: макс. расхождение ${worst.toFixed(3)} мм (${worstWhat})`);
  console.log('клип            кадр (FBX)  Hips Y, м  низ стопы Y, м  Head Y, м  макс. Y, м');
  for (const r of rows) console.log(`${r.clip.padEnd(15)} ${String(r.fr).padStart(3)} (${String(r.fbx).padStart(3)})  ${r.hipsY.toFixed(3).padStart(8)}  ${r.lowFoot.toFixed(3).padStart(13)}  ${r.headY.toFixed(3).padStart(9)}  ${r.top.toFixed(3).padStart(9)}`);
  const W = 300, COLS = 8;
  const comp = await browser.newPage({ viewport: { width: W * COLS, height: 600 } });
  let html = `<style>body{margin:0;background:#12141c;color:#dfe3f0;font:13px monospace}.g{display:flex;flex-wrap:wrap;width:${W * COLS}px}.c{position:relative;width:${W}px;height:${W}px;overflow:hidden}.c img{width:${W}px;height:${W}px;display:block}.l{position:absolute;left:4px;top:3px;background:#000b;padding:1px 4px}</style><div class="g">`;
  for (const c of cells) html += `<div class="c"><img src="${c.img}"><div class="l">${c.label}</div></div>`;
  html += '</div>';
  await comp.setContent(html);
  await comp.waitForTimeout(600);
  fs.mkdirSync(path.dirname(outPng), { recursive: true });
  await comp.screenshot({ path: outPng, fullPage: true });
  console.log(`записано ${outPng} (${fs.statSync(outPng).size} байт)`);
} finally { await browser.close(); server.close(); }
