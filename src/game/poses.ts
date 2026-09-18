import type { Pose, PoseClip } from './types';

/**
 * Скелет живёт в локальной системе, где боец смотрит в +X, а конечности свисают в -Y.
 * Поэтому поворот кости по Z «выносит» её вперёд — на этом держится вся анимация ударов.
 * Разворот влево делается поворотом всей группы на 180° по Y, так что позы писать нужно один раз.
 */

const D = Math.PI / 180;
export const deg = (v: number): number => v * D;

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (key === 'offset') continue;
    const bone = key as Exclude<keyof Pose, 'offset'>;
    const av = a[bone] ?? [0, 0, 0];
    const bv = b[bone] ?? [0, 0, 0];
    out[bone] = [
      av[0] + (bv[0] - av[0]) * t,
      av[1] + (bv[1] - av[1]) * t,
      av[2] + (bv[2] - av[2]) * t,
    ];
  }
  const ao = a.offset ?? [0, 0, 0];
  const bo = b.offset ?? [0, 0, 0];
  out.offset = [ao[0] + (bo[0] - ao[0]) * t, ao[1] + (bo[1] - ao[1]) * t, ao[2] + (bo[2] - ao[2]) * t];
  return out;
}

/** Сэмплирует клип в точке 0..1 с линейной интерполяцией между ключами. */
export function samplePoseClip(clip: PoseClip, t: number): Pose {
  if (clip.length === 0) return {};
  if (clip.length === 1) return clip[0].pose;
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < clip.length - 1; i += 1) {
    const a = clip[i];
    const b = clip[i + 1];
    if (clamped >= a.t && clamped <= b.t) {
      const span = b.t - a.t || 1;
      return lerpPose(a.pose, b.pose, (clamped - a.t) / span);
    }
  }
  return clip[clip.length - 1].pose;
}

/* ------------------------------------------------------------------ */
/* Базовые стойки                                                       */
/* ------------------------------------------------------------------ */

/**
 * Боевая стойка: плечи почти опущены, локти сильно согнуты — кулаки уходят к подбородку.
 * Раньше руки были вытянуты вперёд, и на настоящей модели это читалось не как гард,
 * а как «тянется обняться».
 */
export const IDLE: Pose = {
  hips: [0, deg(-14), 0],
  torso: [0, deg(-6), deg(3)],
  head: [0, deg(12), 0],
  shoulderR: [deg(-20), 0, deg(14)],
  elbowR: [0, 0, deg(126)],
  shoulderL: [deg(16), 0, deg(4)],
  elbowL: [0, 0, deg(142)],
  hipR: [0, 0, deg(16)],
  kneeR: [0, 0, deg(-24)],
  hipL: [0, 0, deg(-18)],
  kneeL: [0, 0, deg(-16)],
  offset: [0, -0.06, 0],
};

export const IDLE_BREATH: Pose = {
  ...IDLE,
  torso: [0, deg(-6), deg(6)],
  shoulderR: [deg(-20), 0, deg(20)],
  elbowR: [0, 0, deg(120)],
  shoulderL: [deg(16), 0, deg(10)],
  head: [0, deg(12), deg(-3)],
  offset: [0, 0.02, 0],
};

export const WALK_F: Pose = {
  ...IDLE,
  hipR: [0, 0, deg(34)],
  kneeR: [0, 0, deg(-40)],
  hipL: [0, 0, deg(-30)],
  kneeL: [0, 0, deg(-12)],
  torso: [0, deg(-6), deg(7)],
  offset: [0.05, -0.1, 0],
};

export const WALK_B: Pose = {
  ...IDLE,
  hipR: [0, 0, deg(-12)],
  kneeR: [0, 0, deg(-8)],
  hipL: [0, 0, deg(26)],
  kneeL: [0, 0, deg(-34)],
  torso: [0, deg(-6), deg(-4)],
  offset: [-0.04, -0.1, 0],
};

export const CROUCH: Pose = {
  hips: [0, deg(-16), 0],
  torso: [0, deg(-8), deg(14)],
  head: [0, deg(14), deg(-8)],
  shoulderR: [deg(-20), 0, deg(52)],
  elbowR: [0, 0, deg(96)],
  shoulderL: [deg(16), 0, deg(40)],
  elbowL: [0, 0, deg(104)],
  hipR: [0, 0, deg(74)],
  kneeR: [0, 0, deg(-118)],
  hipL: [0, 0, deg(-58)],
  kneeL: [0, 0, deg(-104)],
  offset: [0, -0.62, 0],
};

export const JUMP_RISE: Pose = {
  ...IDLE,
  torso: [0, deg(-6), deg(-8)],
  shoulderR: [deg(-30), 0, deg(-26)],
  elbowR: [0, 0, deg(52)],
  shoulderL: [deg(24), 0, deg(-34)],
  elbowL: [0, 0, deg(46)],
  hipR: [0, 0, deg(56)],
  kneeR: [0, 0, deg(-92)],
  hipL: [0, 0, deg(24)],
  kneeL: [0, 0, deg(-70)],
  offset: [0, 0, 0],
};

export const JUMP_FALL: Pose = {
  ...JUMP_RISE,
  torso: [0, deg(-6), deg(10)],
  hipR: [0, 0, deg(30)],
  kneeR: [0, 0, deg(-50)],
  hipL: [0, 0, deg(-16)],
  kneeL: [0, 0, deg(-30)],
  shoulderR: [deg(-30), 0, deg(16)],
  shoulderL: [deg(24), 0, deg(8)],
};

export const BLOCK_HIGH: Pose = {
  hips: [0, deg(-26), 0],
  torso: [0, deg(-14), deg(-6)],
  head: [0, deg(20), deg(6)],
  shoulderR: [deg(-30), 0, deg(52)],
  elbowR: [0, 0, deg(146)],
  shoulderL: [deg(26), 0, deg(44)],
  elbowL: [0, 0, deg(150)],
  hipR: [0, 0, deg(22)],
  kneeR: [0, 0, deg(-30)],
  hipL: [0, 0, deg(-24)],
  kneeL: [0, 0, deg(-20)],
  offset: [-0.06, -0.08, 0],
};

export const BLOCK_LOW: Pose = {
  ...CROUCH,
  shoulderR: [deg(-30), 0, deg(88)],
  elbowR: [0, 0, deg(128)],
  shoulderL: [deg(26), 0, deg(84)],
  elbowL: [0, 0, deg(132)],
  offset: [-0.04, -0.62, 0],
};

export const HIT_HIGH: Pose = {
  hips: [0, deg(-10), deg(-10)],
  torso: [0, deg(-4), deg(-22)],
  head: [0, deg(8), deg(-40)],
  shoulderR: [deg(-40), 0, deg(-44)],
  elbowR: [0, 0, deg(34)],
  shoulderL: [deg(36), 0, deg(-52)],
  elbowL: [0, 0, deg(28)],
  hipR: [0, 0, deg(-16)],
  kneeR: [0, 0, deg(-30)],
  hipL: [0, 0, deg(20)],
  kneeL: [0, 0, deg(-24)],
  offset: [-0.1, -0.04, 0],
};

export const HIT_LOW: Pose = {
  ...HIT_HIGH,
  torso: [0, deg(-4), deg(26)],
  head: [0, deg(8), deg(20)],
  offset: [-0.08, -0.34, 0],
};

export const KNOCKDOWN: Pose = {
  hips: [0, 0, deg(-86)],
  torso: [0, 0, deg(-14)],
  head: [0, 0, deg(-26)],
  shoulderR: [deg(-60), 0, deg(-70)],
  elbowR: [0, 0, deg(24)],
  shoulderL: [deg(58), 0, deg(-76)],
  elbowL: [0, 0, deg(20)],
  hipR: [0, 0, deg(40)],
  kneeR: [0, 0, deg(-56)],
  hipL: [0, 0, deg(24)],
  kneeL: [0, 0, deg(-40)],
  offset: [-0.3, -0.58, 0],
};

export const VICTORY: Pose = {
  hips: [0, deg(-8), 0],
  torso: [0, deg(-4), deg(-6)],
  head: [0, deg(6), deg(-10)],
  shoulderR: [deg(-10), 0, deg(-152)],
  elbowR: [0, 0, deg(40)],
  shoulderL: [deg(10), 0, deg(-40)],
  elbowL: [0, 0, deg(96)],
  hipR: [0, 0, deg(10)],
  kneeR: [0, 0, deg(-14)],
  hipL: [0, 0, deg(-12)],
  kneeL: [0, 0, deg(-10)],
  offset: [0, 0, 0],
};

export const INTRO: Pose = {
  hips: [0, deg(-30), 0],
  torso: [0, deg(-16), deg(8)],
  head: [0, deg(24), deg(4)],
  shoulderR: [deg(-14), 0, deg(112)],
  elbowR: [0, 0, deg(140)],
  shoulderL: [deg(12), 0, deg(-96)],
  elbowL: [0, 0, deg(60)],
  hipR: [0, 0, deg(20)],
  kneeR: [0, 0, deg(-30)],
  hipL: [0, 0, deg(-22)],
  kneeL: [0, 0, deg(-18)],
  offset: [0, -0.08, 0],
};

export const DASH: Pose = {
  ...IDLE,
  torso: [0, deg(-6), deg(18)],
  head: [0, deg(12), deg(-10)],
  shoulderR: [deg(-24), 0, deg(-40)],
  elbowR: [0, 0, deg(62)],
  shoulderL: [deg(18), 0, deg(64)],
  elbowL: [0, 0, deg(70)],
  hipR: [0, 0, deg(52)],
  kneeR: [0, 0, deg(-70)],
  hipL: [0, 0, deg(-40)],
  kneeL: [0, 0, deg(-30)],
  offset: [0.08, -0.12, 0],
};
