/**
 * Минимальные утилиты GLB 2.0 (один BIN-чанк, без зависимостей): чтение и запись,
 * добавление accessor'ов, удаление неиспользуемых bufferView/accessor. Общие для
 * build-clips.mjs, apply-root-lock.mjs и verify-clips.mjs.
 */
import fs from 'node:fs';

const MAGIC = 0x46546c67, CH_JSON = 0x4e4f534a, CH_BIN = 0x004e4942;

export function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== MAGIC || b.readUInt32LE(4) !== 2) throw new Error(`${file}: не GLB v2`);
  const jsonLen = b.readUInt32LE(12);
  if (b.readUInt32LE(16) !== CH_JSON) throw new Error(`${file}: первый чанк не JSON`);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  const h = 20 + jsonLen;
  if (b.readUInt32LE(h + 4) !== CH_BIN) throw new Error(`${file}: второй чанк не BIN`);
  const binLen = b.readUInt32LE(h);
  const bin = Buffer.from(b.subarray(h + 8, h + 8 + binLen)); // копия: её можно править
  return { json, bin };
}

export function writeGlb(file, json, bin) {
  if (bin.length % 4) throw new Error('BIN-чанк должен быть кратен 4 байтам');
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(MAGIC, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  head.writeUInt32LE(js.length, 12);
  head.writeUInt32LE(CH_JSON, 16);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(bin.length, 0);
  binHead.writeUInt32LE(CH_BIN, 4);
  fs.writeFileSync(file, Buffer.concat([head, js, binHead, bin]));
}

export const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
export const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

/** Диапазон байт accessor'а в BIN (только плотные accessor'ы без sparse/stride). */
export function accessorRange(json, idx) {
  const a = json.accessors[idx];
  if (a.sparse) throw new Error(`accessor ${idx}: sparse не поддерживается`);
  const bv = json.bufferViews[a.bufferView];
  const size = COMPONENTS[a.type] * COMPONENT_BYTES[a.componentType];
  if (bv.byteStride && bv.byteStride !== size) throw new Error(`accessor ${idx}: byteStride не поддерживается`);
  const offset = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return { offset, length: a.count * size, count: a.count, ncomp: COMPONENTS[a.type] };
}

/** float32-accessor -> массив массивов (по одному на элемент) или плоский для SCALAR. */
export function readFloatAccessor(json, bin, idx) {
  const a = json.accessors[idx];
  if (a.componentType !== 5126) throw new Error(`accessor ${idx}: ожидается float32`);
  const { offset, count, ncomp } = accessorRange(json, idx);
  const out = [];
  for (let k = 0; k < count; k++) {
    const e = [];
    for (let c = 0; c < ncomp; c++) e.push(bin.readFloatLE(offset + (k * ncomp + c) * 4));
    out.push(ncomp === 1 ? e[0] : e);
  }
  return out;
}

/** Записывает значения в существующий float32-accessor (длина должна совпадать). */
export function writeFloatAccessor(json, bin, idx, vals) {
  const { offset, count, ncomp } = accessorRange(json, idx);
  if (vals.length !== count) throw new Error(`accessor ${idx}: ${vals.length} значений вместо ${count}`);
  vals.forEach((v, k) => {
    const e = ncomp === 1 ? [v] : v;
    e.forEach((x, c) => bin.writeFloatLE(x, offset + (k * ncomp + c) * 4));
  });
}

/** min/max по компонентам float32-значений (как требует спецификация для времени и позиций). */
export function minMax(vals, ncomp) {
  const min = Array(ncomp).fill(Infinity), max = Array(ncomp).fill(-Infinity);
  for (const v of vals) {
    const e = ncomp === 1 ? [v] : v;
    for (let c = 0; c < ncomp; c++) { if (e[c] < min[c]) min[c] = e[c]; if (e[c] > max[c]) max[c] = e[c]; }
  }
  return { min, max };
}

/**
 * Добавляет новый float32-accessor (собственный bufferView) в конец BIN.
 * Возвращает { index, bin } — новый (удлинённый) BIN.
 * withMinMax: записать min/max (по float32-значениям, как они лежат в файле).
 */
export function appendFloatAccessor(json, bin, vals, type, withMinMax = true) {
  const ncomp = COMPONENTS[type];
  const buf = Buffer.alloc(vals.length * ncomp * 4);
  vals.forEach((v, k) => {
    const e = ncomp === 1 ? [v] : v;
    e.forEach((x, c) => buf.writeFloatLE(x, (k * ncomp + c) * 4));
  });
  const pad = (4 - (bin.length % 4)) % 4;
  const offset = bin.length + pad;
  const bv = json.bufferViews.push({ buffer: 0, byteLength: buf.length, byteOffset: offset }) - 1;
  const acc = { bufferView: bv, componentType: 5126, count: vals.length, type };
  if (withMinMax) {
    // min/max по значениям, которые реально лежат в float32
    const stored = [];
    for (let k = 0; k < vals.length; k++) {
      const e = [];
      for (let c = 0; c < ncomp; c++) e.push(buf.readFloatLE((k * ncomp + c) * 4));
      stored.push(ncomp === 1 ? e[0] : e);
    }
    Object.assign(acc, minMax(stored, ncomp));
  }
  const index = json.accessors.push(acc) - 1;
  json.buffers[0].byteLength = offset + buf.length;
  return { index, bin: Buffer.concat([bin, Buffer.alloc(pad), buf]) };
}

/**
 * Удаляет accessor'ы и bufferView, на которые никто не ссылается (после удаления клипов),
 * и пересобирает BIN. Порядок остальных сохраняется, байты данных не меняются, смещения выравниваются на 4.
 * Возвращает новый BIN; json правится на месте.
 */
export function compact(json, bin) {
  const usedAcc = new Set();
  const useA = (i) => { if (i !== undefined) usedAcc.add(i); };
  for (const m of json.meshes ?? []) for (const p of m.primitives) {
    Object.values(p.attributes).forEach(useA); useA(p.indices);
    for (const t of p.targets ?? []) Object.values(t).forEach(useA);
  }
  for (const s of json.skins ?? []) useA(s.inverseBindMatrices);
  for (const a of json.animations ?? []) for (const s of a.samplers) { useA(s.input); useA(s.output); }
  const usedBv = new Set();
  for (const i of usedAcc) {
    const a = json.accessors[i];
    if (a.bufferView !== undefined) usedBv.add(a.bufferView);
    if (a.sparse) throw new Error('sparse accessor не поддерживается');
  }
  for (const im of json.images ?? []) if (im.bufferView !== undefined) usedBv.add(im.bufferView);

  const bvMap = new Map(), parts = [];
  let off = 0;
  const newBv = [];
  json.bufferViews.forEach((bv, i) => {
    if (!usedBv.has(i)) return;
    const pad = (4 - (off % 4)) % 4;
    if (pad) parts.push(Buffer.alloc(pad));
    off += pad;
    const start = bv.byteOffset ?? 0;
    parts.push(bin.subarray(start, start + bv.byteLength));
    bvMap.set(i, newBv.length);
    newBv.push({ ...bv, byteOffset: off });
    off += bv.byteLength;
  });
  const tail = (4 - (off % 4)) % 4;
  if (tail) { parts.push(Buffer.alloc(tail)); off += tail; }

  const accMap = new Map(), newAcc = [];
  json.accessors.forEach((a, i) => {
    if (!usedAcc.has(i)) return;
    accMap.set(i, newAcc.length);
    newAcc.push(a.bufferView === undefined ? a : { ...a, bufferView: bvMap.get(a.bufferView) });
  });
  const mapA = (i) => (i === undefined ? undefined : accMap.get(i));
  for (const m of json.meshes ?? []) for (const p of m.primitives) {
    for (const k of Object.keys(p.attributes)) p.attributes[k] = mapA(p.attributes[k]);
    if (p.indices !== undefined) p.indices = mapA(p.indices);
  }
  for (const s of json.skins ?? []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = mapA(s.inverseBindMatrices);
  for (const a of json.animations ?? []) for (const s of a.samplers) { s.input = mapA(s.input); s.output = mapA(s.output); }
  for (const im of json.images ?? []) if (im.bufferView !== undefined) im.bufferView = bvMap.get(im.bufferView);
  json.accessors = newAcc;
  json.bufferViews = newBv;
  json.buffers[0].byteLength = off;
  return Buffer.concat(parts, off);
}

/** Для каждого accessor'а: сколько samplers (по всем анимациям) на него ссылаются как на input/output. */
export function samplerUsage(json) {
  const use = new Map();
  json.animations?.forEach((an, ai) => an.samplers.forEach((s, si) => {
    for (const idx of [s.input, s.output]) {
      if (!use.has(idx)) use.set(idx, []);
      use.get(idx).push(`${an.name ?? ai}#${si}`);
    }
  }));
  return use;
}
