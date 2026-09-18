import { FRAME_MS, MAX_CATCHUP_FRAMES } from '../game/constants';

/**
 * Фиксированный шаг симуляции + свободный рендер.
 * Логика боя обязана идти ровно 60 раз в секунду, иначе фрейм-дата перестаёт что-либо значить,
 * а на 120-герцовом телефоне игра поедет вдвое быстрее.
 */
export class GameLoop {
  private raf = 0;
  private accumulator = 0;
  private last = 0;
  private running = false;

  constructor(
    private readonly step: () => void,
    private readonly draw: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    const delta = Math.min(now - this.last, 250);
    this.last = now;
    this.accumulator += delta;

    let frames = 0;
    while (this.accumulator >= FRAME_MS && frames < MAX_CATCHUP_FRAMES) {
      this.step();
      this.accumulator -= FRAME_MS;
      frames += 1;
    }
    // Вкладка была свёрнута или устройство подвисло — не догоняем часами, просто сбрасываем долг.
    if (this.accumulator > FRAME_MS * MAX_CATCHUP_FRAMES) this.accumulator = 0;

    this.draw(this.accumulator / FRAME_MS);
  };
}
