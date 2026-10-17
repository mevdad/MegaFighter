#!/usr/bin/env node
/**
 * Root lock: вычитает долю смещения таза (mixamorig:Hips) из translation-канала клипов GLB,
 * потому что Martelo_2 (kick_high) скачан без «In Place» и таз уезжает вперёд до +0,456 м.
 *
 * Запуск (без Blender, без зависимостей, детерминированно):
 *     node scripts/apply-root-lock.mjs                              # по data/clips/terraks.json, правит GLB на месте
 *     node scripts/apply-root-lock.mjs --set kick_high=0.6          # одноразово другой factor (JSON не меняется)
 *     node scripts/apply-root-lock.mjs --set kick_high=0.6 --out /tmp/k06.glb   # писать в другой файл
 *     node scripts/apply-root-lock.mjs --glb in.glb --out out.glb --config other.json
 *
 * Конфиг: data/clips/terraks.json, по каждому клипу { name, rootLock: { axes: ["z"], factor: 0..1 } }.
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
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
      if (!name || v === undefined || !Number.isFinite(f)) throw new Error(`--set ожидает имя_клипа=factor, получено «${argv[i]}»`);
      o.set[name] = f;
    } else throw new Error(`Неизвестный аргумент ${a}`);
  }
  o.out ??= o.glb;
  return o;
}

// ---------------------------------------------------------------- GLB
function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67 || b.readUInt32LE(4) !== 2) throw new Error('Не GLB v2');
  const jsonLen = b.readUInt32LE(12);
  if (b.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Первый чанк не JSON');
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  const binHdr = 20 + jsonLen;
  if (b.readUInt32LE(binHdr + 4) !== 0x004e4942) throw new Error('Второй чанк не BIN');
  const binLen = b.readUInt32LE(binHdr);
  const bin = Buffer.from(b.subarray(binHdr + 8, binHdr + 8 + binLen)); // копия, правим её
  return { json, bin };
}

function writeGlb(file, json, bin) {
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length;
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(total, 8);
  head.writeUInt32LE(js.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(bin.length, 0);
  binHead.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([head, js, binHead, bin]));
}

/** Смещение в BIN первого float32 VEC3 accessor'а и число ключей. */
function vec3Accessor(json, idx) {
  const a = json.accessors[idx];
  if (a.componentType !== 5126 || a.type !== 'VEC3' || a.sparse || a.normalized) throw new Error(`accessor ${idx}: ожидается обычный float32 VEC3`);
  const bv = json.bufferViews[a.bufferView];
  if (bv.byteStride && bv.byteStride !== 12) throw new Error(`accessor ${idx}: byteStride не поддерживается`);
  return { offset: (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), count: a.count };
}

function readVec3(bin, acc) {
  const out = [];
  for (let k = 0; k < acc.count; k++) out.push([0, 1, 2].map((c) => bin.readFloatLE(acc.offset + (k * 3 + c) * 4)));
  return out;
}

function writeVec3(bin, acc, vals) {
  vals.forEach((v, k) => v.forEach((x, c) => bin.writeFloatLE(x, acc.offset + (k * 3 + c) * 4)));
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
  const { json, bin } = readGlb(opt.glb);

  const hips = json.nodes.findIndex((n) => (n.name ?? '').endsWith(HIPS_SUFFIX));
  if (hips < 0) throw new Error('Не найден узел *:Hips');
  const P = parentWorld(json, hips);

  for (const clip of cfg.clips) {
    const rl = clip.rootLock;
    if (!rl) continue;
    const factor = opt.set[clip.name] ?? rl.factor;
    if (!(factor >= 0 && factor <= 1)) throw new Error(`${clip.name}: factor ${factor} вне 0..1`);
    const anim = json.animations.find((a) => a.name === clip.name);
    if (!anim) throw new Error(`В GLB нет клипа «${clip.name}»`);
    const ch = anim.channels.find((c) => c.target.node === hips && c.target.path === 'translation');
    if (!ch) throw new Error(`${clip.name}: нет translation-канала Hips`);
    const acc = vec3Accessor(json, anim.samplers[ch.sampler].output);
    const mapping = mapAxes(P, rl.axes, clip.name);

    // 1) восстановить оригинал, если клип уже обрабатывался
    const saved = anim.extras?.rootLock?.original;
    if (saved) {
      if (saved.length !== acc.count) throw new Error(`${clip.name}: extras.rootLock.original не совпадает по длине`);
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
    writeVec3(bin, acc, after);
    const stored = readVec3(bin, acc); // что реально лежит в float32 после записи

    // 3) метаданные для идемпотентности
    if (factor > 0) {
      anim.extras = { ...(anim.extras ?? {}), rootLock: { axes: rl.axes, factor, original: saved ?? orig } };
    } else if (anim.extras?.rootLock) {
      delete anim.extras.rootLock;
      if (Object.keys(anim.extras).length === 0) delete anim.extras;
    }

    const map = mapping.map((m) => `${m.axis}->local[${'xyz'[m.local]}]${m.sign < 0 ? ' (знак -)' : ''}`).join(', ');
    console.log(`${clip.name}: factor ${factor}, оси ${map}${opt.set[clip.name] !== undefined ? ' (override --set)' : ''}`);
    console.log(`  до    мир Hips  ${stats(P, orig)}`);
    console.log(`  после мир Hips  ${stats(P, stored)}`);
  }

  writeGlb(opt.out, json, bin);
  console.log(`Записано: ${opt.out}`);
}

main();
