import * as THREE from 'three';
import { Rig, dimensions, type Dims } from './rig';
import { instantiate, type LoadedModel } from './assets';
import type { BoneName, CharacterSpec, Pose } from '../game/types';

/**
 * Настоящая модель человека поверх нашего процедурного скелета.
 *
 * Мы НЕ проигрываем анимации из файла: вся боевая анимация задана позами и фрейм-датой,
 * иначе тайминги ударов перестали бы совпадать с хитбоксами. Вместо этого кости Mixamo
 * доворачиваются так, чтобы смотреть туда же, куда смотрят кости нашего рига.
 * Такой ретаргет «по направлению» не требует совпадения систем координат и одинаково
 * работает на любой модели с человеческим скелетом.
 */

/** Кость нашего рига → кость Mixamo, по которой считается направление. */
export const BONE_MAP: Array<{ source: BoneName; bone: string; child: string }> = [
  { source: 'hips', bone: 'mixamorig:Hips', child: 'mixamorig:Spine' },
  { source: 'torso', bone: 'mixamorig:Spine1', child: 'mixamorig:Neck' },
  { source: 'head', bone: 'mixamorig:Neck', child: 'mixamorig:Head' },
  { source: 'shoulderR', bone: 'mixamorig:RightArm', child: 'mixamorig:RightForeArm' },
  { source: 'elbowR', bone: 'mixamorig:RightForeArm', child: 'mixamorig:RightHand' },
  { source: 'shoulderL', bone: 'mixamorig:LeftArm', child: 'mixamorig:LeftForeArm' },
  { source: 'elbowL', bone: 'mixamorig:LeftForeArm', child: 'mixamorig:LeftHand' },
  { source: 'hipR', bone: 'mixamorig:RightUpLeg', child: 'mixamorig:RightLeg' },
  { source: 'kneeR', bone: 'mixamorig:RightLeg', child: 'mixamorig:RightFoot' },
  { source: 'hipL', bone: 'mixamorig:LeftUpLeg', child: 'mixamorig:LeftLeg' },
  { source: 'kneeL', bone: 'mixamorig:LeftLeg', child: 'mixamorig:LeftFoot' },
];

interface Link {
  source: BoneName;
  bone: THREE.Object3D;
  child: THREE.Object3D;
  /** Поворот кости в исходной позе модели. */
  bind: THREE.Quaternion;
}

interface FootLink {
  bone: THREE.Object3D;
  /** Поворот ступни относительно всей модели в исходной позе — по нему она ставится ровно. */
  bindInHolder: THREE.Quaternion;
}

/** Ступня считается «на земле» ниже этой высоты — тогда её выравниваем. */
const FOOT_GROUND_Y = 0.24;

/**
 * GLTFLoader санирует имена узлов и выбрасывает двоеточие, так что в сцене кость
 * зовётся не «mixamorig:Hips», а «mixamorigHips». Сравниваем по ключу без разделителей,
 * чтобы работали оба варианта и модели из других экспортов.
 */
export function boneKey(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/**
 * Сжатие пальцев в кулак. Модели с Mixamo приходят с раскрытой ладонью, и в файтинге
 * это сразу бросается в глаза. Кости пальцев не участвуют в ретаргете, поэтому
 * достаточно один раз согнуть их при создании модели.
 */
const FINGER_CURL = { base: 1.15, mid: 1.4, thumb: 0.5 };

/**
 * Снимает пропорции с исходной позы модели. Наши позы описаны в системе процедурного рига,
 * поэтому риг обязан быть точной «палочной» копией модели — иначе стопы и таз расходятся
 * с землёй на любой позе, где боец опускается.
 */
function measureDims(byName: Map<string, THREE.Object3D>, fallback: Dims): Dims {
  const pos = (name: string): THREE.Vector3 | null => {
    const bone = byName.get(boneKey(name));
    if (!bone) return null;
    bone.updateWorldMatrix(true, false);
    return bone.getWorldPosition(new THREE.Vector3());
  };
  const dist = (a: THREE.Vector3 | null, b: THREE.Vector3 | null, def: number): number =>
    a && b ? a.distanceTo(b) : def;

  const hips = pos('mixamorig:Hips');
  const neck = pos('mixamorig:Neck');
  const armL = pos('mixamorig:LeftArm');
  const armR = pos('mixamorig:RightArm');
  const foreL = pos('mixamorig:LeftForeArm');
  const handL = pos('mixamorig:LeftHand');
  const upLegL = pos('mixamorig:LeftUpLeg');
  const upLegR = pos('mixamorig:RightUpLeg');
  const legL = pos('mixamorig:LeftLeg');
  const footL = pos('mixamorig:LeftFoot');

  return {
    ...fallback,
    hipHeight: hips ? hips.y : fallback.hipHeight,
    torsoLen: hips && neck ? neck.y - hips.y : fallback.torsoLen,
    shoulderY: hips && armL ? armL.y - hips.y : fallback.shoulderY,
    // Поперечные смещения берём как половину расстояния между парными костями:
    // так значение не зависит от того, как модель развёрнута.
    shoulderZ: armL && armR ? armL.distanceTo(armR) / 2 : fallback.shoulderZ,
    hipZ: upLegL && upLegR ? upLegL.distanceTo(upLegR) / 2 : fallback.hipZ,
    upperArm: dist(armL, foreL, fallback.upperArm),
    foreArm: dist(foreL, handL, fallback.foreArm),
    thigh: dist(upLegL, legL, fallback.thigh),
    shin: dist(legL, footL, fallback.shin),
  };
}

const TMP_Q = new THREE.Quaternion();
const TMP_Q2 = new THREE.Quaternion();
const TMP_QP = new THREE.Quaternion();
const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_DIR = new THREE.Vector3();
const TMP_CUR = new THREE.Vector3();

export class RealisticModel {
  readonly root: THREE.Group;
  private readonly rig: Rig;
  private readonly holder = new THREE.Group();
  private readonly links: Link[] = [];
  private readonly feet: FootLink[] = [];
  /** Кости, по которым проверяется, не ушла ли модель под пол. */
  private readonly groundProbes: THREE.Object3D[] = [];
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly auraLight: THREE.PointLight;
  private readonly baseColors: THREE.Color[] = [];

  constructor(
    private readonly spec: CharacterSpec,
    model: LoadedModel,
    /** Доворот модели, чтобы в покое она смотрела в +X. */
    faceYaw: number,
  ) {
    const specDims = dimensions(spec);

    const scene = instantiate(model);
    this.holder.add(scene);
    this.holder.rotation.y = faceYaw;

    // Подгоняем рост модели под габариты персонажа, чтобы хитбоксы совпадали с картинкой.
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const modelHeight = box.max.y - box.min.y;
    const scale = modelHeight > 0.01 ? specDims.height / modelHeight : 1;
    this.holder.scale.setScalar(scale);
    this.holder.updateMatrixWorld(true);

    const byName = new Map<string, THREE.Object3D>();
    scene.traverse((obj) => {
      byName.set(boneKey(obj.name), obj);
      const mesh = obj as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Кости уезжают далеко от исходного бокса — без этого модель пропадает на краях экрана.
        mesh.frustumCulled = false;
        this.tintMaterials(mesh);
      }
    });

    // Риг строится по НАСТОЯЩИМ длинам костей модели. Пока пропорции расходились,
    // поза приседа опускала бойца сильнее, чем складывались его ноги, и ступни уходили под пол.
    const dims = measureDims(byName, specDims);
    this.rig = new Rig(dims);
    this.root = this.rig.root;
    // Модель висит внутри body, поэтому разворот бойца и смещение позы она получает даром.
    this.rig.body.add(this.holder);

    this.makeFists(byName);

    for (const entry of BONE_MAP) {
      const bone = byName.get(boneKey(entry.bone));
      const child = byName.get(boneKey(entry.child));
      if (bone && child) this.links.push({ source: entry.source, bone, child, bind: bone.quaternion.clone() });
    }

    // Ступни не участвуют в ретаргете и просто наследуют поворот голени,
    // из-за чего носки уезжали в пол. Запоминаем их исходный поворот, чтобы ставить ровно.
    this.rig.root.updateMatrixWorld(true);
    const holderQuat = this.holder.getWorldQuaternion(new THREE.Quaternion());
    for (const name of ['mixamorigLeftFoot', 'mixamorigRightFoot']) {
      const bone = byName.get(name);
      if (!bone) continue;
      const world = bone.getWorldQuaternion(new THREE.Quaternion());
      this.feet.push({ bone, bindInHolder: holderQuat.clone().invert().multiply(world) });
      this.groundProbes.push(bone);
    }
    for (const name of ['mixamorigHips', 'mixamorigHead', 'mixamorigLeftHand', 'mixamorigRightHand']) {
      const bone = byName.get(name);
      if (bone) this.groundProbes.push(bone);
    }

    this.auraLight = new THREE.PointLight(spec.palette.aura, 0, 3.4, 2);
    this.auraLight.position.set(0, dims.hipHeight, 0.3);
    this.root.add(this.auraLight);
  }

  /** Сгибает фаланги в кулак. Левая и правая кисти в Mixamo зеркальны, отсюда знак. */
  private makeFists(byName: Map<string, THREE.Object3D>): void {
    for (const [key, node] of byName) {
      const match = key.match(/(left|right)hand(index|middle|ring|pinky|thumb)(\d)/);
      if (!match) continue;
      const [, side, finger, segRaw] = match;
      const segment = Number(segRaw);
      // Четвёртая фаланга — кончик пальца, вращать её нечего.
      if (segment > 3) continue;
      const amount =
        finger === 'thumb' ? FINGER_CURL.thumb : segment === 1 ? FINGER_CURL.base : FINGER_CURL.mid;
      node.rotation.z += side === 'left' ? amount : -amount;
    }
  }

  /** Лёгкая подкраска материалов в палитру бойца: модель общая, а читаться должны разные. */
  private tintMaterials(mesh: THREE.SkinnedMesh): void {
    const wasArray = Array.isArray(mesh.material);
    const list = wasArray ? (mesh.material as THREE.Material[]) : [mesh.material as THREE.Material];
    const tinted = list.map((source) => {
      const mat = (source as THREE.MeshStandardMaterial).clone();
      mat.color.lerp(new THREE.Color(this.spec.palette.primary), 0.32);
      mat.emissive = new THREE.Color(0x000000);
      this.materials.push(mat);
      this.baseColors.push(mat.color.clone());
      return mat;
    });
    // Геометрия без групп с массивом материалов не рисуется вообще — форму сохраняем как была.
    mesh.material = wasArray ? tinted : tinted[0];
  }

  place(x: number, y: number, facing: 1 | -1): void {
    this.rig.place(x, y, facing);
  }

  applyPose(pose: Pose, smoothing: number, grounded = true): void {
    this.holder.position.y = 0;
    this.rig.applyPose(pose, smoothing);
    this.rig.root.updateMatrixWorld(true);
    this.retarget();
    this.levelFeet();
    if (grounded) this.clampToGround();
  }

  /** Доворачивает каждую кость модели так, чтобы она смотрела как соответствующая кость рига. */
  private retarget(): void {
    // Считаем от исходной позы, а не от результата прошлого кадра: иначе скрутка вокруг
    // оси кости никогда не исправляется и модель со временем «перекручивает» конечности.
    for (const link of this.links) link.bone.quaternion.copy(link.bind);

    for (const link of this.links) {
      const desired = this.rig.boneDirection(link.source, TMP_DIR);

      link.bone.updateWorldMatrix(true, false);
      link.child.updateWorldMatrix(true, false);
      const from = link.bone.getWorldPosition(TMP_A);
      const to = link.child.getWorldPosition(TMP_B);
      const current = TMP_CUR.copy(to).sub(from);
      if (current.lengthSq() < 1e-10) continue;
      current.normalize();

      // Поворот, который в мировых координатах доводит текущее направление до нужного.
      const delta = TMP_Q.setFromUnitVectors(current, desired);
      const worldQuat = link.bone.getWorldQuaternion(TMP_Q2);
      delta.multiply(worldQuat);

      const parent = link.bone.parent;
      if (parent) {
        const parentQuat = parent.getWorldQuaternion(TMP_Q2);
        link.bone.quaternion.copy(parentQuat.invert().multiply(delta));
      } else {
        link.bone.quaternion.copy(delta);
      }
      link.bone.updateMatrixWorld(true);
    }
  }

  /** Ставит ступни ровно, если они у земли: иначе носки протыкают пол. */
  private levelFeet(): void {
    const holderQuat = this.holder.getWorldQuaternion(TMP_Q2);
    for (const foot of this.feet) {
      foot.bone.updateWorldMatrix(true, false);
      if (foot.bone.getWorldPosition(TMP_A).y > FOOT_GROUND_Y) continue;

      const desired = TMP_Q.copy(holderQuat).multiply(foot.bindInHolder);
      const parent = foot.bone.parent;
      if (parent) {
        const parentQuat = parent.getWorldQuaternion(TMP_QP);
        foot.bone.quaternion.copy(parentQuat.invert().multiply(desired));
      } else {
        foot.bone.quaternion.copy(desired);
      }
      foot.bone.updateMatrixWorld(true);
    }
  }

  /**
   * Поднимает модель, если она ушла под пол. Смещение позы двигает бойца целиком,
   * а ноги модели длиннее, чем у процедурного рига, — без этой поправки в присяде
   * и в нокдауне ступни проваливаются сквозь арену.
   */
  private clampToGround(): void {
    let lowest = Infinity;
    for (const probe of this.groundProbes) {
      probe.updateWorldMatrix(true, false);
      lowest = Math.min(lowest, probe.getWorldPosition(TMP_A).y);
    }
    if (!Number.isFinite(lowest)) return;
    // Ступня сидит чуть выше подошвы, поэтому небольшой запас оставляем.
    const target = 0.06;
    if (lowest < target) this.holder.position.y += (target - lowest) / this.holder.scale.y;
  }

  setEffects(flash: number, aura: number): void {
    const white = flash > 0 ? Math.min(1, flash / 8) : 0;
    for (let i = 0; i < this.materials.length; i += 1) {
      const mat = this.materials[i];
      mat.emissive.setRGB(white * 0.85, white * 0.12, white * 0.12);
      mat.emissiveIntensity = white > 0 ? 1.4 : aura * 0.8;
      if (aura > 0 && white === 0) mat.emissive.set(this.spec.palette.aura);
      mat.color.copy(this.baseColors[i]);
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
