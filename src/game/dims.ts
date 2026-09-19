import type { CharacterSpec } from './types';

/**
 * Размеры процедурного скелета бойца — чистая математика, не зависит от движка рендера.
 * Раньше жила в src/render/rig.ts вместе с Three.js-специфичным классом Rig; тот класс
 * обслуживал ретаргет на чужой Mixamo-скелет (см. историю realisticModel.ts) и убран —
 * подход себя не оправдал, ретаргетнутые позы выглядели анатомически неестественно.
 * Сама математика размеров осталась нужна: ей ставится размер «бумажной куклы» из
 * примитивов, которую собирает src/render/proceduralFighter.ts.
 */
export interface Dims {
  hipHeight: number;
  torsoLen: number;
  torsoWidth: number;
  torsoDepth: number;
  headSize: number;
  shoulderY: number;
  shoulderZ: number;
  upperArm: number;
  foreArm: number;
  armWidth: number;
  hipZ: number;
  thigh: number;
  shin: number;
  legWidth: number;
  /** Полный рост — по нему подгоняется масштаб внешней модели (Терракс). */
  height: number;
}

export function dimensions(spec: CharacterSpec): Dims {
  const { height, bulk, headScale, limbLength, shoulderSpread } = spec.build;
  const h = 1.78 * height;
  const legs = h * 0.47 * limbLength;
  return {
    height: h,
    hipHeight: legs,
    torsoLen: h * 0.32,
    torsoWidth: 0.34 * bulk * shoulderSpread,
    torsoDepth: 0.22 * bulk,
    headSize: 0.2 * headScale * (1 + (bulk - 1) * 0.3),
    shoulderY: h * 0.28,
    shoulderZ: 0.19 * bulk * shoulderSpread,
    upperArm: h * 0.18 * limbLength,
    foreArm: h * 0.17 * limbLength,
    armWidth: 0.1 * bulk,
    hipZ: 0.1 * bulk,
    thigh: legs * 0.52,
    shin: legs * 0.48,
    legWidth: 0.13 * bulk,
  };
}
