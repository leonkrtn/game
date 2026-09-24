/** Tiny synthesized sound effects, no audio files needed. */
class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;
  muted = false;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, when = 0, slide = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.2, freq = 3000, when = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const t = ctx.currentTime + when;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  chip(): void {
    this.noise(0.05, 0.5, 4200);
    this.tone(1800, 0.05, 'triangle', 0.08);
  }
  pickup(): void {
    this.noise(0.04, 0.35, 2800);
  }
  select(): void {
    this.tone(900, 0.05, 'triangle', 0.08);
  }
  tick(strength: number): void {
    this.noise(0.025, 0.15 + 0.35 * strength, 5000);
  }
  spin(): void {
    this.noise(0.6, 0.12, 1200);
    this.tone(220, 0.5, 'sine', 0.05, 0, 200);
  }
  land(): void {
    this.noise(0.08, 0.6, 2500);
    this.tone(160, 0.15, 'sine', 0.15);
  }
  win(big: boolean): void {
    const notes = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
    notes.forEach((n, i) => this.tone(n, 0.25, 'triangle', 0.18, i * 0.08));
  }
  lose(): void {
    this.tone(300, 0.35, 'sawtooth', 0.06, 0, -150);
  }
  line(i: number): void {
    this.tone(520 * Math.pow(2, Math.min(i, 18) / 12), 0.09, 'triangle', 0.12);
    this.noise(0.03, 0.2, 4200);
  }
  mult(i: number): void {
    this.tone(330 * Math.pow(2, Math.min(i, 18) / 12), 0.14, 'square', 0.07);
    this.tone(660 * Math.pow(2, Math.min(i, 18) / 12), 0.1, 'sine', 0.06, 0.03);
  }
  ring(): void {
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < 8; i++) this.tone(i % 2 ? 1400 : 1150, 0.045, 'square', 0.035, k * 0.5 + i * 0.05);
    }
  }
  coin(): void {
    this.tone(988, 0.08, 'square', 0.1);
    this.tone(1319, 0.25, 'square', 0.1, 0.08);
  }
  cash(): void {
    this.noise(0.1, 0.4, 3500);
    this.tone(1568, 0.1, 'triangle', 0.15, 0.05);
    this.tone(2093, 0.3, 'triangle', 0.15, 0.12);
  }
  error(): void {
    this.tone(140, 0.18, 'square', 0.08);
  }
  threat(): void {
    this.tone(82, 0.9, 'sawtooth', 0.12);
    this.tone(87, 0.9, 'sawtooth', 0.1);
  }
  caught(): void {
    this.tone(110, 1.2, 'sawtooth', 0.15, 0, -60);
    this.noise(0.3, 0.6, 400, 0.2);
  }
  /** Tape rewinding: a rising whine over hiss. */
  rewind(): void {
    this.tone(300, 0.6, 'sawtooth', 0.04, 0, 1800);
    this.noise(0.6, 0.2, 2500);
  }
}

export const sfx = new Sfx();
