import { Entity, type AnimTrack, type RenderComponent, type StandardMaterial } from 'playcanvas';
import type { AnimatedRig, CharacterSpec, Pose } from '../game/types';
import type { Fighter } from '../game/fighter';
import { dimensions } from '../game/dims';
import type { LoadedContainer } from './assets';
import { hexColor } from './scene';
import type { FighterVisual } from './fighterVisual';

/**
 * Терракс — единственный боец с настоящими боевыми клипами в файле (models/warrior2.glb).
 * Анимация проигрывается прямо из GLB через anim-компонент, БЕЗ ретаргета на чужой скелет:
 * тот подход (см. историю proceduralFighter.ts/старый realisticModel.ts) давал анатомически
 * неестественные позы. Тайминги ударов остаются нашими (moveFrame/moveTotal, stateFrame/
 * stunFrames) — скрабится окно клипа, а не наоборот, поэтому хитбоксы не расходятся с картинкой.
 *
 * Калибровка измерена offline через .claude/skills/inspect-glb (boundsSource: vertices):
 * dims=[0.4766, 0.9782, 0.2814], center=[0, 0.4891, 0], groundOffset=0 — модель уже
 * центрирована по X/Z, а ступни стоят на y=0 без поправки.
 */
const TUNING = {
  measuredHeight: 0.9782,
  center: [0, 0.4891, 0] as const,
  groundOffset: 0,
};

type AnimState = 'idle' | 'run' | 'punch' | 'kick' | 'hitHigh';
/** Состояния, которые просто зациклены и играют по настенному времени, без скраба по кадрам приёма. */
const LOOPED_STATES: ReadonlySet<AnimState> = new Set(['idle', 'run']);

export class AnimatedFighter implements FighterVisual {
  readonly root = new Entity('terraks-root');
  private readonly facingNode = new Entity('terraks-facing');
  private readonly yawNode = new Entity('terraks-yaw');
  private readonly visual: Entity;
  private readonly auraLight: Entity;
  private readonly materials: StandardMaterial[] = [];
  private readonly windows: Record<'punch' | 'kick' | 'hitHigh', { start: number; end: number }>;

  private facingAngle = 0;
  private facingInitialized = false;
  private state: AnimState = 'idle';

  constructor(spec: CharacterSpec, loaded: LoadedContainer, rig: AnimatedRig) {
    const targetHeight = dimensions(spec).height;
    const scale = targetHeight / TUNING.measuredHeight;

    this.visual = loaded.instantiate();
    this.visual.setLocalScale(scale, scale, scale);
    this.visual.setLocalPosition(-TUNING.center[0] * scale, TUNING.groundOffset * scale, -TUNING.center[2] * scale);

    this.yawNode.setLocalEulerAngles(0, rig.yaw, 0);
    this.yawNode.addChild(this.visual);
    this.facingNode.addChild(this.yawNode);
    this.root.addChild(this.facingNode);

    // Клонируем материалы: без этого два Терракса на арене делили бы один и тот же
    // материал и вспышка/аура одного бойца красила бы обоих.
    for (const component of this.visual.findComponents('render')) {
      const render = component as RenderComponent;
      for (const mi of render.meshInstances) {
        const cloned = (mi.material as StandardMaterial).clone() as StandardMaterial;
        this.materials.push(cloned);
        mi.material = cloned;
      }
    }

    this.visual.addComponent('anim', { activate: true, speed: 1 });
    const anim = this.visual.anim;
    if (!anim) throw new Error('Не удалось навесить anim-компонент на Терракса');
    anim.assignAnimation('idle', loaded.clip(rig.idleClip).resource as AnimTrack);
    anim.assignAnimation('run', loaded.clip(rig.runClip).resource as AnimTrack);
    anim.assignAnimation('punch', loaded.clip(rig.punch.clip).resource as AnimTrack);
    anim.assignAnimation('kick', loaded.clip(rig.kick.clip).resource as AnimTrack);
    anim.assignAnimation('hitHigh', loaded.clip(rig.hitHigh.clip).resource as AnimTrack);

    this.windows = { punch: rig.punch, kick: rig.kick, hitHigh: rig.hitHigh };

    this.auraLight = new Entity('terraks-aura');
    this.auraLight.addComponent('light', { type: 'omni', color: hexColor(spec.palette.aura), intensity: 0, range: 3.4 });
    this.auraLight.setLocalPosition(0, dimensions(spec).hipHeight, 0.3);
    this.root.addChild(this.auraLight);
  }

  place(x: number, y: number, facing: 1 | -1): void {
    this.root.setPosition(x, y, 0);
    const target = facing === 1 ? 0 : 180;
    if (!this.facingInitialized) {
      // Без этого боец на старте матча один кадр стоит развёрнутым по умолчанию (0°,
      // «лицом вправо»), а не по своей реальной стороне — для игрока справа это читалось
      // как «смотрит не туда» ещё до того, как сглаживание успевало довернуть его.
      this.facingAngle = target;
      this.facingInitialized = true;
    } else {
      const diff = ((target - this.facingAngle + 540) % 360) - 180;
      this.facingAngle += diff * 0.35;
    }
    this.facingNode.setLocalEulerAngles(0, this.facingAngle, 0);
  }

  /**
   * FighterVisual.applyPose получает процедурную Pose — Терраксу она не нужна (его анимация
   * идёт из файла), но интерфейс общий для обеих реализаций. Реальная синхронизация — в sync().
   */
  applyPose(_pose: Pose, _smoothing: number, _grounded: boolean): void {}

  /** Настоящая синхронизация с игровым состоянием — вызывается вместо applyPose из BattleView. */
  sync(fighter: Fighter): void {
    const anim = this.visual.anim;
    if (!anim || !anim.baseLayer) return;
    const layer = anim.baseLayer;

    let next: AnimState = 'idle';
    let progress = 0;
    if (fighter.state === 'attack' && fighter.move && fighter.grounded) {
      const id = fighter.move.id;
      if (id.endsWith('lp') || id.endsWith('hp')) {
        next = 'punch';
        progress = fighter.moveFrame / Math.max(1, fighter.moveTotal);
      } else if (id.endsWith('lk') || id.endsWith('hk')) {
        next = 'kick';
        progress = fighter.moveFrame / Math.max(1, fighter.moveTotal);
      }
    } else if (fighter.state === 'hitstun') {
      next = 'hitHigh';
      progress = fighter.stateFrame / Math.max(1, fighter.stunFrames);
    } else if (fighter.state === 'walkF' || fighter.state === 'walkB' || fighter.state === 'dash') {
      next = 'run';
    }

    if (next !== this.state) {
      layer.transition(next, 0);
      layer.playing = LOOPED_STATES.has(next);
      this.state = next;
    }

    if (next === 'idle' || next === 'run') return;

    const w = this.windows[next];
    layer.activeStateCurrentTime = w.start + Math.min(1, Math.max(0, progress)) * (w.end - w.start);
  }

  setEffects(flash: number, aura: number): void {
    const white = flash > 0 ? Math.min(1, flash / 8) : 0;
    for (const mat of this.materials) {
      mat.emissive.set(white * 0.85, white * 0.12, white * 0.12);
      mat.emissiveIntensity = white > 0 ? 1.4 : 0;
      mat.update();
    }
    if (this.auraLight.light) this.auraLight.light.intensity = aura * 4;
  }

  dispose(): void {
    this.root.destroy();
  }
}
