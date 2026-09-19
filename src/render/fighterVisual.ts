import type { Entity } from 'playcanvas';
import type { Fighter } from '../game/fighter';
import type { Pose } from '../game/types';

/**
 * Что нужно виду от «шкуры» бойца. За интерфейсом стоят две реализации:
 * процедурные примитивы (ProceduralFighter) и модель с боевыми клипами из файла
 * (AnimatedFighter, только для Терракса — см. game/types.ts, AnimatedRig).
 */
export interface FighterVisual {
  readonly root: Entity;
  place(x: number, y: number, facing: 1 | -1): void;
  applyPose(pose: Pose, smoothing: number, grounded: boolean): void;
  /**
   * Только у AnimatedFighter: анимация идёт из файла и должна сама решать, какой клип
   * играть, по состоянию Fighter (move.id, moveFrame/moveTotal, stateFrame/stunFrames) —
   * процедурной Pose для этого недостаточно. Если метода нет, BattleView зовёт applyPose.
   */
  sync?(fighter: Fighter): void;
  setEffects(flash: number, aura: number): void;
  dispose(): void;
}
