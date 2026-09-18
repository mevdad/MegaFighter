export type Sfx =
  | 'light'
  | 'heavy'
  | 'kick'
  | 'special'
  | 'super'
  | 'block'
  | 'whoosh'
  | 'jump'
  | 'land'
  | 'ko'
  | 'ui'
  | 'announce';

/**
 * Весь звук синтезируется в WebAudio: ни одного файла, ноль загрузки, ~5 КБ кода.
 * AudioContext создаётся лениво — браузеры не дают запускать его до жеста пользователя.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private musicTimer = 0;
  private musicStep = 0;
  private musicOn = false;

  muted = false;

  /** Вызывать из обработчика клика/тача, иначе контекст останется suspended. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.0;
      this.musicGain.connect(this.master);
      this.noiseBuffer = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(on ? 0.26 : 0, this.ctx.currentTime, 0.3);
    }
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    sweepTo?: number,
    dest?: AudioNode,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (sweepTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), ctx.currentTime + duration);
    env.gain.setValueAtTime(0.0001, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(env);
    env.connect(dest ?? this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  private noise(duration: number, gain: number, filterFreq: number, q = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    src.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    src.start();
    src.stop(ctx.currentTime + duration);
  }

  play(sfx: Sfx): void {
    if (this.muted || !this.ctx) return;
    switch (sfx) {
      case 'light':
        this.noise(0.09, 0.5, 1800, 1.2);
        this.tone(320, 0.08, 'square', 0.12, 160);
        break;
      case 'heavy':
        this.noise(0.18, 0.75, 900, 0.9);
        this.tone(140, 0.2, 'sawtooth', 0.28, 50);
        break;
      case 'kick':
        this.noise(0.14, 0.6, 1300, 1.0);
        this.tone(200, 0.15, 'triangle', 0.22, 70);
        break;
      case 'special':
        this.tone(660, 0.34, 'sawtooth', 0.22, 160);
        this.tone(330, 0.36, 'square', 0.14, 90);
        this.noise(0.24, 0.4, 2400, 2);
        break;
      case 'super':
        this.tone(220, 0.7, 'sawtooth', 0.3, 1100);
        this.tone(110, 0.8, 'square', 0.2, 55);
        this.noise(0.5, 0.5, 900, 0.7);
        break;
      case 'block':
        this.noise(0.1, 0.45, 3600, 3);
        this.tone(900, 0.07, 'square', 0.1, 600);
        break;
      case 'whoosh':
        this.noise(0.16, 0.18, 700, 0.6);
        break;
      case 'jump':
        this.tone(300, 0.12, 'sine', 0.12, 620);
        break;
      case 'land':
        this.noise(0.12, 0.3, 300, 0.8);
        break;
      case 'ko':
        this.tone(90, 1.1, 'sawtooth', 0.34, 36);
        this.noise(0.8, 0.5, 500, 0.5);
        break;
      case 'ui':
        this.tone(760, 0.07, 'square', 0.14, 980);
        break;
      case 'announce':
        this.tone(520, 0.24, 'triangle', 0.2, 780);
        this.tone(780, 0.3, 'triangle', 0.12, 1040);
        break;
    }
  }

  /**
   * Минималистичный трек: бас по нотам лада, бочка и хэт.
   * Шагает от игрового цикла, отдельного таймера не нужно.
   */
  tickMusic(): void {
    if (!this.musicOn || !this.ctx || !this.musicGain || this.muted) return;
    this.musicTimer -= 1;
    if (this.musicTimer > 0) return;
    this.musicTimer = 14; // ~ 257 BPM в шестнадцатых = 64 такта в минуту по четвертям

    const step = this.musicStep % 16;
    this.musicStep += 1;

    const bassNotes = [55, 55, 65.4, 55, 49, 55, 73.4, 55];
    if (step % 2 === 0) {
      this.tone(bassNotes[(step / 2) % bassNotes.length], 0.22, 'sawtooth', 0.18, undefined, this.musicGain);
    }
    if (step === 0 || step === 6 || step === 10) {
      this.tone(58, 0.16, 'sine', 0.4, 30, this.musicGain);
    }
    if (step % 4 === 2) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 7000;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.12, ctx.currentTime);
      env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
      src.connect(filter);
      filter.connect(env);
      env.connect(this.musicGain);
      src.start();
      src.stop(ctx.currentTime + 0.06);
    }
  }
}

export const audio = new AudioEngine();
