import { describe, expect, it } from 'vitest';
import {
  crossSegments,
  formatAdvantage,
  formatClipTime,
  frameAdvantage,
  hexToRgb01,
  hitboxFromMove,
  movePhase,
  pushboxRect,
  rectToSegments,
  thickRectSegments,
  wrapClipTime,
  type AdvantageFighter,
} from './format';

const fighter = (over: Partial<AdvantageFighter>): AdvantageFighter => ({
  state: 'idle',
  stateFrame: 0,
  stunFrames: 0,
  moveFrame: 0,
  moveTotal: 0,
  grounded: true,
  ...over,
});

describe('formatClipTime', () => {
  it('переводит секунды в кадры 30 к/с', () => {
    const t = formatClipTime(0.5);
    expect(t.seconds).toBe('0.500s');
    expect(t.frames).toBe('f15.0');
  });

  it('добавляет длительность клипа', () => {
    expect(formatClipTime(1 / 30, 30, 1.3333).text).toBe('0.033s  f1.0 / 1.333s (f40.0)');
  });

  it('учитывает другой fps', () => {
    expect(formatClipTime(1, 24).frames).toBe('f24.0');
  });
});

describe('wrapClipTime', () => {
  it('сворачивает время loop-клипа в одну длительность', () => {
    expect(wrapClipTime(16.4, 0.3333)).toBeCloseTo(16.4 - 49 * 0.3333, 6);
    expect(wrapClipTime(0.2, 1)).toBe(0.2);
    expect(wrapClipTime(-0.1, 1)).toBeCloseTo(0.9, 10);
    expect(wrapClipTime(5, 0)).toBe(5);
  });
});

describe('movePhase', () => {
  const m = { startup: 6, active: 3, recovery: 10 };
  it('совпадает с окном хитбокса симуляции: startup <= кадр < startup + active', () => {
    expect(movePhase(0, m)).toBe('startup');
    expect(movePhase(5, m)).toBe('startup');
    expect(movePhase(6, m)).toBe('active');
    expect(movePhase(8, m)).toBe('active');
    expect(movePhase(9, m)).toBe('recovery');
  });
});

describe('frameAdvantage', () => {
  it('попадание: остаток стана минус остаток восстановления', () => {
    // moveTotal 20, кадр 6 -> 14 до свободы; стан 16, кадр 0 -> 16. Итого +2.
    const attacker = fighter({ state: 'attack', moveFrame: 6, moveTotal: 20 });
    const defender = fighter({ state: 'hitstun', stateFrame: 0, stunFrames: 16 });
    expect(frameAdvantage(attacker, defender)).toEqual({ attacker: 0, frames: 2, kind: 'hit' });
  });

  it('блок: отрицательный, если восстановление длиннее блокстана', () => {
    const attacker = fighter({ state: 'attack', moveFrame: 6, moveTotal: 26 });
    const defender = fighter({ state: 'blockstun', stateFrame: 0, stunFrames: 14 });
    expect(frameAdvantage(defender, attacker)).toEqual({ attacker: 1, frames: -6, kind: 'block' });
  });

  it('значение не меняется, пока оба считают тики вниз', () => {
    const at = (t: number) =>
      frameAdvantage(
        fighter({ state: 'attack', moveFrame: 6 + t, moveTotal: 20 }),
        fighter({ state: 'hitstun', stateFrame: t, stunFrames: 16 }),
      );
    expect(at(0)?.frames).toBe(2);
    expect(at(5)?.frames).toBe(2);
    expect(at(13)?.frames).toBe(2);
  });

  it('атакующий уже свободен: остаток стана целиком', () => {
    const attacker = fighter({ state: 'idle' });
    const defender = fighter({ state: 'hitstun', stateFrame: 10, stunFrames: 16 });
    expect(frameAdvantage(attacker, defender)?.frames).toBe(6);
  });

  it('не применимо: нет стана, защитник в воздухе, оба заняты', () => {
    expect(frameAdvantage(fighter({}), fighter({}))).toBeNull();
    expect(
      frameAdvantage(fighter({ state: 'attack', moveFrame: 1, moveTotal: 20 }), fighter({ state: 'hitstun', stunFrames: 16, grounded: false })),
    ).toBeNull();
    expect(frameAdvantage(fighter({ state: 'hitstun', stunFrames: 9 }), fighter({ state: 'blockstun', stunFrames: 9 }))).toBeNull();
    expect(frameAdvantage(fighter({ state: 'dash' }), fighter({ state: 'hitstun', stunFrames: 9 }))).toBeNull();
  });

  it('форматирует знак и прочерк', () => {
    expect(formatAdvantage(null)).toBe('—');
    expect(formatAdvantage({ attacker: 0, frames: 3, kind: 'hit' })).toBe('P1 +3 (hit)');
    expect(formatAdvantage({ attacker: 1, frames: -2, kind: 'block' })).toBe('P2 −2 (block)');
    expect(formatAdvantage({ attacker: 0, frames: 0, kind: 'hit' })).toBe('P1 0 (hit)');
  });
});

describe('геометрия боксов', () => {
  it('прямоугольник с центром в x, y превращается в замкнутый контур из 4 отрезков', () => {
    const segs = rectToSegments({ x: 1, y: 2, w: 2, h: 4 }, 0.5);
    expect(segs).toHaveLength(4);
    expect(segs[0]).toEqual([0, 0, 0.5, 2, 0, 0.5]);
    expect(segs[2]).toEqual([2, 4, 0.5, 0, 4, 0.5]);
    // Замкнут: конец каждого отрезка = начало следующего.
    for (let i = 0; i < 4; i += 1) {
      const a = segs[i];
      const b = segs[(i + 1) % 4];
      expect([a[3], a[4], a[5]]).toEqual([b[0], b[1], b[2]]);
    }
  });

  it('inset сужает контур внутрь, но не уходит в минус', () => {
    expect(rectToSegments({ x: 0, y: 0, w: 2, h: 2 }, 0, 0.25)[0]).toEqual([-0.75, -0.75, 0, 0.75, -0.75, 0]);
    expect(rectToSegments({ x: 0, y: 0, w: 0.1, h: 0.1 }, 0, 1)[0]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('толщина = число вложенных контуров', () => {
    expect(thickRectSegments({ x: 0, y: 0, w: 2, h: 2 }, 0, 3, 0.01)).toHaveLength(12);
  });

  it('хитбокс разворачивается вместе с facing без отрицательного scale', () => {
    const move = { hitbox: { x: 0.8, y: 1.2, w: 0.5, h: 0.3 } };
    const right = hitboxFromMove({ x: -2, y: 0, facing: 1, move });
    const left = hitboxFromMove({ x: 2, y: 0, facing: -1, move });
    expect(right).toEqual({ x: -1.2, y: 1.2, w: 0.5, h: 0.3 });
    expect(left).toEqual({ x: 1.2, y: 1.2, w: 0.5, h: 0.3 });
    expect(hitboxFromMove({ x: 0, y: 0, facing: 1, move: null })).toBeNull();
  });

  it('pushbox: ширина = минимальная дистанция расталкивания из Match.separate', () => {
    const r = pushboxRect({ x: 1, y: 0, height: 1.8 }, 0.62, 1.28, 0.82);
    expect(r.w).toBeCloseTo(0.62 * 1.05, 10);
    expect(r).toMatchObject({ x: 1, y: 0.9, h: 1.8 });
  });

  it('крест и цвет', () => {
    expect(crossSegments(1, 2, 0, 0.1)).toEqual([
      [0.9, 2, 0, 1.1, 2, 0],
      [1, 1.9, 0, 1, 2.1, 0],
    ]);
    expect(hexToRgb01(0xff8000)).toEqual([1, 128 / 255, 0]);
  });
});
