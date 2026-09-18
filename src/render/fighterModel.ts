import * as THREE from 'three';
import type { BoneName, CharacterSpec, Pose } from '../game/types';

/**
 * Боец собирается из примитивов прямо в рантайме: никаких внешних моделей,
 * поэтому новый персонаж — это просто новые числа в CharacterSpec.
 * Скелет смотрит в +X, конечности свисают в -Y (см. poses.ts).
 */

interface Dims {
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
}

function dimensions(spec: CharacterSpec): Dims {
  const { height, bulk, headScale, limbLength, shoulderSpread } = spec.build;
  const h = 1.78 * height;
  const legs = h * 0.47 * limbLength;
  return {
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

function box(w: number, h: number, d: number, mat: THREE.Material, yOffset: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.y = yOffset;
  mesh.castShadow = true;
  return mesh;
}

export class FighterModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly bones = new Map<BoneName, THREE.Group>();
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly accentMat: THREE.MeshStandardMaterial;
  private readonly auraLight: THREE.PointLight;
  private readonly dims: Dims;
  /** Текущая сглаженная поза — без неё смена состояния даёт рывок. */
  private current: Pose = {};

  constructor(private readonly spec: CharacterSpec) {
    this.dims = dimensions(spec);
    const d = this.dims;
    const pal = spec.palette;

    const mk = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.18, ...opts });
      this.materials.push(m);
      return m;
    };

    const primary = mk(pal.primary);
    const secondary = mk(pal.secondary, { roughness: 0.78 });
    const skin = mk(pal.skin, { roughness: 0.85, metalness: 0.02 });
    const trim = mk(pal.trim, { roughness: 0.4, metalness: 0.35 });
    this.accentMat = mk(pal.accent, {
      emissive: new THREE.Color(pal.aura),
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.5,
    });

    this.root.add(this.body);

    const hips = this.bone('hips', new THREE.Group());
    hips.position.y = d.hipHeight;
    this.body.add(hips);
    hips.add(box(d.torsoWidth * 0.9, 0.2, d.torsoDepth * 1.05, secondary, 0.08));

    const torso = this.bone('torso', new THREE.Group());
    hips.add(torso);
    torso.add(box(d.torsoWidth, d.torsoLen, d.torsoDepth, primary, d.torsoLen / 2));
    // Нагрудная пластина — читаемый акцент на силуэте.
    const plate = box(d.torsoWidth * 0.62, d.torsoLen * 0.44, d.torsoDepth * 1.16, this.accentMat, d.torsoLen * 0.66);
    torso.add(plate);

    const head = this.bone('head', new THREE.Group());
    head.position.y = d.torsoLen;
    torso.add(head);
    head.add(box(d.headSize * 1.05, d.headSize * 1.2, d.headSize * 1.05, skin, d.headSize * 0.7));
    this.addSilhouette(head, trim, skin);

    for (const side of [1, -1] as const) {
      const tag = side === 1 ? 'R' : 'L';
      const shoulder = this.bone(`shoulder${tag}` as BoneName, new THREE.Group());
      shoulder.position.set(0, d.shoulderY, d.shoulderZ * side);
      torso.add(shoulder);
      shoulder.add(box(d.armWidth, d.upperArm, d.armWidth, skin, -d.upperArm / 2));
      if (spec.silhouette === 'pauldrons') {
        const pauldron = box(d.armWidth * 1.7, d.armWidth * 1.1, d.armWidth * 1.9, trim, d.shoulderY - 0.03);
        pauldron.position.z = d.shoulderZ * side * 1.2;
        torso.add(pauldron);
      }

      const elbow = this.bone(`elbow${tag}` as BoneName, new THREE.Group());
      elbow.position.y = -d.upperArm;
      shoulder.add(elbow);
      elbow.add(box(d.armWidth * 0.9, d.foreArm, d.armWidth * 0.9, skin, -d.foreArm / 2));
      // Кулак/перчатка — по ней глазом читается траектория удара.
      elbow.add(box(d.armWidth * 1.35, d.armWidth * 1.35, d.armWidth * 1.35, this.accentMat, -d.foreArm - d.armWidth * 0.4));

      const hip = this.bone(`hip${tag}` as BoneName, new THREE.Group());
      hip.position.set(0, 0, d.hipZ * side);
      hips.add(hip);
      hip.add(box(d.legWidth, d.thigh, d.legWidth, primary, -d.thigh / 2));

      const knee = this.bone(`knee${tag}` as BoneName, new THREE.Group());
      knee.position.y = -d.thigh;
      hip.add(knee);
      knee.add(box(d.legWidth * 0.88, d.shin, d.legWidth * 0.88, secondary, -d.shin / 2));
      const foot = box(d.legWidth * 1.5, d.legWidth * 0.7, d.legWidth * 2.1, trim, -d.shin - d.legWidth * 0.3);
      foot.position.x = d.legWidth * 0.35;
      knee.add(foot);
    }

    this.auraLight = new THREE.PointLight(pal.aura, 0, 3.4, 2);
    this.auraLight.position.set(0, d.hipHeight, 0.3);
    this.root.add(this.auraLight);
  }

  /** Деталь, по которой боец узнаётся в силуэте. */
  private addSilhouette(head: THREE.Group, trim: THREE.Material, skin: THREE.Material): void {
    const d = this.dims;
    const s = this.spec.silhouette;
    if (s === 'horns') {
      for (const side of [1, -1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(d.headSize * 0.22, d.headSize * 1.1, 6), trim);
        horn.position.set(-d.headSize * 0.1, d.headSize * 1.5, d.headSize * 0.42 * side);
        horn.rotation.z = -0.4 * Math.sign(1);
        horn.rotation.x = 0.35 * side;
        horn.castShadow = true;
        head.add(horn);
      }
    } else if (s === 'visor') {
      const visor = box(d.headSize * 0.5, d.headSize * 0.3, d.headSize * 1.12, this.accentMat, d.headSize * 0.8);
      visor.position.x = d.headSize * 0.5;
      head.add(visor);
    } else if (s === 'cape') {
      const cape = new THREE.Mesh(
        new THREE.PlaneGeometry(d.torsoLen * 1.5, d.torsoWidth * 1.7),
        new THREE.MeshStandardMaterial({
          color: this.spec.palette.secondary,
          side: THREE.DoubleSide,
          roughness: 0.9,
        }),
      );
      cape.rotation.set(Math.PI / 2, 0, Math.PI / 2);
      cape.position.set(-d.torsoDepth * 0.7, -d.torsoLen * 0.4, 0);
      head.add(cape);
    } else if (s === 'topknot') {
      const knot = new THREE.Mesh(new THREE.SphereGeometry(d.headSize * 0.3, 10, 8), trim);
      knot.position.set(-d.headSize * 0.5, d.headSize * 1.5, 0);
      knot.castShadow = true;
      head.add(knot);
    } else if (s === 'halo') {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(d.headSize * 0.9, d.headSize * 0.08, 8, 20),
        new THREE.MeshStandardMaterial({
          color: this.spec.palette.aura,
          emissive: new THREE.Color(this.spec.palette.aura),
          emissiveIntensity: 1.2,
          roughness: 0.3,
        }),
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = d.headSize * 1.9;
      head.add(halo);
    } else if (s === 'pauldrons') {
      const collar = box(d.headSize * 0.9, d.headSize * 0.4, d.headSize * 1.3, skin, d.headSize * 0.08);
      head.add(collar);
    }
  }

  private bone(name: BoneName, group: THREE.Group): THREE.Group {
    this.bones.set(name, group);
    return group;
  }

  /** Позиция и разворот бойца в мире. */
  place(x: number, y: number, facing: 1 | -1): void {
    this.root.position.set(x, y, 0);
    // Разворот делаем поворотом группы, поэтому все позы описаны только для «лицом вправо».
    const target = facing === 1 ? 0 : Math.PI;
    const diff = ((target - this.body.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.body.rotation.y += diff * 0.35;
  }

  /**
   * Накладывает позу со сглаживанием. smoothing=1 — мгновенно (нужно для ударов,
   * иначе быстрый джеб «не доезжает» до вытянутой руки).
   */
  applyPose(pose: Pose, smoothing: number): void {
    const names: BoneName[] = [
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
    for (const name of names) {
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

  /** Вспышка при получении урона и свечение ауры во время спешла. */
  setEffects(flash: number, aura: number): void {
    const white = flash > 0 ? Math.min(1, flash / 8) : 0;
    for (const mat of this.materials) {
      mat.emissive.setRGB(white * 0.9, white * 0.25, white * 0.25);
      mat.emissiveIntensity = white > 0 ? 1 : mat === this.accentMat ? 0.45 : 0;
    }
    if (white === 0) {
      this.accentMat.emissive.set(this.spec.palette.aura);
      this.accentMat.emissiveIntensity = 0.45 + aura * 1.4;
    }
    this.auraLight.intensity = aura * 4;
  }

  dispose(): void {
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    for (const mat of this.materials) mat.dispose();
  }
}
