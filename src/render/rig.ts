import * as THREE from 'three';
import type { BoneName, CharacterSpec, Pose } from '../game/types';

/**
 * Процедурный скелет бойца. Живёт в локальной системе, где боец смотрит в +X,
 * а конечности свисают в -Y (см. poses.ts).
 *
 * Скелет отделён от «шкуры»: поверх него можно навесить коробки (boxSkin)
 * или притянуть к нему настоящую модель с Mixamo-ригом (realisticModel).
 * Именно поэтому фрейм-дата и позы не зависят от того, как боец выглядит.
 */

export interface Dims {
  hipHeight: number;
  torsoLen: number;
  torsoWidth: number;
  torsoDepth: number;
  headSize: number;
  shoulderY: number;
  shoulderZ: number;
  upperArm: number;
  foreArm: number;
  armWidth: number;
  hipZ: number;
  thigh: number;
  shin: number;
  legWidth: number;
  /** Полный рост, по нему подгоняется масштаб внешней модели. */
  height: number;
}

export function dimensions(spec: CharacterSpec): Dims {
  const { height, bulk, headScale, limbLength, shoulderSpread } = spec.build;
  const h = 1.78 * height;
  const legs = h * 0.47 * limbLength;
  return {
    height: h,
    hipHeight: legs,
    torsoLen: h * 0.32,
    torsoWidth: 0.34 * bulk * shoulderSpread,
    torsoDepth: 0.22 * bulk,
    headSize: 0.2 * headScale * (1 + (bulk - 1) * 0.3),
    shoulderY: h * 0.28,
    shoulderZ: 0.19 * bulk * shoulderSpread,
    upperArm: h * 0.18 * limbLength,
    foreArm: h * 0.17 * limbLength,
    armWidth: 0.1 * bulk,
    hipZ: 0.1 * bulk,
    thigh: legs * 0.52,
    shin: legs * 0.48,
    legWidth: 0.13 * bulk,
  };
}

const POSED_BONES: BoneName[] = [
  'hips',
  'torso',
  'head',
  'shoulderL',
  'elbowL',
  'shoulderR',
  'elbowR',
  'hipL',
  'kneeL',
  'hipR',
  'kneeR',
];

export class Rig {
  /** Внешний узел: позиция бойца в мире. */
  readonly root = new THREE.Group();
  /** Внутренний узел: разворот влево-вправо. Позы пишутся только для «лицом вправо». */
  readonly body = new THREE.Group();
  readonly bones = new Map<BoneName, THREE.Group>();
  /** Концы конечностей — по ним считается направление кости при ретаргете. */
  readonly tips = new Map<BoneName, THREE.Object3D>();

  private current: Pose = {};

  constructor(readonly dims: Dims) {
    const d = dims;
    this.root.add(this.body);

    const hips = this.add('hips', this.body);
    hips.position.y = d.hipHeight;

    const torso = this.add('torso', hips);
    const head = this.add('head', torso);
    head.position.y = d.torsoLen;
    this.tip('head', head, 0, d.headSize * 1.5, 0);
    // Направление торса читается по голове, отдельный кончик не нужен.
    this.tip('torso', torso, 0, d.torsoLen, 0);
    this.tip('hips', hips, 0, d.torsoLen * 0.4, 0);

    for (const side of [1, -1] as const) {
      const tag = side === 1 ? 'R' : 'L';

      const shoulder = this.add(`shoulder${tag}` as BoneName, torso);
      shoulder.position.set(0, d.shoulderY, d.shoulderZ * side);
      this.tip(`shoulder${tag}` as BoneName, shoulder, 0, -d.upperArm, 0);

      const elbow = this.add(`elbow${tag}` as BoneName, shoulder);
      elbow.position.y = -d.upperArm;
      this.tip(`elbow${tag}` as BoneName, elbow, 0, -d.foreArm, 0);

      const hip = this.add(`hip${tag}` as BoneName, hips);
      hip.position.set(0, 0, d.hipZ * side);
      this.tip(`hip${tag}` as BoneName, hip, 0, -d.thigh, 0);

      const knee = this.add(`knee${tag}` as BoneName, hip);
      knee.position.y = -d.thigh;
      this.tip(`knee${tag}` as BoneName, knee, 0, -d.shin, 0);
    }
  }

  private add(name: BoneName, parent: THREE.Object3D): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    parent.add(group);
    this.bones.set(name, group);
    return group;
  }

  private tip(name: BoneName, parent: THREE.Object3D, x: number, y: number, z: number): void {
    const node = new THREE.Object3D();
    node.position.set(x, y, z);
    parent.add(node);
    this.tips.set(name, node);
  }

  place(x: number, y: number, facing: 1 | -1): void {
    this.root.position.set(x, y, 0);
    const target = facing === 1 ? 0 : Math.PI;
    const diff = ((target - this.body.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.body.rotation.y += diff * 0.35;
  }

  /**
   * Накладывает позу со сглаживанием. smoothing=1 — мгновенно (нужно для ударов,
   * иначе быстрый джеб «не доезжает» до вытянутой руки).
   */
  applyPose(pose: Pose, smoothing: number): void {
    for (const name of POSED_BONES) {
      const group = this.bones.get(name);
      if (!group) continue;
      const target = pose[name] ?? [0, 0, 0];
      const cur = this.current[name] ?? [0, 0, 0];
      const next: [number, number, number] = [
        cur[0] + (target[0] - cur[0]) * smoothing,
        cur[1] + (target[1] - cur[1]) * smoothing,
        cur[2] + (target[2] - cur[2]) * smoothing,
      ];
      this.current[name] = next;
      group.rotation.set(next[0], next[1], next[2]);
    }

    const to = pose.offset ?? [0, 0, 0];
    const from = this.current.offset ?? [0, 0, 0];
    const off: [number, number, number] = [
      from[0] + (to[0] - from[0]) * smoothing,
      from[1] + (to[1] - from[1]) * smoothing,
      from[2] + (to[2] - from[2]) * smoothing,
    ];
    this.current.offset = off;
    this.body.position.set(off[0], off[1], off[2]);
  }

  /** Мировое направление кости к её концу — основа ретаргета на чужой скелет. */
  boneDirection(name: BoneName, out = new THREE.Vector3()): THREE.Vector3 {
    const bone = this.bones.get(name);
    const tip = this.tips.get(name);
    if (!bone || !tip) return out.set(0, -1, 0);
    const a = bone.getWorldPosition(TMP_A);
    const b = tip.getWorldPosition(TMP_B);
    return out.copy(b).sub(a).normalize();
  }
}

const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
