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

  // =================================================== pahadi nati (background)
  /**
   * Halka pahadi nati -- drone, reed lead aur dholak, sab WebAudio se.
   *
   * Koi sound file download nahi hoti. Is machine se har free-sound site block
   * hai (freesound, opengameart, pixabay -- sab), aur waise bhi repo ka usool
   * yahi hai ki sab kuch runtime par bane (textures bhi aise hi bante hain).
   *
   * Nati ki pehchan uski **lehar** hai: ek theka jo dohrata rahe, uske upar
   * reed ka lamba sur, aur neeche tanpura jaisa drone. Phrase pentatonic hai
   * (sa re ma pa dha) -- pahadi dhun isi par baithti hai.
   */
  startMusic() {
    if (!this.enabled || this._music) return;
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0.0;
    bus.connect(this.master);

    // --- drone: do sur, halka beating ---
    const drone = ctx.createGain();
    drone.gain.value = 0.16;
    drone.connect(bus);
    const dOsc = [];
    for (const f of [98.0, 147.0]) {          // Sa aur Pa
      for (const det of [-4, 5]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth"; o.frequency.value = f; o.detune.value = det;
        const g = ctx.createGain(); g.gain.value = 0.10;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass"; lp.frequency.value = 620;
        o.connect(g); g.connect(lp); lp.connect(drone);
        o.start();
        dOsc.push(o);
      }
    }

    // --- lead: reed jaisa sur, phrase ke hisaab se ---
    const lead = ctx.createGain();
    lead.gain.value = 0;
    const lf = ctx.createBiquadFilter();
    lf.type = "bandpass"; lf.frequency.value = 1100; lf.Q.value = 2.2;
    lead.connect(lf); lf.connect(bus);
    const lOsc = ctx.createOscillator();
    lOsc.type = "sawtooth"; lOsc.frequency.value = 392;
    lOsc.connect(lead); lOsc.start();
    // halka vibrato -- bina iske sur machine jaisa lagta hai
    const vib = ctx.createOscillator(); const vg = ctx.createGain();
    vib.frequency.value = 5.2; vg.gain.value = 4.5;
    vib.connect(vg); vg.connect(lOsc.detune); vib.start();

    // --- dholak: filtered noise ka jhonka ---
    const nb = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this._noise = nb;

    // Sa re ma pa dha -- pahadi pentatonic, do lehar
    const PHRASE = [392, 440, 523, 587, 523, 440, 392, 330,
                    392, 440, 523, 587, 659, 587, 523, 440];
    const STEP = 0.42;
    let beat = 0;
    const tick = () => {
      if (!this._music) return;
      const t = ctx.currentTime + 0.04;
      const inCar = this._inCar;
      // sur
      const f = PHRASE[beat % PHRASE.length];
      lOsc.frequency.setTargetAtTime(f, t, 0.05);
      lead.gain.cancelScheduledValues(t);
      lead.gain.setValueAtTime(lead.gain.value, t);
      lead.gain.linearRampToValueAtTime(inCar ? 0.05 : 0.10, t + 0.06);
      lead.gain.linearRampToValueAtTime(0.012, t + STEP * 0.9);
      // theka -- pehli aur teesri maatra par bhaari
      const strong = beat % 4 === 0;
      if (beat % 2 === 0 || Math.random() < 0.35) this._thump(strong);
      beat++;
      this._musicTimer = setTimeout(tick, STEP * 1000);
    };
    this._music = { bus, drone, lead, lOsc, vib, dOsc };
    this._inCar = false;
    tick();
    // dheere se aao, warna shuruaat mein jhatka lagta hai
    bus.gain.setTargetAtTime(0.55, ctx.currentTime, 2.5);
  }

  /** Dholak ki ek thaap. */
  _thump(strong) {
    if (!this.enabled || !this._noise) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = strong ? 110 : 260;
    bp.Q.value = strong ? 1.6 : 3.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(strong ? 0.28 : 0.13, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (strong ? 0.26 : 0.13));
    src.connect(bp); bp.connect(g); g.connect(this._music ? this._music.bus : this.master);
    src.start(t); src.stop(t + 0.4);
  }

  /** Gaadi mein music dheema, engine aage. */
  setInCar(on) {
    this._inCar = !!on;
    if (this._music) {
      this._music.bus.gain.setTargetAtTime(on ? 0.30 : 0.55, this.ctx.currentTime, 0.6);
      this._music.drone.gain.setTargetAtTime(on ? 0.09 : 0.16, this.ctx.currentTime, 0.6);
    }
  }

  /** Indian dual-tone horn. */
  horn(dur = 0.45, gain = 0.16) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.setValueAtTime(gain, t + dur - 0.06);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master);
    // do sur ek saath -- yahi Indian horn ki pehchan hai
    for (const f of [420, 508]) {
      const o = this.ctx.createOscillator();
      o.type = "square"; o.frequency.value = f;
      const og = this.ctx.createGain(); og.gain.value = 0.5;
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur + 0.02);
    }
  }

  /**
   * Bheed ki gungunahat -- ek bud-bud, filtered noise se.
   * @param n kitne log paas hain (0 se koi awaaz nahi)
   */
  murmur(n) {
    if (!this.enabled || !this._noise || n <= 0) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    src.playbackRate.value = 0.55 + Math.random() * 0.5;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    // aadmi ki awaaz ka formant range
    bp.frequency.value = 320 + Math.random() * 620;
    bp.Q.value = 5;
    const g = ctx.createGain();
    const vol = Math.min(0.05, 0.008 * n);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.34);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.4);
  }

  /**
   * Bolna -- browser ki apni awaaz se (Web Speech API).
   *
   * Nikhil ne gaaliyan sunai dene ko kaha tha. Sound file download nahi ho
   * sakti, par speech synthesis har browser mein pehle se hai -- koi download
   * nahi, koi API key nahi. Hindi voice mile to Hindi, warna default; voice
   * na mile to chup rehta hai aur subtitle waise bhi chalta rehta hai.
   */
  say(text, { rate = 1.0, pitch = 1.0, volume = 0.9 } = {}) {
    const synth = window.speechSynthesis;
    if (!synth || !text) return false;
    try {
      if (synth.speaking) synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices() || [];
      const hi = voices.find((v) => /^hi/i.test(v.lang))
        || voices.find((v) => /^en-IN/i.test(v.lang));
      if (hi) { u.voice = hi; u.lang = hi.lang; }
      u.rate = rate; u.pitch = pitch; u.volume = volume;
      synth.speak(u);
      return true;
    } catch {
      return false;   // kisi browser mein band ho to khel rukna nahi chahiye
    }
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
