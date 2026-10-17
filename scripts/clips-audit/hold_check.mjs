import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
// usage: node scripts/clips-audit/hold_check.mjs <glb> <clip,clip,...>   (env CHROMIUM_PATH; AUDIT_OUT)
// Нужно заранее: npx esbuild scripts/clips-audit/harness/clip.ts --bundle --format=iife --external:node:worker_threads --outfile=scripts/clips-audit/out/harness/clip.js
// Проверка однокосрочных (hold) клипов в РЕАЛЬНОМ движке PlayCanvas (DECISIONS §12): для каждого клипа и loop = false/true
//  1) длительность AnimTrack в движке; 2) поза при выставлении времени 0, 1/30, 0,5, 2 с (playing = false);
//  3) поза, когда слой реально играет 600 тиков (app.update(1/60)); везде: числа конечные и поза равна FK по GLB (расстояния костей от Hips, мм).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { chromium } = require('playwright');
const OUT = process.env.AUDIT_OUT ?? path.join(HERE, 'out');
const BUNDLE = path.join(OUT, 'harness', 'clip.js');
const glb = path.resolve(process.argv[2] ?? '');
const clips = (process.argv[3] ?? '').split(',').filter(Boolean);
if (!fs.existsSync(glb) || !clips.length || !fs.existsSync(BUNDLE)) { console.error('usage: hold_check.mjs <glb> <clip,...> (нужен бандл harness/clip.js)'); process.exit(2); }

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const file = u.pathname === '/m.glb' ? glb : u.pathname === '/clip.js' ? BUNDLE : u.pathname === '/' ? path.join(HERE, 'harness', 'clip.html') : null;
  if (!file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = server.address().port;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hold-check-'));
execFileSync(process.execPath, [path.join(HERE, 'gltf_fk.mjs'), glb, path.join(tmp, 'fk.json')]);
const FK = JSON.parse(fs.readFileSync(path.join(tmp, 'fk.json'), 'utf8'));
fs.rmSync(tmp, { recursive: true });
const bi = (n) => FK.names.indexOf('mixamorig:' + n);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
let bad = false;
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[console ${m.type()}]`, m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.ready || window.err, null, { timeout: 90000 });
  const err = await page.evaluate(() => window.err);
  if (err) throw new Error(err);
  const info = await page.evaluate(() => window.info('/m.glb'));
  const poseErr = (bones, frame) => {
    const h = bones.Hips;
    let worst = 0, finite = true;
    for (const [n, p] of Object.entries(bones)) {
      if (!p.every(Number.isFinite)) finite = false;
      if (n === 'Hips') continue;
      const e = Math.abs(dist(p, h) - dist(frame[bi(n)], frame[bi('Hips')])) * 1000;
      if (e > worst) worst = e;
    }
    return { worst, finite };
  };
  for (const clip of clips) {
    const meta = info.find((x) => x.name === clip);
    if (!meta) { console.log(`${clip}: нет в GLB`); bad = true; continue; }
    const fkFrame = FK.anims[clip].frames[0];
    console.log(`${clip}: AnimTrack.duration в движке = ${meta.duration} с, кадров по FK ${FK.anims[clip].frames.length}`);
    for (const loop of [false, true]) {
      const rows = [];
      for (const time of [0, 1 / 30, 0.5, 2]) {
        const r = await page.evaluate((o) => window.shot(o), { glb: '/m.glb', clip, time, loop });
        const e = poseErr(r.bones, fkFrame);
        rows.push(`t=${time.toFixed(3)}: время слоя ${r.time.toFixed(4)}, длит. ${r.duration.toFixed(4)}, ошибка ${e.worst.toFixed(3)} мм${e.finite ? '' : ' НЕ КОНЕЧНО'}`);
        if (!e.finite || e.worst > 1) bad = true;
      }
      const p = await page.evaluate((o) => window.play(o), { glb: '/m.glb', clip, loop, ticks: 600, sampleAt: [1, 2, 10, 60, 600] });
      const pr = p.samples.map((s) => { const e = poseErr(s.bones, fkFrame); if (!e.finite || e.worst > 1) bad = true; return `тик ${s.tick}: время ${s.time.toFixed(4)}, progress ${s.progress}, ошибка ${e.worst.toFixed(3)} мм${e.finite ? '' : ' НЕ КОНЕЧНО'}`; });
      console.log(`  loop=${loop}\n    scrub: ${rows.join('\n           ')}\n    играет 600 тиков: ${pr.join('\n                      ')}`);
    }
  }
} finally { await browser.close(); server.close(); }
console.log(bad ? 'ПРОВАЛ' : 'ok: поза держится, числа конечные, ошибка <= 1 мм');
process.exit(bad ? 1 : 0);
