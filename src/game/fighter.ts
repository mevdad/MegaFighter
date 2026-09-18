import { InputBuffer } from './inputBuffer';
import * as P from './poses';
import {
  AIR_DRAG,
  BODY_HALF_WIDTH,
  BODY_HEIGHT,
  CROUCH_HEIGHT,
  GRAVITY,
  GROUND_FRICTION,
  GROUND_Y,
  MAX_METER,
  STAGE_HALF_WIDTH,
} from './constants';
import type { Button, CharacterSpec, Facing, InputState, Move, Pose, SpecialMove } from './types';

export type FighterState =
  | 'intro'
  | 'idle'
  | 'walkF'
  | 'walkB'
  | 'crouch'
  | 'jump'
  | 'dash'
  | 'attack'
  | 'hitstun'
  | 'blockstun'
  | 'knockdown'
  | 'wakeup'
  | 'ko'
  | 'victory';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DASH_FRAMES = 14;
const WAKEUP_FRAMES = 22;
const KNOCKDOWN_FRAMES = 26;

/**
 * Сколько кадров живёт отложенный ввод. Без буфера приём нужно нажимать ровно в кадр,
 * когда кончилось восстановление, — именно из-за этого управление ощущается «вязким».
 */
const BUFFER_FRAMES = 9;
/** Неуязвимость на подъёме: иначе противник просто стоит сверху и бьёт бесконечно. */
const WAKEUP_INVULN = 11;
/** Неуязвимость в начале рывка назад — единственный честный способ выйти из давления. */
const BACKDASH_INVULN = 7;
/** Потолок попаданий по летящему противнику: без него подброс = бесконечное комбо. */
const MAX_JUGGLE = 4;
const THROW_RANGE = 1.15;
/** Окно, в которое брошенный успевает вырваться. */
const THROW_TECH_WINDOW = 10;

/** Ранг нормали для чейнов: слабое → сильное. Цепочка идёт только вверх. */
export function moveRank(id: string): number {
  if (id.endsWith('lp')) return 0;
  if (id.endsWith('lk')) return 1;
  if (id.endsWith('hp')) return 2;
  if (id.endsWith('hk')) return 3;
  return 99;
}

export class Fighter {
  readonly spec: CharacterSpec;
  readonly index: 0 | 1;
  readonly buffer = new InputBuffer();

  x = 0;
  y = GROUND_Y;
  vx = 0;
  vy = 0;
  facing: Facing = 1;

  health: number;
  meter = 0;

  state: FighterState = 'idle';
  stateFrame = 0;

  move: Move | null = null;
  moveFrame = 0;
  /** Один приём — одно попадание, иначе активные кадры бьют по нескольку раз. */
  moveHasHit = false;
  /** Отмена нормали в спешл уже использована в этой цепочке. */
  cancelUsed = false;
  /** Самый сильный удар, уже использованный в текущей цепочке нормалей. */
  private chainRank = -1;

  /** Отложенный ввод: кнопка, спешл и заявка на бросок живут до BUFFER_FRAMES кадров. */
  private bufferedButton: Button | null = null;
  private bufferedSpecial: SpecialMove | null = null;
  private bufferedThrow = false;
  private bufferLife = 0;

  /** Кадры неуязвимости: подъём с земли и рывок назад. */
  invulnFrames = 0;
  /** Сколько раз подряд противника ударили в воздухе. */
  juggleCount = 0;

  blocking = false;
  crouchBlocking = false;

  /** Живая связка: рвётся, как только противник вышел из стана. */
  comboCount = 0;
  comboDamage = 0;
  /** Итог последней связки — его и показывает HUD, пока не истечёт comboTimer. */
  comboShownCount = 0;
  comboShownDamage = 0;
  /** Кадры, в течение которых комбо-счётчик ещё показывается после последнего удара. */
  comboTimer = 0;

  /** Визуальные счётчики, читает рендер. */
  flashFrames = 0;
  auraFrames = 0;

  private animTime = 0;

  constructor(spec: CharacterSpec, index: 0 | 1) {
    this.spec = spec;
    this.index = index;
    this.health = spec.stats.maxHealth;
  }

  reset(x: number, facing: Facing, keepHealth = false): void {
    this.x = x;
    this.y = GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    if (!keepHealth) this.health = this.spec.stats.maxHealth;
    this.state = 'intro';
    this.stateFrame = 0;
    this.move = null;
    this.moveFrame = 0;
    this.moveHasHit = false;
    this.blocking = false;
    this.comboCount = 0;
    this.comboDamage = 0;
    this.comboShownCount = 0;
    this.comboShownDamage = 0;
    this.comboTimer = 0;
    this.invulnFrames = 0;
    this.juggleCount = 0;
    this.chainRank = -1;
    this.clearBuffer();
    this.buffer.clear();
  }

  get grounded(): boolean {
    return this.y <= GROUND_Y + 1e-4;
  }

  get crouching(): boolean {
    return this.state === 'crouch' || (this.state === 'attack' && this.move?.id.startsWith('cr.') === true);
  }

  get alive(): boolean {
    return this.health > 0;
  }

  /** Боец может начать новое действие. */
  get actionable(): boolean {
    if (this.state === 'attack') return false;
    return (
      this.state === 'idle' ||
      this.state === 'walkF' ||
      this.state === 'walkB' ||
      this.state === 'crouch' ||
      this.state === 'jump'
    );
  }

  get height(): number {
    const scale = this.spec.build.height;
    if (this.crouching) return CROUCH_HEIGHT * scale;
    if (!this.grounded) return BODY_HEIGHT * scale * 0.86;
    if (this.state === 'knockdown') return CROUCH_HEIGHT * scale * 0.55;
    return BODY_HEIGHT * scale;
  }

  get halfWidth(): number {
    return BODY_HALF_WIDTH * this.spec.build.bulk;
  }

  /** Хёртбокс в мировых координатах. */
  get hurtbox(): Rect {
    const h = this.height;
    return { x: this.x, y: this.y + h / 2, w: this.halfWidth * 2, h };
  }

  /** Активный хитбокс в мировых координатах или null. */
  get hitbox(): Rect | null {
    const move = this.move;
    if (!move || this.state !== 'attack') return null;
    if (move.projectile) return null;
    const from = move.startup;
    const to = move.startup + move.active;
    if (this.moveFrame < from || this.moveFrame >= to) return null;
    if (this.moveHasHit) return null;
    const box = move.hitbox;
    return {
      x: this.x + box.x * this.facing,
      y: this.y + box.y,
      w: box.w,
      h: box.h,
    };
  }

  /** Кадры до конца текущего приёма. */
  get moveTotal(): number {
    return this.move ? this.move.startup + this.move.active + this.move.recovery : 0;
  }

  addMeter(amount: number): void {
    this.meter = Math.min(MAX_METER, this.meter + amount * this.spec.stats.meterRate);
  }

  /* ---------------------------------------------------------------- */
  /* Главный шаг симуляции                                             */
  /* ---------------------------------------------------------------- */

  step(input: InputState, opponent: Fighter, controlsLocked: boolean): void {
    this.buffer.push(input, this.facing);
    this.animTime += 1;
    if (this.invulnFrames > 0) this.invulnFrames -= 1;
    if (this.bufferLife > 0) {
      this.bufferLife -= 1;
      if (this.bufferLife === 0) this.clearBuffer();
    }
    // Намерение считывается каждый кадр, даже в восстановлении: в этом весь смысл буфера.
    if (!controlsLocked) this.scanIntent(opponent);
    if (this.flashFrames > 0) this.flashFrames -= 1;
    if (this.auraFrames > 0) this.auraFrames -= 1;
    if (this.comboTimer > 0) {
      this.comboTimer -= 1;
      if (this.comboTimer === 0) {
        this.comboShownCount = 0;
        this.comboShownDamage = 0;
      }
    }

    // Разворот лицом к противнику — только когда боец стоит на земле и свободен.
    if (this.grounded && (this.state === 'idle' || this.state === 'walkF' || this.state === 'walkB' || this.state === 'crouch')) {
      this.facing = opponent.x >= this.x ? 1 : -1;
    }

    this.stateFrame += 1;

    switch (this.state) {
      case 'intro':
      case 'ko':
      case 'victory':
        this.applyPhysics();
        return;
      case 'hitstun':
      case 'blockstun':
        this.stepStun();
        break;
      case 'knockdown':
        this.stepKnockdown();
        break;
      case 'wakeup':
        if (this.stateFrame >= WAKEUP_FRAMES) this.setState('idle');
        break;
      case 'dash':
        this.stepDash();
        break;
      case 'attack':
        this.stepAttack(controlsLocked);
        break;
      default:
        if (!controlsLocked) this.stepFree();
        break;
    }

    this.applyPhysics();
  }

  private setState(state: FighterState): void {
    this.state = state;
    this.stateFrame = 0;
  }

  private stepStun(): void {
    if (this.stateFrame >= this.stunFrames) {
      this.blocking = false;
      // Вышел из стана — связка окончена. Иначе отдельные тычки склеивались бы
      // в одно «комбо» и масштабирование урона душило бы обычный размен.
      this.endCombo();
      this.setState(this.grounded ? 'idle' : 'jump');
    }
  }

  /** Связка на этом бойце закончилась: счётчик и масштабирование урона сбрасываются. */
  endCombo(): void {
    this.comboCount = 0;
    this.comboDamage = 0;
  }

  private stunFrames = 0;

  private stepKnockdown(): void {
    if (this.grounded && this.stateFrame >= KNOCKDOWN_FRAMES) {
      this.setState('wakeup');
      this.invulnFrames = WAKEUP_INVULN;
      this.juggleCount = 0;
      this.endCombo();
    }
  }

  private stepDash(): void {
    this.vx = this.dashDir * this.spec.stats.dashSpeed * (1 - this.stateFrame / DASH_FRAMES) * 2;
    if (this.stateFrame >= DASH_FRAMES) this.setState('idle');
  }

  private dashDir = 1;

  private stepAttack(controlsLocked: boolean): void {
    this.moveFrame += 1;
    const move = this.move;
    if (!move) {
      this.setState('idle');
      return;
    }
    if (this.moveFrame >= this.moveTotal) {
      this.move = null;
      this.moveFrame = 0;
      this.cancelUsed = false;
      this.chainRank = -1;
      this.setState(this.grounded ? 'idle' : 'jump');
      return;
    }
    // Отмены открываются только после попадания и только с активных кадров:
    // так связка — награда за попадание, а не бесплатная безопасная мешанина.
    if (controlsLocked || !this.moveHasHit || this.moveFrame < move.startup) return;
    if (!move.cancelable || this.bufferLife <= 0) return;

    if (this.bufferedSpecial && !this.cancelUsed) {
      const special = this.bufferedSpecial;
      this.clearBuffer();
      this.cancelUsed = true;
      this.startMove(special);
      return;
    }
    if (this.bufferedButton) {
      const next = this.resolveNormal(this.bufferedButton);
      // Чейн идёт только в более сильный удар, иначе джеб зациклился бы сам в себя.
      if (next && moveRank(next.id) > this.chainRank) {
        this.clearBuffer();
        this.startMove(next);
      }
    }
  }

  private stepFree(): void {
    const b = this.buffer;
    const forward = this.facing === 1 ? 'right' : 'left';
    const back = this.facing === 1 ? 'left' : 'right';

    // 1-2. Отложенный ввод: спешл, бросок или нормаль, нажатые чуть раньше, чем боец освободился.
    if (this.consumeBuffer()) return;

    if (!this.grounded) {
      this.setState('jump');
      return;
    }

    // 3. Рывки по двойному тапу.
    if (b.doubleTap(6)) {
      this.dashDir = this.facing;
      this.setState('dash');
      return;
    }
    if (b.doubleTap(4)) {
      this.dashDir = -this.facing as Facing;
      this.setState('dash');
      this.invulnFrames = BACKDASH_INVULN;
      return;
    }

    // 4. Прыжок.
    if (b.held('up')) {
      this.vy = this.spec.stats.jumpPower;
      const drift = b.held(forward) ? 1 : b.held(back) ? -1 : 0;
      this.vx = drift * this.facing * this.spec.stats.walkSpeed * 1.35;
      this.setState('jump');
      return;
    }

    // 5. Присед, блок, ходьба.
    const crouch = b.held('down');
    this.blocking = b.held('block') || b.held(back);
    this.crouchBlocking = crouch;

    if (crouch) {
      this.vx = 0;
      this.setState('crouch');
      return;
    }
    if (b.held(back)) {
      this.vx = -this.facing * this.spec.stats.backSpeed;
      this.setState('walkB');
      return;
    }
    if (b.held(forward)) {
      this.vx = this.facing * this.spec.stats.walkSpeed;
      this.setState('walkF');
      return;
    }
    this.vx = 0;
    this.setState('idle');
  }

  private clearBuffer(): void {
    this.bufferedButton = null;
    this.bufferedSpecial = null;
    this.bufferedThrow = false;
    this.bufferLife = 0;
  }

  /** Считывает намерение игрока и кладёт его в буфер — выполнится, как только боец освободится. */
  private scanIntent(opponent: Fighter): void {
    const special = this.findSpecial();
    if (special) {
      this.clearBuffer();
      this.bufferedSpecial = special;
      this.bufferLife = BUFFER_FRAMES;
      return;
    }
    if (this.wantsThrow(opponent)) {
      this.clearBuffer();
      this.bufferedThrow = true;
      this.bufferLife = BUFFER_FRAMES;
      return;
    }
    const button = (['hp', 'hk', 'lp', 'lk'] as const).find((key) => this.buffer.pressed(key));
    if (button) {
      this.clearBuffer();
      this.bufferedButton = button;
      this.bufferLife = BUFFER_FRAMES;
    }
  }

  /** Бросок заявляется слабой рукой и слабой ногой одновременно и только вплотную. */
  private wantsThrow(opponent: Fighter): boolean {
    if (!this.grounded || !opponent.grounded) return false;
    if (Math.abs(opponent.x - this.x) > THROW_RANGE) return false;
    const lp = this.buffer.pressed('lp') && this.buffer.pressedWithin('lk', 3);
    const lk = this.buffer.pressed('lk') && this.buffer.pressedWithin('lp', 3);
    return lp || lk;
  }

  /** Успел ли боец нажать бросок в ответ — тогда захват срывается. */
  canTechThrow(): boolean {
    return this.buffer.pressedWithin('lp', THROW_TECH_WINDOW) && this.buffer.pressedWithin('lk', THROW_TECH_WINDOW);
  }

  /** Выполняет отложенный ввод, если он подходит текущему состоянию. */
  private consumeBuffer(): boolean {
    if (this.bufferLife <= 0) return false;

    if (this.bufferedSpecial) {
      const special = this.bufferedSpecial;
      if (this.grounded || special.airOk) {
        this.clearBuffer();
        this.startMove(special);
        return true;
      }
      return false;
    }
    if (this.bufferedThrow) {
      if (!this.grounded) return false;
      this.clearBuffer();
      this.startMove(this.spec.normals.throw);
      return true;
    }
    if (this.bufferedButton) {
      const move = this.resolveNormal(this.bufferedButton);
      if (move) {
        this.clearBuffer();
        this.startMove(move);
        return true;
      }
    }
    return false;
  }

  /** Ищет подходящий спешл по буферу ввода. Порядок важен: супер проверяется первым. */
  private findSpecial(): SpecialMove | null {
    const specials = this.spec.specials;
    for (let i = specials.length - 1; i >= 0; i -= 1) {
      const s = specials[i];
      if (s.meterCost && this.meter < s.meterCost) continue;
      if (!this.grounded && !s.airOk) continue;
      if (this.buffer.matchMotion(s.input.motion, s.input.button, s.input.window ?? 16)) return s;
    }
    return null;
  }

  /** Подбирает нормаль под кнопку и текущую стойку — в воздухе, в присяде или стоя. */
  private resolveNormal(button: Button): Move | null {
    if (button === 'block') return null;
    const normals = this.spec.normals;
    if (!this.grounded) {
      return button === 'lp' || button === 'hp' ? normals['j.lp'] : normals['j.hk'];
    }
    if (this.buffer.held('down')) {
      return normals[`cr.${button}`] ?? normals['cr.lp'];
    }
    return normals[button] ?? null;
  }

  private startMove(move: Move): void {
    const rank = moveRank(move.id);
    // Цепочка живёт, пока идут нормали; спешл её завершает.
    this.chainRank = rank === 99 ? -1 : Math.max(this.chainRank, rank);
    this.move = move;
    this.moveFrame = 0;
    this.moveHasHit = false;
    this.setState('attack');
    if (move.meterCost) this.meter -= move.meterCost;
    if (move.lunge) {
      this.vx = move.lunge.x * this.facing;
      if (move.lunge.y) this.vy = move.lunge.y;
    }
    if (move.sfx === 'special' || move.sfx === 'super') this.auraFrames = this.moveTotal;
  }

  /* ---------------------------------------------------------------- */
  /* Реакции на попадания                                              */
  /* ---------------------------------------------------------------- */

  applyHit(move: Move, damage: number, fromFacing: Facing): void {
    this.health = Math.max(0, this.health - damage);
    this.stunFrames = move.hitstun;
    this.flashFrames = 8;
    this.move = null;
    this.blocking = false;
    this.clearBuffer();
    this.chainRank = -1;
    this.vx = move.knockback.x * fromFacing;

    if (!this.grounded) this.juggleCount += 1;
    // После потолка жонглирования подброс не работает: комбо обязано закончиться.
    const canLift = this.juggleCount <= MAX_JUGGLE;
    if (move.knockback.y > 0 && canLift) this.vy = move.knockback.y;
    else if (!this.grounded) this.vy = Math.min(this.vy, 0);

    if (!this.alive) {
      this.setState('ko');
      this.vx = move.knockback.x * fromFacing * 1.6;
      this.vy = Math.max(this.vy, 0.12);
      return;
    }
    if (move.knockdown || move.launcher || !this.grounded) {
      this.setState(move.knockdown ? 'knockdown' : 'hitstun');
      if (move.launcher && this.vy <= 0 && canLift) this.vy = move.knockback.y || 0.16;
    } else {
      this.setState('hitstun');
    }
  }

  applyBlock(move: Move, chip: number, fromFacing: Facing): void {
    this.health = Math.max(0, this.health - chip);
    this.stunFrames = move.blockstun;
    this.vx = move.knockback.x * fromFacing * 0.45;
    this.setState('blockstun');
    if (!this.alive) this.setState('ko');
  }

  /* ---------------------------------------------------------------- */
  /* Физика                                                            */
  /* ---------------------------------------------------------------- */

  private applyPhysics(): void {
    this.x += this.vx;
    this.y += this.vy;

    if (!this.grounded || this.vy !== 0) {
      this.vy += GRAVITY;
      this.vx *= AIR_DRAG;
    }
    if (this.y <= GROUND_Y) {
      this.y = GROUND_Y;
      if (this.vy < 0) {
        this.vy = 0;
        // Приземление из хитстана в воздухе = падение, а не мгновенная готовность.
        if (this.state === 'hitstun') {
          this.setState('knockdown');
        } else if (this.state === 'jump') {
          this.setState('idle');
        }
      }
      this.vx *= GROUND_FRICTION;
      if (Math.abs(this.vx) < 0.002) this.vx = 0;
      if (this.state !== 'hitstun' && this.state !== 'knockdown') this.juggleCount = 0;
    }

    const limit = STAGE_HALF_WIDTH - this.halfWidth;
    if (this.x < -limit) {
      this.x = -limit;
      this.vx = Math.max(0, this.vx);
    }
    if (this.x > limit) {
      this.x = limit;
      this.vx = Math.min(0, this.vx);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Анимация                                                          */
  /* ---------------------------------------------------------------- */

  currentPose(): Pose {
    switch (this.state) {
      case 'attack': {
        const move = this.move;
        if (!move) return P.IDLE;
        return P.samplePoseClip(move.clip, this.moveFrame / Math.max(1, this.moveTotal));
      }
      case 'hitstun':
        return this.crouching ? P.HIT_LOW : P.HIT_HIGH;
      case 'blockstun':
        return this.crouchBlocking ? P.BLOCK_LOW : P.BLOCK_HIGH;
      case 'knockdown':
      case 'ko':
        return P.KNOCKDOWN;
      case 'wakeup':
        return P.lerpPose(P.KNOCKDOWN, P.CROUCH, Math.min(1, this.stateFrame / WAKEUP_FRAMES));
      case 'crouch':
        return this.blocking ? P.BLOCK_LOW : P.CROUCH;
      case 'jump':
        return this.vy > 0 ? P.JUMP_RISE : P.JUMP_FALL;
      case 'dash':
        return P.DASH;
      case 'walkF':
        return P.lerpPose(P.IDLE, P.WALK_F, this.cycle(9));
      case 'walkB':
        return P.lerpPose(P.IDLE, P.WALK_B, this.cycle(11));
      case 'victory':
        return P.lerpPose(P.VICTORY, P.IDLE_BREATH, this.cycle(40) * 0.25);
      case 'intro':
        return P.lerpPose(P.INTRO, P.IDLE, Math.min(1, this.stateFrame / 50));
      default:
        if (this.blocking) return P.BLOCK_HIGH;
        return P.lerpPose(P.IDLE, P.IDLE_BREATH, this.cycle(52));
    }
  }

  /** Плавный треугольный цикл 0..1 с заданным периодом в кадрах. */
  private cycle(period: number): number {
    return 0.5 - 0.5 * Math.cos((this.animTime / period) * Math.PI * 2);
  }
}
