import {
  BLEND_ADDITIVE,
  Curve,
  CurveSet,
  EMITTERSHAPE_SPHERE,
  Entity,
  type AppBase,
} from 'playcanvas';
import { hexColor } from './scene';
import { glowMat } from './material';
import { sparkTexture, ringTexture } from './textures';

const SPARK_POOL = 14;
const DUST_POOL = 6;
const RING_POOL = 8;

interface RingSlot {
  entity: Entity;
  mat: ReturnType<typeof glowMat>;
  life: number;
  max: number;
  scale: number;
}

/**
 * Боевая «пиротехника»: искры и пыль — пул `particlesystem`-компонентов (см. add-effects:
 * «prefer the Engine's built-in particle component»), кольца попадания и столб добивания —
 * пул плоских аддитивных примитивов с ручным затуханием (не частицы — это статичная форма,
 * а не облако).
 */
export class Effects {
  readonly root = new Entity('effects');

  private readonly sparks: Entity[] = [];
  private readonly dustPool: Entity[] = [];
  private sparkCursor = 0;
  private dustCursor = 0;

  private readonly rings: RingSlot[] = [];
  private readonly beam: Entity;
  private readonly beamMat: ReturnType<typeof glowMat>;
  private beamLife = 0;
  private beamMax = 1;
  private readonly beamLight: Entity;

  constructor(app: AppBase) {
    const spark = sparkTexture(app.graphicsDevice);
    const ring = ringTexture(app.graphicsDevice);

    for (let i = 0; i < SPARK_POOL; i += 1) {
      const e = new Entity(`spark-${i}`);
      e.addComponent('particlesystem', {
        numParticles: 20,
        lifetime: 0.4,
        rate: 0.001,
        loop: false,
        autoPlay: false,
        emitterShape: EMITTERSHAPE_SPHERE,
        emitterRadius: 0.06,
        initialVelocity: 1.6,
        colorMap: spark,
        blendType: BLEND_ADDITIVE,
        depthWrite: false,
        lighting: false,
        scaleGraph: new Curve([0, 0.09, 1, 0.015]),
        alphaGraph: new Curve([0, 0.95, 0.55, 0.75, 1, 0]),
      });
      this.root.addChild(e);
      this.sparks.push(e);
    }

    for (let i = 0; i < DUST_POOL; i += 1) {
      const e = new Entity(`dust-${i}`);
      e.addComponent('particlesystem', {
        numParticles: 10,
        lifetime: 0.6,
        rate: 0.001,
        loop: false,
        autoPlay: false,
        emitterShape: EMITTERSHAPE_SPHERE,
        emitterRadius: 0.25,
        initialVelocity: 0.5,
        colorMap: spark,
        blendType: BLEND_ADDITIVE,
        depthWrite: false,
        lighting: false,
        scaleGraph: new Curve([0, 0.14, 1, 0.03]),
        alphaGraph: new Curve([0, 0.55, 1, 0]),
        colorGraph: tint(0xb9a88a),
      });
      this.root.addChild(e);
      this.dustPool.push(e);
    }

    for (let i = 0; i < RING_POOL; i += 1) {
      const mat = glowMat(0xffffff, 0);
      mat.emissiveMap = ring;
      mat.opacityMap = ring;
      mat.opacityMapChannel = 'a';
      mat.update();
      const e = new Entity('ring');
      e.addComponent('render', { type: 'plane', material: mat });
      e.setLocalEulerAngles(90, 0, 0);
      e.enabled = false;
      this.root.addChild(e);
      this.rings.push({ entity: e, mat, life: 0, max: 1, scale: 1 });
    }

    this.beamMat = glowMat(0xffffff, 0);
    this.beam = new Entity('beam');
    this.beam.addComponent('render', { type: 'cylinder', material: this.beamMat });
    this.beam.setLocalScale(1.8, 14, 1.8);
    this.beam.setLocalPosition(0, 6, 0);
    this.beam.enabled = false;
    this.root.addChild(this.beam);

    this.beamLight = new Entity('beam-light');
    this.beamLight.addComponent('light', { type: 'omni', color: hexColor(0xffffff), intensity: 0, range: 14 });
    this.beamLight.setLocalPosition(0, 2, 0);
    this.root.addChild(this.beamLight);
  }

  /** Сноп искр из точки контакта. */
  burst(x: number, y: number, color: number, count: number, power: number): void {
    const e = this.sparks[this.sparkCursor];
    this.sparkCursor = (this.sparkCursor + 1) % this.sparks.length;
    const ps = e.particlesystem;
    if (!ps) return;
    e.setPosition(x, y, 0);
    ps.numParticles = Math.round(clamp(count, 4, 48));
    ps.initialVelocity = 1.1 + power * 1.7;
    ps.lifetime = 0.3 + power * 0.12;
    ps.colorGraph = tint(color);
    ps.scaleGraph = new Curve([0, 0.06 + power * 0.05, 1, 0.015]);
    ps.reset();
    ps.play();
  }

  /** Расходящееся кольцо — читается как «удар прошёл». */
  ring(x: number, y: number, color: number, scale = 1, frames = 22): void {
    const slot = this.rings.find((r) => r.life <= 0) ?? this.rings[0];
    slot.entity.setPosition(x, y, 0.2);
    slot.entity.setLocalScale(0.6 * scale, 1, 0.6 * scale);
    slot.entity.enabled = true;
    slot.mat.emissive = hexColor(color);
    slot.mat.opacity = 0.9;
    slot.mat.update();
    slot.life = frames;
    slot.max = frames;
    slot.scale = scale;
  }

  /** Пыль из-под ног при приземлении и рывках. */
  dust(x: number, color = 0xb9a88a): void {
    const e = this.dustPool[this.dustCursor];
    this.dustCursor = (this.dustCursor + 1) % this.dustPool.length;
    const ps = e.particlesystem;
    if (!ps) return;
    e.setPosition(x, 0.05, 0);
    ps.colorGraph = tint(color);
    ps.reset();
    ps.play();
  }

  /** Столб света: добивание должно читаться как событие, а не как обычный удар. */
  column(x: number, color: number, frames = 90): void {
    this.beam.setLocalPosition(x, 6, 0);
    this.beam.enabled = true;
    this.beamMat.emissive = hexColor(color);
    if (this.beamLight.light) this.beamLight.light.color = hexColor(color);
    this.beamLight.setLocalPosition(x, 2, 0);
    this.beamLife = frames;
    this.beamMax = frames;
    this.burst(x, 1.0, color, 90, 2.6);
    this.ring(x, 0.2, color, 3.2, 40);
  }

  update(): void {
    if (this.beamLife > 0) {
      this.beamLife -= 1;
      const t = 1 - this.beamLife / this.beamMax;
      this.beam.setLocalScale((0.4 + t * 1.4) * 1.8, 14, (0.4 + t * 1.4) * 1.8);
      this.beamMat.opacity = 0.85 * (1 - t) ** 1.4;
      this.beamMat.update();
      if (this.beamLight.light) this.beamLight.light.intensity = 22 * (1 - t) ** 2;
      if (this.beamLife <= 0) {
        this.beam.enabled = false;
        if (this.beamLight.light) this.beamLight.light.intensity = 0;
      }
    }

    for (const r of this.rings) {
      if (r.life <= 0) {
        if (r.entity.enabled) r.entity.enabled = false;
        continue;
      }
      r.life -= 1;
      const t = 1 - r.life / r.max;
      const s = (0.6 + t * 2.2) * r.scale;
      r.entity.setLocalScale(s, 1, s);
      r.mat.opacity = 0.9 * (1 - t) ** 1.6;
      r.mat.update();
      if (r.life <= 0) r.entity.enabled = false;
    }
  }
}

function tint(color: number): CurveSet {
  const c = hexColor(color);
  return new CurveSet([
    [0, Math.min(1, c.r + 0.25), 1, c.r * 0.5],
    [0, Math.min(1, c.g + 0.2), 1, c.g * 0.5],
    [0, Math.min(1, c.b + 0.2), 1, c.b * 0.5],
  ]);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
