import * as THREE from 'three';
import { Rig, dimensions } from './rig';
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
const BONE_MAP: Array<{ source: BoneName; bone: string; child: string }> = [
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
}

/**
 * GLTFLoader санирует имена узлов и выбрасывает двоеточие, так что в сцене кость
 * зовётся не «mixamorig:Hips», а «mixamorigHips». Сравниваем по ключу без разделителей,
 * чтобы работали оба варианта и модели из других экспортов.
 */
function boneKey(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/**
 * Сжатие пальцев в кулак. Модели с Mixamo приходят с раскрытой ладонью, и в файтинге
 * это сразу бросается в глаза. Кости пальцев не участвуют в ретаргете, поэтому
 * достаточно один раз согнуть их при создании модели.
 */
const FINGER_CURL = { base: 1.15, mid: 1.4, thumb: 0.5 };

const TMP_Q = new THREE.Quaternion();
const TMP_Q2 = new THREE.Quaternion();
const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_DIR = new THREE.Vector3();
const TMP_CUR = new THREE.Vector3();

export class RealisticModel {
  readonly root: THREE.Group;
  private readonly rig: Rig;
  private readonly holder = new THREE.Group();
  private readonly links: Link[] = [];
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly auraLight: THREE.PointLight;
  private readonly baseColors: THREE.Color[] = [];

  constructor(
    private readonly spec: CharacterSpec,
    model: LoadedModel,
    /** Доворот модели, чтобы в покое она смотрела в +X. */
    faceYaw: number,
  ) {
    const dims = dimensions(spec);
    this.rig = new Rig(dims);
    this.root = this.rig.root;

    const scene = instantiate(model);
    this.holder.add(scene);
    this.holder.rotation.y = faceYaw;
    // Модель висит внутри body, поэтому разворот бойца и смещение позы она получает даром.
    this.rig.body.add(this.holder);

    // Подгоняем рост модели под габариты персонажа, чтобы хитбоксы совпадали с картинкой.
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const modelHeight = box.max.y - box.min.y;
    const scale = modelHeight > 0.01 ? dims.height / modelHeight : 1;
    this.holder.scale.setScalar(scale);

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

    this.makeFists(byName);

    for (const entry of BONE_MAP) {
      const bone = byName.get(boneKey(entry.bone));
      const child = byName.get(boneKey(entry.child));
      if (bone && child) this.links.push({ source: entry.source, bone, child });
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

  applyPose(pose: Pose, smoothing: number): void {
    this.rig.applyPose(pose, smoothing);
    this.rig.root.updateMatrixWorld(true);
    this.retarget();
  }

  /** Доворачивает каждую кость модели так, чтобы она смотрела как соответствующая кость рига. */
  private retarget(): void {
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
