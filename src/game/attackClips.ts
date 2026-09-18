import { CROUCH, IDLE, JUMP_FALL, deg } from './poses';
import type { PoseClip } from './types';

/**
 * Клипы ударов проигрываются ровно за (startup + active + recovery) кадров,
 * поэтому ключи расставлены по долям: замах → вынос → фиксация → возврат.
 */

export const JAB: PoseClip = [
  { t: 0, pose: IDLE },
  {
    t: 0.3,
    pose: { ...IDLE, shoulderR: [deg(-18), 0, deg(66)], elbowR: [0, 0, deg(100)], torso: [0, deg(-14), deg(2)] },
  },
  {
    t: 0.45,
    pose: {
      ...IDLE,
      shoulderR: [0, 0, deg(96)],
      elbowR: [0, 0, deg(4)],
      torso: [0, deg(8), 0],
      hips: [0, deg(-2), 0],
      offset: [0.14, -0.06, 0],
    },
  },
  { t: 0.7, pose: { ...IDLE, shoulderR: [0, 0, deg(80)], elbowR: [0, 0, deg(36)] } },
  { t: 1, pose: IDLE },
];

export const CROSS: PoseClip = [
  { t: 0, pose: IDLE },
  {
    t: 0.34,
    pose: {
      ...IDLE,
      shoulderL: [deg(30), 0, deg(-30)],
      elbowL: [0, 0, deg(120)],
      torso: [0, deg(-30), deg(4)],
      hips: [0, deg(-30), 0],
    },
  },
  {
    t: 0.52,
    pose: {
      ...IDLE,
      shoulderL: [deg(6), 0, deg(98)],
      elbowL: [0, 0, deg(6)],
      shoulderR: [deg(-24), 0, deg(12)],
      elbowR: [0, 0, deg(110)],
      torso: [0, deg(24), deg(-4)],
      hips: [0, deg(16), 0],
      hipL: [0, 0, deg(-30)],
      offset: [0.2, -0.08, 0],
    },
  },
  { t: 0.78, pose: { ...IDLE, shoulderL: [deg(18), 0, deg(60)], elbowL: [0, 0, deg(60)], torso: [0, deg(4), 0] } },
  { t: 1, pose: IDLE },
];

export const UPPERCUT: PoseClip = [
  { t: 0, pose: IDLE },
  {
    t: 0.3,
    pose: {
      ...IDLE,
      shoulderR: [deg(-20), 0, deg(-16)],
      elbowR: [0, 0, deg(120)],
      torso: [0, deg(-20), deg(22)],
      offset: [0, -0.24, 0],
    },
  },
  {
    t: 0.5,
    pose: {
      ...IDLE,
      shoulderR: [deg(-8), 0, deg(-150)],
      elbowR: [0, 0, deg(26)],
      torso: [0, deg(10), deg(-18)],
      head: [0, deg(8), deg(-16)],
      hipR: [0, 0, deg(6)],
      kneeR: [0, 0, deg(-8)],
      offset: [0.12, 0.16, 0],
    },
  },
  { t: 0.75, pose: { ...IDLE, shoulderR: [deg(-20), 0, deg(-60)], elbowR: [0, 0, deg(80)], offset: [0.04, 0, 0] } },
  { t: 1, pose: IDLE },
];

export const HOOK: PoseClip = [
  { t: 0, pose: IDLE },
  {
    t: 0.32,
    pose: { ...IDLE, shoulderR: [deg(-70), 0, deg(30)], elbowR: [0, 0, deg(110)], torso: [0, deg(-34), 0] },
  },
  {
    t: 0.5,
    pose: {
      ...IDLE,
      shoulderR: [deg(-90), 0, deg(86)],
      elbowR: [0, 0, deg(40)],
      torso: [0, deg(30), 0],
      hips: [0, deg(18), 0],
      offset: [0.16, -0.04, 0],
    },
  },
  { t: 0.76, pose: { ...IDLE, shoulderR: [deg(-50), 0, deg(60)], elbowR: [0, 0, deg(80)] } },
  { t: 1, pose: IDLE },
];

export const LOW_JAB: PoseClip = [
  { t: 0, pose: CROUCH },
  { t: 0.35, pose: { ...CROUCH, shoulderR: [deg(-10), 0, deg(40)], elbowR: [0, 0, deg(120)] } },
  {
    t: 0.5,
    pose: {
      ...CROUCH,
      shoulderR: [0, 0, deg(86)],
      elbowR: [0, 0, deg(8)],
      torso: [0, deg(10), deg(16)],
      offset: [0.14, -0.39, 0],
    },
  },
  { t: 0.75, pose: { ...CROUCH, shoulderR: [0, 0, deg(60)], elbowR: [0, 0, deg(60)] } },
  { t: 1, pose: CROUCH },
];

export const SWEEP: PoseClip = [
  { t: 0, pose: CROUCH },
  { t: 0.3, pose: { ...CROUCH, hipR: [0, 0, deg(20)], kneeR: [0, 0, deg(-120)], torso: [0, deg(-24), deg(22)] } },
  {
    t: 0.5,
    pose: {
      ...CROUCH,
      hipR: [0, 0, deg(96)],
      kneeR: [0, 0, deg(-10)],
      hipL: [0, 0, deg(-40)],
      kneeL: [0, 0, deg(-120)],
      torso: [0, deg(20), deg(30)],
      shoulderL: [deg(30), 0, deg(-40)],
      offset: [0.22, -0.52, 0],
    },
  },
  { t: 0.78, pose: { ...CROUCH, hipR: [0, 0, deg(60)], kneeR: [0, 0, deg(-80)], offset: [0.06, -0.45, 0] } },
  { t: 1, pose: CROUCH },
];

export const LOW_KICK: PoseClip = [
  { t: 0, pose: CROUCH },
  { t: 0.34, pose: { ...CROUCH, hipR: [0, 0, deg(40)], kneeR: [0, 0, deg(-130)] } },
  {
    t: 0.5,
    pose: { ...CROUCH, hipR: [0, 0, deg(72)], kneeR: [0, 0, deg(-30)], torso: [0, deg(8), deg(18)], offset: [0.12, -0.39, 0] },
  },
  { t: 0.78, pose: { ...CROUCH, hipR: [0, 0, deg(60)], kneeR: [0, 0, deg(-100)] } },
  { t: 1, pose: CROUCH },
];

export const MID_KICK: PoseClip = [
  { t: 0, pose: IDLE },
  {
    t: 0.32,
    pose: { ...IDLE, hipR: [0, 0, deg(54)], kneeR: [0, 0, deg(-110)], torso: [0, deg(-18), deg(-6)], offset: [0, -0.04, 0] },
  },
  {
    t: 0.5,
    pose: {
      ...IDLE,
      hipR: [0, 0, deg(92)],
      kneeR: [0, 0, deg(-8)],
      hipL: [0, 0, deg(-14)],
      torso: [0, deg(14), deg(-14)],
      shoulderL: [deg(40), 0, deg(-58)],
      shoulderR: [deg(-40), 0, deg(-20)],
      offset: [0.18, -0.02, 0],
    },
  },
  { t: 0.76, pose: { ...IDLE, hipR: [0, 0, deg(60)], kneeR: [0, 0, deg(-70)] } },
  { t: 1, pose: IDLE },
];

export const ROUNDHOUSE: PoseClip = [
  { t: 0, pose: IDLE },
  {
    t: 0.28,
    pose: {
      ...IDLE,
      hips: [0, deg(-50), 0],
      torso: [0, deg(-30), deg(-10)],
      hipR: [0, 0, deg(40)],
      kneeR: [0, 0, deg(-120)],
    },
  },
  {
    t: 0.5,
    pose: {
      ...IDLE,
      hips: [0, deg(40), 0],
      torso: [0, deg(30), deg(-26)],
      head: [0, deg(20), deg(-14)],
      hipR: [deg(-14), 0, deg(126)],
      kneeR: [0, 0, deg(-14)],
      hipL: [0, 0, deg(-26)],
      kneeL: [0, 0, deg(-30)],
      shoulderL: [deg(60), 0, deg(-70)],
      shoulderR: [deg(-60), 0, deg(-40)],
      offset: [0.2, 0.06, 0],
    },
  },
  { t: 0.8, pose: { ...IDLE, hips: [0, deg(-20), 0], hipR: [0, 0, deg(50)], kneeR: [0, 0, deg(-80)] } },
  { t: 1, pose: IDLE },
];

export const AIR_PUNCH: PoseClip = [
  { t: 0, pose: JUMP_FALL },
  { t: 0.3, pose: { ...JUMP_FALL, shoulderR: [deg(-20), 0, deg(-30)], elbowR: [0, 0, deg(120)] } },
  {
    t: 0.5,
    pose: {
      ...JUMP_FALL,
      shoulderR: [0, 0, deg(122)],
      elbowR: [0, 0, deg(10)],
      torso: [0, deg(16), deg(24)],
      offset: [0.14, -0.06, 0],
    },
  },
  { t: 1, pose: JUMP_FALL },
];

export const AIR_KICK: PoseClip = [
  { t: 0, pose: JUMP_FALL },
  { t: 0.3, pose: { ...JUMP_FALL, hipR: [0, 0, deg(70)], kneeR: [0, 0, deg(-120)] } },
  {
    t: 0.5,
    pose: {
      ...JUMP_FALL,
      hipR: [0, 0, deg(112)],
      kneeR: [0, 0, deg(-6)],
      hipL: [0, 0, deg(-30)],
      kneeL: [0, 0, deg(-90)],
      torso: [0, deg(10), deg(-20)],
      shoulderL: [deg(40), 0, deg(-80)],
    },
  },
  { t: 1, pose: JUMP_FALL },
];

/** Каст снаряда: разворот корпуса и выброс обеих ладоней вперёд. */
export const CAST: PoseClip = [
  { t: 0, pose: IDLE },
  {
    t: 0.34,
    pose: {
      ...IDLE,
      hips: [0, deg(-44), 0],
      torso: [0, deg(-34), deg(14)],
      shoulderR: [deg(-40), 0, deg(-10)],
      elbowR: [0, 0, deg(130)],
      shoulderL: [deg(36), 0, deg(-6)],
      elbowL: [0, 0, deg(134)],
      offset: [-0.1, -0.16, 0],
    },
  },
  {
    t: 0.52,
    pose: {
      ...IDLE,
      hips: [0, deg(10), 0],
      torso: [0, deg(20), deg(-6)],
      shoulderR: [deg(-10), 0, deg(92)],
      elbowR: [0, 0, deg(6)],
      shoulderL: [deg(10), 0, deg(92)],
      elbowL: [0, 0, deg(6)],
      hipL: [0, 0, deg(-34)],
      kneeL: [0, 0, deg(-20)],
      offset: [0.16, -0.08, 0],
    },
  },
  { t: 0.8, pose: { ...IDLE, shoulderR: [0, 0, deg(60)], shoulderL: [deg(14), 0, deg(50)] } },
  { t: 1, pose: IDLE },
];

/** Взлетающий апперкот-шорьюкен. */
export const RISING: PoseClip = [
  { t: 0, pose: IDLE },
  { t: 0.22, pose: { ...IDLE, offset: [0, -0.3, 0], torso: [0, deg(-16), deg(26)], shoulderR: [deg(-10), 0, deg(-10)], elbowR: [0, 0, deg(130)] } },
  {
    t: 0.45,
    pose: {
      ...IDLE,
      shoulderR: [0, 0, deg(-168)],
      elbowR: [0, 0, deg(8)],
      shoulderL: [deg(20), 0, deg(30)],
      elbowL: [0, 0, deg(120)],
      torso: [0, deg(6), deg(-14)],
      hipR: [0, 0, deg(50)],
      kneeR: [0, 0, deg(-100)],
      hipL: [0, 0, deg(10)],
      kneeL: [0, 0, deg(-40)],
      offset: [0.1, 0.5, 0],
    },
  },
  {
    t: 0.72,
    pose: {
      ...IDLE,
      shoulderR: [0, 0, deg(-150)],
      elbowR: [0, 0, deg(20)],
      hipR: [0, 0, deg(40)],
      kneeR: [0, 0, deg(-80)],
      offset: [0.06, 0.2, 0],
    },
  },
  { t: 1, pose: IDLE },
];

/** Рывок-таран плечом вперёд. */
export const CHARGE: PoseClip = [
  { t: 0, pose: IDLE },
  { t: 0.24, pose: { ...IDLE, torso: [0, deg(-24), deg(-14)], offset: [-0.14, -0.1, 0] } },
  {
    t: 0.5,
    pose: {
      ...IDLE,
      torso: [0, deg(-10), deg(36)],
      head: [0, deg(10), deg(-20)],
      shoulderR: [deg(-30), 0, deg(-50)],
      elbowR: [0, 0, deg(100)],
      shoulderL: [deg(26), 0, deg(-58)],
      elbowL: [0, 0, deg(96)],
      hipR: [0, 0, deg(64)],
      kneeR: [0, 0, deg(-40)],
      hipL: [0, 0, deg(-50)],
      kneeL: [0, 0, deg(-60)],
      offset: [0.24, -0.16, 0],
    },
  },
  { t: 0.8, pose: { ...IDLE, torso: [0, deg(-6), deg(18)], offset: [0.1, -0.08, 0] } },
  { t: 1, pose: IDLE },
];

/** Вертушка в прыжке — универсальный «спиральный» спешл. */
export const SPIN: PoseClip = [
  { t: 0, pose: IDLE },
  { t: 0.2, pose: { ...IDLE, hips: [0, deg(-60), 0], offset: [0, -0.24, 0] } },
  {
    t: 0.45,
    pose: {
      ...IDLE,
      hips: [0, deg(120), 0],
      torso: [0, deg(40), deg(-18)],
      hipR: [deg(-20), 0, deg(120)],
      kneeR: [0, 0, deg(-10)],
      hipL: [0, 0, deg(-40)],
      kneeL: [0, 0, deg(-50)],
      shoulderR: [deg(-80), 0, deg(-30)],
      shoulderL: [deg(80), 0, deg(-30)],
      offset: [0.12, 0.42, 0],
    },
  },
  {
    t: 0.7,
    pose: {
      ...IDLE,
      hips: [0, deg(300), 0],
      hipR: [deg(-20), 0, deg(110)],
      kneeR: [0, 0, deg(-20)],
      shoulderR: [deg(-70), 0, deg(-20)],
      offset: [0.08, 0.2, 0],
    },
  },
  { t: 1, pose: { ...IDLE, hips: [0, deg(346), 0] } },
];

/** Захват: шаг вперёд, рывок на себя, бросок. */
export const GRAB: PoseClip = [
  { t: 0, pose: IDLE },
  {
    t: 0.3,
    pose: {
      ...IDLE,
      shoulderR: [deg(-10), 0, deg(84)],
      elbowR: [0, 0, deg(16)],
      shoulderL: [deg(10), 0, deg(80)],
      elbowL: [0, 0, deg(20)],
      offset: [0.2, -0.06, 0],
    },
  },
  {
    t: 0.55,
    pose: {
      ...IDLE,
      shoulderR: [deg(-10), 0, deg(-40)],
      elbowR: [0, 0, deg(70)],
      shoulderL: [deg(10), 0, deg(-44)],
      elbowL: [0, 0, deg(74)],
      torso: [0, deg(-30), deg(-16)],
      offset: [-0.06, -0.02, 0],
    },
  },
  { t: 0.8, pose: { ...IDLE, torso: [0, deg(30), deg(20)], offset: [0.1, -0.12, 0] } },
  { t: 1, pose: IDLE },
];

/** Супер: накопление энергии и мощный выпад обеими руками. */
export const SUPER: PoseClip = [
  { t: 0, pose: IDLE },
  {
    t: 0.22,
    pose: {
      ...IDLE,
      shoulderR: [deg(-50), 0, deg(-30)],
      elbowR: [0, 0, deg(140)],
      shoulderL: [deg(46), 0, deg(-30)],
      elbowL: [0, 0, deg(140)],
      torso: [0, 0, deg(20)],
      head: [0, 0, deg(10)],
      offset: [-0.08, -0.3, 0],
    },
  },
  {
    t: 0.4,
    pose: {
      ...IDLE,
      shoulderR: [deg(-20), 0, deg(-140)],
      elbowR: [0, 0, deg(30)],
      shoulderL: [deg(18), 0, deg(-140)],
      elbowL: [0, 0, deg(30)],
      torso: [0, 0, deg(-24)],
      head: [0, 0, deg(-24)],
      offset: [0, 0.1, 0],
    },
  },
  {
    t: 0.6,
    pose: {
      ...IDLE,
      shoulderR: [0, 0, deg(96)],
      elbowR: [0, 0, deg(2)],
      shoulderL: [0, 0, deg(96)],
      elbowL: [0, 0, deg(2)],
      torso: [0, deg(20), deg(10)],
      hipL: [0, 0, deg(-40)],
      kneeL: [0, 0, deg(-24)],
      offset: [0.3, -0.12, 0],
    },
  },
  { t: 0.85, pose: { ...IDLE, shoulderR: [0, 0, deg(60)], shoulderL: [deg(12), 0, deg(56)], offset: [0.1, -0.06, 0] } },
  { t: 1, pose: IDLE },
];
