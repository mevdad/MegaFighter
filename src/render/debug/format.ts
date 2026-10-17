/**
 * Чистые функции оверлея: форматирование, frame advantage, геометрия боксов.
 * Без DOM и PlayCanvas, поэтому покрыты юнит-тестами (format.test.ts).
 */
import { CLIP_FPS } from './config';

/* ------------------------------ клип ------------------------------ */

export interface ClipTimeText {
  /** Секунды с тремя знаками. */
  seconds: string;
  /** Кадр клипа при CLIP_FPS (дробный, один знак). */
  frames: string;
  text: string;
}

/**
 * Время клипа внутри одного прохода: у loop-клипов activeStateCurrentTime растёт без остановки
 * (по настенному времени), поэтому показываем остаток от деления на длительность.
 */
export function wrapClipTime(timeSec: number, durationSec: number): number {
  if (!(durationSec > 0)) return timeSec;
  const t = timeSec % durationSec;
  return t < 0 ? t + durationSec : t;
}

/** Локальное время клипа в секундах и в кадрах клипа (по умолчанию 30 к/с). */
export function formatClipTime(timeSec: number, fps = CLIP_FPS, durationSec?: number): ClipTimeText {
  const seconds = `${timeSec.toFixed(3)}s`;
  const frames = `f${(timeSec * fps).toFixed(1)}`;
  const total = durationSec !== undefined && durationSec > 0 ? ` / ${durationSec.toFixed(3)}s (f${(durationSec * fps).toFixed(1)})` : '';
  return { seconds, frames, text: `${seconds}  ${frames}${total}` };
}

/* ------------------------- фаза приёма ---------------------------- */

export type MovePhase = 'startup' | 'active' | 'recovery';

export interface MoveTiming {
  startup: number;
  active: number;
  recovery: number;
}

/**
 * Фаза приёма по счётчику Fighter.moveFrame. Как в симуляции (fighter.hitbox):
 * хитбокс активен при startup <= moveFrame < startup + active.
 */
export function movePhase(moveFrame: number, m: MoveTiming): MovePhase {
  if (moveFrame < m.startup) return 'startup';
  if (moveFrame < m.startup + m.active) return 'active';
  return 'recovery';
}

/* -------------------------- frame advantage ----------------------- */

export interface AdvantageFighter {
  state: string;
  stateFrame: number;
  stunFrames: number;
  moveFrame: number;
  moveTotal: number;
  grounded: boolean;
}

export interface Advantage {
  /** Индекс бойца, чьё преимущество показано. */
  attacker: 0 | 1;
  /** Положительное: атакующий освободится раньше защитника. */
  frames: number;
  kind: 'hit' | 'block';
}

/** Состояния, в которых боец уже может действовать (Fighter.actionable без attack). */
const FREE_STATES: ReadonlySet<string> = new Set(['idle', 'walkF', 'walkB', 'crouch', 'jump']);

/**
 * Frame advantage = (сколько тиков защитнику ещё стоять в стане) − (сколько тиков атакующему
 * ещё восстанавливаться). Оба отсчитываются до одного и того же момента «следующий тик после
 * выхода в idle» (в Fighter.step: стан кончается, когда stateFrame >= stunFrames, приём кончается,
 * когда moveFrame >= moveTotal; +1 тик на выход одинаков и сокращается), поэтому
 *   adv = (stunFrames − stateFrame) − (moveTotal − moveFrame).
 * Если атакующий уже свободен, его остаток 0. Значение «живое»: пока оба считают тики вниз,
 * разность не меняется, а когда атакующий освободился — растёт на 1 за тик простоя.
 * Не применимо (null): никто не в hitstun/blockstun, защитник в воздухе (стан кончается по
 * приземлению, а не по таймеру), оба заняты, атакующий в dash/wakeup/etc. Отмены (cancel) не учитываются.
 */
export function frameAdvantage(f0: AdvantageFighter, f1: AdvantageFighter): Advantage | null {
  const pair: [AdvantageFighter, AdvantageFighter] = [f0, f1];
  for (const a of [0, 1] as const) {
    const att = pair[a];
    const def = pair[1 - a];
    if (def.state !== 'hitstun' && def.state !== 'blockstun') continue;
    if (!def.grounded) continue;
    let attRemaining: number;
    if (att.state === 'attack') attRemaining = Math.max(0, att.moveTotal - att.moveFrame);
    else if (FREE_STATES.has(att.state)) attRemaining = 0;
    else continue;
    const defRemaining = Math.max(0, def.stunFrames - def.stateFrame);
    return { attacker: a, frames: defRemaining - attRemaining, kind: def.state === 'hitstun' ? 'hit' : 'block' };
  }
  return null;
}

/** «+3», «−2», «0»; null -> «—». */
export function formatAdvantage(adv: Advantage | null): string {
  if (!adv) return '—';
  const sign = adv.frames > 0 ? '+' : adv.frames < 0 ? '−' : '';
  return `P${adv.attacker + 1} ${sign}${Math.abs(adv.frames)} (${adv.kind === 'hit' ? 'hit' : 'block'})`;
}

/* ------------------------------ боксы ----------------------------- */

/** Как Rect в game/fighter: x, y — ЦЕНТР, w, h — полные размеры. */
export interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Отрезок в мировых координатах: [x1, y1, z1, x2, y2, z2]. */
export type Segment = [number, number, number, number, number, number];

/** Контур прямоугольника (4 отрезка) в плоскости z; inset сужает контур внутрь. */
export function rectToSegments(r: BoxRect, z: number, inset = 0): Segment[] {
  const hw = Math.max(0, r.w / 2 - inset);
  const hh = Math.max(0, r.h / 2 - inset);
  const l = r.x - hw;
  const rt = r.x + hw;
  const b = r.y - hh;
  const t = r.y + hh;
  return [
    [l, b, z, rt, b, z],
    [rt, b, z, rt, t, z],
    [rt, t, z, l, t, z],
    [l, t, z, l, b, z],
  ];
}

/** Несколько вложенных контуров: имитация толщины линии, которой у drawLines нет. */
export function thickRectSegments(r: BoxRect, z: number, layers: number, step: number): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < layers; i += 1) out.push(...rectToSegments(r, z, i * step));
  return out;
}

/** Крест в точке (x, y) — маркер позиции бойца. */
export function crossSegments(x: number, y: number, z: number, half: number): Segment[] {
  return [
    [x - half, y, z, x + half, y, z],
    [x, y - half, z, x, y + half, z],
  ];
}

export interface HitboxSource {
  x: number;
  facing: 1 | -1;
  y: number;
  move: { hitbox: { x: number; y: number; w: number; h: number } } | null;
}

/**
 * Хитбокс из frame data в мировых координатах, с учётом разворота (facing).
 * Та же формула, что у Fighter.hitbox, но без проверок фазы и moveHasHit.
 */
export function hitboxFromMove(f: HitboxSource): BoxRect | null {
  if (!f.move) return null;
  const b = f.move.hitbox;
  return { x: f.x + b.x * f.facing, y: f.y + b.y, w: b.w, h: b.h };
}

/**
 * Pushbox. В симуляции явного pushbox нет: Match.separate() расталкивает бойцов, пока расстояние между
 * центрами меньше PUSH_RADIUS * (bulkA + bulkB) / 2. Эквивалентные AABB: ширина = эта дистанция
 * (у двух соприкасающихся боксов центры на расстоянии min), высота = высота бойца.
 */
export function pushboxRect(f: { x: number; y: number; height: number }, pushRadius: number, bulkA: number, bulkB: number): BoxRect {
  const width = pushRadius * ((bulkA + bulkB) / 2);
  return { x: f.x, y: f.y + f.height / 2, w: width, h: f.height };
}

/** 0xRRGGBB -> [r, g, b] в 0..1 (для pc.Color; отдельно, чтобы тестировать без движка). */
export function hexToRgb01(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}
