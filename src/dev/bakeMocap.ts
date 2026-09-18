/**
 * Запекает реальные боевые позы из мокапа (GLB с анимациями) в наш формат Pose —
 * тот же, которым описаны процедурные клипы в attackClips.ts.
 *
 * Идея: мы НЕ проигрываем анимацию из файла в игре (тайминги ударов обязаны совпадать
 * с фрейм-датой, а не с длиной мокап-клипа). Вместо этого здесь, офлайн, мы прогоняем
 * анимацию через прямую кинематику, получаем мировые направления костей мокап-скелета
 * и «переливаем» их в наш процедурный риг — тем же способом, каким realisticModel.ts
 * на лету поворачивает модель под наши позы, только в обратную сторону и один раз.
 *
 * Времена ключевых кадров ниже подобраны НЕ автоматическим поиском пика (первая версия
 * этого скрипта искала «пик» по расстоянию кисть/стопа до плеча/бедра — эвристика провалилась:
 * на анимации box_02 она нашла защитную стойку-покачивание и приняла её за джеб, а на
 * front_kick_01 промахнулась мимо настоящего удара на полсекунды). Времена ниже —
 * результат покадрового визуального прогона через debug.html/debug.ts с реальным
 * three.js AnimationMixer. Той же проверкой выяснилось, что box_02, hit_to_side и
 * hit_to_body_01 в этом конкретном ассете — вариации одной защитной стойки без реального
 * удара или отшатывания, поэтому джеб, кросс и реакции на попадание здесь не запекаются:
 * лучше оставить рабочие рисованные позы, чем выдать защитную стойку за удар.
 *
 * Запуск: npm run bake:mocap -- <путь-к-glb>
 * Пишет src/game/mocapPoses.ts (сгенерированный файл, руками не редактируется).
 */
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { AnimationSampler, GlbFile, computeWorldTransforms } from './glbAnim';
import { BONE_MAP, boneKey } from '../render/realisticModel';
import { Rig, dimensions } from '../render/rig';
import type { BoneName, CharacterSpec, Pose } from '../game/types';

const glbPath = process.argv[2];
if (!glbPath) {
  console.error('Использование: npm run bake:mocap -- <путь-к-glb>');
  process.exit(1);
}

const glb = new GlbFile(glbPath);

const nodeIndex = new Map<string, number>();
for (const n of glb.json.nodes) {
  if (n.name) nodeIndex.set(boneKey(n.name), glb.json.nodes.indexOf(n));
}
function findNode(mixamoName: string): number {
  const idx = nodeIndex.get(boneKey(mixamoName));
  if (idx === undefined) throw new Error(`кость "${mixamoName}" не найдена в модели`);
  return idx;
}

const links = BONE_MAP.map((entry) => ({
  source: entry.source,
  boneNode: findNode(entry.bone),
  childNode: findNode(entry.child),
}));

/** Нейтральный риг для запекания: Euler-углы не зависят от масштаба скелета (height=1 — множитель, а не метры). */
const bakeDims = dimensions({ build: { height: 1, bulk: 1, headScale: 1, limbLength: 1, shoulderSpread: 1 } } as CharacterSpec);

// Рост мокап-модели в её собственном масштабе (по костям, не по мешу) — им приводим
// смещения таза к масштабу нашего рига (~1.78 условных единиц на полный рост).
const bind = computeWorldTransforms(glb, null, 0);
const headTop = bind.positions.get(findNode('mixamorig:HeadTop_End')) ?? bind.positions.get(findNode('mixamorig:Head'))!;
const footBottom = Math.min(
  bind.positions.get(findNode('mixamorig:LeftFoot'))!.y,
  bind.positions.get(findNode('mixamorig:RightFoot'))!.y,
);
const mocapHeight = headTop.y - footBottom;
const scaleToRig = bakeDims.height / mocapHeight;
const hipsNode = findNode('mixamorig:Hips');
const bindHipsPos = bind.positions.get(hipsNode)!.clone();

console.log(`# рост мокап-модели: ${mocapHeight.toFixed(3)}, масштаб в риг: ${scaleToRig.toFixed(3)}`);

/**
 * Запекает один кадр анимации в Pose: направления костей мокапа переливаются
 * в свежий процедурный риг тем же способом, каким realisticModel.retarget()
 * на лету доворачивает модель под наши позы (см. комментарий там).
 */
function bakeFrame(sampler: AnimationSampler, t: number): Pose {
  const { positions } = computeWorldTransforms(glb, sampler, t);
  const rig = new Rig(bakeDims);
  rig.root.updateMatrixWorld(true);

  const q = new THREE.Quaternion();
  const worldQuat = new THREE.Quaternion();
  const parentQuat = new THREE.Quaternion();

  for (const link of links) {
    const from = positions.get(link.boneNode)!;
    const to = positions.get(link.childNode)!;
    const targetDir = to.clone().sub(from).normalize();

    const bone = rig.bones.get(link.source)!;
    const currentDir = rig.boneDirection(link.source, new THREE.Vector3());
    q.setFromUnitVectors(currentDir, targetDir);
    bone.getWorldQuaternion(worldQuat);
    q.multiply(worldQuat);

    const parent = bone.parent!;
    parent.getWorldQuaternion(parentQuat);
    bone.quaternion.copy(parentQuat.clone().invert().multiply(q));
    bone.updateMatrixWorld(true);
  }

  const pose: Pose = {};
  for (const link of links) {
    const bone = rig.bones.get(link.source)!;
    pose[link.source] = [round(bone.rotation.x), round(bone.rotation.y), round(bone.rotation.z)];
  }

  const hipsPos = positions.get(hipsNode)!;
  const dx = (hipsPos.x - bindHipsPos.x) * scaleToRig;
  const dy = (hipsPos.y - bindHipsPos.y) * scaleToRig;
  pose.offset = [round(dx), round(dy), 0];
  return pose;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

type Named = Record<string, Pose>;
const out: Named = {};

/**
 * front_kick_02 — чистый одиночный прямой удар ногой без разбега (в отличие от
 * front_kick_01, где кик зажат между шагами подхода и отхода). Времена ниже —
 * результат визуального прогона (см. комментарий вверху файла): нога полностью
 * распрямлена на t≈0.69–0.71.
 */
function bakeKick(): void {
  const animName = 'front_kick_02';
  const sampler = new AnimationSampler(glb, animName);
  const windupT = 0.57;
  const peakT = 0.7;
  const recoverT = 0.8;

  out.kick_windup = bakeFrame(sampler, windupT);
  out.kick_peak = bakeFrame(sampler, peakT);
  out.kick_recover = bakeFrame(sampler, recoverT);
  console.log(`# kick (${animName}): windup=${windupT} peak=${peakT} recover=${recoverT}`);
}

bakeKick();

// --- сборка выходного файла -------------------------------------------------

function poseLiteral(pose: Pose, indent: string): string {
  const parts: string[] = [];
  const order: BoneName[] = ['hips', 'torso', 'head', 'shoulderR', 'elbowR', 'shoulderL', 'elbowL', 'hipR', 'kneeR', 'hipL', 'kneeL'];
  for (const key of order) {
    const v = pose[key];
    if (v) parts.push(`${indent}  ${key}: [${v[0]}, ${v[1]}, ${v[2]}]`);
  }
  if (pose.offset) parts.push(`${indent}  offset: [${pose.offset[0]}, ${pose.offset[1]}, ${pose.offset[2]}]`);
  return `{\n${parts.join(',\n')},\n${indent}}`;
}

const lines: string[] = [];
lines.push('/**');
lines.push(' * Позы, запечённые из настоящего мокапа (см. src/dev/bakeMocap.ts, там же —');
lines.push(' * почему запечён только удар ногой, а не джеб/кросс/реакции на попадание).');
lines.push(' * Файл сгенерирован — правки руками потеряются при следующем `npm run bake:mocap`.');
lines.push(' */');
lines.push("import type { Pose } from './types';");
lines.push('');
for (const [name, pose] of Object.entries(out)) {
  const constName = `MOCAP_${name.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
  lines.push(`export const ${constName}: Pose = ${poseLiteral(pose, '')};`);
  lines.push('');
}

const outPath = 'src/game/mocapPoses.ts';
writeFileSync(outPath, lines.join('\n'));
console.log(`\n✓ записано ${Object.keys(out).length} поз в ${outPath}`);
