/** Tiny synthesized sound effects, no audio files needed. */
class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;
  private mutedFlag = false;

  get muted(): boolean {
    return this.mutedFlag;
  }

  set muted(v: boolean) {
    this.mutedFlag = v;
    this.duckMusic(this.duck);
  }

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    if (this.musicOn) this.startMusic();
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
  // ---- Music: a dark synthwave loop, generated live ---------------------------------------

  private music?: GainNode;
  private musicOn = true;
  private musicTimer?: number;
  private nextNote = 0;
  private step16 = 0;
  private wow?: OscillatorNode;
  private wowGain?: GainNode;
  private echo?: DelayNode;
  /** 0..1: how far the music is pulled back (e.g. while the ball rolls). */
  private duck = 0;

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  /** Pulls the music back while something tense happens (0 = full, 1 = almost silent). */
  duckMusic(amount: number): void {
    this.duck = amount;
    const ctx = this.ctx;
    if (ctx && this.music) this.music.gain.setTargetAtTime(this.musicLevel(), ctx.currentTime, 0.4);
  }

  private musicLevel(): number {
    return this.muted || !this.musicOn ? 0 : 0.16 * (1 - this.duck * 0.8);
  }

  private startMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.musicTimer !== undefined) return;
    if (!this.music) {
      this.music = ctx.createGain();
      this.music.gain.value = 0;
      this.music.connect(this.master);
      // Tape wow: a slow pitch wobble on every voice, like a worn cassette.
      this.wow = ctx.createOscillator();
      this.wow.frequency.value = 0.35;
      this.wowGain = ctx.createGain();
      this.wowGain.gain.value = 7;
      this.wow.connect(this.wowGain);
      this.wow.start();
      // A dark echo for the arpeggio.
      this.echo = ctx.createDelay(1);
      this.echo.delayTime.value = (60 / 84) * 0.75;
      const fb = ctx.createGain();
      fb.gain.value = 0.38;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 1800;
      this.echo.connect(tone).connect(fb).connect(this.echo);
      tone.connect(this.music);
    }
    this.music.gain.setTargetAtTime(this.musicLevel(), ctx.currentTime, 1.5);
    this.nextNote = ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.schedule(), 60);
  }

  private stopMusic(): void {
    if (this.musicTimer !== undefined) window.clearInterval(this.musicTimer);
    this.musicTimer = undefined;
    const ctx = this.ctx;
    if (ctx && this.music) this.music.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  }

  /** Schedules the next notes a little ahead of time (Web Audio clock). */
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.music) return;
    if (this.music.gain.value < 0.0005 && this.musicLevel() === 0) {
      this.nextNote = ctx.currentTime + 0.1;
      return;
    }
    const sixteenth = 60 / 84 / 4;
    // Am – F – Dm – E, one bar each (MIDI notes).
    const chords = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]];
    const roots = [45, 41, 38, 40];
    while (this.nextNote < ctx.currentTime + 0.25) {
      const t = this.nextNote;
      const s = this.step16 % 16;
      const bar = Math.floor(this.step16 / 16) % 4;
      const chord = chords[bar];
      // Bass: driving eighths, octave jump on the offbeat.
      if (s % 2 === 0) this.voice(midi(roots[bar] - 12 + (s % 4 === 2 ? 12 : 0)), t, sixteenth * 1.8, 'sawtooth', 0.22, 420);
      // Pad: the whole chord, swelling in at the start of each bar.
      if (s === 0) for (const n of chord) this.voice(midi(n - 12), t, sixteenth * 16, 'sawtooth', 0.05, 900, 0.8);
      // Arpeggio into the echo.
      if (bar % 2 === 1 || this.step16 > 64) {
        const n = chord[[0, 1, 2, 1][s % 4]] + (s >= 8 ? 12 : 0);
        this.voice(midi(n), t, sixteenth * 0.9, 'square', 0.035, 2400, 0, true);
      }
      // Drums: kick on 1 and 3, snare on 2 and 4, quiet hats.
      if (s === 0 || s === 8) this.kick(t);
      if (s === 4 || s === 12) this.snare(t);
      if (s % 2 === 1) this.hat(t);
      this.nextNote += sixteenth;
      this.step16 = (this.step16 + 1) % 128;
    }
  }

  private voice(freq: number, t: number, dur: number, type: OscillatorType, vol: number, cutoff: number, attack = 0.005, echo = false): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = (Math.random() - 0.5) * 8;
    this.wowGain?.connect(o.detune);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.max(0.005, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.music!);
    if (echo && this.echo) g.connect(this.echo);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.music!);
    o.start(t);
    o.stop(t + 0.4);
  }

  private snare(t: number): void {
    this.noiseTo(this.music!, t, 0.22, 0.18, 1800);
  }

  private hat(t: number): void {
    this.noiseTo(this.music!, t, 0.04, 0.035, 8000);
  }

  private noiseTo(out: AudioNode, t: number, dur: number, vol: number, freq: number): void {
    const ctx = this.ctx!;
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
    src.connect(f).connect(g).connect(out);
    src.start(t);
  }

  /** A heartbeat for tense moments. */
  heartbeat(): void {
    this.tone(55, 0.16, 'sine', 0.35);
    this.tone(50, 0.18, 'sine', 0.28, 0.2);
  }

  /** A footstep on carpet: a soft, low thud. */
  step(): void {
    this.noise(0.07, 0.05, 260 + Math.random() * 80);
  }
  /** Tape rewinding: a rising whine over hiss. */
  rewind(): void {
    this.tone(300, 0.6, 'sawtooth', 0.04, 0, 1800);
    this.noise(0.6, 0.2, 2500);
  }
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export const sfx = new Sfx();
