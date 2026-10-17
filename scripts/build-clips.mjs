#!/usr/bin/env node
/**
 * build-clips: собирает клипы Терракса в GLB прямо из FBX Mixamo, без Blender.
 *
 *     node scripts/build-clips.mjs                    # data/clips/terraks.json -> public/models/warrior3.glb
 *     node scripts/build-clips.mjs --out /tmp/x.glb   # писать в другой файл
 *     node scripts/build-clips.mjs --config c.json --base base.glb --fbx-dir dir
 * Дальше (npm run build:clips) идёт scripts/apply-root-lock.mjs. Цепочка идемпотентна:
 * build-clips каждый раз начинает с нетронутой базы, поэтому результат побайтово один и тот же.
 *
 * Язык: Node (а не python3) потому, что вся остальная сборка (apply-root-lock, gltf_fk, smoke, vite)
 * на Node, GLB-читалка/писалка уже была на JS, а zlib и Buffer есть в самом Node. Python в
 * репозитории только у Blender-скрипта и разовых аудитов; тащить второй рантайм в npm-цепочку незачем.
 *
 * ---------------------------------------------------------------- что делает
 * Берёт из БАЗОВОГО GLB (assets/rig-source/terraks/terraks-base.glb: вывод Blender до apply-root-lock,
 * `npm run bake:terraks`) меш, скелет, материал и клипы без `file` в конфиге (idle_hold, punch_body:
 * байты их accessor'ов не меняются). Клипы с `file` строятся заново из FBX; остальные клипы базы
 * (старые kick_high, punch_heavy) в итоговый файл не попадают: roster ссылается на новые id.
 *
 * ---------------------------------------------------------------- модель клипа
 * Кадры в индексации FBX: ключ i лежит на t = i/30 с, i = 0..N-1. Trim {start,end} ВКЛЮЧИТЕЛЬНЫЙ
 * с обеих сторон (кадры start..end, всего end-start+1). Время ключа в GLB = (кадр - start)/30,
 * то есть клип начинается с t = 0 и сдвига +1/30 с, который был у Blender-сборки, нет.
 * Для loop-клипа trim должен уже исключать кадр-дубль: скрипт падает, если последний кадр
 * совпадает с первым (< 1 мм и < 0,2°). Не-loop клипы дубль не отбрасывают.
 * Интерполяция LINEAR, 30 к/с, ключи на каждом кадре (без редукции).
 *
 * ---------------------------------------------------------------- вращения
 * «Without Skin» FBX несут ненулевую позу по умолчанию (Lcl Rotation у 24 костей; AUDIT_CLIPS §10.1),
 * а Blender трактовал кривые относительно неё (поза GLB = PreRotation·(R_default⁻¹·R_кривой)).
 * Здесь кривые АБСОЛЮТНЫЕ, как в FBX и в FK аудита (fk.py): поза кости = PreRotation·R(кривая),
 * R(кривая) = Rz·Ry·Rx (eEulerXYZ). Кость без кривой берёт свой Lcl Rotation по умолчанию как константу
 * (так же, как fk.py), все 41 кость получают канал rotation.
 * Связь с локальной системой узла GLB: у узла GLB локальное вращение = родитель→узел, как у FBX
 * (Blender-импорт сохраняет PreRotation в rest-вращении узла: проверено, максимум 0,024° против
 * PreRotation клипа). Rest-вращение узла в анимации НЕ участвует: канал rotation задаёт вращение
 * целиком, поэтому PreRotation берётся из FBX клипа, а не из узла.
 * Исключение Hips: его родитель в GLB, Armature, повёрнут на +90° по X (конверсия Z-up Blender -> Y-up),
 * а у FBX родителя нет. Чтобы мировая поза совпала с FBX: q_Hips = Q_Armature⁻¹ · PreRotation · R(кривая).
 * Для Hips PreRotation в FBX нулевой, так что получается -90° по X · R(кривая): ровно rest узла (-0,7071; 0; 0; 0,7071).
 * Знак кватерниона: канонизируется w >= 0 на первом ключе и dot(q[k], q[k-1]) > 0 дальше.
 *
 * ---------------------------------------------------------------- translation Hips
 * Только Hips (остальные кости не анимируют translation, каналов S нет: DECISIONS §11 для новых клипов).
 * В FBX Hips: Lcl Translation (x; y вверх; z вперёд) в метрах рига, без родителя. В GLB translation
 * лежит в локали Armature (+90° по X): мировой вектор w -> локальный Q_Armature⁻¹·w = (wx; wz; -wy)
 * (мировой Z = локальный Y, мировой Y = -локальный Z, X без изменений; масштаб 1).
 * База: Hips меш-скелета (rest узла) = (0; 0,56059; 0,03048), у «Without Skin» FBX rest Hips = (0; 0,56500; 0).
 * Длины остальных костей у обоих скелетов совпадают с точностью 0,08 мм (скелет один и тот же, это просто
 * сдвинутый скелет), поэтому поза покоя клипа = поза покоя меша, сдвинутая на
 *     D = Hips_rest(меш) - Hips_rest(FBX клипа) = (0; -0,00441; +0,03048) м  (|D| = 30,8 мм).
 * Выбрано: t_мир = t_fbx + D для каждого ключа. Это сохраняет всё относительное движение таза (разности ключей
 * не меняются) и переносит клип в систему меша: в позе покоя Hips совпадает с Hips меша, ступни стоят на
 * той же высоте относительно земли, которую откалибровал TUNING (groundOffset 0). Альтернатива
 * «как в FBX без сдвига» оставила бы таз на 4,4 мм выше и на 30,5 мм позади меша (меш центрирован по Z,
 * Hips меша на z = +0,030). D считается по каждому клипу из его FBX (для четырёх пилотных файлов одинакова).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadFbxAnim, quatEulerXYZ, qmul, qconj, qnorm, qrot } from './lib/fbx.mjs';
import { readGlb, writeGlb, appendFloatAccessor, compact } from './lib/glb.mjs';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BONE_PREFIX = 'mixamorig:';
const HIPS = 'mixamorig:Hips';
const DUP_MM = 1, DUP_DEG = 0.2; // «дубль кадра» как в AUDIT_CLIPS §0

export function defaultOptions() {
  return {
    config: path.join(ROOT, 'data', 'clips', 'terraks.json'),
    base: null, // по умолчанию из конфига
    out: null,
    fbxDir: null,
  };
}

const rel = (p) => path.relative(ROOT, p) || p;
const f32 = Math.fround;

/** Мировое вращение родителя Hips (Armature): произведение вращений предков; предки без сдвига и масштаба. */
function ancestorRotation(json, nodeIdx) {
  const parent = new Map();
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const chain = [];
  for (let p = parent.get(nodeIdx); p !== undefined; p = parent.get(p)) chain.unshift(p);
  let q = [0, 0, 0, 1];
  for (const i of chain) {
    const n = json.nodes[i];
    if (n.translation && n.translation.some((x) => Math.abs(x) > 1e-9)) throw new Error(`Предок Hips «${n.name}» со сдвигом не поддерживается`);
    if (n.scale && n.scale.some((x) => Math.abs(x - 1) > 1e-6)) throw new Error(`Предок Hips «${n.name}» с масштабом != 1 не поддерживается`);
    q = qmul(q, n.rotation ?? [0, 0, 0, 1]);
  }
  return q;
}

/** Угол между кватернионами в градусах. */
function angleDeg(a, b) {
  const q = qmul(qconj(a), b);
  return (2 * Math.acos(Math.min(1, Math.abs(q[3]))) * 180) / Math.PI;
}

/**
 * Считает данные клипа из FBX: rot[имя] = массив кватернионов по кадрам trim (в системе узла GLB),
 * hips[k] = translation Hips в локали узла (метры). Чистая функция от FBX и параметров рига.
 */
export function computeClip(fbx, trim, glbInfo, label) {
  const { start, end } = trim;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= fbx.nkeys) {
    throw new Error(`${label}: trim ${start}..${end} вне 0..${fbx.nkeys - 1}`);
  }
  const frames = [];
  for (let f = start; f <= end; f++) frames.push(f);
  const rot = new Map();
  for (const name of glbInfo.boneNames) {
    const b = fbx.bones.get(name);
    const pre = quatEulerXYZ(...b.pre);
    const P = name === HIPS ? qmul(qconj(glbInfo.armatureQ), pre) : pre;
    const qs = [];
    for (const f of frames) {
      const e = b.rot ? [b.rot[0][f], b.rot[1][f], b.rot[2][f]] : b.lclR;
      let q = qnorm(qmul(P, quatEulerXYZ(...e)));
      if (qs.length === 0) { if (q[3] < 0) q = q.map((x) => -x); }
      else {
        const p = qs[qs.length - 1];
        if (p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3] < 0) q = q.map((x) => -x);
      }
      qs.push(q);
    }
    rot.set(name, qs);
  }
  // Hips translation: FBX (мир) + D, затем в локаль Armature
  const hb = fbx.bones.get(HIPS);
  const restFbx = hb.lclT;
  const D = glbInfo.hipsRestWorld.map((x, i) => x - restFbx[i]);
  const hips = frames.map((f) => {
    const t = hb.trans ? [hb.trans[0][f], hb.trans[1][f], hb.trans[2][f]] : restFbx;
    return qrot(qconj(glbInfo.armatureQ), t.map((x, i) => x + D[i]));
  });
  return { frames, rot, hips, D };
}

/** Проверка дубля у loop-клипа: последний кадр не должен совпадать с первым. */
function assertNoLoopDuplicate(clip, fbx, id) {
  const first = clip.frames[0], last = clip.frames[clip.frames.length - 1];
  let maxDeg = 0;
  for (const [name, qs] of clip.rot) maxDeg = Math.max(maxDeg, angleDeg(qs[0], qs[qs.length - 1]));
  const h0 = clip.hips[0], h1 = clip.hips[clip.hips.length - 1];
  const hmm = Math.hypot(h0[0] - h1[0], h0[1] - h1[1], h0[2] - h1[2]) * 1000;
  if (maxDeg < DUP_DEG && hmm < DUP_MM) {
    throw new Error(`${id}: loop-клип, но кадр ${last} дублирует кадр ${first} (${maxDeg.toFixed(3)}°, ${hmm.toFixed(3)} мм): сократите trim.end на 1`);
  }
  return { maxDeg, hmm };
}

export function buildClips(opt = {}) {
  const o = { ...defaultOptions(), ...opt };
  const cfg = JSON.parse(fs.readFileSync(o.config, 'utf8'));
  const basePath = path.resolve(o.base ?? path.join(ROOT, cfg.baseGlb));
  const outPath = path.resolve(o.out ?? path.join(ROOT, cfg.outGlb));
  const fbxDir = path.resolve(o.fbxDir ?? path.join(ROOT, cfg.fbxDir));
  const fps = cfg.fps;
  if (fps !== 30) throw new Error(`fps ${fps}: поддерживается только 30 (ключи FBX на сетке 30 к/с)`);

  const { json, bin: baseBin } = readGlb(basePath);
  let bin = baseBin;

  // ---- информация о риге в GLB
  const nodeIndex = new Map(json.nodes.map((n, i) => [n.name, i]));
  const boneNames = json.nodes.map((n) => n.name).filter((n) => n?.startsWith(BONE_PREFIX));
  if (boneNames.length !== 41) throw new Error(`В базе ${boneNames.length} костей mixamorig:*, ожидалось 41`);
  const hipsIdx = nodeIndex.get(HIPS);
  if (hipsIdx === undefined) throw new Error('В базе нет узла ' + HIPS);
  const armatureQ = ancestorRotation(json, hipsIdx);
  const hipsRestWorld = qrot(armatureQ, json.nodes[hipsIdx].translation);
  const parentName = new Map();
  json.nodes.forEach((n) => (n.children ?? []).forEach((c) => parentName.set(json.nodes[c].name, n.name)));
  const glbInfo = { boneNames, armatureQ, hipsRestWorld };

  // ---- какие клипы остаются / строятся
  const baseAnims = new Map(json.animations.map((a) => [a.name, a]));
  const ids = new Set();
  const animations = [];
  const log = [];
  const fbxCache = new Map();
  for (const c of cfg.clips) {
    if (ids.has(c.id)) throw new Error(`Дубль id клипа «${c.id}»`);
    ids.add(c.id);
    if (!c.file) {
      const a = baseAnims.get(c.id);
      if (!a) throw new Error(`Клип «${c.id}» без file должен быть в базе ${rel(basePath)}; есть: ${[...baseAnims.keys()].join(', ')}`);
      animations.push(a);
      log.push(`${c.id}: из базы (без изменений)`);
      continue;
    }
    if (!c.trim) throw new Error(`${c.id}: нет trim`);
    const file = path.join(fbxDir, c.file);
    let fbx = fbxCache.get(file);
    if (!fbx) { fbx = loadFbxAnim(file); fbxCache.set(file, fbx); }
    // скелет FBX должен совпадать со скелетом GLB (имена и родители)
    for (const name of boneNames) {
      const b = fbx.bones.get(name);
      if (!b) throw new Error(`${c.id}: в ${c.file} нет кости ${name}`);
      if ((b.parent ?? null) !== (parentName.get(name) === 'Armature' ? null : parentName.get(name) ?? null)) {
        throw new Error(`${c.id}: родитель ${name} в ${c.file} («${b.parent}») != GLB («${parentName.get(name)}»)`);
      }
    }
    if (fbx.bones.size !== boneNames.length) throw new Error(`${c.id}: в ${c.file} ${fbx.bones.size} костей, в GLB ${boneNames.length}`);

    const clip = computeClip(fbx, c.trim, glbInfo, c.id);
    let loopNote = '';
    if (c.loop) {
      const d = assertNoLoopDuplicate(clip, fbx, c.id);
      loopNote = `, шаг last->first ${d.maxDeg.toFixed(2)}° / ${d.hmm.toFixed(1)} мм`;
    }
    const n = clip.frames.length;
    const times = clip.frames.map((f) => f32((f - c.trim.start) / fps));
    const t = appendFloatAccessor(json, bin, times, 'SCALAR', true);
    bin = t.bin;
    const samplers = [], channels = [];
    const push = (node, pathName, vals, type) => {
      const r = appendFloatAccessor(json, bin, vals, type, true); // отдельный accessor на каждый sampler
      bin = r.bin;
      samplers.push({ input: t.index, interpolation: 'LINEAR', output: r.index });
      channels.push({ sampler: samplers.length - 1, target: { node, path: pathName } });
    };
    for (const name of boneNames) {
      const node = nodeIndex.get(name);
      if (name === HIPS) push(node, 'translation', clip.hips.map((v) => v.map(f32)), 'VEC3');
      push(node, 'rotation', clip.rot.get(name).map((q) => q.map(f32)), 'VEC4');
    }
    animations.push({
      name: c.id,
      channels,
      samplers,
      extras: { build: { file: c.file, trim: [c.trim.start, c.trim.end], fps, loop: !!c.loop, placeholder: !!c.placeholder } },
    });
    log.push(`${c.id}: ${c.file} кадры ${c.trim.start}..${c.trim.end} (${n}), ${((n - 1) / fps).toFixed(4)} с, D = (${clip.D.map((x) => x.toFixed(5)).join('; ')}) м${loopNote}`);
  }
  const dropped = json.animations.filter((a) => !ids.has(a.name)).map((a) => a.name);
  json.animations = animations;
  bin = compact(json, bin);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  writeGlb(outPath, json, bin);
  return { outPath, basePath, log, dropped, size: fs.statSync(outPath).size };
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const opt = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--config') opt.config = path.resolve(a[++i]);
    else if (a[i] === '--base') opt.base = path.resolve(a[++i]);
    else if (a[i] === '--out') opt.out = path.resolve(a[++i]);
    else if (a[i] === '--fbx-dir') opt.fbxDir = path.resolve(a[++i]);
    else throw new Error(`Неизвестный аргумент ${a[i]}`);
  }
  const r = buildClips(opt);
  console.log(`База: ${rel(r.basePath)}`);
  r.log.forEach((l) => console.log('  ' + l));
  if (r.dropped.length) console.log(`  не включены (есть в базе, нет в конфиге): ${r.dropped.join(', ')}`);
  console.log(`Записано: ${rel(r.outPath)} (${r.size} байт)`);
}
