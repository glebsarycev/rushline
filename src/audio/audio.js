// All sound is synthesised with the Web Audio API: engine, tyres, wind,
// impacts, UI cues and a small generative menu soundtrack.

import { clamp } from '../util/math.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, sfx: 0.9, engine: 0.75, music: 0.45 };
    this.muted = false;
    this.engine = null;
    this.music = null;
  }

  // must be called from a user gesture
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.engineBus = ctx.createGain(); this.engineBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  get ready() { return !!this.ctx; }

  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.engineBus.gain.setTargetAtTime(this.vol.engine, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.05);
  }

  toggleMute() { this.muted = !this.muted; this.applyVolumes(); return this.muted; }

  _noise(loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    return s;
  }

  // ---- continuous car sounds ------------------------------------------------------
  startEngine() {
    if (!this.ctx || this.engine) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(this.engineBus);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 1.4; filter.frequency.value = 900;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve;
    shaper.connect(filter).connect(out);
    const mk = (type, gain) => {
      const o = ctx.createOscillator(); o.type = type;
      const g = ctx.createGain(); g.gain.value = gain;
      o.connect(g).connect(shaper); o.start(t);
      return { o, g };
    };
    const base = mk('sawtooth', 0.38), sub = mk('square', 0.22), high = mk('sawtooth', 0.12);
    high.o.detune.value = 8;
    const whine = ctx.createOscillator(); whine.type = 'sine';
    const whineG = ctx.createGain(); whineG.gain.value = 0;
    whine.connect(whineG).connect(out); whine.start(t);
    // tyre squeal
    const sq = this._noise(); const sqF = ctx.createBiquadFilter(); sqF.type = 'bandpass'; sqF.frequency.value = 1700; sqF.Q.value = 7;
    const sqG = ctx.createGain(); sqG.gain.value = 0; sq.connect(sqF).connect(sqG).connect(this.sfx); sq.start(t);
    // wind
    const wn = this._noise(); const wnF = ctx.createBiquadFilter(); wnF.type = 'lowpass'; wnF.frequency.value = 400;
    const wnG = ctx.createGain(); wnG.gain.value = 0; wn.connect(wnF).connect(wnG).connect(this.sfx); wn.start(t);
    // scrape
    const sc = this._noise(); const scF = ctx.createBiquadFilter(); scF.type = 'bandpass'; scF.frequency.value = 3200; scF.Q.value = 2;
    const scG = ctx.createGain(); scG.gain.value = 0; sc.connect(scF).connect(scG).connect(this.sfx); sc.start(t);
    // gravel / surface rumble
    const gr = this._noise(); const grF = ctx.createBiquadFilter(); grF.type = 'bandpass'; grF.frequency.value = 500; grF.Q.value = 0.8;
    const grG = ctx.createGain(); grG.gain.value = 0; gr.connect(grF).connect(grG).connect(this.sfx); gr.start(t);
    // boost roar
    const br = this._noise(); const brF = ctx.createBiquadFilter(); brF.type = 'bandpass'; brF.frequency.value = 900; brF.Q.value = 1.2;
    const brG = ctx.createGain(); brG.gain.value = 0; br.connect(brF).connect(brG).connect(this.sfx); br.start(t);
    out.gain.setTargetAtTime(0.9, t, 0.2);
    this.engine = { out, filter, base, sub, high, whine, whineG, sqF, sqG, wnF, wnG, scG, grG, brF, brG, nodes: [base.o, sub.o, high.o, whine, sq, wn, sc, gr, br] };
  }

  stopEngine() {
    if (!this.engine) return;
    const e = this.engine, t = this.ctx.currentTime;
    e.out.gain.setTargetAtTime(0, t, 0.08);
    for (const g of [e.sqG, e.wnG, e.scG, e.grG, e.brG]) g.gain.setTargetAtTime(0, t, 0.05);
    const nodes = e.nodes;
    setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }), 600);
    this.engine = null;
  }

  // s: { rpm, throttle, speed, skid, grounded, scrape, surfaceDust, boost }
  updateEngine(s) {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime, tc = 0.03;
    const f = (s.rpm / 60) * 3 * 0.5;
    e.base.o.frequency.setTargetAtTime(f, t, tc);
    e.sub.o.frequency.setTargetAtTime(f * 0.5, t, tc);
    e.high.o.frequency.setTargetAtTime(f * 2, t, tc);
    e.whine.frequency.setTargetAtTime(f * 4.02, t, tc);
    e.whineG.gain.setTargetAtTime(0.018 + 0.03 * s.throttle, t, tc);
    e.filter.frequency.setTargetAtTime(420 + s.throttle * 2300 + (s.rpm / 8600) * 1400, t, tc);
    e.out.gain.setTargetAtTime(0.32 + s.throttle * 0.42, t, 0.06);
    e.sqG.gain.setTargetAtTime(clamp(s.skid, 0, 1) * 0.22, t, 0.04);
    e.sqF.frequency.setTargetAtTime(1500 + clamp(s.speed / 80, 0, 1) * 700 + Math.sin(t * 13) * 60, t, 0.05);
    const w = clamp(s.speed / 110, 0, 1.4);
    e.wnG.gain.setTargetAtTime(w * w * 0.2, t, 0.1);
    e.wnF.frequency.setTargetAtTime(300 + s.speed * 9, t, 0.1);
    e.scG.gain.setTargetAtTime(clamp(s.scrape / 25, 0, 1) * 0.35, t, 0.03);
    e.grG.gain.setTargetAtTime(s.grounded ? clamp(s.surfaceDust * s.speed / 50, 0, 1) * 0.18 : 0, t, 0.06);
    e.brG.gain.setTargetAtTime(s.boost ? 0.12 + 0.06 * s.boost : 0, t, 0.08);
    e.brF.frequency.setTargetAtTime(600 + (s.boost || 0) * 500, t, 0.1);
  }

  // ---- one-shots -----------------------------------------------------------------------
  tone(freq, dur = 0.15, { type = 'sine', gain = 0.3, delay = 0, glide = 0, attack = 0.005, bus = null } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur = 0.2, { freq = 800, q = 1, gain = 0.3, type = 'bandpass', delay = 0, sweep = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = this._noise(false);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  countdown(n) { this.tone(n > 0 ? 587 : 1175, n > 0 ? 0.16 : 0.5, { type: 'square', gain: 0.12 }); }
  go() { this.tone(1175, 0.45, { type: 'square', gain: 0.12 }); this.tone(1760, 0.45, { type: 'sine', gain: 0.1 }); }

  checkpoint(better) {
    const a = better === false ? [784, 659] : [784, 1175];
    this.tone(a[0], 0.12, { type: 'triangle', gain: 0.22 });
    this.tone(a[1], 0.25, { type: 'triangle', gain: 0.22, delay: 0.09 });
    this.noise(0.25, { freq: 5000, q: 0.7, gain: 0.05, type: 'highpass' });
  }

  finish(record) {
    const notes = record ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
    notes.forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', gain: 0.18, delay: i * 0.09 }));
    if (record) notes.forEach((f, i) => this.tone(f * 2, 0.35, { type: 'sine', gain: 0.07, delay: 0.5 + i * 0.06 }));
  }

  medal() { [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.3, { type: 'sine', gain: 0.1, delay: 0.7 + i * 0.07 })); }

  boost(level) {
    this.noise(0.7, { freq: 400, q: 1.5, gain: 0.35, sweep: level > 1 ? 9 : 6 });
    this.tone(110, 0.5, { type: 'sawtooth', gain: 0.12, glide: 2.5 });
  }

  impact(strength) {
    const s = clamp(strength / 25, 0.1, 1);
    this.noise(0.18 + s * 0.25, { freq: 180 + s * 300, q: 0.8, gain: 0.25 + s * 0.45, type: 'lowpass' });
    this.tone(70, 0.2, { type: 'sine', gain: 0.25 * s, glide: 0.5 });
  }

  land(strength) {
    this.tone(90, 0.25, { type: 'sine', gain: 0.18 + strength * 0.25, glide: 0.45 });
    this.noise(0.15, { freq: 250, q: 0.8, gain: 0.12 + strength * 0.2, type: 'lowpass' });
  }

  respawn() {
    this.noise(0.35, { freq: 3000, q: 1, gain: 0.2, sweep: 0.2 });
    this.tone(880, 0.2, { type: 'sine', gain: 0.1, glide: 0.5 });
  }

  click() { this.tone(1320, 0.05, { type: 'square', gain: 0.05 }); }
  hover() { this.tone(2200, 0.03, { type: 'sine', gain: 0.025 }); }
  place() { this.tone(330, 0.08, { type: 'triangle', gain: 0.18 }); this.noise(0.08, { freq: 1200, gain: 0.08 }); }
  erase() { this.tone(220, 0.1, { type: 'triangle', gain: 0.16, glide: 0.6 }); }
  denied() { this.tone(160, 0.14, { type: 'square', gain: 0.08 }); }

  // ---- generative soundtrack (original, loops a 4-bar progression) ----------------------
  startMusic() {
    if (!this.ctx || this.music) return;
    const bpm = 118, step = 60 / bpm / 4;
    // chord roots in semitones from A2 (110 Hz): Am, F, C, G  -> minor-ish rolling progression
    const prog = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]];
    const arp = [0, 2, 1, 2, 0, 1, 2, 1];
    const hz = (semi, base = 110) => base * Math.pow(2, semi / 12);
    const m = { next: this.ctx.currentTime + 0.1, i: 0, timer: 0 };
    const tick = () => {
      if (!this.ctx) return;
      const ahead = this.ctx.currentTime + 0.25;
      while (m.next < ahead) {
        const bar = Math.floor(m.i / 16) % 4, s16 = m.i % 16;
        const chord = prog[bar];
        const t = m.next - this.ctx.currentTime;
        if (s16 % 2 === 0) this.tone(hz(chord[0] - 12), step * 1.8, { type: 'sawtooth', gain: s16 % 4 === 0 ? 0.1 : 0.06, delay: t, bus: this.musicBus });
        if (s16 % 2 === 1 || m.i % 3 === 0) this.tone(hz(chord[arp[s16 % 8]] + 12), step * 1.4, { type: 'square', gain: 0.025, delay: t, bus: this.musicBus });
        if (s16 === 0) chord.forEach((c) => this.tone(hz(c), step * 15, { type: 'triangle', gain: 0.035, delay: t, attack: 0.3, bus: this.musicBus }));
        if (s16 % 4 === 2) this._hat(t, 0.03);
        if (s16 % 8 === 0) this._kick(t);
        m.next += step;
        m.i++;
      }
    };
    m.timer = setInterval(tick, 60);
    tick();
    this.music = m;
  }

  _hat(delay, gain) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = this._noise(false);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(this.musicBus);
    s.start(t, Math.random()); s.stop(t + 0.08);
  }

  _kick(delay) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + 0.3);
  }

  stopMusic() {
    if (!this.music) return;
    clearInterval(this.music.timer);
    this.music = null;
  }
}
