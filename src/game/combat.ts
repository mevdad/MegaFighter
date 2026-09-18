import type { Fighter, Rect } from './fighter';
import type { Facing, Move } from './types';
import { MAX_COMBO_SCALING_STEPS } from './constants';

export interface Projectile {
  owner: 0 | 1;
  x: number;
  y: number;
  vx: number;
  radius: number;
  life: number;
  move: Move;
  color: number;
  facing: Facing;
  dead: boolean;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) * 2 < a.w + b.w &&
    Math.abs(a.y - b.y) * 2 < a.h + b.h
  );
}

/**
 * Масштабирование урона в комбо: каждый следующий удар слабее.
 * Без него любая связка с подбросом превращалась бы в мгновенный нокаут.
 */
export function comboScaling(hits: number): number {
  if (hits <= 0) return 1;
  const step = Math.min(hits, MAX_COMBO_SCALING_STEPS);
  return Math.max(0.28, 1 - step * 0.1);
}

/**
 * Может ли защищающийся заблокировать конкретную атаку.
 * Низкие атаки блокируются только в присяде, оверхеды — только стоя,
 * в воздухе блока нет вообще: прыжок — это осознанный риск.
 */
export function canBlock(defender: Fighter, move: Move, attackerX: number): boolean {
  // Захваты проходят сквозь блок — иначе «сесть в блок» было бы бесплатной стратегией.
  if (move.unblockable) return false;
  if (!defender.grounded) return false;
  if (defender.state === 'attack' || defender.state === 'hitstun' || defender.state === 'knockdown') return false;
  if (defender.state === 'dash' || defender.state === 'wakeup') return false;

  const awayIsLeft = attackerX > defender.x;
  const holdingAway = awayIsLeft ? defender.buffer.held('left') : defender.buffer.held('right');
  const blockButton = defender.buffer.held('block');
  if (!holdingAway && !blockButton) return false;

  const crouching = defender.buffer.held('down');
  if (move.height === 'low') return crouching;
  if (move.height === 'overhead') return !crouching;
  return true;
}

export type HitResult = 'hit' | 'block' | 'miss';

export function testHit(attacker: Fighter, defender: Fighter): HitResult {
  const hitbox = attacker.hitbox;
  const move = attacker.move;
  if (!hitbox || !move) return 'miss';
  // Кадры неуязвимости на подъёме и в рывке назад.
  if (defender.invulnFrames > 0) return 'miss';
  // Присед уводит голову из-под высоких ударов — за это и приседают.
  if (move.height === 'high' && defender.ducking) return 'miss';
  if (!rectsOverlap(hitbox, defender.hurtbox)) return 'miss';
  return canBlock(defender, move, attacker.x) ? 'block' : 'hit';
}

/**
 * Контрудар: попадание по противнику, который уже начал свою атаку, но ещё не вышел
 * на активные кадры. Это главная награда за чтение соперника, поэтому и урон, и стан больше.
 */
export function isCounterHit(defender: Fighter): boolean {
  const move = defender.move;
  return defender.state === 'attack' && !!move && defender.moveFrame < move.startup;
}

export const COUNTER_DAMAGE = 1.3;
export const COUNTER_HITSTUN = 6;

export function projectileRect(p: Projectile): Rect {
  return { x: p.x, y: p.y, w: p.radius * 2, h: p.radius * 2 };
}
