/**
 * Procedural WebAudio. Koi external sound file nahi -- repo self-contained rehta hai.
 * Engine ki awaaz do oscillator (saw + square) se, RPM ke saath pitch/gain badalta hai.
 */
export class Audio {
  constructor() { this.ctx = null; this.enabled = false; }

  /** Browser autoplay policy: pehle user gesture pe hi start ho sakta hai. */
  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.16;
    this.master.connect(this.ctx.destination);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.master);

    this.osc = [];
    for (const [type, detune] of [["sawtooth", 0], ["square", -12]]) {
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = 60; o.detune.value = detune;
      const g = this.ctx.createGain();
      g.gain.value = type === "square" ? 0.35 : 1;
      o.connect(g); g.connect(this.engineGain);
      o.start();
      this.osc.push(o);
    }
    this.enabled = true;
  }

  setEngine(kmh, topKmh, active) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const rpm = Math.min(1, kmh / Math.max(1, topKmh));
    const gear = Math.floor(rpm * 4);
    const local = rpm * 4 - gear;                    // gear ke andar ka RPM
    const f = 52 + local * 95 + gear * 12;
    for (const o of this.osc) o.frequency.setTargetAtTime(f, t, 0.08);
    this.engineGain.gain.setTargetAtTime(active ? 0.10 + rpm * 0.30 : 0, t, 0.12);
  }

  blip(freq = 660, dur = 0.10, gain = 0.25) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "triangle"; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  siren(on) {
    if (!this.enabled) return;
    if (on && !this._siren) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      o.type = "sine"; o.frequency.value = 700;
      lfo.frequency.value = 1.6; lg.gain.value = 190;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.value = 0.05;
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this._siren = { o, lfo, g };
    } else if (!on && this._siren) {
      this._siren.o.stop(); this._siren.lfo.stop();
      this._siren = null;
    }
  }
}
