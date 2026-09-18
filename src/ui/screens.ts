import { button, clear, el, hex } from './dom';
import { ROSTER } from '../characters/roster';
import type { Difficulty } from '../game/ai';
import type { Button, CharacterSpec, SpecialMove } from '../game/types';

const ARROWS: Record<number, string> = { 1: '↙', 2: '↓', 3: '↘', 4: '←', 5: '·', 6: '→', 7: '↖', 8: '↑', 9: '↗' };
const BUTTON_LABEL: Record<Button, string> = {
  lp: 'СЛ.РУКА',
  hp: 'СИЛ.РУКА',
  lk: 'СЛ.НОГА',
  hk: 'СИЛ.НОГА',
  block: 'БЛОК',
};

export function motionText(special: SpecialMove): string {
  const arrows = special.input.motion.map((d) => ARROWS[d] ?? '·').join(' ');
  return `${arrows} + ${BUTTON_LABEL[special.input.button]}`;
}

class Screen {
  readonly root = el('div', 'screen screen--hidden');

  constructor(layer: HTMLElement) {
    layer.append(this.root);
  }

  show(): void {
    this.root.classList.remove('screen--hidden');
    this.root.scrollTop = 0;
  }

  hide(): void {
    this.root.classList.add('screen--hidden');
  }

  get visible(): boolean {
    return !this.root.classList.contains('screen--hidden');
  }
}

export class TitleScreen extends Screen {
  constructor(
    layer: HTMLElement,
    actions: { onFight: () => void; onControls: () => void; onGenerate: () => void; onToggleSound: () => boolean },
  ) {
    super(layer);
    const soundBtn = button('ЗВУК: ВКЛ', 'btn btn--ghost');
    soundBtn.addEventListener('pointerup', () => {
      const on = actions.onToggleSound();
      soundBtn.textContent = `ЗВУК: ${on ? 'ВКЛ' : 'ВЫКЛ'}`;
    });

    this.root.append(
      el('div', 'title', el('h1', '', 'MEGAFIGHTER'), el('p', '', 'арена нижнего храма')),
      el(
        'div',
        'menu',
        button('НАЧАТЬ БОЙ', 'btn btn--primary', actions.onFight),
        button('СГЕНЕРИРОВАТЬ БОЙЦА', 'btn', actions.onGenerate),
        button('УПРАВЛЕНИЕ', 'btn', actions.onControls),
        soundBtn,
      ),
    );
  }
}

export class SelectScreen extends Screen {
  private roster: CharacterSpec[] = [...ROSTER];
  private selected = 0;
  private difficulty: Difficulty = 'normal';
  private readonly grid = el('div', 'roster');
  private readonly detail = el('div', 'detail');
  private readonly chips = el('div', 'chips');

  constructor(
    layer: HTMLElement,
    private readonly actions: { onConfirm: (p1: CharacterSpec, difficulty: Difficulty) => void; onBack: () => void },
  ) {
    super(layer);

    const diffs: Array<[Difficulty, string]> = [
      ['easy', 'НОВИЧОК'],
      ['normal', 'БОЕЦ'],
      ['hard', 'ВЕТЕРАН'],
      ['nightmare', 'КОШМАР'],
    ];
    for (const [id, label] of diffs) {
      const chip = button(label, `chip${id === this.difficulty ? ' chip--active' : ''}`, () => {
        this.difficulty = id;
        for (const node of Array.from(this.chips.children)) node.classList.remove('chip--active');
        chip.classList.add('chip--active');
      });
      this.chips.append(chip);
    }

    this.root.append(
      el('div', 'screen__head', el('h2', '', 'ВЫБОР БОЙЦА'), button('НАЗАД', 'btn btn--ghost', actions.onBack)),
      this.chips,
      this.grid,
      this.detail,
      el(
        'div',
        'row',
        button('В БОЙ', 'btn btn--primary', () => this.actions.onConfirm(this.roster[this.selected], this.difficulty)),
        button('СЛУЧАЙНЫЙ БОЕЦ', 'btn', () => {
          this.selected = Math.floor(Math.random() * this.roster.length);
          this.render();
        }),
      ),
    );
    this.render();
  }

  /** Добавляет сгенерированного бойца в ростер и сразу выбирает его. */
  addGenerated(spec: CharacterSpec): void {
    this.roster = [spec, ...this.roster];
    this.selected = 0;
    this.render();
  }

  get current(): CharacterSpec {
    return this.roster[this.selected];
  }

  /** Случайный соперник, отличный от выбранного игроком. */
  randomOpponent(): CharacterSpec {
    const others = this.roster.filter((_, i) => i !== this.selected);
    return others[Math.floor(Math.random() * others.length)] ?? this.roster[0];
  }

  private render(): void {
    clear(this.grid);
    this.roster.forEach((spec, i) => {
      const card = el('button', `card${i === this.selected ? ' card--active' : ''}`) as HTMLButtonElement;
      card.type = 'button';
      const art = el('div', 'card__silhouette');
      art.style.background = `linear-gradient(170deg, ${hex(spec.palette.primary)} 0%, ${hex(
        spec.palette.secondary,
      )} 62%, #05050a 100%)`;
      // Простой «портрет»: подсветка ауры за силуэтом головы и плеч.
      const glow = el('div', '');
      glow.style.cssText = `position:absolute;left:50%;top:26%;width:52%;height:34%;transform:translate(-50%,-50%);border-radius:50% 50% 42% 42%;background:${hex(
        spec.palette.accent,
      )};opacity:.55;filter:blur(2px);`;
      art.append(glow);
      card.append(art, el('div', 'card__name', spec.name), el('div', 'card__role', spec.style.split('·')[0].trim()));
      card.addEventListener('pointerup', () => {
        this.selected = i;
        this.render();
      });
      this.grid.append(card);
    });

    const spec = this.roster[this.selected];
    clear(this.detail);
    const stat = (label: string, value: number, max: number) => {
      const fill = el('div', 'stat__fill');
      fill.style.width = `${Math.round(Math.min(1, value / max) * 100)}%`;
      return el('div', 'stat', el('div', '', label), el('div', 'stat__track', fill));
    };

    const moves = el('div', 'moves');
    for (const special of spec.specials) {
      moves.append(
        el(
          'div',
          'move',
          el('span', '', special.meterCost ? `${special.name} (супер)` : special.name),
          el('span', 'move__input', motionText(special)),
        ),
      );
    }

    this.detail.append(
      el('h3', '', spec.name),
      el('div', 'detail__title', `${spec.title} · ${spec.style}`),
      el('p', 'detail__bio', spec.bio),
      el(
        'div',
        'stats',
        stat('ЗДОРОВЬЕ', spec.stats.maxHealth, 1250),
        stat('СКОРОСТЬ', spec.stats.walkSpeed, 0.08),
        stat('СИЛА', spec.normals.hp.damage, 120),
        stat('ЗАЩИТА', 2 - spec.stats.defense, 1.25),
      ),
      moves,
    );
  }
}

export class ControlsScreen extends Screen {
  constructor(layer: HTMLElement, onBack: () => void) {
    super(layer);
    const section = (title: string, rows: Array<[string, string]>) => {
      const dl = el('dl');
      for (const [k, v] of rows) {
        dl.append(el('dt', '', k), el('dd', '', v));
      }
      return el('section', '', el('h4', '', title), dl);
    };

    this.root.append(
      el('div', 'screen__head', el('h2', '', 'УПРАВЛЕНИЕ'), button('НАЗАД', 'btn btn--ghost', onBack)),
      el(
        'div',
        'keys',
        section('КЛАВИАТУРА', [
          ['Движение', 'A / D или ← →'],
          ['Присед', 'S или ↓'],
          ['Прыжок', 'W или ↑'],
          ['Блок', 'Пробел или назад'],
          ['Слабая рука', 'J'],
          ['Сильная рука', 'K'],
          ['Слабая нога', 'L'],
          ['Сильная нога', ';'],
          ['Пауза', 'Esc'],
        ]),
        section('ТЕЛЕФОН', [
          ['Движение', 'Стик слева'],
          ['Удары', 'Четыре кнопки справа'],
          ['Блок', 'Кнопка БЛОК'],
          ['Бросок', 'Кнопка БРОСОК'],
          ['Спешл', 'Кнопка СПЕШЛ — сама набирает ↓ ↘ → + сильная рука'],
        ]),
        section('БАЗОВЫЕ ПРИЁМЫ', [
          ['Рывок', 'Двойное нажатие вперёд или назад; рывок назад даёт кадры неуязвимости'],
          ['Подсечка', '↓ + сильная нога (блокируется только в присяде)'],
          ['Апперкот', '↓ + сильная рука — подбрасывает для комбо'],
          ['Бросок', 'Слабая рука + слабая нога вплотную — проходит сквозь блок'],
          ['Срыв броска', 'Нажми бросок в ответ — захват сорвётся'],
          ['Супер', '↓↘→ ↓↘→ + сильная рука при полной шкале'],
        ]),
        section('КАК СТРОИТЬ КОМБО', [
          ['Цепочка', 'Попал слабым — жми следующий, более сильный: слабая рука → нога → сильная рука'],
          ['Отмена', 'После попадания нормалью сразу вводи мотион спешла'],
          ['Буфер', 'Приём можно нажать заранее — он выполнится, как только боец освободится'],
          ['Подброс', 'Апперкот поднимает в воздух; добить можно до 4 ударов'],
          ['Контрудар', 'Попал по замаху противника — больше урона и стана'],
        ]),
        section('ПРАВИЛА', [
          ['Раунды', 'До двух побед'],
          ['Время', '99 секунд; по истечении побеждает тот, у кого больше здоровья'],
          ['Блок', 'Низкие атаки — только в присяде, оверхеды — только стоя'],
          ['Воздух', 'В прыжке блока нет'],
          ['Подъём', 'Вставая с земли боец несколько кадров неуязвим'],
        ]),
      ),
    );
  }
}

export class ResultScreen extends Screen {
  private readonly body = el('div', 'title');

  constructor(layer: HTMLElement, actions: { onRematch: () => void; onSelect: () => void; onMenu: () => void }) {
    super(layer);
    this.root.append(
      this.body,
      el(
        'div',
        'menu',
        button('РЕВАНШ', 'btn btn--primary', actions.onRematch),
        button('СМЕНИТЬ БОЙЦА', 'btn', actions.onSelect),
        button('В ГЛАВНОЕ МЕНЮ', 'btn btn--ghost', actions.onMenu),
      ),
    );
  }

  setResult(winner: CharacterSpec, playerWon: boolean, rounds: [number, number]): void {
    clear(this.body);
    this.body.append(
      el('h1', '', playerWon ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'),
      el('p', '', `${winner.name} — ${rounds[0]} : ${rounds[1]}`),
      el('p', '', winner.finisher.name),
    );
  }
}

export class PauseScreen extends Screen {
  constructor(layer: HTMLElement, actions: { onResume: () => void; onMenu: () => void }) {
    super(layer);
    this.root.append(
      el('div', 'title', el('h1', '', 'ПАУЗА')),
      el(
        'div',
        'menu',
        button('ПРОДОЛЖИТЬ', 'btn btn--primary', actions.onResume),
        button('ВЫЙТИ В МЕНЮ', 'btn btn--ghost', actions.onMenu),
      ),
    );
  }
}
