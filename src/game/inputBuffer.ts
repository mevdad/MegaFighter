import type { Button, Facing, InputKey, InputState } from './types';

const BUTTONS: Button[] = ['lp', 'hp', 'lk', 'hk', 'block'];

interface Frame {
  /** Направление в нотации нампада, 1..9, где 6 — «вперёд» относительно взгляда. */
  dir: number;
  state: InputState;
}

const BUFFER_SIZE = 40;

/**
 * Кольцевой буфер ввода: хранит последние кадры и распознаёт мотионы (236, 214, 623)
 * уже приведёнными к направлению взгляда, чтобы спешлы работали с обеих сторон экрана.
 */
export class InputBuffer {
  private frames: Frame[] = [];
  private prev: InputState | null = null;

  push(state: InputState, facing: Facing): void {
    const forward = facing === 1 ? state.right : state.left;
    const back = facing === 1 ? state.left : state.right;

    let dir = 5;
    const horizontal = forward ? 1 : back ? -1 : 0;
    const vertical = state.up ? 1 : state.down ? -1 : 0;
    if (vertical === 1) dir = 8 + horizontal;
    else if (vertical === -1) dir = 2 + horizontal;
    else dir = 5 + horizontal;

    this.prev = this.frames.length ? this.frames[this.frames.length - 1].state : null;
    this.frames.push({ dir, state: { ...state } });
    if (this.frames.length > BUFFER_SIZE) this.frames.shift();
  }

  get current(): InputState | null {
    return this.frames.length ? this.frames[this.frames.length - 1].state : null;
  }

  held(key: InputKey): boolean {
    return this.current?.[key] ?? false;
  }

  /** Кнопка нажата именно в этом кадре. */
  pressed(key: InputKey): boolean {
    const cur = this.current;
    if (!cur) return false;
    return cur[key] && !(this.prev?.[key] ?? false);
  }

  /** Была ли кнопка нажата (именно фронт) в последние `window` кадров. */
  pressedWithin(key: InputKey, window: number): boolean {
    const start = Math.max(1, this.frames.length - window);
    for (let i = this.frames.length - 1; i >= start; i -= 1) {
      if (this.frames[i].state[key] && !this.frames[i - 1].state[key]) return true;
    }
    return false;
  }

  anyAttackPressed(): boolean {
    return BUTTONS.some((b) => b !== 'block' && this.pressed(b));
  }

  /** Текущее направление в нотации нампада. */
  get dir(): number {
    return this.frames.length ? this.frames[this.frames.length - 1].dir : 5;
  }

  /**
   * Проверяет мотион: кнопка нажата в этом кадре, а перед ней в буфере
   * по порядку встречаются нужные направления. Между элементами допускаются пропуски —
   * на телефоне точный ввод недостижим, и строгая проверка сделала бы спешлы неиграбельными.
   */
  matchMotion(motion: number[], button: Button, window = 16): boolean {
    if (!this.pressed(button)) return false;
    if (motion.length === 0) return true;

    const start = Math.max(0, this.frames.length - window);
    let index = motion.length - 1;
    for (let i = this.frames.length - 1; i >= start; i -= 1) {
      if (this.frames[i].dir === motion[index]) {
        index -= 1;
        if (index < 0) return true;
      }
    }
    return false;
  }

  /** Двойное нажатие направления — рывок вперёд или назад. */
  doubleTap(dir: number, window = 14): boolean {
    if (this.dir !== dir) return false;
    const start = Math.max(0, this.frames.length - window);
    let phase: 'hold' | 'gap' | 'first' = 'hold';
    for (let i = this.frames.length - 1; i >= start; i -= 1) {
      const d = this.frames[i].dir;
      if (phase === 'hold') {
        if (d !== dir) phase = 'gap';
        else if (i === this.frames.length - 1) continue;
        else if (this.frames.length - 1 - i > 4) return false; // держит, а не тапает
      } else if (phase === 'gap') {
        if (d === dir) phase = 'first';
      } else if (d !== dir) {
        return true;
      }
    }
    return phase === 'first';
  }

  clear(): void {
    this.frames = [];
    this.prev = null;
  }
}
