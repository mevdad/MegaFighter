#!/usr/bin/env node
/**
 * Root lock: вычитает долю смещения таза (mixamorig:Hips) из translation-канала клипов GLB,
 * потому что Martelo_2 (kick_high) скачан без «In Place» и таз уезжает вперёд до +0,456 м.
 *
 * Запуск (без Blender, без зависимостей, детерминированно):
 *     node scripts/apply-root-lock.mjs                              # по data/clips/terraks.json, правит GLB на месте
 *     node scripts/apply-root-lock.mjs --set martelo_2=0.6          # одноразово другой factor (JSON не меняется)
 *     node scripts/apply-root-lock.mjs --set martelo_2=0.6 --out /tmp/k06.glb   # писать в другой файл
 *     node scripts/apply-root-lock.mjs --glb in.glb --out out.glb --config other.json
 * Обычно вызывается через `npm run build:clips` сразу после scripts/build-clips.mjs.
 *
 * Конфиг: data/clips/terraks.json, по каждому клипу { id, rootLock: { axes: ["z"], factor: 0..1 }, ... }
 * (id = имя анимации в GLB; остальные поля читает build-clips).
 *   factor 0 — клип не трогается (байты accessor'а не меняются), 1 — Hips полностью зафиксирован
 *   по оси на значении ПЕРВОГО ключа клипа (в GLB он стоит на 0,0333 с), 0..1 — доля смещения.
 *   Формула на каждый ключ k:  p[k] := p[k] - factor * (p[k] - p[0])  (только выбранные оси).
 *
 * Оси в конфиге — МИРОВЫЕ оси модели: x вправо, y вверх, z вперёд (лицом персонажа, +Z в glTF).
 * translation Hips лежит в локали родителя (Armature с поворотом +90° по X), поэтому локальные
 * компоненты не совпадают с мировыми. Скрипт берёт мировую матрицу родителя Hips и по ней находит,
 * какая локальная компонента даёт нужную мировую ось (для Armature +90° по X: мировой Z = локальный Y,
 * мировой Y = -локальный Z, мировой X = локальный X). Если родитель повёрнут не на кратный 90° угол
 * или имеет масштаб != 1, скрипт останавливается с ошибкой.
 *
 * Идемпотентность: исходный translation Hips клипа с factor > 0 сохраняется в
 * animation.extras.rootLock.original (glTF extras, движок их игнорирует). Повторный запуск сначала
 * восстанавливает оригинал, потом применяет текущий factor — поэтому factor можно менять туда-сюда
 * и после factor 1 вернуть 0,6 или 0. Свежий GLB из Blender (bake:terraks) оригинал и несёт:
 * после пересборки в Blender этот скрипт нужно запустить снова.
 * Вращения Hips, остальные кости и остальные клипы не затрагиваются.
 *
 * Общие accessor'ы. Правится float32-accessor translation Hips прямо в BIN. Если этот accessor
 * используется ещё каким-то sampler'ом (того же или другого клипа) или перекрывается по байтам с другим
 * accessor'ом, правка испортила бы чужой клип. В этом случае скрипт НЕ падает, а создаёт отдельную копию
 * (новый bufferView + accessor в конце BIN) и перенаправляет на неё sampler этого клипа; общий оригинал
 * остаётся нетронутым (выбрано копирование, а не ошибка: лок продолжает работать для любого GLB).
 * Если у правимого accessor'а есть min/max, они пересчитываются по float32-значениям, которые реально
 * лежат в файле (валидатор glTF сверяет их с данными); у accessor'а без min/max их не появляется.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, accessorRange, appendFloatAccessor, minMax, samplerUsage } from './lib/glb.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HIPS_SUFFIX = ':Hips';
const AXIS_INDEX = { x: 0, y: 1, z: 2 };
const SNAP_EPS = 1e-4;

// ---------------------------------------------------------------- аргументы
function parseArgs(argv) {
  const o = {
    config: path.join(ROOT, 'data', 'clips', 'terraks.json'),
    glb: path.join(ROOT, 'public', 'models', 'warrior3.glb'),
    out: null,
    set: {},
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') o.config = path.resolve(argv[++i]);
    else if (a === '--glb') o.glb = path.resolve(argv[++i]);
    else if (a === '--out') o.out = path.resolve(argv[++i]);
    else if (a === '--set') {
      const [name, v] = String(argv[++i]).split('=');
      const f = Number(v);
      if (!name || v === undefined || !Number.isFinite(f)) throw new Error(`--set ожидает id_клипа=factor, получено «${argv[i]}»`);
      o.set[name] = f;
    } else throw new Error(`Неизвестный аргумент ${a}`);
  }
  o.out ??= o.glb;
  return o;
}

// ---------------------------------------------------------------- GLB (общие readGlb/writeGlb: scripts/lib/glb.mjs)
/** Смещение в BIN первого float32 VEC3 accessor'а и число ключей. */
function vec3Accessor(json, idx) {
  const a = json.accessors[idx];
  if (a.componentType !== 5126 || a.type !== 'VEC3' || a.sparse || a.normalized) throw new Error(`accessor ${idx}: ожидается обычный float32 VEC3`);
  const { offset, count } = accessorRange(json, idx); // бросает на byteStride != 12 и sparse
  return { offset, count };
}

function readVec3(bin, acc) {
  const out = [];
  for (let k = 0; k < acc.count; k++) out.push([0, 1, 2].map((c) => bin.readFloatLE(acc.offset + (k * 3 + c) * 4)));
  return out;
}

function writeVec3(bin, acc, vals) {
  vals.forEach((v, k) => v.forEach((x, c) => bin.writeFloatLE(x, acc.offset + (k * 3 + c) * 4)));
}

/** Другие sampler'ы / перекрывающиеся accessor'ы, делящие байты с accessor'ом idx (пустой список = accessor уникален). */
function sharers(json, idx, usage) {
  const out = (usage.get(idx) ?? []).slice();
  const mine = accessorRange(json, idx);
  const myBv = json.accessors[idx].bufferView;
  json.accessors.forEach((a, j) => {
    if (j === idx || a.bufferView !== myBv) return;
    const r = accessorRange(json, j);
    if (r.offset < mine.offset + mine.length && mine.offset < r.offset + r.length) out.push(`accessor ${j} (перекрытие байт)`);
  });
  return out;
}

// ---------------------------------------------------------------- математика (column-major mat4)
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function trs(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const m = ident();
  m[0] = (1 - 2 * (y * y + z * z)) * s[0]; m[1] = 2 * (x * y + z * w) * s[0]; m[2] = 2 * (x * z - y * w) * s[0];
  m[4] = 2 * (x * y - z * w) * s[1]; m[5] = (1 - 2 * (x * x + z * z)) * s[1]; m[6] = 2 * (y * z + x * w) * s[1];
  m[8] = 2 * (x * z + y * w) * s[2]; m[9] = 2 * (y * z - x * w) * s[2]; m[10] = (1 - 2 * (x * x + y * y)) * s[2];
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
  return m;
}

function parentWorld(json, nodeIdx) {
  const parent = new Map();
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const chain = [];
  for (let p = parent.get(nodeIdx); p !== undefined; p = parent.get(p)) chain.unshift(p);
  return chain.reduce((m, i) => {
    const n = json.nodes[i];
    return mul(m, trs(n.translation, n.rotation, n.scale));
  }, ident());
}

/** Для каждой мировой оси из axes — индекс локальной компоненты translation, дающей эту ось. */
function mapAxes(P, axes, clip) {
  // P — мировая матрица родителя; мировая ось w = сумма P[w][l] * локальная компонента l.
  const m3 = (w, l) => P[l * 4 + w];
  for (let l = 0; l < 3; l++) {
    const len = Math.hypot(m3(0, l), m3(1, l), m3(2, l));
    if (Math.abs(len - 1) > 1e-3) throw new Error(`${clip}: родитель Hips с масштабом ${len.toFixed(4)} != 1 не поддерживается`);
  }
  return axes.map((ax) => {
    const w = AXIS_INDEX[ax];
    if (w === undefined) throw new Error(`${clip}: неизвестная ось «${ax}» (x|y|z)`);
    let best = -1;
    for (let l = 0; l < 3; l++) if (Math.abs(m3(w, l)) > 1 - SNAP_EPS) best = l;
    if (best < 0) throw new Error(`${clip}: мировая ось ${ax} не совпадает ни с одной локальной осью родителя Hips (поворот не кратен 90°)`);
    return { axis: ax, local: best, sign: Math.sign(m3(w, best)) };
  });
}

function worldHips(P, v) {
  return [0, 1, 2].map((w) => P[12 + w] + P[w] * v[0] + P[4 + w] * v[1] + P[8 + w] * v[2]);
}

function stats(P, series) {
  const w = series.map((v) => worldHips(P, v));
  const col = (c) => w.map((p) => p[c]);
  const f = (x) => +x.toFixed(4);
  return ['x', 'y', 'z'].map((ax, c) => {
    const s = col(c);
    return `${ax}: start ${f(s[0])} min ${f(Math.min(...s))} max ${f(Math.max(...s))} end ${f(s[s.length - 1])}`;
  }).join(' | ');
}

// ---------------------------------------------------------------- main
function main() {
  const opt = parseArgs(process.argv.slice(2));
  const cfg = JSON.parse(fs.readFileSync(opt.config, 'utf8'));
  const glb = readGlb(opt.glb);
  const { json } = glb;
  let bin = glb.bin;

  const hips = json.nodes.findIndex((n) => (n.name ?? '').endsWith(HIPS_SUFFIX));
  if (hips < 0) throw new Error('Не найден узел *:Hips');
  const P = parentWorld(json, hips);

  for (const clip of cfg.clips) {
    const rl = clip.rootLock;
    if (!rl) continue;
    const id = clip.id;
    if (!id) throw new Error('В конфиге клип без id (схема: { id, ..., rootLock })');
    const factor = opt.set[id] ?? rl.factor;
    if (!(factor >= 0 && factor <= 1)) throw new Error(`${id}: factor ${factor} вне 0..1`);
    const anim = json.animations.find((a) => a.name === id);
    if (!anim) throw new Error(`В GLB нет клипа «${id}»`);
    const ch = anim.channels.find((c) => c.target.node === hips && c.target.path === 'translation');
    if (!ch) throw new Error(`${id}: нет translation-канала Hips`);
    const sampler = anim.samplers[ch.sampler];
    let acc = vec3Accessor(json, sampler.output);
    const mapping = mapAxes(P, rl.axes, id);
    const saved = anim.extras?.rootLock?.original;
    const willWrite = factor > 0 || !!saved; // иначе байты accessor'а не трогаем

    // 0) accessor делится с другим sampler'ом или accessor'ом: правим отдельную копию, общий оригинал не трогаем
    let copied = '';
    if (willWrite) {
      const others = sharers(json, sampler.output, samplerUsage(json)).filter((u) => u !== `${anim.name}#${ch.sampler}`);
      if (others.length > 0) {
        const src = json.accessors[sampler.output];
        const r = appendFloatAccessor(json, bin, readVec3(bin, acc), 'VEC3', !!(src.min || src.max));
        bin = r.bin;
        sampler.output = r.index;
        acc = vec3Accessor(json, r.index);
        copied = ` (accessor делился с ${others.join(', ')}: правится отдельная копия)`;
      }
    }

    // 1) восстановить оригинал, если клип уже обрабатывался
    if (saved) {
      if (saved.length !== acc.count) throw new Error(`${id}: extras.rootLock.original не совпадает по длине`);
      writeVec3(bin, acc, saved);
    }
    const orig = readVec3(bin, acc);

    // 2) применить factor к первому ключу как опорному
    let after = orig;
    if (factor > 0) {
      const p0 = orig[0];
      after = orig.map((v) => {
        const o = v.slice();
        if (v === p0) return o;
        for (const { local } of mapping) o[local] = v[local] - factor * (v[local] - p0[local]);
        return o;
      });
    }
    if (willWrite) writeVec3(bin, acc, after);
    const stored = readVec3(bin, acc); // что реально лежит в float32 после записи
    // min/max (если были) должны описывать то, что лежит в файле
    const a = json.accessors[sampler.output];
    if (willWrite && (a.min || a.max)) Object.assign(a, minMax(stored, 3));

    // 3) метаданные для идемпотентности
    if (factor > 0) {
      anim.extras = { ...(anim.extras ?? {}), rootLock: { axes: rl.axes, factor, original: saved ?? orig } };
    } else if (anim.extras?.rootLock) {
      delete anim.extras.rootLock;
      if (Object.keys(anim.extras).length === 0) delete anim.extras;
    }

    const map = mapping.map((m) => `${m.axis}->local[${'xyz'[m.local]}]${m.sign < 0 ? ' (знак -)' : ''}`).join(', ');
    console.log(`${id}: factor ${factor}, оси ${map}${opt.set[id] !== undefined ? ' (override --set)' : ''}${copied}`);
    console.log(`  до    мир Hips  ${stats(P, orig)}`);
    console.log(`  после мир Hips  ${stats(P, stored)}`);
  }

  writeGlb(opt.out, json, bin);
  console.log(`Записано: ${opt.out}`);
}

main();
