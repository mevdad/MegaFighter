/**
 * Оверлей отладки (F1): хёртбоксы, хитбоксы, pushbox, кадр приёма, состояние, hitstop,
 * frame advantage, клип и его локальное время. Пауза (F2) и покадровый шаг (F3 или «.»).
 *
 * Только чтение: оверлей ничего не пишет в Match/Fighter. Единственное, чем он управляет, это
 * своё решение «разрешить ли App выполнить очередной тик» (shouldTick): App вызывает его в начале
 * шага GameLoop, поэтому пауза и шаг идут через тот же фиксированный цикл 60 Гц.
 * Линии боксов рисуются в мировых координатах (та же плоскость z = 0 и та же камера, что у бойцов),
 * текст идёт HTML-панелями поверх канваса (как HUD в src/ui).
 */
import { Color, Vec3, type AppBase } from 'playcanvas';
import type { Match } from '../../game/match';
import type { Fighter } from '../../game/fighter';
import { PUSH_RADIUS } from '../../game/constants';
import { projectileRect } from '../../game/combat';
import { AnimatedFighter } from '../animatedFighter';
import type { FighterVisual } from '../fighterVisual';
import {
  BOX_COLORS,
  BOX_LINE_INSET,
  BOX_LINE_LAYERS,
  BOX_Z,
  CENTER_MARK_HALF,
  DEBUG_KEYS,
  FONT_FAMILY,
  FONT_SIZE_PX,
  HINT_TEXT,
  LEGEND,
  PANEL_ACCENT,
  PANEL_BG,
  PANEL_EDGE_PX,
  PANEL_MUTED,
  PANEL_TEXT,
  PANEL_TOP_PX,
  PANEL_Z_INDEX,
} from './config';
import {
  crossSegments,
  formatAdvantage,
  formatClipTime,
  frameAdvantage,
  hexToRgb01,
  hitboxFromMove,
  movePhase,
  pushboxRect,
  thickRectSegments,
  wrapClipTime,
  type Advantage,
  type BoxRect,
  type Segment,
} from './format';

/** Что оверлею нужно от BattleView: только список визуалов бойцов. */
export interface VisualsSource {
  readonly fighterVisuals: readonly [FighterVisual, FighterVisual] | null;
}

function cssHex(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function box(style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const node = document.createElement('div');
  Object.assign(node.style, {
    position: 'absolute',
    pointerEvents: 'none',
    background: PANEL_BG,
    color: PANEL_TEXT,
    fontFamily: FONT_FAMILY,
    fontSize: `${FONT_SIZE_PX}px`,
    lineHeight: '1.35',
    padding: '6px 8px',
    borderRadius: '4px',
    whiteSpace: 'pre',
    zIndex: String(PANEL_Z_INDEX),
    ...style,
  });
  return node;
}

export class DebugOverlay {
  private readonly root = document.createElement('div');
  private readonly panels: [HTMLDivElement, HTMLDivElement];
  private readonly matchPanel: HTMLDivElement;
  private readonly bottom: HTMLDivElement;
  private readonly hintEl: HTMLSpanElement;
  private readonly lastText = new Map<HTMLElement, string>();

  private visible = false;
  private paused = false;
  private stepPending = false;
  /** Frame advantage в момент контакта (защитник только вошёл в стан, stateFrame === 0). */
  private contact: Advantage | null = null;
  private lastMatch: Match | null = null;

  constructor(
    layer: HTMLElement,
    private readonly app: AppBase,
    private readonly visuals: VisualsSource,
  ) {
    Object.assign(this.root.style, { position: 'absolute', inset: '0', pointerEvents: 'none', display: 'none', zIndex: String(PANEL_Z_INDEX) });

    const top = `${PANEL_TOP_PX}px`;
    const edge = `${PANEL_EDGE_PX}px`;
    this.panels = [box({ top, left: edge }), box({ top, right: edge })];
    this.matchPanel = box({ top, left: '50%', transform: 'translateX(-50%)', width: 'max-content', textAlign: 'center' });

    // Низ: легенда + подсказка клавиш (всегда видны при открытом оверлее).
    this.bottom = box({ bottom: edge, left: '50%', transform: 'translateX(-50%)', width: 'max-content', maxWidth: '98vw', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' });
    const legend = document.createElement('div');
    Object.assign(legend.style, { display: 'flex', gap: '14px', flexWrap: 'wrap', justifyContent: 'center' });
    for (const item of LEGEND) {
      const row = document.createElement('span');
      const swatch = document.createElement('span');
      Object.assign(swatch.style, {
        display: 'inline-block',
        width: '12px',
        height: '12px',
        marginRight: '5px',
        verticalAlign: 'middle',
        border: `2px solid ${cssHex(BOX_COLORS[item.key])}`,
        boxSizing: 'border-box',
      });
      row.append(swatch, item.label);
      legend.append(row);
    }
    this.hintEl = document.createElement('span');
    this.hintEl.style.color = PANEL_MUTED;
    this.bottom.append(legend, this.hintEl);

    this.root.append(this.panels[0], this.panels[1], this.matchPanel, this.bottom);
    layer.append(this.root);

    window.addEventListener('keydown', this.onKeyDown);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
  }

  get isOpen(): boolean {
    return this.visible;
  }

  /**
   * Вызывается App в начале каждого шага GameLoop: true — тик выполнить.
   * Оверлей закрыт или пауза не включена: всегда true (игра идёт как без оверлея).
   * На паузе: true ровно один раз на каждый запрос шага.
   */
  shouldTick(): boolean {
    if (!this.visible || !this.paused) return true;
    if (!this.stepPending) return false;
    this.stepPending = false;
    return true;
  }

  private setVisible(value: boolean): void {
    this.visible = value;
    this.root.style.display = value ? '' : 'none';
    if (!value) {
      // Закрытый оверлей не должен оставлять игру замороженной.
      this.paused = false;
      this.stepPending = false;
    }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === DEBUG_KEYS.toggle) {
      e.preventDefault();
      if (!e.repeat) this.setVisible(!this.visible);
      return;
    }
    if (!this.visible) return;
    if (e.code === DEBUG_KEYS.pause) {
      e.preventDefault();
      if (!e.repeat) {
        this.paused = !this.paused;
        this.stepPending = false;
      }
    } else if ((DEBUG_KEYS.step as readonly string[]).includes(e.code)) {
      e.preventDefault();
      // Шаг имеет смысл только на паузе; удержание клавиши даёт автоповтор.
      if (this.paused) this.stepPending = true;
    }
  };

  /** Вызывается из App.draw() каждый кадр рендера, после BattleView.update и до render(). */
  draw(match: Match): void {
    if (!this.visible) return;
    this.drawBoxes(match);
    this.updateText(match);
  }

  /* ------------------------------ боксы ------------------------------ */

  private drawBoxes(match: Match): void {
    const segments: Array<{ seg: Segment; color: number }> = [];
    const addRect = (r: BoxRect, color: number): void => {
      for (const seg of thickRectSegments(r, BOX_Z, BOX_LINE_LAYERS, BOX_LINE_INSET)) segments.push({ seg, color });
    };
    const [a, b] = match.fighters;

    for (const f of match.fighters) {
      addRect(f.hurtbox, BOX_COLORS.hurtbox);
      addRect(pushboxRect(f, PUSH_RADIUS, a.spec.build.bulk, b.spec.build.bulk), BOX_COLORS.pushbox);
      for (const seg of crossSegments(f.x, f.y, BOX_Z, CENTER_MARK_HALF)) segments.push({ seg, color: BOX_COLORS.pushbox });

      const move = f.move;
      if (f.state === 'attack' && move && !move.projectile && movePhase(f.moveFrame, move) === 'active') {
        const r = hitboxFromMove(f);
        if (r) addRect(r, f.moveHasHit ? BOX_COLORS.hitboxSpent : BOX_COLORS.hitbox);
      }
    }
    for (const p of match.projectiles) addRect(projectileRect(p), BOX_COLORS.projectile);

    const positions: Vec3[] = [];
    const colors: Color[] = [];
    for (const { seg, color } of segments) {
      const [r, g, bl] = hexToRgb01(color);
      positions.push(new Vec3(seg[0], seg[1], seg[2]), new Vec3(seg[3], seg[4], seg[5]));
      colors.push(new Color(r, g, bl), new Color(r, g, bl));
    }
    // depthTest = false: боксы видны сквозь модель бойца.
    this.app.drawLines(positions, colors, false);
  }

  /* ------------------------------ текст ------------------------------ */

  private setText(node: HTMLElement, text: string): void {
    if (this.lastText.get(node) === text) return;
    this.lastText.set(node, text);
    node.textContent = text;
  }

  private updateText(match: Match): void {
    if (match !== this.lastMatch) {
      this.lastMatch = match;
      this.contact = null;
    }
    const [f0, f1] = match.fighters;
    match.fighters.forEach((f, i) => this.setText(this.panels[i], this.fighterText(f, i)));

    const adv = frameAdvantage(f0, f1);
    // Фиксируем значение в момент контакта: стан только что начался (stateFrame 0).
    if (adv && match.fighters[1 - adv.attacker].stateFrame === 0) this.contact = adv;
    const lines = [
      `phase ${match.phase} (${match.phaseFrame})   round ${match.round}`,
      `hitstop: ${match.hitstop}`,
      `frame adv (live): ${formatAdvantage(adv)}`,
      `frame adv (at contact): ${formatAdvantage(this.contact)}`,
    ];
    this.setText(this.matchPanel, lines.join('\n'));

    this.hintEl.textContent = `${this.paused ? '[ПАУЗА] ' : ''}${HINT_TEXT}`;
    this.hintEl.style.color = this.paused ? PANEL_ACCENT : PANEL_MUTED;
  }

  private fighterText(f: Fighter, index: number): string {
    const lines: string[] = [`P${index + 1} ${f.spec.name}`];
    lines.push(`state: ${f.state}   stateFrame: ${f.stateFrame}`);

    const move = f.move;
    if (f.state === 'attack' && move) {
      const phase = movePhase(f.moveFrame, move);
      const total = f.moveTotal;
      lines.push(`move: ${move.id}   move frame: ${f.moveFrame} / ${total}   ${phase.toUpperCase()}${f.moveHasHit ? ' (hit)' : ''}`);
      lines.push(`  startup ${move.startup} | active ${move.active} (${move.startup}..${move.startup + move.active - 1}) | recovery ${move.recovery}`);
    } else {
      lines.push('move: — (move frame: —)');
    }

    if (f.state === 'hitstun' || f.state === 'blockstun') {
      lines.push(`stun: ${f.stateFrame} / ${f.stunFrames}   (left ${Math.max(0, f.stunFrames - f.stateFrame)})`);
    } else {
      lines.push('stun: —');
    }
    lines.push(`x ${f.x.toFixed(2)}  y ${f.y.toFixed(2)}  facing ${f.facing > 0 ? '+1' : '-1'}  inv ${f.invulnFrames}`);

    const visual = this.visuals.fighterVisuals?.[index];
    const clip = visual instanceof AnimatedFighter ? visual.debugClip : null;
    if (clip) {
      const t = formatClipTime(wrapClipTime(clip.time, clip.duration), undefined, clip.duration);
      lines.push(`clip: ${clip.clip}  (anim state ${clip.animState})`);
      lines.push(`clip time: ${t.text}`);
    } else {
      lines.push('clip: — (процедурный боец, клипов нет)');
    }
    return lines.join('\n');
  }
}
