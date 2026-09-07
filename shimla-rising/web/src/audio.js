import { toDevanagari } from "./translit.js";

/**
 * Procedural WebAudio. Koi external sound file nahi -- repo self-contained rehta hai.
 * Engine ki awaaz do oscillator (saw + square) se, RPM ke saath pitch/gain badalta hai.
 */

/**
 * Nikhil: *"game ki sound b thodi jyda rkhni h"* -- 0.16 se shuru hua tha,
 * ek round 0.34 par, aur *"music thoda increase kr"* ke baad yahan.
 */
export const DEFAULT_VOLUME = 0.46;

export class Audio {
  constructor(opts = {}) {
    this.ctx = null;
    this.enabled = false;
    this.volume = clamp01(opts.volume ?? DEFAULT_VOLUME);
    this.muted = !!opts.muted;
    this.voiceName = opts.voice || null;      // khiladi ki chuni hui awaaz
    this._amb = null;
    this._birdT = 3; this._bellT = 60; this._barkT = 25;
    this.onVolume = () => {};                 // HUD isse padhta hai
  }

  // ------------------------------------------------------------ volume
  /** 0..1. Save mein yaad rehta hai. */
  setVolume(v) {
    this.volume = clamp01(v);
    this.muted = false;
    this._applyVolume();
    this.onVolume(this.volume, this.muted);
    return this.volume;
  }

  /** `,` aur `.` se ghatao-badhao. */
  nudge(d) { return this.setVolume(this.volume + d); }

  toggleMute() {
    this.muted = !this.muted;
    this._applyVolume();
    if (this.muted && window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
    this.onVolume(this.volume, this.muted);
    return this.muted;
  }

  _applyVolume() {
    if (!this.master) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.06);
  }

  /** Browser autoplay policy: pehle user gesture pe hi start ho sakta hai. */
  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
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
    // Ek hi shor ka buffer sab jagah: dholak, bheed, hawa, chidiya, kutta.
    // Pehle ye sirf `startMusic()` mein banta tha, isliye music band hone par
    // baaki sab bhi chup ho jaata tha.
    const nb = this.ctx.createBuffer(1, this.ctx.sampleRate * 1.0, this.ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this._noise = nb;

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
    drone.gain.value = 0.22;
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
      lead.gain.linearRampToValueAtTime(inCar ? 0.08 : 0.15, t + 0.06);
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
    // dheere se aao, warna shuruaat mein jhatka lagta hai.
    // Nikhil: "music thoda increase kr" -- 0.55 se 0.85.
    bus.gain.setTargetAtTime(0.85, ctx.currentTime, 2.5);
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
      this._music.bus.gain.setTargetAtTime(on ? 0.48 : 0.85, this.ctx.currentTime, 0.6);
      this._music.drone.gain.setTargetAtTime(on ? 0.13 : 0.22, this.ctx.currentTime, 0.6);
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

  // ==================================================== Shimla ki apni awaaz
  /**
   * Aas-paas ka mahaul -- deodar mein hawa, chidiya, door mandir ki ghanti,
   * raat ko kutte.
   *
   * Nikhil: *"game ki sound b thodi jyda rkhni h shimla vibe type"*. Sirf
   * volume badhane se music tez hota hai, Shimla nahi lagta. Shimla ki
   * pehchan uska **khaali-pan** hai: hawa deodar se guzarti hai, subah
   * chidiyan, aur beech-beech mein bahut door se ghanti.
   *
   * Sab wahi ek noise buffer + filter se. Koi file download nahi.
   */
  startAmbience() {
    if (!this.enabled || this._amb) return;
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.master);

    // hawa: ek lagatar chalta hua noise, lowpass ke saath -- deodar ki sarsarahat
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 420; lp.Q.value = 0.6;
    const wind = ctx.createGain();
    wind.gain.value = 0.09;
    // jhonka: bahut dheemi lehar, warna hawa pankhe jaisi lagti hai
    const gust = ctx.createOscillator();
    const gg = ctx.createGain();
    gust.frequency.value = 0.07; gg.gain.value = 0.055;
    gust.connect(gg); gg.connect(wind.gain);
    src.connect(lp); lp.connect(wind); wind.connect(bus);
    src.start(); gust.start();

    this._amb = { bus, src, wind, gust, lp };
    bus.gain.setTargetAtTime(1.0, ctx.currentTime, 3.0);
  }

  /**
   * Ghadi ke hisaab se mahaul. Har frame bulaya jaata hai.
   * @param ctxInfo {hour, inCar}
   */
  updateAmbience(dt, { hour = 12, inCar = false } = {}) {
    if (!this.enabled || !this._amb) return;
    // gaadi ke andar bahar ka shor dab jaata hai
    this._amb.bus.gain.setTargetAtTime(inCar ? 0.30 : 1.0, this.ctx.currentTime, 0.8);
    // raat ko hawa thodi thandi/patli lagti hai
    this._amb.lp.frequency.setTargetAtTime(hour > 19 || hour < 6 ? 300 : 460,
                                           this.ctx.currentTime, 2.0);

    const day = hour >= 5.2 && hour <= 19.2;
    const dawn = hour >= 5.2 && hour <= 8.6;
    const dusk = hour >= 16.5 && hour <= 19.2;

    this._birdT -= dt;
    if (this._birdT <= 0) {
      this._birdT = day ? (dawn || dusk ? 1.4 : 4.5) * (0.5 + Math.random()) : 30;
      if (day && !inCar) this.bird();
    }

    this._bellT -= dt;
    if (this._bellT <= 0) {
      this._bellT = 75 + Math.random() * 120;
      // aarti ka waqt -- subah aur shaam
      if ((hour >= 6 && hour <= 8) || (hour >= 18 && hour <= 20)) this.bell();
    }

    this._barkT -= dt;
    if (this._barkT <= 0) {
      this._barkT = 22 + Math.random() * 50;
      if (!day && !inCar) this.bark();
    }
  }

  /** Chidiya ki ek chahchahat -- do-teen tez sur. */
  bird() {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const n = 2 + ((Math.random() * 3) | 0);
    const base = 2400 + Math.random() * 1600;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.07 + Math.random() * 0.06);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.35), t);
      o.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.05);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g); g.connect(this._amb ? this._amb.bus : this.master);
      o.start(t); o.stop(t + 0.12);
    }
  }

  /**
   * Door mandir ki ghanti (Jakhoo/Sankat Mochan).
   *
   * Ghanti ke sur aapas mein poore nahi baithte -- yahi use dhaatu ki awaaz
   * deta hai. Isliye partials jaan-boojh kar be-mel hain.
   */
  bell() {
    const ctx = this.ctx, t = ctx.currentTime;
    const f0 = 520 + Math.random() * 60;
    const out = ctx.createGain();
    out.gain.value = 0.055;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 2600;     // door se aa rahi hai
    out.connect(lp); lp.connect(this._amb ? this._amb.bus : this.master);
    for (const [mult, amp, dur] of [[1, 1, 3.4], [2.06, 0.5, 2.4],
                                    [2.71, 0.32, 1.8], [3.94, 0.2, 1.2]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f0 * mult;
      g.gain.setValueAtTime(amp * 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }

  /** Gali ka kutta -- do-teen bhaunk. */
  bark() {
    if (!this._noise) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const n = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.24 + Math.random() * 0.12);
      const src = ctx.createBufferSource();
      src.buffer = this._noise;
      src.playbackRate.value = 0.5 + Math.random() * 0.3;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 380 + Math.random() * 180; bp.Q.value = 3.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0004, t + 0.16);
      src.connect(bp); bp.connect(g); g.connect(this._amb ? this._amb.bus : this.master);
      src.start(t); src.stop(t + 0.3);
    }
  }

  // ============================================================== bolna
  /**
   * Bolna -- browser ki apni awaaz se (Web Speech API).
   *
   * Sound file download nahi ho sakti (is machine se har free-sound host aur
   * har TTS API block hai), par speech synthesis har browser mein pehle se
   * hai -- koi download nahi, koi API key nahi.
   *
   * Nikhil: *"jo voices tune di h wo ajeeb lgri"*. Uski asli wajah lipi thi:
   * hum roman Hinglish (`"dekh ke chal"`) ek angrezi awaaz ko de rahe the aur
   * wo use angrezi ki tarah padh rahi thi. Ab teen cheezein badli hain:
   *
   *   1. line pehle **Devanagari** mein badalti hai (`translit.js`)
   *   2. voice `hi-IN` pehle, phir `en-IN`, phir default
   *   3. khiladi `V` se apni pasand ki awaaz chun sakta hai (save ho jaati hai)
   *
   * **Pahadi lehja kisi TTS engine mein nahi hota** -- Hindi mil jaati hai,
   * lehja nahi. Ye saaf keh dena zaroori hai.
   */
  say(text, { rate = 1.0, pitch = 1.0, volume = 0.9, gender = "male" } = {}) {
    const synth = window.speechSynthesis;
    if (!synth || !text || this.muted) return false;
    try {
      if (synth.speaking) synth.cancel();
      const u = new SpeechSynthesisUtterance(toDevanagari(text));
      const v = this.pickVoice(gender);
      if (v) { u.voice = v; u.lang = v.lang; }
      else u.lang = "hi-IN";
      u.rate = rate;
      u.pitch = Math.max(0.1, Math.min(2, pitch));
      u.volume = Math.min(1, volume * (0.55 + this.volume));
      synth.speak(u);
      return true;
    } catch {
      return false;   // kisi browser mein band ho to khel rukna nahi chahiye
    }
  }

  /** Sab maujood awaazein -- Hindi/Indian pehle, mard ki awaaz upar. */
  voices() {
    const all = window.speechSynthesis?.getVoices?.() || [];
    return [...all].sort((a, b) => score(b, "male") - score(a, "male"));
  }

  /**
   * Kaunsi awaaz bole.
   *
   * Nikhil: *"ladke ki awaj ho vicky ki"*. Pehle sirf `lang` dekha jaata tha,
   * isliye jis machine par pehli Hindi voice aurat ki thi -- aur wahi aam
   * baat hai -- Vicky bhi usi mein bolta tha.
   *
   * Web Speech API `gender` batati hi nahi. Jo mil sakta hai wo hai **naam**:
   * har platform ki Hindi/Indian awaazon ke naam gine-chune hain (Madhur,
   * Hemant, Ravi, Prabhat mard; Swara, Kalpana, Heera, Neerja aurat). Isliye
   * naam se score lagta hai. Khiladi `V` se apni pasand chun le to wahi
   * sabse upar rehti hai -- ye sirf uski gair-maujoodgi mein chalta hai.
   */
  pickVoice(gender = "male") {
    const all = window.speechSynthesis?.getVoices?.() || [];
    if (!all.length) return null;
    if (this.voiceName) {
      const chosen = all.find((v) => v.name === this.voiceName);
      if (chosen) return chosen;
    }
    let best = null, bs = -Infinity;
    for (const v of all) {
      const sc = score(v, gender);
      if (sc > bs) { bs = sc; best = v; }
    }
    return best;
  }

  /** `V` -- agli awaaz. Naam lautata hai taaki HUD dikha sake. */
  cycleVoice() {
    const list = this.voices();
    if (!list.length) return null;
    const cur = this.pickVoice();
    const i = cur ? list.findIndex((v) => v.name === cur.name) : -1;
    const next = list[(i + 1) % list.length];
    this.voiceName = next.name;
    return next;
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

/** Jaane-pehchane Indian TTS naam -- yahi ek ishaara hai jo API deti hi nahi. */
const MALE_NAMES = /(madhur|hemant|ravi|prabhat|kunal|arjun|pankaj|rishi|gagan|niranjan|\bmale\b)/i;
const FEMALE_NAMES = /(swara|kalpana|heera|neerja|aditi|lekha|priya|isha|veena|sangeeta|shruti|\bfemale\b)/i;

/**
 * Awaaz kitni theek baithti hai -- pehle zubaan, phir naam se lingg ka andaza.
 *
 * `SpeechSynthesisVoice` mein gender ka koi field hai hi nahi; jo mil sakta
 * hai wo sirf naam hai, aur har platform ki Indian awaazon ke naam gine-chune
 * hain. Isliye ye ek andaza hai, guarantee nahi -- aur isiliye `V` se khiladi
 * khud chun sakta hai.
 */
function score(v, gender = "male") {
  let s = 0;
  if (/^hi/i.test(v.lang)) s += 100;
  else if (/^en-IN/i.test(v.lang)) s += 60;
  else if (/^(bn|mr|ta|te|gu|pa|ur)/i.test(v.lang)) s += 25;
  else if (/^en/i.test(v.lang)) s += 8;
  const male = MALE_NAMES.test(v.name), female = FEMALE_NAMES.test(v.name);
  if (gender === "female") { if (female) s += 40; if (male) s -= 40; }
  else { if (male) s += 40; if (female) s -= 40; }
  if (v.localService) s += 4;   // local awaaz turant bolti hai, network wali ruk-ruk kar
  return s;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
