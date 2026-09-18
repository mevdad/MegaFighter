import { Rng } from '../core/rng';
import { EMPTY_INPUT, type InputKey, type InputState, type SpecialMove } from './types';
import type { Fighter } from './fighter';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'nightmare';

interface Profile {
  /** Кадры задержки реакции — главный рычаг сложности. */
  reaction: number;
  /** Как часто ИИ принимает новое решение. */
  decisionInterval: number;
  aggression: number;
  blockChance: number;
  specialChance: number;
  antiAirChance: number;
  punishChance: number;
}

const PROFILES: Record<Difficulty, Profile> = {
  easy: { reaction: 22, decisionInterval: 34, aggression: 0.4, blockChance: 0.25, specialChance: 0.12, antiAirChance: 0.15, punishChance: 0.1 },
  normal: { reaction: 14, decisionInterval: 24, aggression: 0.58, blockChance: 0.5, specialChance: 0.28, antiAirChance: 0.4, punishChance: 0.3 },
  hard: { reaction: 8, decisionInterval: 16, aggression: 0.72, blockChance: 0.72, specialChance: 0.45, antiAirChance: 0.65, punishChance: 0.55 },
  nightmare: { reaction: 4, decisionInterval: 11, aggression: 0.85, blockChance: 0.88, specialChance: 0.62, antiAirChance: 0.85, punishChance: 0.78 },
};

/** Один кадр «нажатий», которые ИИ отыгрывает по сценарию. */
type MacroFrame = InputKey[];

export class AiController {
  private readonly rng: Rng;
  private profile: Profile;
  private macro: MacroFrame[] = [];
  private hold: InputKey[] = [];
  private holdFrames = 0;
  private decisionTimer = 0;
  /** Кольцо снимков противника — из него читаем «устаревшее» состояние для задержки реакции. */
  private history: Array<{ state: string; x: number; y: number; attacking: boolean; recovering: boolean }> = [];

  constructor(difficulty: Difficulty = 'normal', seed: number = Date.now()) {
    this.profile = PROFILES[difficulty];
    this.rng = new Rng(seed);
  }

  setDifficulty(d: Difficulty): void {
    this.profile = PROFILES[d];
  }

  reset(): void {
    this.macro = [];
    this.hold = [];
    this.holdFrames = 0;
    this.decisionTimer = 0;
    this.history = [];
  }

  /** Вызывается раз в кадр до симуляции; возвращает ввод для бойца. */
  poll(self: Fighter, foe: Fighter, active: boolean): InputState {
    this.record(foe);
    if (!active) return { ...EMPTY_INPUT };

    if (this.macro.length > 0) return toState(this.macro.shift() ?? []);
    if (this.holdFrames > 0) {
      this.holdFrames -= 1;
      return toState(this.hold);
    }

    this.decisionTimer -= 1;
    if (this.decisionTimer > 0) return toState(this.hold);
    this.decisionTimer = this.profile.decisionInterval;

    this.decide(self, foe);
    return toState(this.hold);
  }

  private record(foe: Fighter): void {
    const move = foe.move;
    const recovering =
      foe.state === 'attack' && !!move && foe.moveFrame > move.startup + move.active;
    this.history.push({ state: foe.state, x: foe.x, y: foe.y, attacking: foe.state === 'attack', recovering });
    if (this.history.length > 40) this.history.shift();
  }

  /** Состояние противника, каким ИИ его «видит» с учётом задержки реакции. */
  private perceived(): { state: string; x: number; y: number; attacking: boolean; recovering: boolean } | null {
    const index = this.history.length - 1 - this.profile.reaction;
    return index >= 0 ? this.history[index] : null;
  }

  private decide(self: Fighter, foe: Fighter): void {
    const view = this.perceived();
    if (!view) {
      this.hold = [];
      return;
    }

    const toFoe = foe.x - self.x;
    const dist = Math.abs(toFoe);
    const forward: InputKey = toFoe >= 0 ? 'right' : 'left';
    const back: InputKey = toFoe >= 0 ? 'left' : 'right';
    const p = this.profile;

    // 1. Противник в воздухе и близко — антивоздушка.
    if (view.y > 0.6 && dist < 2.4 && this.rng.chance(p.antiAirChance)) {
      const rising = this.pickSpecial(self, (s) => !!s.launcher && !s.projectile);
      if (rising) {
        this.queueSpecial(rising, forward);
        return;
      }
      this.queue([['down'], ['down', 'hp'], ['down', 'hp']]);
      return;
    }

    // 2. Противник застрял в восстановлении после промаха — наказываем.
    // Видим это с той же задержкой реакции, что и всё остальное, поэтому успеть
    // можно только против по-настоящему медленных приёмов — как и задумано дизайном.
    if (view.recovering && dist < 2.1 && this.rng.chance(p.punishChance)) {
      const punisher = this.pickSpecial(self, (s) => !s.projectile && !!s.launcher);
      if (punisher && this.rng.chance(0.5)) {
        this.queueSpecial(punisher, forward);
        return;
      }
      this.queue([[forward], ['down', 'hp'], ['down', 'hp'], [], ['hp'], ['hp']]);
      return;
    }

    // 3. Противник атакует рядом — блок.
    if (view.attacking && dist < 2.0 && this.rng.chance(p.blockChance)) {
      this.hold = [back];
      if (this.rng.chance(0.4)) this.hold.push('down');
      this.holdFrames = 18;
      return;
    }

    // 4. Дальняя дистанция: снаряд или сближение.
    if (dist > 3.6) {
      const shot = this.pickSpecial(self, (s) => !!s.projectile && !s.meterCost);
      if (shot && this.rng.chance(p.specialChance)) {
        this.queueSpecial(shot, forward);
        return;
      }
      this.hold = [forward];
      this.holdFrames = this.rng.int(14, 30);
      if (this.rng.chance(0.18)) this.hold = [forward, 'up'];
      return;
    }

    // 5. Средняя дистанция: подход, прыжок или рывок в спешл.
    if (dist > 1.7) {
      if (self.meter >= 100 && this.rng.chance(p.punishChance)) {
        const sup = this.pickSpecial(self, (s) => s.meterCost === 100);
        if (sup) {
          this.queueSpecial(sup, forward);
          return;
        }
      }
      const rush = this.pickSpecial(self, (s) => !!s.lunge && s.lunge.x > 0.4);
      if (rush && this.rng.chance(p.specialChance * 0.8)) {
        this.queueSpecial(rush, forward);
        return;
      }
      if (this.rng.chance(0.2)) {
        this.queue([[forward, 'up'], [forward, 'up'], [forward], [forward], [forward], [forward], [forward, 'hk']]);
        return;
      }
      this.hold = [forward];
      this.holdFrames = this.rng.int(10, 22);
      return;
    }

    // 6. Вплотную: бить, ставить микс-ап или отступать.
    const roll = this.rng.next();
    if (roll < p.aggression * 0.45) {
      // Связка: быстрый удар с отменой в спешл.
      const special = this.pickSpecial(self, (s) => !s.projectile && !s.meterCost);
      const starter: MacroFrame[] = this.rng.chance(0.5) ? [['lp'], [], ['lp'], []] : [['down', 'lk'], [], ['down', 'lk'], []];
      this.queue(starter);
      if (special && this.rng.chance(p.specialChance)) this.queueSpecial(special, forward, true);
      return;
    }
    if (roll < p.aggression * 0.7) {
      this.queue([['down', 'hk'], ['down', 'hk']]); // подсечка
      return;
    }
    if (roll < p.aggression * 0.86) {
      this.queue([['hp'], ['hp']]);
      return;
    }
    if (roll < p.aggression * 0.95) {
      this.queue([['down', 'hp'], ['down', 'hp']]); // апперкот-лаунчер
      return;
    }
    this.hold = [back];
    this.holdFrames = this.rng.int(8, 18);
  }

  private pickSpecial(self: Fighter, filter: (s: SpecialMove) => boolean): SpecialMove | null {
    const options = self.spec.specials.filter((s) => filter(s) && (!s.meterCost || self.meter >= s.meterCost));
    return options.length ? this.rng.pick(options) : null;
  }

  /**
   * Разворачивает мотион в последовательность кадров нажатий.
   * ИИ «набирает» спешл теми же направлениями, что и игрок, — никаких читерских вызовов приёма.
   */
  private queueSpecial(special: SpecialMove, forward: InputKey, append = false): void {
    const back: InputKey = forward === 'right' ? 'left' : 'right';
    const frames: MacroFrame[] = [];
    for (const dir of special.input.motion) {
      frames.push(numpadToKeys(dir, forward, back));
      frames.push(numpadToKeys(dir, forward, back));
    }
    const last = frames[frames.length - 1] ?? [];
    frames.push([...last, special.input.button]);
    frames.push([...last, special.input.button]);
    if (append) this.macro.push(...frames);
    else this.queue(frames);
  }

  private queue(frames: MacroFrame[]): void {
    this.macro = frames;
    this.hold = [];
    this.holdFrames = 0;
  }
}

function numpadToKeys(dir: number, forward: InputKey, back: InputKey): InputKey[] {
  const keys: InputKey[] = [];
  if (dir === 1 || dir === 2 || dir === 3) keys.push('down');
  if (dir === 7 || dir === 8 || dir === 9) keys.push('up');
  if (dir === 3 || dir === 6 || dir === 9) keys.push(forward);
  if (dir === 1 || dir === 4 || dir === 7) keys.push(back);
  return keys;
}

function toState(keys: InputKey[]): InputState {
  const state = { ...EMPTY_INPUT };
  for (const key of keys) state[key] = true;
  return state;
}
