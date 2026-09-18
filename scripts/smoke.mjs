/**
 * Браузерный smoke-тест: поднимает собранную игру, проходит меню → выбор бойца → бой
 * и падает, если в консоли появились ошибки или бой не пошёл.
 * Запуск: npm run build && npm run smoke
 * Скриншоты складываются в .smoke/ (папка в .gitignore).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.SMOKE_PORT ?? 4173);
const URL = `http://127.0.0.1:${PORT}/`;
const SHOTS = '.smoke';
mkdirSync(SHOTS, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], {
  stdio: 'ignore',
  detached: true,
});

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
};

try {
  // Ждём, пока preview поднимется.
  let ready = false;
  for (let i = 0; i < 30 && !ready; i += 1) {
    await sleep(300);
    ready = await fetch(URL).then((r) => r.ok).catch(() => false);
  }
  if (!ready) throw new Error(`preview не поднялся на ${URL}`);

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });

  for (const [label, viewport] of [
    ['desktop', { width: 1280, height: 720 }],
    ['mobile-landscape', { width: 844, height: 390 }],
  ]) {
    const errors = [];
    const page = await browser.newPage({ viewport, hasTouch: label !== 'desktop' });
    page.on('pageerror', (e) => errors.push(String(e.message)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto(URL, { waitUntil: 'load' });
    await sleep(1500);
    await page.getByText('НАЧАТЬ БОЙ').click();
    await sleep(400);
    await page.getByText('В БОЙ', { exact: true }).click();
    await sleep(5000);

    // Игрок бьёт, ИИ отвечает — обе полосы здоровья должны просесть.
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.down('KeyD');
      await sleep(400);
      await page.keyboard.up('KeyD');
      await page.keyboard.press('KeyJ');
      await sleep(120);
      await page.keyboard.press('KeyK');
      await sleep(200);
    }
    await page.screenshot({ path: `${SHOTS}/${label}.png` });

    const state = await page.evaluate(() => ({
      bars: [...document.querySelectorAll('.bar__fill')].map((b) => parseFloat(b.style.transform.replace(/[^\d.]/g, ''))),
      timer: Number(document.querySelector('.timer')?.textContent ?? '99'),
      hud: getComputedStyle(document.querySelector('.hud')).display,
    }));

    if (errors.length) fail(`${label}: ошибки в консоли — ${errors.slice(0, 3).join(' | ')}`);
    if (state.hud === 'none') fail(`${label}: HUD не показан`);
    if (state.timer >= 99) fail(`${label}: таймер не идёт`);
    if (!state.bars.some((v) => v < 1)) fail(`${label}: ни одно попадание не прошло`);
    if (process.exitCode !== 1) console.log(`✓ ${label}: таймер ${state.timer}, здоровье ${state.bars.map((v) => v.toFixed(2)).join(' / ')}`);
    await page.close();
  }

  await browser.close();
} catch (error) {
  fail(String(error));
} finally {
  try {
    process.kill(-server.pid);
  } catch {
    /* сервер уже остановлен */
  }
}
