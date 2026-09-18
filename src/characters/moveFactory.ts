import * as CLIP from '../game/attackClips';
import type { Box, Move, SpecialMove } from '../game/types';

export interface Tuning {
  /** Множитель длины атак: <1 — коротышка-рашдаун, >1 — длинные конечности. */
  reach: number;
  /** Множитель урона. */
  power: number;
  /** >1 — быстрее стартап и восстановление. */
  speed: number;
}

const clampFrames = (v: number, min: number): number => Math.max(min, Math.round(v));

function scaleBox(box: Box, reach: number): Box {
  return { x: box.x * reach, y: box.y, w: box.w * reach, h: box.h };
}

/** Применяет статы персонажа к «эталонной» фрейм-дате приёма. */
export function tune<T extends Move>(base: T, t: Tuning): T {
  return {
    ...base,
    startup: clampFrames(base.startup / t.speed, 3),
    recovery: clampFrames(base.recovery / t.speed, 3),
    damage: Math.round(base.damage * t.power),
    chip: Math.round(base.chip * t.power),
    hitbox: scaleBox(base.hitbox, t.reach),
  };
}

/* ------------------------------------------------------------------ */
/* Нормали — общий для всех бойцов набор, дальше разводится тюнингом    */
/* ------------------------------------------------------------------ */

const BASE_NORMALS: Record<string, Move> = {
  lp: {
    id: 'lp',
    name: 'Джеб',
    startup: 4,
    active: 3,
    recovery: 7,
    damage: 28,
    chip: 2,
    hitstun: 13,
    blockstun: 9,
    height: 'high',
    hitbox: { x: 0.78, y: 1.32, w: 0.66, h: 0.34 },
    knockback: { x: 0.06, y: 0 },
    meterGain: 4,
    cancelable: true,
    clip: CLIP.JAB,
    sfx: 'light',
  },
  hp: {
    id: 'hp',
    name: 'Кросс',
    startup: 9,
    active: 4,
    recovery: 16,
    damage: 78,
    chip: 8,
    hitstun: 20,
    blockstun: 13,
    height: 'high',
    hitbox: { x: 0.94, y: 1.3, w: 0.86, h: 0.4 },
    knockback: { x: 0.14, y: 0 },
    lunge: { x: 0.06, y: 0 },
    meterGain: 9,
    cancelable: true,
    clip: CLIP.CROSS,
    sfx: 'heavy',
  },
  lk: {
    id: 'lk',
    name: 'Лоу-кик',
    startup: 6,
    active: 3,
    recovery: 10,
    damage: 40,
    chip: 3,
    hitstun: 15,
    blockstun: 10,
    height: 'mid',
    hitbox: { x: 0.86, y: 0.86, w: 0.78, h: 0.36 },
    knockback: { x: 0.08, y: 0 },
    meterGain: 5,
    cancelable: true,
    clip: CLIP.MID_KICK,
    sfx: 'kick',
  },
  hk: {
    id: 'hk',
    name: 'Раундхаус',
    startup: 12,
    active: 4,
    recovery: 19,
    damage: 92,
    chip: 10,
    hitstun: 22,
    blockstun: 14,
    height: 'mid',
    hitbox: { x: 1.02, y: 1.18, w: 0.96, h: 0.46 },
    knockback: { x: 0.2, y: 0.01 },
    lunge: { x: 0.05, y: 0 },
    meterGain: 11,
    cancelable: true,
    clip: CLIP.ROUNDHOUSE,
    sfx: 'kick',
  },
  'cr.lp': {
    id: 'cr.lp',
    name: 'Тычок в присяде',
    startup: 4,
    active: 3,
    recovery: 8,
    damage: 24,
    chip: 2,
    hitstun: 12,
    blockstun: 8,
    height: 'mid',
    hitbox: { x: 0.72, y: 0.66, w: 0.62, h: 0.32 },
    knockback: { x: 0.05, y: 0 },
    meterGain: 4,
    cancelable: true,
    clip: CLIP.LOW_JAB,
    sfx: 'light',
  },
  'cr.lk': {
    id: 'cr.lk',
    name: 'Подрезка',
    startup: 5,
    active: 3,
    recovery: 9,
    damage: 32,
    chip: 3,
    hitstun: 14,
    blockstun: 9,
    height: 'low',
    hitbox: { x: 0.8, y: 0.3, w: 0.72, h: 0.3 },
    knockback: { x: 0.06, y: 0 },
    meterGain: 5,
    cancelable: true,
    clip: CLIP.LOW_KICK,
    sfx: 'kick',
  },
  'cr.hk': {
    id: 'cr.hk',
    name: 'Подсечка',
    startup: 10,
    active: 4,
    recovery: 22,
    damage: 74,
    chip: 8,
    hitstun: 24,
    blockstun: 13,
    height: 'low',
    hitbox: { x: 1.0, y: 0.24, w: 1.0, h: 0.3 },
    knockback: { x: 0.24, y: 0.05 },
    knockdown: true,
    meterGain: 10,
    clip: CLIP.SWEEP,
    sfx: 'kick',
  },
  'cr.hp': {
    id: 'cr.hp',
    name: 'Апперкот',
    startup: 8,
    active: 5,
    recovery: 24,
    damage: 96,
    chip: 10,
    hitstun: 26,
    blockstun: 14,
    height: 'mid',
    hitbox: { x: 0.7, y: 1.28, w: 0.7, h: 0.9 },
    knockback: { x: 0.1, y: 0.17 },
    launcher: true,
    meterGain: 12,
    clip: CLIP.UPPERCUT,
    sfx: 'heavy',
  },
  'j.lp': {
    id: 'j.lp',
    name: 'Удар с воздуха',
    startup: 5,
    active: 8,
    recovery: 6,
    damage: 44,
    chip: 4,
    hitstun: 16,
    blockstun: 10,
    height: 'overhead',
    hitbox: { x: 0.68, y: 0.9, w: 0.7, h: 0.6 },
    knockback: { x: 0.08, y: 0 },
    airOnly: true,
    meterGain: 6,
    clip: CLIP.AIR_PUNCH,
    sfx: 'light',
  },
  // Бросок: слабая рука + слабая нога вместе. Не блокируется — ответ на «сидит в блоке».
  throw: {
    id: 'throw',
    name: 'Бросок',
    startup: 5,
    active: 3,
    recovery: 22,
    damage: 116,
    chip: 0,
    hitstun: 30,
    blockstun: 0,
    height: 'mid',
    hitbox: { x: 0.5, y: 1.0, w: 0.62, h: 1.1 },
    knockback: { x: 0.34, y: 0.1 },
    knockdown: true,
    unblockable: true,
    throwable: true,
    meterGain: 10,
    clip: CLIP.GRAB,
    sfx: 'heavy',
  },
  'j.hk': {
    id: 'j.hk',
    name: 'Прыжковый кик',
    startup: 7,
    active: 10,
    recovery: 8,
    damage: 72,
    chip: 7,
    hitstun: 20,
    blockstun: 12,
    height: 'overhead',
    hitbox: { x: 0.86, y: 0.72, w: 0.9, h: 0.68 },
    knockback: { x: 0.16, y: 0 },
    airOnly: true,
    meterGain: 9,
    clip: CLIP.AIR_KICK,
    sfx: 'kick',
  },
};

export function buildNormals(t: Tuning): Record<string, Move> {
  const out: Record<string, Move> = {};
  for (const [key, move] of Object.entries(BASE_NORMALS)) out[key] = tune(move, t);
  return out;
}

/* ------------------------------------------------------------------ */
/* Шаблоны спешлов                                                     */
/* ------------------------------------------------------------------ */

type SpecialTemplate = Omit<SpecialMove, 'id' | 'name' | 'description'>;

/** ↓ ↘ → + удар: снаряд. Основной инструмент зонера. */
export const PROJECTILE: SpecialTemplate = {
  startup: 13,
  active: 2,
  recovery: 26,
  damage: 84,
  chip: 14,
  hitstun: 22,
  blockstun: 14,
  height: 'mid',
  hitbox: { x: 0, y: 0, w: 0, h: 0 },
  knockback: { x: 0.24, y: 0 },
  meterGain: 8,
  clip: CLIP.CAST,
  sfx: 'special',
  projectile: { speed: 0.22, y: 1.12, radius: 0.28, lifetime: 90 },
  input: { motion: [2, 3, 6], button: 'hp' },
};

/** → ↓ ↘ + удар: взлетающий контрприём против прыжков. */
export const RISING: SpecialTemplate = {
  startup: 6,
  active: 10,
  recovery: 28,
  damage: 118,
  chip: 16,
  hitstun: 26,
  blockstun: 16,
  height: 'mid',
  hitbox: { x: 0.56, y: 1.5, w: 0.8, h: 1.5 },
  knockback: { x: 0.16, y: 0.2 },
  launcher: true,
  lunge: { x: 0.16, y: 0.24 },
  meterGain: 10,
  clip: CLIP.RISING,
  sfx: 'special',
  input: { motion: [6, 2, 3], button: 'hp' },
};

/** ↓ ↙ ← + удар: таран с рывком через пол-экрана. */
export const CHARGE: SpecialTemplate = {
  startup: 14,
  active: 8,
  recovery: 24,
  damage: 104,
  chip: 14,
  hitstun: 24,
  blockstun: 15,
  height: 'mid',
  hitbox: { x: 0.78, y: 1.0, w: 0.9, h: 1.1 },
  knockback: { x: 0.42, y: 0.05 },
  knockdown: true,
  lunge: { x: 0.52, y: 0 },
  meterGain: 10,
  clip: CLIP.CHARGE,
  sfx: 'special',
  input: { motion: [2, 1, 4], button: 'hk' },
};

/** ↓ ↙ ← + пинок: вертушка, бьёт в воздухе и проходит над низкими атаками. */
export const SPIN: SpecialTemplate = {
  startup: 10,
  active: 14,
  recovery: 22,
  damage: 96,
  chip: 12,
  hitstun: 22,
  blockstun: 14,
  height: 'overhead',
  hitbox: { x: 0.74, y: 1.36, w: 0.96, h: 1.0 },
  knockback: { x: 0.28, y: 0.09 },
  lunge: { x: 0.26, y: 0.19 },
  meterGain: 10,
  clip: CLIP.SPIN,
  sfx: 'special',
  input: { motion: [2, 1, 4], button: 'hk' },
};

/** → ↓ ↘ + пинок: захват, пробивает блок. */
export const GRAB: SpecialTemplate = {
  startup: 9,
  active: 4,
  recovery: 30,
  damage: 132,
  chip: 0,
  hitstun: 34,
  blockstun: 0,
  height: 'mid',
  hitbox: { x: 0.62, y: 1.0, w: 0.66, h: 1.2 },
  knockback: { x: 0.34, y: 0.13 },
  knockdown: true,
  lunge: { x: 0.2, y: 0 },
  meterGain: 12,
  clip: CLIP.GRAB,
  sfx: 'heavy',
  input: { motion: [6, 2, 3], button: 'lk' },
};

/** ↓ ↘ → + пинок: рывок-телепорт с ударом на выходе. */
export const BLINK: SpecialTemplate = {
  startup: 8,
  active: 6,
  recovery: 20,
  damage: 88,
  chip: 10,
  hitstun: 22,
  blockstun: 13,
  height: 'mid',
  hitbox: { x: 0.7, y: 1.14, w: 0.8, h: 1.0 },
  knockback: { x: 0.2, y: 0.1 },
  lunge: { x: 0.74, y: 0.04 },
  meterGain: 9,
  clip: CLIP.CHARGE,
  sfx: 'special',
  input: { motion: [2, 3, 6], button: 'lk' },
};

/** ↓ ↘ → ↓ ↘ → + сильный удар: супер за полную шкалу. */
export const SUPER: SpecialTemplate = {
  startup: 11,
  active: 16,
  recovery: 34,
  damage: 264,
  chip: 30,
  hitstun: 36,
  blockstun: 20,
  height: 'mid',
  hitbox: { x: 0.9, y: 1.16, w: 1.5, h: 1.5 },
  knockback: { x: 0.56, y: 0.16 },
  knockdown: true,
  lunge: { x: 0.3, y: 0 },
  meterGain: 0,
  meterCost: 100,
  clip: CLIP.SUPER,
  sfx: 'super',
  input: { motion: [2, 3, 6, 2, 3, 6], button: 'hp', window: 34 },
};

export function makeSpecial(
  template: SpecialTemplate,
  id: string,
  name: string,
  description: string,
  overrides: Partial<SpecialMove> = {},
): SpecialMove {
  return { ...template, id, name, description, ...overrides };
}
