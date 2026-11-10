import { LOW_BATTERY } from '../sim/constants';
import { gustAt, rainAt } from '../sim/hazards';
import type { World } from '../sim/world';

export type Sfx = 'select' | 'confirm' | 'collect' | 'upload' | 'touchdown' | 'crash' | 'chute' | 'warning' | 'lowbattery' | 'lob';

/** Procedural sound: rotor hum, wind and rain beds plus short synthesized effects. No audio files. */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private rotorGain: GainNode | null = null;
  private rotorA: OscillatorNode | null = null;
  private rotorB: OscillatorNode | null = null;
  private windGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private prev = { status: '', phase: '', collected: 0, score: 0, warn: false, lowAt: 0, shots: 0 };

  constructor(public muted: boolean) {}

  /** Browsers only allow audio after a user gesture: call this from a key press. */
  unlock(): void {
    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') void this.ctx.resume();
        return;
      }
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(ctx.destination);

      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      // Rotor hum: two detuned saws through a low-pass.
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      this.rotorGain = ctx.createGain();
      this.rotorGain.gain.value = 0;
      this.rotorA = ctx.createOscillator();
      this.rotorB = ctx.createOscillator();
      this.rotorA.type = 'sawtooth';
      this.rotorB.type = 'sawtooth';
      this.rotorA.connect(lp);
      this.rotorB.connect(lp);
      lp.connect(this.rotorGain);
      this.rotorGain.connect(this.master);
      this.rotorA.start();
      this.rotorB.start();

      this.windGain = this.bed(450, 'bandpass', 0.7);
      this.rainGain = this.bed(3500, 'highpass', 0.5);
    } catch {
      this.ctx = null;
    }
  }

  private bed(freq: number, type: BiquadFilterType, q: number): GainNode | null {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return null;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    return gain;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  /** Update continuous beds and fire one-shot effects from state changes. `active` is false in menus. */
  update(w: World | null, active: boolean): void {
    const { ctx } = this;
    if (!ctx || !this.rotorGain || !this.rotorA || !this.rotorB || !this.windGain || !this.rainGain) return;
    const now = ctx.currentTime;
    if (!w || !active) {
      this.rotorGain.gain.setTargetAtTime(0, now, 0.1);
      this.windGain.gain.setTargetAtTime(0, now, 0.1);
      this.rainGain.gain.setTargetAtTime(0, now, 0.1);
      return;
    }
    const c = w.craft;
    const alive = w.status !== 'crashed';
    const weather = !w.intro || w.landing !== null;
    const gust = weather ? gustAt(w.level.gust, w.time) : gustAt(null, 0);
    const rain = weather ? rainAt(w.level.zones, c.x, w.time) : 0;

    const base = 36 + c.throttle * 60;
    this.rotorA.frequency.setTargetAtTime(base, now, 0.05);
    this.rotorB.frequency.setTargetAtTime(base * 1.51, now, 0.05);
    this.rotorGain.gain.setTargetAtTime(alive ? 0.01 + c.throttle * 0.07 : 0, now, 0.08);
    const chute = w.phase === 'chute' ? 0.1 : 0;
    this.windGain.gain.setTargetAtTime(alive ? chute + gust.blow * 0.25 + Math.min(1, Math.abs(c.vx) / 70) * 0.06 : 0, now, 0.15);
    this.rainGain.gain.setTargetAtTime(alive ? rain * 0.14 : 0, now, 0.3);

    // One-shot effects from state transitions.
    const p = this.prev;
    if (p.status === 'flying' && w.status === 'landed') this.sfx('touchdown');
    if (p.status !== 'crashed' && w.status === 'crashed') this.sfx('crash');
    if (p.phase === 'chute' && w.phase === 'spinup') this.sfx('chute');
    const collected = w.science.targets.filter((t) => t.collected).length;
    if (collected > p.collected) this.sfx('collect');
    if (w.science.score > p.score) this.sfx('upload');
    // A thump when a vent near you fires.
    const shots = w.ventShots.reduce((a, b2) => a + b2, 0);
    if (shots > p.shots && w.obstacles.vents.some((v) => Math.abs(v.x - c.x) < 260)) this.sfx('lob');
    const warn = gust.warn > 0;
    if (warn && !p.warn) this.sfx('warning');
    if (w.status === 'flying' && w.phase === 'flight' && w.battery < LOW_BATTERY && now > p.lowAt) {
      this.sfx('lowbattery');
      p.lowAt = now + 1.2;
    }
    p.status = w.status;
    p.phase = w.phase;
    p.collected = collected;
    p.score = w.science.score;
    p.shots = w.ventShots.reduce((a, b2) => a + b2, 0);
    p.warn = warn;
  }

  /** Forget the previous state, e.g. when a new world starts, so old values don't fire effects. */
  reset(): void {
    this.prev = { status: '', phase: '', collected: 0, score: 0, warn: false, lowAt: 0, shots: 0 };
  }

  sfx(name: Sfx): void {
    const { ctx } = this;
    if (!ctx || this.muted) return;
    switch (name) {
      case 'select':
        this.tone(520, 0.05, 'square', 0.05);
        break;
      case 'confirm':
        this.tone(520, 0.07, 'square', 0.06);
        this.tone(780, 0.1, 'square', 0.06, 0.07);
        break;
      case 'collect':
        [660, 880, 1100].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.09, i * 0.08));
        break;
      case 'upload':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.09, i * 0.09));
        break;
      case 'touchdown':
        this.tone(95, 0.18, 'sine', 0.2, 0, 45);
        break;
      case 'crash':
        this.burst(0.7, 0.35, 1200);
        this.tone(140, 0.6, 'sawtooth', 0.18, 0, 35);
        break;
      case 'chute':
        this.burst(0.5, 0.18, 800);
        break;
      case 'warning':
        [0, 0.14, 0.28].forEach((d) => this.tone(740, 0.08, 'square', 0.05, d));
        break;
      case 'lob':
        this.tone(120, 0.18, 'sine', 0.16, 0, 55);
        this.burst(0.2, 0.12, 700);
        break;
      case 'lowbattery':
        this.tone(880, 0.1, 'square', 0.05);
        break;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private burst(dur: number, vol: number, cutoff: number): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t0);
    filter.frequency.exponentialRampToValueAtTime(120, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }
}
