import * as THREE from 'three';
import { STAGE_HALF_WIDTH } from '../game/constants';

/**
 * Арена «Нижний храм»: каменная плита, колоннада, жаровни с мерцающим огнём.
 * Геометрии мало и она вся статичная — на мобильном это один-два десятка вызовов отрисовки.
 */
export class Stage {
  readonly group = new THREE.Group();
  private readonly braziers: Array<{ light: THREE.PointLight; base: number; phase: number }> = [];
  private readonly banners: THREE.Mesh[] = [];
  private readonly flames: THREE.Mesh[] = [];

  constructor() {
    const stone = new THREE.MeshStandardMaterial({ color: 0x6a6a78, roughness: 0.92, metalness: 0.04 });
    const darkStone = new THREE.MeshStandardMaterial({ color: 0x3b3b48, roughness: 0.96 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x9a7f52, roughness: 0.55, metalness: 0.4 });

    // Пол арены.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(STAGE_HALF_WIDTH * 2 + 40, 0.4, 60), stone);
    floor.position.set(0, -0.2, -12);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Тёмная кайма по краям боевой зоны — визуальные границы, их видно в бою.
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 12), trim);
      edge.position.set(side * (STAGE_HALF_WIDTH + 0.25), -0.1, 0);
      edge.receiveShadow = true;
      edge.castShadow = true;
      this.group.add(edge);
    }

    // Задняя стена.
    const wall = new THREE.Mesh(new THREE.BoxGeometry(34, 14, 1), darkStone);
    wall.position.set(0, 6, -5.6);
    wall.receiveShadow = true;
    this.group.add(wall);

    // Колоннада.
    const columnGeo = new THREE.CylinderGeometry(0.42, 0.5, 8.4, 10);
    for (let i = -3; i <= 3; i += 1) {
      if (i === 0) continue;
      const column = new THREE.Mesh(columnGeo, stone);
      column.position.set(i * 3.4, 4.0, -4.2);
      column.castShadow = true;
      column.receiveShadow = true;
      this.group.add(column);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 1.3), trim);
      cap.position.set(i * 3.4, 8.3, -4.2);
      this.group.add(cap);
    }

    // Жаровни — основной источник живого света на сцене.
    for (const side of [-1, 1]) {
      const x = side * 6.4;
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 2.2, 8), trim);
      stand.position.set(x, 1.1, -3.0);
      stand.castShadow = true;
      this.group.add(stand);

      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.28, 0.4, 10), trim);
      bowl.position.set(x, 2.35, -3.0);
      this.group.add(bowl);

      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.26, 0.62, 8),
        new THREE.MeshBasicMaterial({ color: 0xffb457, transparent: true, opacity: 0.95 }),
      );
      flame.position.set(x, 2.78, -3.0);
      this.group.add(flame);
      this.flames.push(flame);

      const light = new THREE.PointLight(0xff8a30, 2.6, 16, 2);
      light.position.set(x, 3.1, -2.6);
      this.group.add(light);
      this.braziers.push({ light, base: 2.6, phase: Math.random() * Math.PI * 2 });
    }

    // Знамёна над ареной: дают вертикальный ритм и цвет там, где раньше была пустая стена.
    const bannerGeo = new THREE.PlaneGeometry(1.1, 3.4);
    for (let i = -3; i <= 3; i += 1) {
      const banner = new THREE.Mesh(
        bannerGeo,
        new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? 0x7a2020 : 0x1f2a5a,
          roughness: 0.95,
          side: THREE.DoubleSide,
        }),
      );
      banner.position.set(i * 3.4 + 1.7, 5.6, -4.9);
      this.group.add(banner);
      this.banners.push(banner);
    }
  }

  update(time: number): void {
    for (let i = 0; i < this.flames.length; i += 1) {
      const flame = this.flames[i];
      flame.scale.set(1, 0.85 + Math.sin(time * 0.23 + i) * 0.18 + Math.random() * 0.08, 1);
    }
    for (const b of this.braziers) {
      b.light.intensity = b.base + Math.sin(time * 0.11 + b.phase) * 0.5 + Math.random() * 0.25;
    }
    // Знамёна слегка колышутся — статичный задник сразу выдаёт «картонность» сцены.
    for (let i = 0; i < this.banners.length; i += 1) {
      this.banners[i].rotation.z = Math.sin(time * 0.03 + i) * 0.03;
      this.banners[i].scale.y = 1 + Math.sin(time * 0.05 + i * 1.7) * 0.02;
    }
  }
}
