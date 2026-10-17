#!/usr/bin/env node
/**
 * verify-clips: проверка собранных клипов Терракса против FBX (FK, покадрово, 41 кость) и структуры GLB.
 *
 *     node scripts/verify-clips.mjs                      # обе проверки (см. ниже), код выхода 1 при провале
 *     node scripts/verify-clips.mjs --glb x.glb [--no-lock] [--only jab,martelo_2] [--tol 1]
 *     npm run verify:clips
 *
 * Без аргументов:
 *   1) собирает build-clips во временный файл (ДО apply-root-lock) и сверяет без лока;
 *   2) сверяет текущий итоговый GLB (data/clips/terraks.json -> outGlb, после apply-root-lock) с локом из конфига.
 *
 * Что считается. Для каждого клипа с `file` и каждого кадра k trim (кадр FBX = start + k):
 *   - FK из FBX (этот файл, в JS): позиции 41 кости, local = T·R(PreRotation)·R(Lcl Rotation кривой), Rz·Ry·Rx;
 *     сверка с независимой реализацией на Python, scripts/clips-audit/pose/<файл>.json (fk.py), если файл есть;
 *   - FK из GLB: scripts/clips-audit/gltf_fk.mjs (запускается отдельным процессом, это готовый инструмент аудита);
 *   - ошибка кости = |(поза GLB - Hips GLB) - (поза FBX - Hips FBX)|, то есть положение относительно таза, мм.
 *     Допуск 1 мм (DECISIONS §1);
 *   - Hips отдельно: смещение абсолютной позиции относительно FBX (это разница баз D, см. build-clips.mjs) и невязка
 *     после учёта D (и лока, если он включён): должна быть ~0.
 * Структура GLB: диапазоны bufferView в пределах BIN, выравнивание, min/max accessor'ов совпадает с данными,
 * время строго возрастает, кватернионы единичные с dot > 0 между ключами, ссылки на узлы/accessor'ы валидны.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadFbxAnim, quatEulerXYZ, qmul, qrot } from './lib/fbx.mjs';
import { readGlb, accessorRange, readFloatAccessor, COMPONENT_BYTES, minMax } from './lib/glb.mjs';
import { buildClips, ROOT } from './build-clips.mjs';

const HIPS = 'mixamorig:Hips';
const AXIS = { x: 0, y: 1, z: 2 };

// ---------------------------------------------------------------- FK из FBX
function fbxFk(fbx, names) {
  const n = fbx.nkeys;
  const out = [];
  for (let f = 0; f < n; f++) {
    const pos = new Map(), rot = new Map();
    for (const name of fbx.order) {
      const b = fbx.bones.get(name);
      const e = b.rot ? [b.rot[0][f], b.rot[1][f], b.rot[2][f]] : b.lclR;
      const t = b.trans ? [b.trans[0][f], b.trans[1][f], b.trans[2][f]] : b.lclT;
      const q = qmul(quatEulerXYZ(...b.pre), quatEulerXYZ(...e));
      if (!b.parent) { rot.set(name, q); pos.set(name, t); }
      else {
        const pr = rot.get(b.parent), pp = pos.get(b.parent);
        const o = qrot(pr, t);
        rot.set(name, qmul(pr, q));
        pos.set(name, [pp[0] + o[0], pp[1] + o[1], pp[2] + o[2]]);
      }
    }
    out.push(names.map((nm) => pos.get(nm)));
  }
  return out;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);

// ---------------------------------------------------------------- сверка клипов
function glbFk(glb) {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'verify-clips-')), 'fk.json');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'clips-audit', 'gltf_fk.mjs'), glb, tmp], { stdio: ['ignore', 'ignore', 'inherit'] });
  const r = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.rmSync(path.dirname(tmp), { recursive: true });
  return r;
}

export function verifyFk(glb, cfg, { lock, only, tol = 1, fbxDir }) {
  const fk = glbFk(glb);
  const hi = fk.names.indexOf(HIPS);
  const base = readGlb(glb).json;
  const rows = [];
  const cache = new Map();
  for (const c of cfg.clips) {
    if (!c.file || (only && !only.includes(c.id))) continue;
    const anim = fk.anims[c.id];
    if (!anim) throw new Error(`В ${glb} нет клипа ${c.id}`);
    let fbx = cache.get(c.file);
    if (!fbx) { fbx = loadFbxAnim(path.join(fbxDir, c.file)); cache.set(c.file, fbx); }
    const ref = fbxFk(fbx, fk.names);
    // независимая проверка нашего FK по pose/*.json (Python fk.py)
    let pyDiff = null;
    const poseFile = path.join(ROOT, 'scripts', 'clips-audit', 'pose', c.file.replace(/\.fbx$/, '.json'));
    if (fs.existsSync(poseFile)) {
      const p = JSON.parse(fs.readFileSync(poseFile, 'utf8'));
      const idx = fk.names.map((nm) => p.names.indexOf(nm));
      pyDiff = 0;
      for (let f = 0; f < ref.length; f++) fk.names.forEach((_, b) => { pyDiff = Math.max(pyDiff, len(sub(ref[f][b], p.pos[f][idx[b]])) * 1000); });
    }
    const n = c.trim.end - c.trim.start + 1;
    if (anim.frames.length !== n) throw new Error(`${c.id}: в GLB ${anim.frames.length} кадров, ожидалось ${n}`);
    const node = base.nodes.find((x) => x.name === HIPS);
    // rest Hips меша в мировой системе (Armature +90° по X: (x,y,z) -> (x,-z,y))
    const restM = [node.translation[0], -node.translation[2], node.translation[1]];
    const restF = fbx.bones.get(HIPS).lclT;
    const D = sub(restM, restF);
    // ожидаемая траектория Hips с учётом D и (опционально) лока
    const hipsF = [];
    for (let k = 0; k < n; k++) hipsF.push(ref[c.trim.start + k][hi].map((x, i) => x + D[i]));
    let hipsExp = hipsF.map((v) => v.slice());
    const rl = c.rootLock;
    if (lock && rl && rl.factor > 0) {
      for (const ax of rl.axes) {
        const a = AXIS[ax];
        hipsExp = hipsExp.map((v, k) => { const o = v.slice(); if (k > 0) o[a] = v[a] - rl.factor * (v[a] - hipsF[0][a]); return o; });
      }
    }
    let maxE = 0, sumE = 0, cnt = 0, maxBone = '', maxFrame = 0, hipsOff = 0, hipsRes = 0;
    for (let k = 0; k < n; k++) {
      const g = anim.frames[k], r = ref[c.trim.start + k];
      fk.names.forEach((nm, b) => {
        if (b === hi) return;
        const e = len(sub(sub(g[b], g[hi]), sub(r[b], r[hi]))) * 1000;
        sumE += e; cnt += 1;
        if (e > maxE) { maxE = e; maxBone = nm.replace('mixamorig:', ''); maxFrame = c.trim.start + k; }
      });
      hipsOff = Math.max(hipsOff, len(sub(g[hi], r[hi])) * 1000);
      hipsRes = Math.max(hipsRes, len(sub(g[hi], hipsExp[k])) * 1000);
    }
    rows.push({ id: c.id, file: c.file, frames: n, max: maxE, mean: sumE / cnt, bone: maxBone, frame: maxFrame, hipsOff, hipsRes, D, pyDiff, locked: !!(lock && rl && rl.factor > 0), ok: maxE <= tol && hipsRes < 0.05 });
  }
  return rows;
}

// ---------------------------------------------------------------- структура GLB
export function checkStructure(glb) {
  const { json, bin } = readGlb(glb);
  const errs = [], notes = [];
  const err = (m) => errs.push(m);
  const buf = json.buffers[0];
  if (buf.byteLength !== bin.length) err(`buffers[0].byteLength ${buf.byteLength} != BIN ${bin.length}`);
  json.bufferViews.forEach((bv, i) => {
    const off = bv.byteOffset ?? 0;
    if (bv.buffer !== 0 || off < 0 || off + bv.byteLength > bin.length) err(`bufferView ${i}: выходит за BIN`);
  });
  json.accessors.forEach((a, i) => {
    if (a.bufferView === undefined || a.bufferView >= json.bufferViews.length) { err(`accessor ${i}: нет bufferView`); return; }
    const { offset, length } = accessorRange(json, i);
    const bv = json.bufferViews[a.bufferView];
    if (offset + length > (bv.byteOffset ?? 0) + bv.byteLength) err(`accessor ${i}: выходит за bufferView ${a.bufferView}`);
    if (offset % COMPONENT_BYTES[a.componentType]) err(`accessor ${i}: невыровнен`);
    if (a.componentType === 5126 && (a.min || a.max)) {
      const vals = readFloatAccessor(json, bin, i);
      const nc = a.min?.length ?? a.max.length;
      const mm = minMax(vals, nc);
      // Blender пишет min/max как double до упаковки в float32: сравниваем после Math.fround
      if (a.min && a.min.some((x, c) => Math.fround(x) !== mm.min[c])) err(`accessor ${i}: min не совпадает с данными`);
      if (a.max && a.max.some((x, c) => Math.fround(x) !== mm.max[c])) err(`accessor ${i}: max не совпадает с данными`);
    }
  });
  json.animations.forEach((an) => {
    // клипы базы (Blender) не меняются; строгие правила непрерывности знака и уникальности accessor'ов только для собранных здесь
    const strict = !!an.extras?.build;
    const warn = (m) => (strict ? errs : notes).push(m);
    const outs = new Set();
    an.samplers.forEach((s, si) => {
      const ia = json.accessors[s.input], oa = json.accessors[s.output];
      if (!ia || !oa) { err(`${an.name}#${si}: нет accessor`); return; }
      if (ia.count !== oa.count) err(`${an.name}#${si}: input ${ia.count} != output ${oa.count}`);
      if (!ia.min || !ia.max) err(`${an.name}#${si}: у времени нет min/max`);
      const t = readFloatAccessor(json, bin, s.input);
      for (let k = 1; k < t.length; k++) if (!(t[k] > t[k - 1])) err(`${an.name}#${si}: время не возрастает на ключе ${k}`);
      if (outs.has(s.output)) warn(`${an.name}#${si}: output accessor ${s.output} используется несколькими sampler`);
      outs.add(s.output);
    });
    an.channels.forEach((ch, ci) => {
      const s = an.samplers[ch.sampler];
      if (!s) err(`${an.name} канал ${ci}: нет sampler`);
      if (json.nodes[ch.target.node] === undefined) err(`${an.name} канал ${ci}: нет узла`);
      if (ch.target.path === 'rotation' && s) {
        const q = readFloatAccessor(json, bin, s.output);
        q.forEach((v, k) => {
          if (Math.abs(Math.hypot(...v) - 1) > 1e-5) err(`${an.name} канал ${ci}: кватернион ${k} не единичный`);
          if (k > 0) { const p = q[k - 1]; if (p[0] * v[0] + p[1] * v[1] + p[2] * v[2] + p[3] * v[3] < 0) warn(`${an.name} канал ${ci}: смена знака на ключе ${k}`); }
        });
      }
    });
  });
  return { errs, notes };
}

// ---------------------------------------------------------------- базовые клипы и меш не изменились
/** Данные accessor'а (байты) вместе с его описанием, чтобы сравнивать независимо от нумерации и раскладки BIN. */
function accessorBlob(json, bin, i) {
  const a = json.accessors[i];
  const { offset, length } = accessorRange(json, i);
  return JSON.stringify({ ...a, bufferView: undefined, byteOffset: undefined }) + '|' + bin.subarray(offset, offset + length).toString('hex');
}

/** Клипы без `file` (idle_hold, punch_body), меш, скелет, IBM и текстура побайтово равны базе. Возвращает список расхождений. */
export function checkBaseUnchanged(glb, baseGlb, cfg) {
  const A = readGlb(baseGlb), B = readGlb(glb);
  const diffs = [];
  const same = (what, x, y) => { if (x !== y) diffs.push(what); };
  const accs = (j, bin, ids) => ids.map((i) => accessorBlob(j, bin, i));
  for (const c of cfg.clips.filter((x) => !x.file)) {
    const a = A.json.animations.find((x) => x.name === c.id), b = B.json.animations.find((x) => x.name === c.id);
    if (!a || !b) { diffs.push(`клип ${c.id}: нет в одном из файлов`); continue; }
    same(`${c.id}: каналы`, JSON.stringify(a.channels), JSON.stringify(b.channels));
    same(`${c.id}: sampler'ы (interpolation)`, JSON.stringify(a.samplers.map((s) => s.interpolation)), JSON.stringify(b.samplers.map((s) => s.interpolation)));
    same(`${c.id}: extras`, JSON.stringify(a.extras ?? null), JSON.stringify(b.extras ?? null));
    const io = (an) => an.samplers.flatMap((s) => [s.input, s.output]);
    same(`${c.id}: байты accessor'ов`, JSON.stringify(accs(A.json, A.bin, io(a))), JSON.stringify(accs(B.json, B.bin, io(b))));
  }
  same('узлы', JSON.stringify(A.json.nodes), JSON.stringify(B.json.nodes));
  same('skins (кроме нумерации accessor)', JSON.stringify(A.json.skins.map((s) => ({ ...s, inverseBindMatrices: 0 }))), JSON.stringify(B.json.skins.map((s) => ({ ...s, inverseBindMatrices: 0 }))));
  same('материалы/текстуры', JSON.stringify([A.json.materials, A.json.textures, A.json.samplers]), JSON.stringify([B.json.materials, B.json.textures, B.json.samplers]));
  const meshIds = (j) => j.meshes.flatMap((m) => m.primitives.flatMap((p) => [...Object.values(p.attributes), p.indices]));
  same('меш (атрибуты, индексы)', JSON.stringify(accs(A.json, A.bin, meshIds(A.json))), JSON.stringify(accs(B.json, B.bin, meshIds(B.json))));
  same('inverseBindMatrices', accs(A.json, A.bin, [A.json.skins[0].inverseBindMatrices])[0], accs(B.json, B.bin, [B.json.skins[0].inverseBindMatrices])[0]);
  const img = (r) => { const bv = r.json.bufferViews[r.json.images[0].bufferView]; return r.bin.subarray(bv.byteOffset, bv.byteOffset + bv.byteLength).toString('hex'); };
  same('текстура (PNG)', img(A), img(B));
  return diffs;
}

// ---------------------------------------------------------------- вывод
function printRows(title, rows) {
  console.log(`\n${title}`);
  console.log('клип           кадров  макс, мм  средн, мм  кость (кадр FBX)           Hips: абс. смещение vs FBX, мм  невязка после D, мм');
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(14)} ${String(r.frames).padStart(6)}  ${r.max.toFixed(3).padStart(8)}  ${r.mean.toFixed(3).padStart(9)}  ${`${r.bone} (${r.frame})`.padEnd(26)} ${r.hipsOff.toFixed(2).padStart(12)}${r.locked ? ' (с локом)' : '          '}  ${r.hipsRes.toFixed(4).padStart(18)}  ${r.ok ? 'ok' : 'FAIL'}`,
    );
  }
  for (const r of rows) if (r.pyDiff !== null) console.log(`  FK JS против fk.py (pose/${r.file.replace('.fbx', '.json')}): макс ${r.pyDiff.toFixed(4)} мм (${r.id})`);
}

function main() {
  const a = process.argv.slice(2);
  const o = { glb: null, lock: true, only: null, tol: 1, config: path.join(ROOT, 'data', 'clips', 'terraks.json') };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--glb') o.glb = path.resolve(a[++i]);
    else if (a[i] === '--no-lock') o.lock = false;
    else if (a[i] === '--only') o.only = a[++i].split(',');
    else if (a[i] === '--tol') o.tol = Number(a[++i]);
    else if (a[i] === '--config') o.config = path.resolve(a[++i]);
    else throw new Error(`Неизвестный аргумент ${a[i]}`);
  }
  const cfg = JSON.parse(fs.readFileSync(o.config, 'utf8'));
  const fbxDir = path.join(ROOT, cfg.fbxDir);
  let bad = false;
  const run = (title, glb, lock) => {
    const rows = verifyFk(glb, cfg, { lock, only: o.only, tol: o.tol, fbxDir });
    printRows(title, rows);
    if (rows.some((r) => !r.ok)) bad = true;
    const { errs, notes } = checkStructure(glb);
    console.log(errs.length ? `структура GLB: ${errs.length} ошибок` : 'структура GLB: ok');
    errs.slice(0, 20).forEach((e) => console.log('  ' + e));
    if (notes.length) console.log(`  замечания по клипам базы (Blender, байты не меняются): ${notes.length}, например: ${notes[0]}`);
    if (errs.length) bad = true;
    const diffs = checkBaseUnchanged(glb, path.join(ROOT, cfg.baseGlb), cfg);
    console.log(diffs.length ? `базовые клипы/меш изменились: ${diffs.join('; ')}` : 'базовые клипы (без file), меш, скелет, IBM, текстура: байты равны базе');
    if (diffs.length) bad = true;
  };
  if (o.glb) run(`${path.relative(ROOT, o.glb)} (${o.lock ? 'с локом' : 'без лока'})`, o.glb, o.lock);
  else {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-clips-'));
    const pre = path.join(tmpDir, 'prelock.glb');
    buildClips({ config: o.config, out: pre });
    run('ДО apply-root-lock (build-clips, factor не применён)', pre, false);
    fs.rmSync(tmpDir, { recursive: true });
    const final = path.join(ROOT, cfg.outGlb);
    run(`ИТОГ ${cfg.outGlb} (после apply-root-lock)`, final, true);
  }
  console.log(bad ? '\nПРОВАЛ' : '\nвсё в допуске');
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
