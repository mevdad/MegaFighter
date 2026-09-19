import { Entity } from 'playcanvas';
import { Effects } from './effects';
import { ProceduralFighter } from './proceduralFighter';
import { AnimatedFighter } from './animatedFighter';
import { getLoadedContainer } from './assets';
import { SceneView, hexColor } from './scene';
import { Stage } from './stage';
import { standardMat } from './material';
import { audio } from '../core/audio';
import type { GameEvent, Match } from '../game/match';
import type { Projectile } from '../game/combat';
import type { CharacterSpec } from '../game/types';
import type { FighterVisual } from './fighterVisual';

function makeVisual(spec: CharacterSpec): FighterVisual {
  if (spec.animatedRig) {
    const loaded = getLoadedContainer(spec.animatedRig.url);
    if (loaded) return new AnimatedFighter(spec, loaded, spec.animatedRig);
  }
  return new ProceduralFighter(spec);
}

/** Соединяет симуляцию с графикой: модели бойцов, снаряды, эффекты и звук по событиям. */
export class BattleView {
  private readonly stage = new Stage();
  private readonly effects: Effects;
  private models: [FighterVisual, FighterVisual] | null = null;
  private readonly projectileEntities = new Map<Projectile, { entity: Entity; color: number }>();
  private time = 0;
  private wasAirborne: [boolean, boolean] = [false, false];

  constructor(private readonly view: SceneView) {
    view.root.addChild(this.stage.root);
    this.effects = new Effects(view.app);
    view.root.addChild(this.effects.root);
  }

  setMatch(match: Match): void {
    if (this.models) {
      for (const m of this.models) m.dispose();
    }
    this.models = [makeVisual(match.fighters[0].spec), makeVisual(match.fighters[1].spec)];
    for (const m of this.models) this.view.root.addChild(m.root);
    for (const [, p] of this.projectileEntities) p.entity.destroy();
    this.projectileEntities.clear();
  }

  handleEvents(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const base = e.power === 'super' ? 2.4 : e.power === 'special' ? 1.7 : e.power === 'heavy' ? 1.4 : 1;
          // Контрудар должен читаться мгновенно: ярче вспышка, шире кольцо, сильнее тряска.
          const power = e.counter ? base * 1.45 : base;
          this.effects.burst(e.x, e.y, e.counter ? 0xffe066 : e.color, Math.round(14 * power), power);
          this.effects.ring(e.x, e.y, e.counter ? 0xffc43d : e.color, power, e.counter ? 26 : 20);
          this.view.shake(0.12 * power + e.damage / 900);
          audio.play(e.power);
          break;
        }
        case 'finisher':
          this.effects.column(e.x, e.color, 110);
          this.view.shake(1.4);
          audio.play('super');
          break;
        case 'throwTech':
          this.effects.burst(e.x, e.y, 0xffffff, 16, 1.2);
          this.effects.ring(e.x, e.y, 0xffffff, 1.1, 18);
          audio.play('block');
          break;
        case 'block':
          this.effects.burst(e.x, e.y, 0xbfd8ff, 8, 0.7);
          this.effects.ring(e.x, e.y, 0x9fc4ff, 0.7, 14);
          audio.play('block');
          break;
        case 'projectile':
          this.effects.burst(e.x, e.y, e.color, 10, 0.9);
          audio.play('special');
          break;
        case 'ko':
          this.view.shake(0.8);
          audio.play('ko');
          break;
        case 'announce':
          audio.play('announce');
          break;
        default:
          break;
      }
    }
  }

  update(match: Match): void {
    this.time += 1;
    this.stage.update(this.time);
    this.effects.update();

    const models = this.models;
    if (!models) return;

    match.fighters.forEach((fighter, i) => {
      const model = models[i];
      model.place(fighter.x, fighter.y, fighter.facing);
      if (model.sync) {
        model.sync(fighter);
      } else {
        // Удары накладываются жёстко, стойки — со сглаживанием: иначе быстрый джеб «не доезжает».
        const smoothing = fighter.state === 'attack' ? 1 : 0.32;
        model.applyPose(fighter.currentPose(), smoothing, fighter.grounded);
      }
      model.setEffects(fighter.flashFrames, fighter.auraFrames > 0 ? 1 : 0);

      // Пыль на взлёте и приземлении — бесплатная читаемость вертикали.
      const air = !fighter.grounded;
      if (air && !this.wasAirborne[i]) {
        this.effects.dust(fighter.x);
        audio.play('jump');
      } else if (!air && this.wasAirborne[i]) {
        this.effects.dust(fighter.x);
        audio.play('land');
      }
      this.wasAirborne[i] = air;
    });

    this.syncProjectiles(match);

    const [a, b] = match.fighters;
    const mid = (a.x + b.x) / 2;
    const spread = Math.abs(a.x - b.x);
    const midY = Math.max(a.y, b.y);
    this.view.follow(mid, spread, midY);
    if (match.shake > 0.02) this.view.shake(match.shake * 0.5);
  }

  private syncProjectiles(match: Match): void {
    const alive = new Set(match.projectiles);
    for (const [p, slot] of this.projectileEntities) {
      if (alive.has(p)) continue;
      const pos = slot.entity.getPosition();
      this.effects.burst(pos.x, pos.y, slot.color, 12, 1.1);
      slot.entity.destroy();
      this.projectileEntities.delete(p);
    }

    for (const p of match.projectiles) {
      let slot = this.projectileEntities.get(p);
      if (!slot) {
        const entity = new Entity('projectile');
        entity.addComponent('render', {
          type: 'sphere',
          material: standardMat(p.color, { emissive: p.color, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.1 }),
        });
        entity.setLocalScale(p.radius * 2, p.radius * 2, p.radius * 2);
        const light = new Entity('projectile-light');
        light.addComponent('light', { type: 'omni', color: hexColor(p.color), intensity: 2.2, range: 5 });
        entity.addChild(light);
        this.view.root.addChild(entity);
        slot = { entity, color: p.color };
        this.projectileEntities.set(p, slot);
      }
      slot.entity.setPosition(p.x, p.y, 0);
      slot.entity.rotate(0, 0, 0.3 * p.facing * (180 / Math.PI));
      const s = p.radius * 2 * (1 + Math.sin(this.time * 0.4) * 0.08);
      slot.entity.setLocalScale(s, s, s);
      // След за снарядом.
      if (this.time % 3 === 0) this.effects.burst(p.x, p.y, p.color, 2, 0.35);
    }
  }
}
