import { Entity } from 'playcanvas';
import { STAGE_HALF_WIDTH } from '../game/constants';
import { standardMat, glowMat } from './material';
import { hexColor } from './scene';

/**
 * Арена «Нижний храм»: каменная плита, колоннада, жаровни с мерцающим огнём.
 * Геометрии мало и она вся статичная — на мобильном это один-два десятка вызовов отрисовки.
 */
export class Stage {
  readonly root = new Entity('stage');
  private readonly braziers: Array<{ light: Entity; base: number; phase: number }> = [];
  private readonly banners: Entity[] = [];
  private readonly flames: Entity[] = [];

  constructor() {
    const stone = standardMat(0x6a6a78, { roughness: 0.92, metalness: 0.04 });
    const darkStone = standardMat(0x3b3b48, { roughness: 0.96, metalness: 0 });
    const trim = standardMat(0x9a7f52, { roughness: 0.55, metalness: 0.4 });

    // Пол арены.
    const floor = box(STAGE_HALF_WIDTH * 2 + 40, 0.4, 60, stone);
    floor.setLocalPosition(0, -0.2, -12);
    this.root.addChild(floor);

    // Тёмная кайма по краям боевой зоны — визуальные границы, их видно в бою.
    for (const side of [-1, 1]) {
      const edge = box(0.5, 0.72, 12, trim);
      edge.setLocalPosition(side * (STAGE_HALF_WIDTH + 0.25), -0.1, 0);
      this.root.addChild(edge);
    }

    // Задняя стена.
    const wall = box(34, 14, 1, darkStone);
    wall.setLocalPosition(0, 6, -5.6);
    this.root.addChild(wall);

    // Колоннада.
    for (let i = -3; i <= 3; i += 1) {
      if (i === 0) continue;
      const column = cylinder(0.46, 8.4, stone);
      column.setLocalPosition(i * 3.4, 4.0, -4.2);
      this.root.addChild(column);

      const cap = box(1.3, 0.4, 1.3, trim);
      cap.setLocalPosition(i * 3.4, 8.3, -4.2);
      this.root.addChild(cap);
    }

    // Жаровни — основной источник живого света на сцене.
    for (const side of [-1, 1]) {
      const x = side * 6.4;
      const stand = cylinder(0.23, 2.2, trim);
      stand.setLocalPosition(x, 1.1, -3.0);
      this.root.addChild(stand);

      const bowl = cylinder(0.4, 0.4, trim);
      bowl.setLocalPosition(x, 2.35, -3.0);
      this.root.addChild(bowl);

      const flame = cone(0.26, 0.62, glowMat(0xffb457, 0.95, false));
      flame.setLocalPosition(x, 2.78, -3.0);
      this.root.addChild(flame);
      this.flames.push(flame);

      const light = new Entity('brazier-light');
      light.addComponent('light', { type: 'omni', color: hexColor(0xff8a30), intensity: 2.6, range: 16 });
      light.setLocalPosition(x, 3.1, -2.6);
      this.root.addChild(light);
      this.braziers.push({ light, base: 2.6, phase: Math.random() * Math.PI * 2 });
    }

    // Знамёна над ареной: дают вертикальный ритм и цвет там, где раньше была пустая стена.
    for (let i = -3; i <= 3; i += 1) {
      const banner = new Entity('banner');
      banner.addComponent('render', {
        type: 'plane',
        material: standardMat(i % 2 === 0 ? 0x7a2020 : 0x1f2a5a, { roughness: 0.95, doubleSided: true }),
      });
      banner.setLocalScale(1.1, 1, 3.4);
      banner.setLocalEulerAngles(90, 0, 0);
      banner.setLocalPosition(i * 3.4 + 1.7, 5.6, -4.9);
      this.root.addChild(banner);
      this.banners.push(banner);
    }
  }

  update(time: number): void {
    for (let i = 0; i < this.flames.length; i += 1) {
      const flame = this.flames[i];
      const s = 0.85 + Math.sin(time * 0.23 + i) * 0.18 + Math.random() * 0.08;
      flame.setLocalScale(0.26 * 2, 0.62 * s, 0.26 * 2);
    }
    for (const b of this.braziers) {
      const intensity = b.base + Math.sin(time * 0.11 + b.phase) * 0.5 + Math.random() * 0.25;
      if (b.light.light) b.light.light.intensity = intensity;
    }
    // Знамёна слегка колышутся — статичный задник сразу выдаёт «картонность» сцены.
    for (let i = 0; i < this.banners.length; i += 1) {
      const banner = this.banners[i];
      const quiver = Math.sin(time * 0.03 + i) * 1.7;
      const wobble = 1 + Math.sin(time * 0.05 + i * 1.7) * 0.02;
      banner.setLocalEulerAngles(90, quiver, 0);
      banner.setLocalScale(1.1, 1, 3.4 * wobble);
    }
  }
}

function box(w: number, h: number, d: number, material: ReturnType<typeof standardMat>): Entity {
  const e = new Entity('box');
  e.addComponent('render', { type: 'box', material, castShadows: true, receiveShadows: true });
  e.setLocalScale(w, h, d);
  return e;
}

function cylinder(radius: number, height: number, material: ReturnType<typeof standardMat>): Entity {
  const e = new Entity('cylinder');
  e.addComponent('render', { type: 'cylinder', material, castShadows: true, receiveShadows: true });
  e.setLocalScale(radius * 2, height, radius * 2);
  return e;
}

function cone(radius: number, height: number, material: ReturnType<typeof glowMat>): Entity {
  const e = new Entity('cone');
  e.addComponent('render', { type: 'cone', material });
  e.setLocalScale(radius * 2, height, radius * 2);
  return e;
}
