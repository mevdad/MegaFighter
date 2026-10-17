import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// usage: node scripts/clips-audit/shoot.mjs   (env PEAK=28 - кадр пика; CHROMIUM_PATH; AUDIT_OUT)
// Нужно заранее: out/harness/bundle.js (esbuild harness.ts) и out/work/w_f0.glb, w_f0.6.glb, w_f1.glb (apply-root-lock.mjs --set kick_high=... --out). Команды: README.
// Пишет out/shoot/kick_peak_*.png, kick_active15_*.png и out/shoot/frames.json (его читает table.mjs).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, '..', '..', 'package.json'));
const { chromium } = require('playwright');
const OUT = process.env.AUDIT_OUT ?? path.join(HERE, 'out');
const SHOT = path.join(OUT, 'shoot');
fs.mkdirSync(SHOT, { recursive: true });
const BUNDLE = path.join(OUT, 'harness', 'bundle.js');
const GLB = { f0: path.join(OUT, 'work', 'w_f0.glb'), f06: path.join(OUT, 'work', 'w_f0.6.glb'), f10: path.join(OUT, 'work', 'w_f1.glb') };
for (const f of [BUNDLE, ...Object.values(GLB)]) if (!fs.existsSync(f)) { console.error('нет файла: ' + f + ' (см. README, раздел shoot.mjs)'); process.exit(1); }
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let file;
  const m = u.pathname.match(/^\/glb\/(\w+)\.glb$/);
  if (m && GLB[m[1]]) file = GLB[m[1]];
  else if (u.pathname === '/bundle.js') file = BUNDLE;
  else file = u.pathname === '/' ? path.join(HERE, 'harness', 'index.html') : null;
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const out = {};
const peakFrame = Number(process.env.PEAK ?? 28);
const labels = { f0: 'factor 0.0 (as was)', f06: 'factor 0.6', f10: 'factor 1.0' };
try {
  for (const k of Object.keys(GLB)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${k} console ${m.type()}]`, m.text().slice(0, 300)); });
    page.on('pageerror', (e) => console.log(`[${k} pageerror]`, String(e).slice(0, 300)));
    await page.goto(`http://127.0.0.1:${port}/?glb=${encodeURIComponent('/glb/' + k + '.glb')}&label=${encodeURIComponent(labels[k])}`);
    await page.waitForFunction(() => window.ready || window.err, null, { timeout: 90000 });
    const err = await page.evaluate(() => window.err);
    if (err) throw new Error(k + ': ' + err);
    const meta = await page.evaluate(() => window.meta);
    if (k === 'f0') console.log('meta', JSON.stringify(meta));
    const rows = [];
    for (let n = 0; n <= meta.total; n++) rows.push(await page.evaluate((n) => window.setFrame(n), n));
    out[k] = rows;
    const shot = async (n, name) => { await page.evaluate((n) => window.setFrame(n), n); await page.screenshot({ path: path.join(SHOT, name) }); };
    await shot(peakFrame, `kick_peak_${k}.png`);
    await shot(15, `kick_active15_${k}.png`);
    await page.close();
  }
} finally { await browser.close(); server.close(); }
fs.writeFileSync(path.join(SHOT, 'frames.json'), JSON.stringify(out));
console.log('done');
