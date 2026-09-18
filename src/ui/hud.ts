import { el, hex } from './dom';
import { MAX_METER, ROUNDS_TO_WIN } from '../game/constants';
import type { Match } from '../game/match';

/** Верхняя панель боя: полосы здоровья, шкалы супера, таймер, счётчик комбо и объявления. */
export class Hud {
  readonly root = el('div', 'hud');
  readonly announceEl = el('div', 'announce');

  private readonly names: [HTMLElement, HTMLElement];
  private readonly bars: [HTMLElement, HTMLElement];
  private readonly fills: [HTMLElement, HTMLElement];
  private readonly ghosts: [HTMLElement, HTMLElement];
  private readonly meters: [HTMLElement, HTMLElement];
  private readonly meterFills: [HTMLElement, HTMLElement];
  private readonly pips: [HTMLElement, HTMLElement];
  private readonly combos: [HTMLElement, HTMLElement];
  private readonly timerEl = el('div', 'timer', '99');
  private readonly announceSub = el('span', 'announce__sub');
  private readonly labelEl = el('div', 'flashlabel');
  private readonly announceText = document.createTextNode('');

  constructor(private readonly layer: HTMLElement) {
    const side = (right: boolean) => {
      const name = el('div', 'hud__name', '—');
      const ghost = el('div', 'bar__ghost');
      const fill = el('div', 'bar__fill');
      const bar = el('div', 'bar', ghost, fill);
      const meterFill = el('div', 'meter__fill');
      const meter = el('div', 'meter', meterFill);
      const wrap = el('div', `hud__side${right ? ' hud__side--right' : ''}`, name, bar, meter);
      return { wrap, name, bar, fill, ghost, meter, meterFill };
    };

    const left = side(false);
    const right = side(true);

    const pipsL = el('div', 'rounds__group');
    const pipsR = el('div', 'rounds__group');
    const center = el('div', 'hud__center', this.timerEl, el('div', 'rounds', pipsL, pipsR));

    this.root.append(left.wrap, center, right.wrap);

    this.names = [left.name, right.name];
    this.bars = [left.bar, right.bar];
    this.fills = [left.fill, right.fill];
    this.ghosts = [left.ghost, right.ghost];
    this.meters = [left.meter, right.meter];
    this.meterFills = [left.meterFill, right.meterFill];
    this.pips = [pipsL, pipsR];

    this.combos = [el('div', 'combo combo--left'), el('div', 'combo combo--right')];
    this.announceEl.append(this.announceText, this.announceSub);

    layer.append(this.root, this.combos[0], this.combos[1], this.labelEl, this.announceEl);
    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    const display = visible ? '' : 'none';
    this.root.style.display = visible ? 'grid' : 'none';
    for (const c of this.combos) c.style.display = display;
    this.labelEl.style.display = display;
    this.announceEl.style.display = display;
  }

  bind(match: Match): void {
    match.fighters.forEach((f, i) => {
      this.names[i].textContent = f.spec.name;
      this.names[i].style.color = hex(f.spec.palette.aura);
      for (let r = 0; r < ROUNDS_TO_WIN; r += 1) {
        if (this.pips[i].children.length <= r) this.pips[i].append(el('div', 'pip'));
      }
    });
  }

  update(match: Match): void {
    match.fighters.forEach((f, i) => {
      const ratio = f.health / f.spec.stats.maxHealth;
      this.fills[i].style.transform = `scaleX(${ratio})`;
      this.ghosts[i].style.transform = `scaleX(${ratio})`;
      this.bars[i].classList.toggle('bar--low', ratio < 0.3);

      const meter = f.meter / MAX_METER;
      this.meterFills[i].style.transform = `scaleX(${meter})`;
      this.meters[i].classList.toggle('meter--full', f.meter >= MAX_METER);

      const pips = this.pips[i].children;
      for (let r = 0; r < pips.length; r += 1) {
        pips[r].classList.toggle('pip--on', r < match.wins[i]);
      }

      // Комбо показываем над тем, КТО его делает, поэтому берём счётчик жертвы напротив.
      const victim = match.fighters[1 - i];
      const on = victim.comboShownCount > 1 && victim.comboTimer > 0;
      this.combos[i].classList.toggle('combo--on', on);
      if (on) {
        this.combos[i].textContent = `${victim.comboShownCount} УДАРОВ`;
        this.combos[i].append(el('span', '', `${victim.comboShownDamage} урона`));
      }
    });

    this.timerEl.textContent = String(Math.max(0, match.timer)).padStart(2, '0');
    this.timerEl.style.color = match.timer <= 10 ? 'var(--danger)' : 'var(--gold)';
  }

  announce(text: string, sub?: string): void {
    this.announceText.nodeValue = text;
    this.announceSub.textContent = sub ?? '';
    this.announceEl.classList.remove('announce--show');
    // Принудительный reflow — иначе повторное объявление не перезапустит анимацию.
    void this.announceEl.offsetWidth;
    this.announceEl.classList.add('announce--show');
  }

  /** Короткая подпись поверх боя: контрудар, срыв захвата. */
  flashLabel(text: string): void {
    this.labelEl.textContent = text;
    this.labelEl.classList.remove('flashlabel--show');
    void this.labelEl.offsetWidth;
    this.labelEl.classList.add('flashlabel--show');
  }

  toast(text: string): void {
    const node = el('div', 'toast', text);
    this.layer.append(node);
    requestAnimationFrame(() => node.classList.add('toast--show'));
    setTimeout(() => {
      node.classList.remove('toast--show');
      setTimeout(() => node.remove(), 300);
    }, 1800);
  }
}
