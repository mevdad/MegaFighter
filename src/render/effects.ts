import * as THREE from 'three';

const SPARK_CAPACITY = 420;
const RING_POOL = 8;

/**
 * Вся боевая «пиротехника» в одном месте: искры одним draw call через Points,
 * ударные кольца — небольшим пулом мешей. Телефон такое тянет без просадок.
 */
export class Effects {
  readonly group = new THREE.Group();

  private readonly sparkGeo = new THREE.BufferGeometry();
  private readonly positions = new Float32Array(SPARK_CAPACITY * 3);
  private readonly colors = new Float32Array(SPARK_CAPACITY * 3);
  private readonly sizes = new Float32Array(SPARK_CAPACITY);
  private readonly vel = new Float32Array(SPARK_CAPACITY * 3);
  private readonly life = new Float32Array(SPARK_CAPACITY);
  private readonly maxLife = new Float32Array(SPARK_CAPACITY);
  private cursor = 0;

  private readonly rings: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; max: number; scale: number }> = [];
  /** Столб света для добивания. */
  private readonly beam: THREE.Mesh;
  private readonly beamMat: THREE.MeshBasicMaterial;
  private beamLife = 0;
  private beamMax = 1;
  private readonly beamLight: THREE.PointLight;

  constructor() {
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.sparkGeo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    const points = new THREE.Points(
      this.sparkGeo,
      new THREE.PointsMaterial({
        size: 0.1,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    points.frustumCulled = false;
    this.group.add(points);

    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 14, 20, 1, true), this.beamMat);
    this.beam.position.y = 6;
    this.beam.visible = false;
    this.group.add(this.beam);

    this.beamLight = new THREE.PointLight(0xffffff, 0, 14, 2);
    this.beamLight.position.y = 2;
    this.group.add(this.beamLight);

    const ringGeo = new THREE.RingGeometry(0.28, 0.42, 24);
    for (let i = 0; i < RING_POOL; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, life: 0, max: 1, scale: 1 });
    }
  }

  /** Сноп искр из точки контакта. */
  burst(x: number, y: number, color: number, count: number, power: number): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i += 1) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % SPARK_CAPACITY;
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.04 + Math.random() * 0.12) * power;
      this.positions[idx * 3] = x + (Math.random() - 0.5) * 0.12;
      this.positions[idx * 3 + 1] = y + (Math.random() - 0.5) * 0.12;
      this.positions[idx * 3 + 2] = (Math.random() - 0.5) * 0.4;
      this.vel[idx * 3] = Math.cos(angle) * speed;
      this.vel[idx * 3 + 1] = Math.sin(angle) * speed + 0.02;
      this.vel[idx * 3 + 2] = (Math.random() - 0.5) * speed;
      const tint = 0.7 + Math.random() * 0.5;
      this.colors[idx * 3] = Math.min(1, c.r * tint + 0.25);
      this.colors[idx * 3 + 1] = Math.min(1, c.g * tint + 0.2);
      this.colors[idx * 3 + 2] = Math.min(1, c.b * tint + 0.2);
      this.sizes[idx] = 0.07 + Math.random() * 0.1 * power;
      this.life[idx] = 18 + Math.random() * 16;
      this.maxLife[idx] = this.life[idx];
    }
  }

  /** Расходящееся кольцо — читается как «удар прошёл». */
  ring(x: number, y: number, color: number, scale = 1, frames = 22): void {
    const slot = this.rings.find((r) => r.life <= 0) ?? this.rings[0];
    slot.mesh.position.set(x, y, 0.2);
    slot.mesh.scale.setScalar(0.3 * scale);
    slot.mesh.visible = true;
    slot.mat.color.set(color);
    slot.mat.opacity = 0.9;
    slot.life = frames;
    slot.max = frames;
    slot.scale = scale;
  }

  /** Пыль из-под ног при приземлении и рывках. */
  dust(x: number, color = 0xb9a88a): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < 10; i += 1) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % SPARK_CAPACITY;
      this.positions[idx * 3] = x + (Math.random() - 0.5) * 0.5;
      this.positions[idx * 3 + 1] = 0.05 + Math.random() * 0.1;
      this.positions[idx * 3 + 2] = (Math.random() - 0.5) * 0.5;
      this.vel[idx * 3] = (Math.random() - 0.5) * 0.05;
      this.vel[idx * 3 + 1] = 0.01 + Math.random() * 0.02;
      this.vel[idx * 3 + 2] = (Math.random() - 0.5) * 0.02;
      this.colors[idx * 3] = c.r;
      this.colors[idx * 3 + 1] = c.g;
      this.colors[idx * 3 + 2] = c.b;
      this.sizes[idx] = 0.12 + Math.random() * 0.14;
      this.life[idx] = 26 + Math.random() * 14;
      this.maxLife[idx] = this.life[idx];
    }
  }

  /** Столб света: добивание должно читаться как событие, а не как обычный удар. */
  column(x: number, color: number, frames = 90): void {
    this.beam.position.x = x;
    this.beam.visible = true;
    this.beamMat.color.set(color);
    this.beamLight.color.set(color);
    this.beamLight.position.x = x;
    this.beamLife = frames;
    this.beamMax = frames;
    this.burst(x, 1.0, color, 90, 2.6);
    this.ring(x, 0.2, color, 3.2, 40);
  }

  update(): void {
    for (let i = 0; i < SPARK_CAPACITY; i += 1) {
      if (this.life[i] <= 0) {
        this.sizes[i] = 0;
        continue;
      }
      this.life[i] -= 1;
      this.positions[i * 3] += this.vel[i * 3];
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1];
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2];
      this.vel[i * 3 + 1] -= 0.004;
      this.vel[i * 3] *= 0.94;
      this.vel[i * 3 + 2] *= 0.94;
      const t = this.life[i] / this.maxLife[i];
      this.sizes[i] *= 0.96;
      this.colors[i * 3] *= 0.97;
      this.colors[i * 3 + 1] *= 0.96;
      this.colors[i * 3 + 2] *= 0.96;
      if (t < 0.05) this.sizes[i] = 0;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.color.needsUpdate = true;
    this.sparkGeo.attributes.size.needsUpdate = true;

    if (this.beamLife > 0) {
      this.beamLife -= 1;
      const t = 1 - this.beamLife / this.beamMax;
      this.beam.scale.set(0.4 + t * 1.4, 1, 0.4 + t * 1.4);
      this.beamMat.opacity = 0.85 * (1 - t) ** 1.4;
      this.beamLight.intensity = 22 * (1 - t) ** 2;
      if (this.beamLife <= 0) {
        this.beam.visible = false;
        this.beamLight.intensity = 0;
      }
    }

    for (const r of this.rings) {
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      r.life -= 1;
      const t = 1 - r.life / r.max;
      r.mesh.scale.setScalar((0.3 + t * 2.2) * r.scale);
      r.mat.opacity = 0.9 * (1 - t) ** 1.6;
      if (r.life <= 0) r.mesh.visible = false;
    }
  }
}
