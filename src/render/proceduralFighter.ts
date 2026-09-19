import { Entity } from 'playcanvas';
import { dimensions, type Dims } from '../game/dims';
import type { BoneName, CharacterSpec, Pose } from '../game/types';
import { standardMat } from './material';
import { hexColor } from './scene';
import type { FighterVisual } from './fighterVisual';

/**
 * Боец собирается из примитивов прямо в рантайме: никаких внешних моделей,
 * поэтому новый персонаж — это просто новые числа в CharacterSpec.
 * Скелет смотрит в +X, конечности свисают в -Y (см. poses.ts).
 */

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

function box(w: number, h: number, d: number, material: ReturnType<typeof standardMat>, yOffset: number): Entity {
  const e = new Entity('box');
  e.addComponent('render', { type: 'box', material, castShadows: true, receiveShadows: true });
  e.setLocalScale(w, h, d);
  e.setLocalPosition(0, yOffset, 0);
  return e;
}

export class ProceduralFighter implements FighterVisual {
  readonly root = new Entity('fighter');
  private readonly body = new Entity('body');
  private readonly bones = new Map<BoneName, Entity>();
  private readonly materials: ReturnType<typeof standardMat>[] = [];
  private readonly accentMat: ReturnType<typeof standardMat>;
  private readonly auraLight: Entity;
  private readonly dims: Dims;
  /** Текущая сглаженная поза и разворот — без них смена состояния даёт рывок. */
  private current: Pose = {};
  private facingAngle = 0;

  constructor(private readonly spec: CharacterSpec) {
    this.dims = dimensions(spec);
    const d = this.dims;
    const pal = spec.palette;

    const mk = (color: number, opts: Parameters<typeof standardMat>[1] = {}) => {
      const m = standardMat(color, { roughness: 0.62, metalness: 0.18, ...opts });
      this.materials.push(m);
      return m;
    };

    const primary = mk(pal.primary);
    const secondary = mk(pal.secondary, { roughness: 0.78 });
    const skin = mk(pal.skin, { roughness: 0.85, metalness: 0.02 });
    const trim = mk(pal.trim, { roughness: 0.4, metalness: 0.35 });
    this.accentMat = mk(pal.accent, { emissive: pal.aura, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.5 });

    this.root.addChild(this.body);

    const hips = this.bone('hips');
    hips.setLocalPosition(0, d.hipHeight, 0);
    this.body.addChild(hips);
    hips.addChild(box(d.torsoWidth * 0.9, 0.2, d.torsoDepth * 1.05, secondary, 0.08));

    const torso = this.bone('torso');
    hips.addChild(torso);
    torso.addChild(box(d.torsoWidth, d.torsoLen, d.torsoDepth, primary, d.torsoLen / 2));
    // Нагрудная пластина — читаемый акцент на силуэте.
    torso.addChild(box(d.torsoWidth * 0.62, d.torsoLen * 0.44, d.torsoDepth * 1.16, this.accentMat, d.torsoLen * 0.66));

    const head = this.bone('head');
    head.setLocalPosition(0, d.torsoLen, 0);
    torso.addChild(head);
    head.addChild(box(d.headSize * 1.05, d.headSize * 1.2, d.headSize * 1.05, skin, d.headSize * 0.7));
    this.addSilhouette(head, trim, skin);

    for (const side of [1, -1] as const) {
      const tag = side === 1 ? 'R' : 'L';
      const shoulder = this.bone(`shoulder${tag}` as BoneName);
      shoulder.setLocalPosition(0, d.shoulderY, d.shoulderZ * side);
      torso.addChild(shoulder);
      shoulder.addChild(box(d.armWidth, d.upperArm, d.armWidth, skin, -d.upperArm / 2));
      if (spec.silhouette === 'pauldrons') {
        const pauldron = box(d.armWidth * 1.7, d.armWidth * 1.1, d.armWidth * 1.9, trim, d.shoulderY - 0.03);
        pauldron.setLocalPosition(0, d.shoulderY - 0.03, d.shoulderZ * side * 1.2);
        torso.addChild(pauldron);
      }

      const elbow = this.bone(`elbow${tag}` as BoneName);
      elbow.setLocalPosition(0, -d.upperArm, 0);
      shoulder.addChild(elbow);
      elbow.addChild(box(d.armWidth * 0.9, d.foreArm, d.armWidth * 0.9, skin, -d.foreArm / 2));
      // Кулак/перчатка — по ней глазом читается траектория удара.
      elbow.addChild(box(d.armWidth * 1.35, d.armWidth * 1.35, d.armWidth * 1.35, this.accentMat, -d.foreArm - d.armWidth * 0.4));

      const hip = this.bone(`hip${tag}` as BoneName);
      hip.setLocalPosition(0, 0, d.hipZ * side);
      hips.addChild(hip);
      hip.addChild(box(d.legWidth, d.thigh, d.legWidth, primary, -d.thigh / 2));

      const knee = this.bone(`knee${tag}` as BoneName);
      knee.setLocalPosition(0, -d.thigh, 0);
      hip.addChild(knee);
      knee.addChild(box(d.legWidth * 0.88, d.shin, d.legWidth * 0.88, secondary, -d.shin / 2));
      const foot = box(d.legWidth * 1.5, d.legWidth * 0.7, d.legWidth * 2.1, trim, -d.shin - d.legWidth * 0.3);
      foot.setLocalPosition(d.legWidth * 0.35, -d.shin - d.legWidth * 0.3, 0);
      knee.addChild(foot);
    }

    this.auraLight = new Entity('aura-light');
    this.auraLight.addComponent('light', { type: 'omni', color: hexColor(pal.aura), intensity: 0, range: 3.4 });
    this.auraLight.setLocalPosition(0, d.hipHeight, 0.3);
    this.root.addChild(this.auraLight);
  }

  /** Деталь, по которой боец узнаётся в силуэте. */
  private addSilhouette(head: Entity, trim: ReturnType<typeof standardMat>, skin: ReturnType<typeof standardMat>): void {
    const d = this.dims;
    const s = this.spec.silhouette;
    if (s === 'horns') {
      for (const side of [1, -1]) {
        const horn = new Entity('horn');
        horn.addComponent('render', { type: 'cone', material: trim, castShadows: true });
        horn.setLocalScale(d.headSize * 0.44, d.headSize * 1.1, d.headSize * 0.44);
        horn.setLocalPosition(-d.headSize * 0.1, d.headSize * 1.5, d.headSize * 0.42 * side);
        horn.setLocalEulerAngles(35 * side, 0, -22);
        head.addChild(horn);
      }
    } else if (s === 'visor') {
      const visor = box(d.headSize * 0.5, d.headSize * 0.3, d.headSize * 1.12, this.accentMat, d.headSize * 0.8);
      visor.setLocalPosition(d.headSize * 0.5, d.headSize * 0.8, 0);
      head.addChild(visor);
    } else if (s === 'cape') {
      const cape = new Entity('cape');
      cape.addComponent('render', { type: 'plane', material: standardMat(this.spec.palette.secondary, { roughness: 0.9, doubleSided: true }) });
      cape.setLocalScale(d.torsoWidth * 1.7, 1, d.torsoLen * 1.5);
      cape.setLocalEulerAngles(0, 0, 90);
      cape.setLocalPosition(-d.torsoDepth * 0.7, -d.torsoLen * 0.4, 0);
      head.addChild(cape);
    } else if (s === 'topknot') {
      const knot = new Entity('topknot');
      knot.addComponent('render', { type: 'sphere', material: trim, castShadows: true });
      knot.setLocalScale(d.headSize * 0.6, d.headSize * 0.6, d.headSize * 0.6);
      knot.setLocalPosition(-d.headSize * 0.5, d.headSize * 1.5, 0);
      head.addChild(knot);
    } else if (s === 'halo') {
      const halo = new Entity('halo');
      halo.addComponent('render', {
        type: 'cylinder',
        material: standardMat(this.spec.palette.aura, { emissive: this.spec.palette.aura, emissiveIntensity: 1.2, roughness: 0.3 }),
      });
      halo.setLocalScale(d.headSize * 1.8, 0.05, d.headSize * 1.8);
      halo.setLocalPosition(0, d.headSize * 1.9, 0);
      head.addChild(halo);
    } else if (s === 'pauldrons') {
      const collar = box(d.headSize * 0.9, d.headSize * 0.4, d.headSize * 1.3, skin, d.headSize * 0.08);
      head.addChild(collar);
    }
  }

  private bone(name: BoneName): Entity {
    const e = new Entity(name);
    this.bones.set(name, e);
    return e;
  }

  /** Позиция и разворот бойца в мире. */
  place(x: number, y: number, facing: 1 | -1): void {
    this.root.setPosition(x, y, 0);
    // Разворот делаем поворотом группы, поэтому все позы описаны только для «лицом вправо» (+X).
    // Скелет и позы (poses.ts) 1:1 те же числа, что и в Three-версии — обе системы координат
    // правые и +Y вверх, так что доворот по Y в градусах ведёт себя идентично.
    const target = facing === 1 ? 0 : 180;
    const diff = ((target - this.facingAngle + 540) % 360) - 180;
    this.facingAngle += diff * 0.35;
    this.body.setLocalEulerAngles(0, this.facingAngle, 0);
  }

  /**
   * Накладывает позу со сглаживанием. smoothing=1 — мгновенно (нужно для ударов,
   * иначе быстрый джеб «не доезжает» до вытянутой руки).
   */
  applyPose(pose: Pose, smoothing: number, _grounded = true): void {
    for (const name of POSED_BONES) {
      const entity = this.bones.get(name);
      if (!entity) continue;
      const target = pose[name] ?? [0, 0, 0];
      const cur = this.current[name] ?? [0, 0, 0];
      const next: [number, number, number] = [
        cur[0] + (target[0] - cur[0]) * smoothing,
        cur[1] + (target[1] - cur[1]) * smoothing,
        cur[2] + (target[2] - cur[2]) * smoothing,
      ];
      this.current[name] = next;
      // Позы заданы в радианах вокруг осей (см. poses.ts) — PlayCanvas ждёт градусы.
      entity.setLocalEulerAngles((next[0] * 180) / Math.PI, (next[1] * 180) / Math.PI, (next[2] * 180) / Math.PI);
    }

    const to = pose.offset ?? [0, 0, 0];
    const from = this.current.offset ?? [0, 0, 0];
    const off: [number, number, number] = [
      from[0] + (to[0] - from[0]) * smoothing,
      from[1] + (to[1] - from[1]) * smoothing,
      from[2] + (to[2] - from[2]) * smoothing,
    ];
    this.current.offset = off;
    this.body.setLocalPosition(off[0], off[1], off[2]);
  }

  /** Вспышка при получении урона и свечение ауры во время спешла. */
  setEffects(flash: number, aura: number): void {
    const white = flash > 0 ? Math.min(1, flash / 8) : 0;
    for (const mat of this.materials) {
      mat.emissive.set(white * 0.9, white * 0.25, white * 0.25);
      mat.emissiveIntensity = white > 0 ? 1 : mat === this.accentMat ? 0.45 : 0;
      mat.update();
    }
    if (white === 0) {
      this.accentMat.emissive.copy(hexColor(this.spec.palette.aura));
      this.accentMat.emissiveIntensity = 0.45 + aura * 1.4;
      this.accentMat.update();
    }
    if (this.auraLight.light) this.auraLight.light.intensity = aura * 4;
  }

  dispose(): void {
    this.root.destroy();
  }
}
