import './ui/styles.css';

import { GameLoop } from './core/loop';
import { CompositeSource, GamepadSource, KeyboardSource, type InputSource } from './core/input';
import { audio } from './core/audio';
import { Match } from './game/match';
import { AiController, type Difficulty } from './game/ai';
import { ROSTER } from './characters/roster';
import { generateCharacter } from './characters/generator';
import { SceneView } from './render/scene';
import { BattleView } from './render/view';
import { preload } from './render/assets';
import { Hud } from './ui/hud';
import { TouchControls, isTouchDevice } from './ui/touch';
import { ControlsScreen, PauseScreen, ResultScreen, SelectScreen, TitleScreen } from './ui/screens';
import type { CharacterSpec, InputState } from './game/types';
import { el } from './ui/dom';

type Mode = 'demo' | 'fight' | 'pause';

class App {
  private readonly sceneView: SceneView;
  private readonly battleView: BattleView;
  private readonly hud: Hud;
  private readonly touch: TouchControls;
  private readonly playerInput: InputSource;

  private readonly title: TitleScreen;
  private readonly select: SelectScreen;
  private readonly controls: ControlsScreen;
  private readonly result: ResultScreen;
  private readonly pause: PauseScreen;

  private match: Match;
  private readonly ai: [AiController, AiController];
  private mode: Mode = 'demo';
  private resultShown = false;
  private readonly pauseButton: HTMLButtonElement;
  private readonly rotateHint: HTMLElement;

  constructor(layer: HTMLElement, sceneView: SceneView) {
    this.sceneView = sceneView;
    this.battleView = new BattleView(this.sceneView);
    this.hud = new Hud(layer);

    this.touch = new TouchControls(() => this.match.fighters[0].facing);
    layer.append(this.touch.root);

    this.playerInput = new CompositeSource([new KeyboardSource(), new GamepadSource(0), this.touch]);
    this.ai = [new AiController('normal'), new AiController('normal')];

    this.match = this.makeDemoMatch();
    this.battleView.setMatch(this.match);

    this.title = new TitleScreen(layer, {
      onFight: () => this.goto(this.select),
      onControls: () => this.goto(this.controls),
      onGenerate: () => {
        const spec = generateCharacter(Date.now() ^ Math.floor(Math.random() * 1e9));
        this.select.addGenerated(spec);
        this.goto(this.select);
        this.hud.toast(`Создан боец: ${spec.name}`);
      },
      onToggleSound: () => {
        const on = audio.muted;
        audio.setMuted(!on);
        audio.setMusic(!on);
        return !audio.muted;
      },
    });

    this.select = new SelectScreen(layer, {
      onConfirm: (spec, difficulty) => this.startFight(spec, this.select.randomOpponent(), difficulty),
      onBack: () => this.goto(this.title),
    });

    this.controls = new ControlsScreen(layer, () => this.goto(this.title));

    this.result = new ResultScreen(layer, {
      onRematch: () => {
        const [a, b] = this.match.fighters;
        this.startFight(a.spec, b.spec, this.currentDifficulty);
      },
      onSelect: () => this.goto(this.select),
      onMenu: () => this.goto(this.title),
    });

    this.pause = new PauseScreen(layer, {
      onResume: () => this.resume(),
      onMenu: () => this.goto(this.title),
    });

    // Файтинг рассчитан на горизонтальный экран: в портрете бойцы уезжают в точку.
    this.rotateHint = el(
      'div',
      'rotate',
      el(
        'div',
        '',
        el('div', 'rotate__icon', '▭'),
        el(
          'p',
          '',
          el('strong', '', 'ПОВЕРНИ ЭКРАН'),
          'Бой идёт в горизонтальной ориентации — так оба бойца помещаются в кадр, а кнопки не перекрывают арену.',
        ),
      ),
    );
    layer.append(this.rotateHint);

    this.pauseButton = el('button', 'pause-btn', 'ПАУЗА');
    this.pauseButton.type = 'button';
    this.pauseButton.style.display = 'none';
    this.pauseButton.addEventListener('pointerup', () => this.togglePause());
    layer.append(this.pauseButton);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.togglePause();
    });
    // Звук разрешено запускать только после жеста пользователя.
    const unlock = () => {
      audio.unlock();
      audio.setMusic(true);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    this.goto(this.title);
    this.loadAssets(layer);

    const loop = new GameLoop(
      () => this.step(),
      () => this.draw(),
    );
    loop.start();
  }

  private currentDifficulty: Difficulty = 'normal';

  /**
   * Модели людей грузятся в фоне: игра уже крутится и показывает меню,
   * а как только файлы приедут — бойцы с моделями пересобираются.
   * Если загрузка не удалась, все останутся процедурными, и это играбельно.
   */
  private loadAssets(layer: HTMLElement): void {
    const urls = [...new Set(ROSTER.map((c) => c.animatedRig?.url).filter((u): u is string => !!u))];
    if (urls.length === 0) return;

    const bar = el('div', 'loading__bar');
    const box = el('div', 'loading', el('div', 'loading__text', 'ЗАГРУЗКА БОЙЦОВ'), el('div', 'loading__track', bar));
    layer.append(box);

    void preload(this.sceneView.app, urls, (done, total) => {
      bar.style.transform = `scaleX(${done / total})`;
    }).then(() => {
      box.remove();
      // Пересобираем текущий спарринг, чтобы модели появились сразу, а не со следующего боя.
      this.battleView.setMatch(this.match);
    });
  }

  private makeDemoMatch(): Match {
    // Фон меню — живой спарринг двух случайных бойцов: сцена не выглядит пустой.
    const pick = () => ROSTER[Math.floor(Math.random() * ROSTER.length)];
    const a = pick();
    let b = pick();
    while (b.id === a.id) b = pick();
    const match = new Match(a, b);
    this.ai[0].setDifficulty('normal');
    this.ai[1].setDifficulty('normal');
    return match;
  }

  private goto(screen: { show: () => void }): void {
    for (const s of [this.title, this.select, this.controls, this.result, this.pause]) s.hide();
    screen.show();

    const inFight = screen === this.pause;
    if (!inFight) {
      this.mode = 'demo';
      this.hud.setVisible(false);
      this.touch.setVisible(false);
      this.pauseButton.style.display = 'none';
      this.rotateHint.classList.remove('rotate--on');
      if (screen !== this.result && this.match.matchWinner !== null) {
        this.match = this.makeDemoMatch();
        this.battleView.setMatch(this.match);
      }
    }
  }

  private startFight(player: CharacterSpec, opponent: CharacterSpec, difficulty: Difficulty): void {
    this.currentDifficulty = difficulty;
    this.match = new Match(player, opponent);
    this.battleView.setMatch(this.match);
    this.hud.bind(this.match);
    this.ai[1].setDifficulty(difficulty);
    this.ai[1].reset();
    this.touch.reset();
    this.resultShown = false;

    for (const s of [this.title, this.select, this.controls, this.result, this.pause]) s.hide();
    this.hud.setVisible(true);
    this.touch.setVisible(isTouchDevice());
    this.rotateHint.classList.add('rotate--on');
    this.pauseButton.style.display = '';
    this.mode = 'fight';
  }

  private togglePause(): void {
    if (this.mode === 'fight') {
      this.mode = 'pause';
      this.pause.show();
      this.pauseButton.style.display = 'none';
      this.touch.setVisible(false);
    } else if (this.mode === 'pause') {
      this.resume();
    }
  }

  private resume(): void {
    this.pause.hide();
    this.mode = 'fight';
    this.pauseButton.style.display = '';
    this.touch.setVisible(isTouchDevice());
    this.touch.reset();
  }

  private step(): void {
    audio.tickMusic();
    if (this.mode === 'pause') return;

    const [f0, f1] = this.match.fighters;
    const fighting = this.match.phase === 'fight';

    let inputs: [InputState, InputState];
    if (this.mode === 'fight') {
      inputs = [this.playerInput.poll(), this.ai[1].poll(f1, f0, fighting)];
    } else {
      inputs = [this.ai[0].poll(f0, f1, fighting), this.ai[1].poll(f1, f0, fighting)];
    }

    this.match.step(inputs);

    const events = this.match.drainEvents();
    this.battleView.handleEvents(events);
    if (this.mode === 'fight') {
      for (const e of events) {
        if (e.type === 'announce') this.hud.announce(e.text, e.sub);
        if (e.type === 'hit' && e.counter) this.hud.flashLabel('КОНТРУДАР');
        if (e.type === 'throwTech') this.hud.flashLabel('СРЫВ ЗАХВАТА');
      }
      this.hud.update(this.match);
    }

    if (this.mode === 'demo' && this.match.phase === 'matchEnd' && this.match.phaseFrame > 120) {
      this.match = this.makeDemoMatch();
      this.battleView.setMatch(this.match);
    }

    if (this.mode === 'fight' && this.match.phase === 'matchEnd' && !this.resultShown && this.match.phaseFrame > 90) {
      this.resultShown = true;
      const winner = this.match.matchWinner ?? 0;
      this.hud.setVisible(false);
      this.touch.setVisible(false);
      this.pauseButton.style.display = 'none';
      this.result.setResult(this.match.fighters[winner].spec, winner === 0, this.match.wins);
      this.result.show();
      this.mode = 'demo';
    }
  }

  private draw(): void {
    this.battleView.update(this.match);
    this.sceneView.render();
  }
}

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const layer = document.getElementById('ui') as HTMLElement;
SceneView.create(canvas).then((sceneView) => new App(layer, sceneView));
