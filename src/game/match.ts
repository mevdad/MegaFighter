import { Fighter } from './fighter';
import {
  COUNTER_DAMAGE,
  COUNTER_HITSTUN,
  comboScaling,
  isCounterHit,
  projectileRect,
  rectsOverlap,
  testHit,
  type Projectile,
} from './combat';
import {
  FPS,
  HITSTOP_HEAVY,
  HITSTOP_LIGHT,
  HITSTOP_SPECIAL,
  PUSH_RADIUS,
  ROUNDS_TO_WIN,
  ROUND_TIME,
  STAGE_HALF_WIDTH,
} from './constants';
import type { CharacterSpec, InputState, Move } from './types';

export type MatchPhase = 'intro' | 'fight' | 'ko' | 'roundEnd' | 'matchEnd';

export type GameEvent =
  | {
      type: 'hit';
      x: number;
      y: number;
      color: number;
      power: Move['sfx'];
      victim: 0 | 1;
      damage: number;
      counter: boolean;
    }
  | { type: 'throwTech'; x: number; y: number }
  | { type: 'block'; x: number; y: number; color: number; victim: 0 | 1 }
  | { type: 'whiff'; x: number; y: number; power: Move['sfx'] }
  | { type: 'projectile'; x: number; y: number; color: number }
  | { type: 'jump'; x: number }
  | { type: 'land'; x: number }
  | { type: 'ko'; loser: 0 | 1 }
  | { type: 'roundStart'; round: number }
  | { type: 'roundEnd'; winner: 0 | 1 | null }
  | { type: 'matchEnd'; winner: 0 | 1 }
  | { type: 'announce'; text: string; sub?: string };

const INTRO_FRAMES = 150;
const KO_FRAMES = 150;
const ROUND_END_FRAMES = 90;

export class Match {
  readonly fighters: [Fighter, Fighter];
  projectiles: Projectile[] = [];
  events: GameEvent[] = [];

  phase: MatchPhase = 'intro';
  phaseFrame = 0;
  round = 1;
  wins: [number, number] = [0, 0];
  timer = ROUND_TIME;
  private timerFrames = 0;

  hitstop = 0;
  shake = 0;
  /** Победитель раунда; null — двойной нокаут или время. */
  roundWinner: 0 | 1 | null = null;
  matchWinner: 0 | 1 | null = null;

  constructor(p1: CharacterSpec, p2: CharacterSpec) {
    this.fighters = [new Fighter(p1, 0), new Fighter(p2, 1)];
    this.startRound(1);
  }

  startRound(round: number): void {
    this.round = round;
    this.fighters[0].reset(-2.6, 1);
    this.fighters[1].reset(2.6, -1);
    this.projectiles = [];
    this.timer = ROUND_TIME;
    this.timerFrames = 0;
    this.phase = 'intro';
    this.phaseFrame = 0;
    this.roundWinner = null;
    this.hitstop = 0;
    this.events.push({ type: 'roundStart', round });
    this.events.push({ type: 'announce', text: `РАУНД ${round}`, sub: 'ПРИГОТОВИТЬСЯ' });
  }

  step(inputs: [InputState, InputState]): void {
    this.phaseFrame += 1;
    if (this.shake > 0) this.shake *= 0.86;

    // Хитстоп замораживает бой целиком — именно он придаёт ударам вес.
    if (this.hitstop > 0) {
      this.hitstop -= 1;
      return;
    }

    switch (this.phase) {
      case 'intro':
        this.stepIntro(inputs);
        return;
      case 'fight':
        this.stepFight(inputs);
        return;
      case 'ko':
        this.stepKo(inputs);
        return;
      case 'roundEnd':
        this.stepRoundEnd();
        return;
      case 'matchEnd':
        this.stepFrozen(inputs);
        return;
    }
  }

  private stepIntro(inputs: [InputState, InputState]): void {
    this.stepFrozen(inputs, true);
    if (this.phaseFrame >= INTRO_FRAMES) {
      this.phase = 'fight';
      this.phaseFrame = 0;
      for (const f of this.fighters) f.state = 'idle';
      this.events.push({ type: 'announce', text: 'БОЙ!' });
    }
  }

  /** Бойцы получают ввод, но не могут действовать: интро, нокаут, конец матча. */
  private stepFrozen(inputs: [InputState, InputState], keepIntro = false): void {
    this.fighters.forEach((f, i) => {
      if (!keepIntro && f.state === 'intro') f.state = 'idle';
      f.step(inputs[i], this.fighters[1 - i], true);
    });
    this.separate();
  }

  private stepFight(inputs: [InputState, InputState]): void {
    this.fighters.forEach((f, i) => f.step(inputs[i], this.fighters[1 - i], false));

    this.resolveAttacks();
    this.stepProjectiles();
    this.separate();
    this.tickTimer();

    const [a, b] = this.fighters;
    if (!a.alive || !b.alive) {
      // Проигравший — тот, у кого кончилось здоровье; двойной нокаут даёт null.
      this.enterKo(!a.alive && !b.alive ? null : !a.alive ? 0 : 1);
    }
  }

  private stepKo(inputs: [InputState, InputState]): void {
    this.stepFrozen(inputs);
    if (this.phaseFrame >= KO_FRAMES) {
      this.phase = 'roundEnd';
      this.phaseFrame = 0;
      const winner = this.roundWinner;
      if (winner !== null) {
        this.wins[winner] += 1;
        this.fighters[winner].state = 'victory';
        this.fighters[winner].stateFrame = 0;
      }
      this.events.push({ type: 'roundEnd', winner });
      if (winner !== null && this.wins[winner] >= ROUNDS_TO_WIN) {
        this.matchWinner = winner;
        this.events.push({
          type: 'announce',
          text: `${this.fighters[winner].spec.name} ПОБЕЖДАЕТ`,
          sub: this.fighters[winner].spec.finisher.name,
        });
      } else {
        this.events.push({
          type: 'announce',
          text: winner === null ? 'НИЧЬЯ' : `${this.fighters[winner].spec.name} — РАУНД`,
        });
      }
    }
  }

  private stepRoundEnd(): void {
    this.fighters.forEach((f, i) => f.step({ ...EMPTY }, this.fighters[1 - i], true));
    if (this.phaseFrame >= ROUND_END_FRAMES) {
      if (this.matchWinner !== null) {
        this.phase = 'matchEnd';
        this.phaseFrame = 0;
        this.events.push({ type: 'matchEnd', winner: this.matchWinner });
      } else {
        this.startRound(this.round + 1);
      }
    }
  }

  private enterKo(loser: 0 | 1 | null): void {
    this.phase = 'ko';
    this.phaseFrame = 0;
    this.hitstop = 16;
    this.shake = 1;
    this.roundWinner = loser === null ? null : ((1 - loser) as 0 | 1);
    if (loser !== null) this.events.push({ type: 'ko', loser });
    this.events.push({ type: 'announce', text: loser === null ? 'ДВОЙНОЙ НОКАУТ' : 'НОКАУТ' });
  }

  private tickTimer(): void {
    this.timerFrames += 1;
    if (this.timerFrames < FPS) return;
    this.timerFrames = 0;
    this.timer -= 1;
    if (this.timer > 0) return;

    // Время вышло — побеждает тот, у кого больше процент здоровья.
    const [a, b] = this.fighters;
    const ra = a.health / a.spec.stats.maxHealth;
    const rb = b.health / b.spec.stats.maxHealth;
    this.enterKo(ra === rb ? null : ra < rb ? 0 : 1);
    this.events.push({ type: 'announce', text: 'ВРЕМЯ' });
  }

  private resolveAttacks(): void {
    for (let i = 0; i < 2; i += 1) {
      const attacker = this.fighters[i];
      const defender = this.fighters[1 - i];
      const move = attacker.move;
      if (!move) continue;

      // Снаряд выпускается один раз, в первый активный кадр.
      if (move.projectile && attacker.moveFrame === move.startup && !attacker.moveHasHit) {
        attacker.moveHasHit = true;
        this.spawnProjectile(attacker.index, move, attacker);
        continue;
      }

      const result = testHit(attacker, defender);
      if (result === 'miss') continue;
      attacker.moveHasHit = true;
      this.applyResult(result, attacker, defender, move);
    }
  }

  private applyResult(result: 'hit' | 'block', attacker: Fighter, defender: Fighter, move: Move): void {
    const contactX = (attacker.x + defender.x) / 2;
    const contactY = move.hitbox.y || 1.1;
    const color = move.fx ?? attacker.spec.palette.aura;

    // Бросок можно сорвать встречным броском — расходятся оба, урона нет.
    if (move.throwable && defender.canTechThrow()) {
      attacker.vx = -attacker.facing * 0.16;
      defender.vx = attacker.facing * 0.16;
      this.hitstop = Math.max(this.hitstop, 8);
      this.events.push({ type: 'throwTech', x: contactX, y: contactY });
      return;
    }

    if (result === 'block') {
      const chip = Math.round(move.chip * defender.spec.stats.defense);
      defender.endCombo();
      defender.applyBlock(move, chip, attacker.facing);
      attacker.addMeter(move.meterGain * 0.4);
      defender.addMeter(move.meterGain * 0.6);
      this.hitstop = Math.max(this.hitstop, 4);
      this.events.push({ type: 'block', x: contactX, y: contactY, color, victim: defender.index });
      return;
    }

    const counter = isCounterHit(defender);
    const scaled =
      move.damage *
      comboScaling(defender.comboCount) *
      defender.spec.stats.defense *
      (counter ? COUNTER_DAMAGE : 1);
    const damage = Math.max(6, Math.round(scaled));
    const applied = counter ? { ...move, hitstun: move.hitstun + COUNTER_HITSTUN } : move;
    defender.applyHit(applied, damage, attacker.facing);

    defender.comboCount += 1;
    defender.comboDamage += damage;
    defender.comboShownCount = defender.comboCount;
    defender.comboShownDamage = defender.comboDamage;
    defender.comboTimer = 90;
    attacker.addMeter(move.meterGain);
    defender.addMeter(move.meterGain * 0.35);

    const stop =
      move.sfx === 'super' ? HITSTOP_SPECIAL + 4 : move.sfx === 'special' ? HITSTOP_SPECIAL : move.sfx === 'heavy' ? HITSTOP_HEAVY : HITSTOP_LIGHT;
    this.hitstop = Math.max(this.hitstop, counter ? stop + 4 : stop);
    this.shake = Math.max(this.shake, damage / 160);
    this.events.push({
      type: 'hit',
      x: contactX,
      y: contactY,
      color,
      power: move.sfx,
      victim: defender.index,
      damage,
      counter,
    });
  }

  private spawnProjectile(owner: 0 | 1, move: Move, attacker: Fighter): void {
    const spec = move.projectile;
    if (!spec) return;
    const p: Projectile = {
      owner,
      x: attacker.x + attacker.facing * 0.6,
      y: spec.y,
      vx: spec.speed * attacker.facing,
      radius: spec.radius,
      life: spec.lifetime,
      move,
      color: move.fx ?? attacker.spec.palette.aura,
      facing: attacker.facing,
      dead: false,
    };
    this.projectiles.push(p);
    this.events.push({ type: 'projectile', x: p.x, y: p.y, color: p.color });
  }

  private stepProjectiles(): void {
    for (const p of this.projectiles) {
      p.x += p.vx;
      p.life -= 1;
      if (p.life <= 0 || Math.abs(p.x) > STAGE_HALF_WIDTH + 1) p.dead = true;
    }

    // Встречные снаряды гасят друг друга — иначе зонер против зонера превращается в тупик.
    for (let i = 0; i < this.projectiles.length; i += 1) {
      for (let j = i + 1; j < this.projectiles.length; j += 1) {
        const a = this.projectiles[i];
        const b = this.projectiles[j];
        if (a.dead || b.dead || a.owner === b.owner) continue;
        if (rectsOverlap(projectileRect(a), projectileRect(b))) {
          a.dead = true;
          b.dead = true;
          this.events.push({ type: 'block', x: (a.x + b.x) / 2, y: a.y, color: a.color, victim: 0 });
        }
      }
    }

    for (const p of this.projectiles) {
      if (p.dead) continue;
      const defender = this.fighters[1 - p.owner];
      if (defender.invulnFrames > 0) continue;
      if (!rectsOverlap(projectileRect(p), defender.hurtbox)) continue;
      p.dead = true;

      const attacker = this.fighters[p.owner];
      const blocked = canBlockProjectile(defender, p.move, attacker.x);
      this.applyResult(blocked ? 'block' : 'hit', attacker, defender, p.move);
    }

    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  /** Бойцы не проходят сквозь друг друга: расталкиваем симметрично, с упором в стены. */
  private separate(): void {
    const [a, b] = this.fighters;
    const min = PUSH_RADIUS * ((a.spec.build.bulk + b.spec.build.bulk) / 2);
    const dx = b.x - a.x;
    const dist = Math.abs(dx);
    if (dist >= min || dist === 0) return;

    const push = (min - dist) / 2;
    const dir = Math.sign(dx);
    const limit = STAGE_HALF_WIDTH - 0.3;

    let ax = a.x - dir * push;
    let bx = b.x + dir * push;
    if (ax < -limit) {
      bx += -limit - ax;
      ax = -limit;
    }
    if (bx > limit) {
      ax -= bx - limit;
      bx = limit;
    }
    if (bx < -limit) {
      ax += -limit - bx;
      bx = -limit;
    }
    if (ax > limit) {
      bx -= ax - limit;
      ax = limit;
    }
    a.x = Math.max(-limit, Math.min(limit, ax));
    b.x = Math.max(-limit, Math.min(limit, bx));
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }
}

function canBlockProjectile(defender: Fighter, move: Move, attackerX: number): boolean {
  if (!defender.grounded) return false;
  if (defender.state === 'attack' || defender.state === 'hitstun' || defender.state === 'knockdown') return false;
  const awayIsLeft = attackerX > defender.x;
  const away = awayIsLeft ? defender.buffer.held('left') : defender.buffer.held('right');
  if (!away && !defender.buffer.held('block')) return false;
  const crouching = defender.buffer.held('down');
  if (move.height === 'low') return crouching;
  if (move.height === 'overhead') return !crouching;
  return true;
}

const EMPTY: InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  lp: false,
  hp: false,
  lk: false,
  hk: false,
  block: false,
};
