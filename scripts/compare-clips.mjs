#!/usr/bin/env node
/**
 * compare-clips: сравнение СТАРЫХ Blender-клипов (kick_high, punch_heavy из базового GLB) с НОВЫМИ
 * (martelo_2, cross_punch из FBX) по FK: позиции 41 кости относительно Hips, одинаковые кадры FBX.
 *
 *     node scripts/compare-clips.mjs           # печатает markdown-таблицы
 *
 * Соответствие кадров. Старые клипы: ключ k лежит на t = (k+1)/30 с (сдвиг Blender), то есть GLB-кадр k = кадр k FBX.
 * Новые клипы: локальный кадр j = кадр FBX start+j (trim из data/clips/terraks.json), t = j/30.
 * Сравниваются кадры FBX start..end нового клипа: старый[f] против нового[f - start].
 * «После rootLock»: старые клипы лочатся временной копией (kick_high factor 1, как в коммите b4f6e3f),
 * новые берутся из итогового GLB. Позиции относительно Hips от лока не зависят, это проверяется.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './build-clips.mjs';

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'clips', 'terraks.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-clips-'));
const run = (args) => execFileSync(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
const base = path.join(ROOT, cfg.baseGlb);

// старые: до лока = база; после лока = копия базы с локом kick_high=1
const lockCfg = path.join(tmp, 'lock.json');
fs.writeFileSync(lockCfg, JSON.stringify({ clips: [{ id: 'kick_high', rootLock: { axes: ['z'], factor: 1 } }, { id: 'punch_heavy', rootLock: { axes: ['z'], factor: 0 } }] }));
const oldLocked = path.join(tmp, 'old_locked.glb');
run([path.join(ROOT, 'scripts', 'apply-root-lock.mjs'), '--config', lockCfg, '--glb', base, '--out', oldLocked]);
const fkOf = (glb) => {
  const out = path.join(tmp, path.basename(glb) + '.json');
  run([path.join(ROOT, 'scripts', 'clips-audit', 'gltf_fk.mjs'), glb, out]);
  return JSON.parse(fs.readFileSync(out, 'utf8'));
};
const FK = { old: fkOf(base), oldLocked: fkOf(oldLocked), neu: fkOf(path.join(ROOT, cfg.outGlb)) };
fs.rmSync(tmp, { recursive: true });

const names = FK.old.names.map((n) => n.replace('mixamorig:', ''));
const idx = (n) => names.indexOf(n);
const hi = idx('Hips');
const GROUPS = {
  'кисти (Hand)': ['LeftHand', 'RightHand'],
  'стопы (Foot, ToeBase)': ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'],
  'локти (ForeArm)': ['LeftForeArm', 'RightForeArm'],
  'голова (Head, HeadTop_End)': ['Head', 'HeadTop_End'],
  'колени (Leg)': ['LeftLeg', 'RightLeg'],
  'все 41 кость': names.filter((n) => n !== 'Hips'),
};
const PAIRS = [
  { oldId: 'kick_high', newId: 'martelo_2' },
  { oldId: 'punch_heavy', newId: 'cross_punch' },
];
const rel = (fr, b) => [0, 1, 2].map((c) => fr[b][c] - fr[hi][c]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mm = (x) => (x * 1000).toFixed(0);

const md = [];
const summary = {};
for (const { oldId, newId } of PAIRS) {
  const c = cfg.clips.find((x) => x.id === newId);
  const { start, end } = c.trim;
  const oldA = FK.old.anims[oldId], oldL = FK.oldLocked.anims[oldId], newA = FK.neu.anims[newId];
  if (Math.abs(oldA.t0 - 1 / 30) > 1e-6) throw new Error(`${oldId}: ожидался первый ключ 1/30 с, а не ${oldA.t0}`);
  if (Math.abs(newA.t0) > 1e-9) throw new Error(`${newId}: первый ключ должен быть на 0`);
  md.push(`\n### ${oldId} (Blender, ${oldA.frames.length} кадров, t0 = ${oldA.t0.toFixed(4)} с) против ${newId} (FBX ${c.file}, кадры ${start}..${end}, t0 = 0)\n`);
  md.push('Разница позиций относительно Hips, мм (старый минус новый), кадры FBX ' + `${start}..${end}:\n`);
  md.push('| группа | макс | средняя | кость | кадр FBX |');
  md.push('|---|---:|---:|---|---:|');
  let lockDiff = 0;
  for (const [g, list] of Object.entries(GROUPS)) {
    let max = 0, sum = 0, cnt = 0, mb = '', mf = 0;
    for (let f = start; f <= end; f++) {
      for (const n of list) {
        const b = idx(n);
        const d = dist(rel(oldA.frames[f], b), rel(newA.frames[f - start], b));
        sum += d; cnt += 1;
        if (d > max) { max = d; mb = n; mf = f; }
        lockDiff = Math.max(lockDiff, dist(rel(oldA.frames[f], b), rel(oldL.frames[f], b)));
      }
    }
    md.push(`| ${g} | ${mm(max)} | ${mm(sum / cnt)} | ${mb} | ${mf} |`);
    summary[`${oldId}|${g}`] = { max, mean: sum / cnt, bone: mb, frame: mf };
  }
  md.push(`\nОтносительно Hips до и после rootLock старого клипа: макс. разница ${(lockDiff * 1000).toFixed(4)} мм (лок двигает только Hips).`);

  // вынос вперёд (Z мира) от Hips: как в AUDIT_CLIPS §9 (s7.py)
  md.push('\nВынос вперёд (Z) от Hips, м: максимум по кадрам, кадр FBX в скобках:\n');
  md.push('| кость | старый | новый (FBX) |');
  md.push('|---|---:|---:|');
  for (const n of ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']) {
    const reach = (A, off) => {
      let best = -9, bf = 0;
      for (let f = start; f <= end; f++) {
        const fr = A.frames[f - off];
        const z = fr[idx(n)][2] - fr[hi][2];
        if (z > best) { best = z; bf = f; }
      }
      return `${best.toFixed(3)} (${bf})`;
    };
    md.push(`| ${n} | ${reach(oldA, 0)} | ${reach(newA, start)} |`);
  }

  // Hips: абсолютная позиция, до/после лока
  const hipsPath = (A, off) => { const o = []; for (let f = start; f <= end; f++) o.push(A.frames[f - off][hi]); return o; };
  const ho = hipsPath(oldA, 0), hl = hipsPath(oldL, 0), hn = hipsPath(newA, start);
  const rng = (p, a) => `${(Math.min(...p.map((v) => v[a])) * 1000).toFixed(0)}..${(Math.max(...p.map((v) => v[a])) * 1000).toFixed(0)}`;
  md.push('\nHips, абсолютная позиция по окну (мм, мир, диапазон Y / Z):\n');
  md.push('| вариант | Y | Z | Hips z (первый -> последний кадр) |');
  md.push('|---|---|---|---|');
  const fl = (p) => `${(p[0][2] * 1000).toFixed(0)} -> ${(p[p.length - 1][2] * 1000).toFixed(0)}`;
  md.push(`| старый, до лока | ${rng(ho, 1)} | ${rng(ho, 2)} | ${fl(ho)} |`);
  md.push(`| старый, после лока | ${rng(hl, 1)} | ${rng(hl, 2)} | ${fl(hl)} |`);
  md.push(`| новый, итог (factor ${c.rootLock.factor}) | ${rng(hn, 1)} | ${rng(hn, 2)} | ${fl(hn)} |`);
}
console.log(md.join('\n'));
