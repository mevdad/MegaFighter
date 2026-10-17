// Быстрые тесты пайплайна клипов (scripts/lib/*, build-clips, apply-root-lock) на синтетических данных:
// без FBX, без Blender и без тяжёлых GLB. Полная сверка с FBX: npm run verify:clips.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { quatEulerXYZ, qmul, qrot, qconj } from './lib/fbx.mjs';
import { appendFloatAccessor, compact, readFloatAccessor, readGlb, writeGlb, minMax } from './lib/glb.mjs';
import { computeClip } from './build-clips.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// матрицы R = Rz·Ry·Rx для сверки порядка Эйлера XYZ
const mm = (a, b) => a.map((_, i) => [0, 1, 2].map((j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]));
const rx = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const ry = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const rz = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
const rad = (d) => (d * Math.PI) / 180;

describe('эйлер XYZ как в FBX (R = Rz·Ry·Rx)', () => {
  it('кватернион поворачивает вектор так же, как матрица', () => {
    for (const e of [[10, 20, 30], [-47, 0.4, -0.3], [90, -45, 170]]) {
      const R = mm(rz(rad(e[2])), mm(ry(rad(e[1])), rx(rad(e[0]))));
      const q = quatEulerXYZ(...e);
      const v = [0.3, -0.5, 0.8];
      const m = [0, 1, 2].map((i) => R[i][0] * v[0] + R[i][1] * v[1] + R[i][2] * v[2]);
      qrot(q, v).forEach((x, i) => expect(x).toBeCloseTo(m[i], 9));
    }
  });
});

describe('computeClip', () => {
  const armatureQ = quatEulerXYZ(90, 0, 0);
  const glbInfo = { boneNames: ['mixamorig:Hips', 'mixamorig:Spine'], armatureQ, hipsRestWorld: [0, 0.5606, 0.0305] };
  const mk = (rot, trans) => ({ nkeys: 4, bones: new Map([
    ['mixamorig:Hips', { name: 'mixamorig:Hips', parent: null, pre: [0, 0, 0], lclT: [0, 0.565, 0], lclR: [0, 0, 0], rot: null, trans }],
    ['mixamorig:Spine', { name: 'mixamorig:Spine', parent: 'mixamorig:Hips', pre: [-8.78, 0, 0], lclT: [0, 0.04, 0], lclR: [5, 0, 0], rot, trans: null }],
  ]) });
  const flat = (v) => [v, v, v, v];

  it('trim включительный, translation Hips = FBX + D в локали Armature', () => {
    const fbx = mk(null, [[0, 0.01, 0.02, 0.03], [0.5, 0.4, 0.3, 0.2], [0, 0.1, 0.2, 0.3]]);
    const c = computeClip(fbx, { start: 1, end: 3 }, glbInfo, 't');
    expect(c.frames).toEqual([1, 2, 3]);
    expect(c.D[1]).toBeCloseTo(0.5606 - 0.565, 9);
    expect(c.D[2]).toBeCloseTo(0.0305, 9);
    // мировой вектор (x, y+Dy, z+Dz) -> локаль (x, z, -y)
    expect(c.hips[0][0]).toBeCloseTo(0.01, 9);
    expect(c.hips[0][1]).toBeCloseTo(0.1 + 0.0305, 9);
    expect(c.hips[0][2]).toBeCloseTo(-(0.4 + 0.5606 - 0.565), 9);
    // обратно в мир тем же Armature
    const w = qrot(armatureQ, c.hips[0]);
    expect(w[1]).toBeCloseTo(0.4 + (0.5606 - 0.565), 9);
  });

  it('кривые абсолютные: поза кости = PreRotation·R(кривая), без вычитания позы по умолчанию', () => {
    const fbx = mk([flat(30), flat(0), flat(0)], [flat(0), flat(0.5), flat(0)]);
    const c = computeClip(fbx, { start: 0, end: 3 }, glbInfo, 't');
    const want = qmul(quatEulerXYZ(-8.78, 0, 0), quatEulerXYZ(30, 0, 0));
    c.rot.get('mixamorig:Spine').forEach((q) => q.forEach((x, i) => expect(x).toBeCloseTo(want[i], 9)));
    // Hips: Q_Armature⁻¹ (rest узла -90° по X) · R(кривая) = -90° по X при нулевой кривой
    const h = c.rot.get('mixamorig:Hips')[0];
    const rest = qmul(qconj(armatureQ), [0, 0, 0, 1]);
    h.forEach((x, i) => expect(Math.abs(x)).toBeCloseTo(Math.abs(rest[i]), 9));
  });

  it('кость без кривой берёт Lcl Rotation по умолчанию, знак кватерниона непрерывен', () => {
    const noCurve = mk(null, [flat(0), flat(0.5), flat(0)]);
    const c = computeClip(noCurve, { start: 0, end: 1 }, glbInfo, 't');
    const want = qmul(quatEulerXYZ(-8.78, 0, 0), quatEulerXYZ(5, 0, 0));
    c.rot.get('mixamorig:Spine')[0].forEach((x, i) => expect(x).toBeCloseTo(want[i], 9));
    // вращение через 360 градусов даёт тот же поворот, но противоположный знак: должен сохраниться dot > 0
    const fbx = mk([[0, 120, 240, 360], flat(0), flat(0)], [flat(0), flat(0.5), flat(0)]);
    const q = computeClip(fbx, { start: 0, end: 3 }, glbInfo, 't').rot.get('mixamorig:Spine');
    for (let k = 1; k < q.length; k++) expect(q[k].reduce((s, x, i) => s + x * q[k - 1][i], 0)).toBeGreaterThan(0);
  });

  it('падает при trim вне клипа', () => {
    expect(() => computeClip(mk(null, null), { start: 2, end: 9 }, glbInfo, 't')).toThrow(/вне/);
  });
});

/** Минимальный GLB: узлы Armature(+90° X) -> Hips, две анимации с общим translation-accessor'ом. */
function tinyGlb(file, { share }) {
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [1] }],
    nodes: [
      { name: 'mixamorig:Hips', rotation: [-0.7071067690849304, 0, 0, 0.7071067690849304], translation: [0, 0.03, -0.56] },
      { name: 'Armature', children: [0], rotation: [0.7071068286895752, 0, 0, 0.7071068286895752] },
    ],
    animations: [],
    accessors: [],
    bufferViews: [],
    buffers: [{ byteLength: 0 }],
  };
  let bin = Buffer.alloc(0);
  const add = (vals, type) => { const r = appendFloatAccessor(json, bin, vals, type, true); bin = r.bin; return r.index; };
  const time = add([0, 1 / 30, 2 / 30], 'SCALAR');
  // локальный Y = мировой Z: ход вперёд по Z
  const trans = add([[0, 0.03, -0.56], [0, 0.13, -0.56], [0, 0.23, -0.56]], 'VEC3');
  const mk = (name, out) => ({ name, samplers: [{ input: time, interpolation: 'LINEAR', output: out }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] });
  json.animations.push(mk('a', trans));
  json.animations.push(mk('b', share ? trans : add([[0, 0.03, -0.56], [0, 0.13, -0.56], [0, 0.23, -0.56]], 'VEC3')));
  writeGlb(file, json, bin);
}

describe('apply-root-lock: общий accessor', () => {
  const run = (cfgObj, glb, out) => {
    const dir = path.dirname(glb);
    const cfg = path.join(dir, 'cfg.json');
    fs.writeFileSync(cfg, JSON.stringify(cfgObj));
    return execFileSync(process.execPath, [path.join(HERE, 'apply-root-lock.mjs'), '--config', cfg, '--glb', glb, '--out', out], { encoding: 'utf8' });
  };
  const hipsWorldZ = (file, anim) => {
    const { json, bin } = readGlb(file);
    const a = json.animations.find((x) => x.name === anim);
    // мировой Z = локальный Y
    return readFloatAccessor(json, bin, a.samplers[0].output).map((v) => v[1]);
  };

  it('создаёт отдельную копию, общий оригинал не меняется, min/max верны', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arl-test-'));
    const glb = path.join(dir, 'in.glb'), out = path.join(dir, 'out.glb'), out2 = path.join(dir, 'out2.glb');
    tinyGlb(glb, { share: true });
    const cfg = { clips: [{ id: 'a', rootLock: { axes: ['z'], factor: 1 } }] };
    const log = run(cfg, glb, out);
    expect(log).toMatch(/отдельная копия/);
    expect(hipsWorldZ(out, 'a')[2]).toBeCloseTo(0.03, 6); // заперт по Z на первом ключе
    expect(hipsWorldZ(out, 'b')[2]).toBeCloseTo(0.23, 6); // чужой клип не тронут
    const { json, bin } = readGlb(out);
    const idx = json.animations[0].samplers[0].output;
    expect(idx).not.toBe(json.animations[1].samplers[0].output);
    const vals = readFloatAccessor(json, bin, idx);
    const mmx = minMax(vals, 3);
    expect(json.accessors[idx].min).toEqual(mmx.min);
    expect(json.accessors[idx].max).toEqual(mmx.max);
    // идемпотентность: повторный запуск на результате даёт те же байты, смена factor возвращает оригинал
    run(cfg, out, out2);
    expect(fs.readFileSync(out2).equals(fs.readFileSync(out))).toBe(true);
    const out3 = path.join(dir, 'out3.glb');
    run({ clips: [{ id: 'a', rootLock: { axes: ['z'], factor: 0 } }] }, out, out3);
    expect(hipsWorldZ(out3, 'a')[2]).toBeCloseTo(0.23, 6);
    fs.rmSync(dir, { recursive: true });
  });

  it('уникальный accessor правится на месте без копии', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arl-test-'));
    const glb = path.join(dir, 'in.glb'), out = path.join(dir, 'out.glb');
    tinyGlb(glb, { share: false });
    const before = readGlb(glb).json.accessors.length;
    const log = run({ clips: [{ id: 'a', rootLock: { axes: ['z'], factor: 0.5 } }] }, glb, out);
    expect(log).not.toMatch(/копия/);
    expect(readGlb(out).json.accessors.length).toBe(before);
    expect(hipsWorldZ(out, 'a')[2]).toBeCloseTo(0.03 + 0.5 * 0.2, 6);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('compact', () => {
  it('удаляет неиспользуемое и не меняет байты оставшегося', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-test-'));
    const f = path.join(dir, 't.glb');
    tinyGlb(f, { share: false });
    const { json, bin } = readGlb(f);
    const keep = readFloatAccessor(json, bin, json.animations[0].samplers[0].output);
    json.animations.pop(); // клип b выброшен
    const nb = compact(json, bin);
    expect(json.accessors.length).toBe(2);
    expect(nb.length).toBe(json.buffers[0].byteLength);
    expect(readFloatAccessor(json, nb, json.animations[0].samplers[0].output)).toEqual(keep);
    fs.rmSync(dir, { recursive: true });
  });
});
