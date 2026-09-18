import { el } from './dom';
import { EMPTY_INPUT, type InputKey, type InputState } from '../game/types';
import type { InputSource } from '../core/input';

/**
 * Экранное управление: аналоговый «стик» слева, четыре кнопки справа,
 * блок и отдельная кнопка спешла — на телефоне честно накрутить ↓↘→ почти нереально,
 * поэтому кнопка сама «набирает» мотион кадр за кадром.
 */
export class TouchControls implements InputSource {
  readonly root = el('div', 'touch');
  private readonly state: InputState = { ...EMPTY_INPUT };
  private readonly knob = el('div', 'pad__knob');
  private padPointer: number | null = null;
  private macro: InputKey[][] = [];

  constructor(private readonly getFacing: () => 1 | -1) {
    const pad = el('div', 'pad', this.knob, el('div', 'pad__hint', 'ДВИЖЕНИЕ'));
    pad.addEventListener('pointerdown', this.onPadDown);
    pad.addEventListener('pointermove', this.onPadMove);
    pad.addEventListener('pointerup', this.onPadUp);
    pad.addEventListener('pointercancel', this.onPadUp);

    const buttons = el('div', 'buttons');
    const defs: Array<[InputKey, string, string]> = [
      ['lp', 'tbtn tbtn--lp', 'СЛ.РУКА'],
      ['hp', 'tbtn tbtn--hp', 'СИЛ.РУКА'],
      ['lk', 'tbtn tbtn--lk', 'СЛ.НОГА'],
      ['hk', 'tbtn tbtn--hk', 'СИЛ.НОГА'],
    ];
    for (const [key, cls, label] of defs) buttons.append(this.makeButton(key, cls, label));

    const block = this.makeButton('block', 'tbtn tbtn--block', 'БЛОК');
    const special = el('button', 'tbtn tbtn--special', 'СПЕШЛ');
    special.type = 'button';
    special.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      special.classList.add('tbtn--active');
      this.queueSpecial();
    });
    const release = () => special.classList.remove('tbtn--active');
    special.addEventListener('pointerup', release);
    special.addEventListener('pointercancel', release);

    this.root.append(pad, buttons, block, special);
  }

  private makeButton(key: InputKey, cls: string, label: string): HTMLButtonElement {
    const node = el('button', cls, label);
    node.type = 'button';
    const down = (e: PointerEvent) => {
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      this.state[key] = true;
      node.classList.add('tbtn--active');
    };
    const up = (e: PointerEvent) => {
      e.preventDefault();
      this.state[key] = false;
      node.classList.remove('tbtn--active');
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', up);
    return node;
  }

  /** Раскладывает ↓ ↘ → + сильный удар в очередь кадров. */
  private queueSpecial(): void {
    const forward: InputKey = this.getFacing() === 1 ? 'right' : 'left';
    this.macro = [
      ['down'],
      ['down'],
      ['down', forward],
      ['down', forward],
      [forward],
      [forward, 'hp'],
      [forward, 'hp'],
    ];
  }

  private onPadDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.padPointer = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.onPadMove(e);
  };

  private onPadMove = (e: PointerEvent): void => {
    if (this.padPointer !== e.pointerId) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);

    const dead = 0.34;
    this.state.left = dx < -dead;
    this.state.right = dx > dead;
    this.state.up = dy < -dead;
    this.state.down = dy > dead;

    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    this.knob.style.transform = `translate(${clamp(dx) * 42}%, ${clamp(dy) * 42}%)`;
  };

  private onPadUp = (e: PointerEvent): void => {
    if (this.padPointer !== e.pointerId) return;
    this.padPointer = null;
    this.state.left = this.state.right = this.state.up = this.state.down = false;
    this.knob.style.transform = 'translate(0, 0)';
  };

  setVisible(visible: boolean): void {
    this.root.classList.toggle('touch--on', visible);
  }

  poll(): InputState {
    // Кадры макроса перекрывают ручной ввод, пока очередь не опустеет.
    if (this.macro.length) {
      const frame = this.macro.shift() ?? [];
      const out = { ...EMPTY_INPUT };
      for (const key of frame) out[key] = true;
      return out;
    }
    return { ...this.state };
  }

  reset(): void {
    for (const key of Object.keys(this.state) as InputKey[]) this.state[key] = false;
    this.macro = [];
    this.knob.style.transform = 'translate(0, 0)';
  }
}

export function isTouchDevice(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
}
