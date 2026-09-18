import * as THREE from 'three';
import { Effects } from './effects';
import { FighterModel } from './fighterModel';
import { SceneView } from './scene';
import { Stage } from './stage';
import { audio } from '../core/audio';
import type { GameEvent, Match } from '../game/match';
import type { Projectile } from '../game/combat';

/** Соединяет симуляцию с графикой: модели бойцов, снаряды, эффекты и звук по событиям. */
export class BattleView {
  private readonly stage = new Stage();
  private readonly effects = new Effects();
  private models: [FighterModel, FighterModel] | null = null;
  private readonly projectileMeshes = new Map<Projectile, THREE.Mesh>();
  private readonly projectileGeo = new THREE.SphereGeometry(1, 12, 10);
  private time = 0;
  private wasAirborne: [boolean, boolean] = [false, false];

  constructor(private readonly view: SceneView) {
    view.scene.add(this.stage.group);
    view.scene.add(this.effects.group);
  }

  setMatch(match: Match): void {
    if (this.models) {
      for (const m of this.models) {
        this.view.scene.remove(m.root);
        m.dispose();
      }
    }
    this.models = [new FighterModel(match.fighters[0].spec), new FighterModel(match.fighters[1].spec)];
    for (const m of this.models) this.view.scene.add(m.root);
    for (const [, mesh] of this.projectileMeshes) this.view.scene.remove(mesh);
    this.projectileMeshes.clear();
  }

  handleEvents(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const power = e.power === 'super' ? 2.4 : e.power === 'special' ? 1.7 : e.power === 'heavy' ? 1.4 : 1;
          this.effects.burst(e.x, e.y, e.color, Math.round(14 * power), power);
          this.effects.ring(e.x, e.y, e.color, power, 20);
          this.view.shake(0.12 * power + e.damage / 900);
          audio.play(e.power);
          break;
        }
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
      // Удары накладываются жёстко, стойки — со сглаживанием: иначе быстрый джеб «не доезжает».
      const smoothing = fighter.state === 'attack' ? 1 : 0.32;
      model.applyPose(fighter.currentPose(), smoothing);
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
    for (const [p, mesh] of this.projectileMeshes) {
      if (alive.has(p)) continue;
      this.effects.burst(mesh.position.x, mesh.position.y, mesh.userData.color as number, 12, 1.1);
      this.view.scene.remove(mesh);
      this.projectileMeshes.delete(p);
    }

    for (const p of match.projectiles) {
      let mesh = this.projectileMeshes.get(p);
      if (!mesh) {
        mesh = new THREE.Mesh(
          this.projectileGeo,
          new THREE.MeshStandardMaterial({
            color: p.color,
            emissive: new THREE.Color(p.color),
            emissiveIntensity: 1.6,
            roughness: 0.2,
          }),
        );
        mesh.userData.color = p.color;
        mesh.scale.setScalar(p.radius);
        const light = new THREE.PointLight(p.color, 2.2, 5, 2);
        mesh.add(light);
        this.view.scene.add(mesh);
        this.projectileMeshes.set(p, mesh);
      }
      mesh.position.set(p.x, p.y, 0);
      mesh.rotation.z += 0.3 * p.facing;
      mesh.scale.setScalar(p.radius * (1 + Math.sin(this.time * 0.4) * 0.08));
      // След за снарядом.
      if (this.time % 3 === 0) this.effects.burst(p.x, p.y, p.color, 2, 0.35);
    }
  }
}
