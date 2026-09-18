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
import type { CharacterSpec, Facing, InputState, Move, Pose, SpecialMove } from './types';

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

  blocking = false;
  crouchBlocking = false;

  comboCount = 0;
  comboDamage = 0;
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
    this.comboTimer = 0;
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
    if (this.flashFrames > 0) this.flashFrames -= 1;
    if (this.auraFrames > 0) this.auraFrames -= 1;
    if (this.comboTimer > 0) {
      this.comboTimer -= 1;
      if (this.comboTimer === 0) {
        this.comboCount = 0;
        this.comboDamage = 0;
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
      this.setState(this.grounded ? 'idle' : 'jump');
    }
  }

  private stunFrames = 0;

  private stepKnockdown(): void {
    if (this.grounded && this.stateFrame >= KNOCKDOWN_FRAMES) {
      this.setState('wakeup');
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
      this.setState(this.grounded ? 'idle' : 'jump');
      return;
    }
    // Отмена нормали в спешл: окно открывается с активных кадров и держится до конца приёма.
    if (
      !controlsLocked &&
      move.cancelable &&
      !this.cancelUsed &&
      this.moveHasHit &&
      this.moveFrame >= move.startup
    ) {
      const special = this.findSpecial();
      if (special) {
        this.cancelUsed = true;
        this.startMove(special);
      }
    }
  }

  private stepFree(): void {
    const b = this.buffer;
    const forward = this.facing === 1 ? 'right' : 'left';
    const back = this.facing === 1 ? 'left' : 'right';

    // 1. Спешлы и супер — приоритет выше нормалей, иначе мотион съедается джебом.
    const special = this.findSpecial();
    if (special) {
      this.startMove(special);
      return;
    }

    // 2. Нормали.
    const normal = this.findNormal();
    if (normal) {
      this.startMove(normal);
      return;
    }

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

  private findNormal(): Move | null {
    const b = this.buffer;
    const air = !this.grounded;
    const crouch = b.held('down');
    const pressed = (['hp', 'hk', 'lp', 'lk'] as const).find((key) => b.pressed(key));
    if (!pressed) return null;

    const normals = this.spec.normals;
    if (air) {
      if (pressed === 'lp' || pressed === 'hp') return normals['j.lp'];
      return normals['j.hk'];
    }
    if (crouch) {
      const key = `cr.${pressed}`;
      return normals[key] ?? normals[`cr.${pressed === 'hp' ? 'hp' : 'lp'}`] ?? normals['cr.lp'];
    }
    return normals[pressed];
  }

  private startMove(move: Move): void {
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
    this.vx = move.knockback.x * fromFacing;
    if (move.knockback.y > 0) this.vy = move.knockback.y;

    if (!this.alive) {
      this.setState('ko');
      this.vx = move.knockback.x * fromFacing * 1.6;
      this.vy = Math.max(this.vy, 0.12);
      return;
    }
    if (move.knockdown || move.launcher || !this.grounded) {
      this.setState(move.knockdown ? 'knockdown' : 'hitstun');
      if (move.launcher && this.vy <= 0) this.vy = move.knockback.y || 0.16;
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
