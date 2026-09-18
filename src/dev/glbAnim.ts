import * as THREE from 'three';
import { readFileSync } from 'node:fs';

/**
 * Минимальный ручной парсер GLB для офлайн-запекания анимаций в Node.
 * GLTFLoader из three.js рассчитан на браузер (fetch/Image); здесь нужны только
 * JSON-структура узлов и бинарные accessor'ы — их проще прочитать напрямую.
 */

interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4';
}

interface GltfNode {
  name?: string;
  children?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

interface GltfSampler {
  input: number;
  output: number;
  interpolation?: 'LINEAR' | 'STEP' | 'CUBICSPLINE';
}

interface GltfChannel {
  sampler: number;
  target: { node: number; path: 'translation' | 'rotation' | 'scale' | 'weights' };
}

interface GltfAnimation {
  name?: string;
  channels: GltfChannel[];
  samplers: GltfSampler[];
}

interface GltfJson {
  nodes: GltfNode[];
  scenes: Array<{ nodes: number[] }>;
  scene?: number;
  accessors: GltfAccessor[];
  bufferViews: Array<{ buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }>;
  animations?: GltfAnimation[];
}

const COMPONENT_SIZE: Record<number, number> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};
const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export class GlbFile {
  readonly json: GltfJson;
  private readonly bin: Buffer;

  constructor(path: string) {
    const data = readFileSync(path);
    const magic = data.readUInt32LE(0);
    if (magic !== 0x46546c67) throw new Error('not a glb file');
    let offset = 12;
    let jsonChunk: Buffer | null = null;
    let binChunk: Buffer | null = null;
    while (offset < data.length) {
      const chunkLen = data.readUInt32LE(offset);
      const chunkType = data.readUInt32LE(offset + 4);
      const chunkData = data.subarray(offset + 8, offset + 8 + chunkLen);
      if (chunkType === 0x4e4f534a) jsonChunk = chunkData;
      else if (chunkType === 0x004e4942) binChunk = chunkData;
      offset += 8 + chunkLen;
    }
    if (!jsonChunk) throw new Error('no JSON chunk');
    this.json = JSON.parse(jsonChunk.toString('utf-8'));
    this.bin = binChunk ?? Buffer.alloc(0);
  }

  /** Читает accessor как плоский массив float (только FLOAT-компоненты — этого достаточно для анимаций). */
  readAccessor(index: number): { data: Float32Array; stride: number; count: number } {
    const acc = this.json.accessors[index];
    const stride = TYPE_COMPONENTS[acc.type];
    const count = acc.count;
    if (acc.bufferView === undefined) return { data: new Float32Array(count * stride), stride, count };
    const bv = this.json.bufferViews[acc.bufferView];
    const compSize = COMPONENT_SIZE[acc.componentType];
    const byteOffset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const elemStride = bv.byteStride ?? stride * compSize;

    const out = new Float32Array(count * stride);
    for (let i = 0; i < count; i += 1) {
      const base = byteOffset + i * elemStride;
      for (let c = 0; c < stride; c += 1) {
        const at = base + c * compSize;
        let v: number;
        if (acc.componentType === 5126) v = this.bin.readFloatLE(at);
        else if (acc.componentType === 5123) v = this.bin.readUInt16LE(at);
        else if (acc.componentType === 5121) v = this.bin.readUInt8(at);
        else throw new Error(`unsupported componentType ${acc.componentType}`);
        out[i * stride + c] = v;
      }
    }
    return { data: out, stride, count };
  }

  findAnimation(name: string): GltfAnimation {
    const anim = (this.json.animations ?? []).find((a) => a.name === name);
    if (!anim) throw new Error(`animation "${name}" not found`);
    return anim;
  }

  duration(anim: GltfAnimation): number {
    let max = 0;
    for (const s of anim.samplers) {
      const { data } = this.readAccessor(s.input);
      if (data.length) max = Math.max(max, data[data.length - 1]);
    }
    return max;
  }
}

type Track = { times: Float32Array; values: Float32Array; stride: number; interpolation: 'LINEAR' | 'STEP' | 'CUBICSPLINE' };

/** Сэмплирует локальный TRS каждого узла на момент времени t для заданной анимации. */
export class AnimationSampler {
  private readonly rotation = new Map<number, Track>();
  private readonly translation = new Map<number, Track>();
  private readonly scale = new Map<number, Track>();

  constructor(
    private readonly glbFile: GlbFile,
    animName: string,
  ) {
    const anim = this.glbFile.findAnimation(animName);
    for (const ch of anim.channels) {
      const sampler = anim.samplers[ch.sampler];
      const { data: times } = this.glbFile.readAccessor(sampler.input);
      const { data: values, stride } = this.glbFile.readAccessor(sampler.output);
      const track: Track = { times, values, stride, interpolation: sampler.interpolation ?? 'LINEAR' };
      const target = ch.target.path === 'rotation' ? this.rotation : ch.target.path === 'translation' ? this.translation : this.scale;
      target.set(ch.target.node, track);
    }
  }

  private sampleTrack(track: Track, t: number): number[] {
    const { times, values, stride } = track;
    const n = times.length;
    if (n === 0) return new Array(stride).fill(0);
    if (t <= times[0]) return Array.from(values.subarray(0, stride));
    if (t >= times[n - 1]) return Array.from(values.subarray((n - 1) * stride, n * stride));
    let hi = 1;
    while (hi < n && times[hi] < t) hi += 1;
    const lo = hi - 1;
    if (track.interpolation === 'STEP') return Array.from(values.subarray(lo * stride, (lo + 1) * stride));
    const span = times[hi] - times[lo] || 1;
    const f = (t - times[lo]) / span;
    if (stride === 4) {
      // Кватернион: линейная интерполяция даёт скрутку на больших углах, поэтому slerp.
      const a = new THREE.Quaternion(values[lo * 4], values[lo * 4 + 1], values[lo * 4 + 2], values[lo * 4 + 3]);
      const b = new THREE.Quaternion(values[hi * 4], values[hi * 4 + 1], values[hi * 4 + 2], values[hi * 4 + 3]);
      a.slerp(b, f);
      return [a.x, a.y, a.z, a.w];
    }
    const out: number[] = [];
    for (let c = 0; c < stride; c += 1) {
      const a = values[lo * stride + c];
      const b = values[hi * stride + c];
      out.push(a + (b - a) * f);
    }
    return out;
  }

  translationAt(node: number, t: number, fallback: [number, number, number]): [number, number, number] {
    const track = this.translation.get(node);
    if (!track) return fallback;
    const v = this.sampleTrack(track, t);
    return [v[0], v[1], v[2]];
  }

  rotationAt(node: number, t: number, fallback: [number, number, number, number]): [number, number, number, number] {
    const track = this.rotation.get(node);
    if (!track) return fallback;
    const v = this.sampleTrack(track, t);
    return [v[0], v[1], v[2], v[3]];
  }
}

/** Прямая кинематика: мировые матрицы всех узлов сцены на момент t заданной анимации. */
export function computeWorldTransforms(
  glb: GlbFile,
  sampler: AnimationSampler | null,
  t: number,
): { positions: Map<number, THREE.Vector3>; quats: Map<number, THREE.Quaternion> } {
  const nodes = glb.json.nodes;
  const positions = new Map<number, THREE.Vector3>();
  const quats = new Map<number, THREE.Quaternion>();

  const visit = (index: number, parentMatrix: THREE.Matrix4): void => {
    const node = nodes[index];
    const baseT = node.translation ?? [0, 0, 0];
    const baseR = node.rotation ?? [0, 0, 0, 1];
    const baseS = node.scale ?? [1, 1, 1];

    const t3 = sampler ? sampler.translationAt(index, t, baseT) : baseT;
    const r4 = sampler ? sampler.rotationAt(index, t, baseR) : baseR;
    const s3 = baseS; // масштаб костей не анимируется в этом ассете — берём базовый.

    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...t3),
      new THREE.Quaternion(...r4),
      new THREE.Vector3(...s3),
    );
    const world = new THREE.Matrix4().multiplyMatrices(parentMatrix, local);

    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    world.decompose(pos, quat, scl);
    positions.set(index, pos);
    quats.set(index, quat);

    for (const child of node.children ?? []) visit(child, world);
  };

  const roots = glb.json.scenes[glb.json.scene ?? 0].nodes;
  for (const r of roots) visit(r, new THREE.Matrix4());

  return { positions, quats };
}

export function findNodeByName(glb: GlbFile, name: string): number {
  const idx = glb.json.nodes.findIndex((n) => n.name === name);
  if (idx < 0) throw new Error(`node "${name}" not found`);
  return idx;
}
