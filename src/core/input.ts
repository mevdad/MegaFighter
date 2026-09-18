import { EMPTY_INPUT, type InputKey, type InputState } from '../game/types';

export interface InputSource {
  poll(): InputState;
}

const DEFAULT_KEYS: Record<string, InputKey> = {
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'up',
  KeyS: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyJ: 'lp',
  KeyK: 'hp',
  KeyL: 'lk',
  Semicolon: 'hk',
  Space: 'block',
  KeyU: 'lp',
  KeyI: 'hp',
  KeyO: 'lk',
  KeyP: 'hk',
  ShiftLeft: 'block',
};

export class KeyboardSource implements InputSource {
  private readonly held = new Set<InputKey>();
  private readonly bindings: Record<string, InputKey>;

  constructor(bindings: Record<string, InputKey> = DEFAULT_KEYS) {
    this.bindings = bindings;
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  poll(): InputState {
    const state = { ...EMPTY_INPUT };
    for (const key of this.held) state[key] = true;
    return state;
  }

  private onDown = (e: KeyboardEvent): void => {
    const key = this.bindings[e.code];
    if (!key) return;
    // Стрелки и пробел иначе скроллят страницу прямо во время боя.
    e.preventDefault();
    this.held.add(key);
  };

  private onUp = (e: KeyboardEvent): void => {
    const key = this.bindings[e.code];
    if (!key) return;
    e.preventDefault();
    this.held.delete(key);
  };

  private onBlur = (): void => {
    this.held.clear();
  };
}

/** Источник, которым управляют экранные кнопки: UI просто дёргает set(). */
export class VirtualSource implements InputSource {
  private state: InputState = { ...EMPTY_INPUT };

  set(key: InputKey, down: boolean): void {
    this.state[key] = down;
  }

  clear(): void {
    this.state = { ...EMPTY_INPUT };
  }

  poll(): InputState {
    return { ...this.state };
  }
}

/** Стандартная раскладка геймпада: крестовина/стик + четыре лицевые кнопки. */
export class GamepadSource implements InputSource {
  constructor(private readonly index = 0) {}

  poll(): InputState {
    const state = { ...EMPTY_INPUT };
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads[this.index];
    if (!pad) return state;

    const [ax = 0, ay = 0] = pad.axes;
    const dead = 0.4;
    state.left = pad.buttons[14]?.pressed || ax < -dead;
    state.right = pad.buttons[15]?.pressed || ax > dead;
    state.up = pad.buttons[12]?.pressed || ay < -dead;
    state.down = pad.buttons[13]?.pressed || ay > dead;
    state.lp = !!pad.buttons[2]?.pressed;
    state.hp = !!pad.buttons[3]?.pressed;
    state.lk = !!pad.buttons[0]?.pressed;
    state.hk = !!pad.buttons[1]?.pressed;
    state.block = !!(pad.buttons[6]?.pressed || pad.buttons[7]?.pressed);
    return state;
  }
}

/** Игрок может одновременно жать клавиатуру, тач и геймпад — берём объединение. */
export class CompositeSource implements InputSource {
  constructor(private readonly sources: InputSource[]) {}

  poll(): InputState {
    const state = { ...EMPTY_INPUT };
    for (const source of this.sources) {
      const s = source.poll();
      for (const key of Object.keys(state) as InputKey[]) {
        if (s[key]) state[key] = true;
      }
    }
    return state;
  }
}
