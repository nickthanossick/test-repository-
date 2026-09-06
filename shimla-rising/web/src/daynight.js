import * as THREE from "three";
import { Weather } from "./weather.js";

/**
 * Din-raat ka chakkar aur badalta mausam.
 *
 * Waqt lagataar chalta hai: **1 asli second = 1 game minute**, yaani poora din
 * 24 minute mein. Khelte-khelte subah, dopahar, shaam aur raat sab aa jaate hain.
 *
 * Ek zaroori baat: `sky.setTime()` PMREM se environment map dobara banata hai,
 * jo mehnga hai. Isliye rang aur light **har frame** update hote hain par env
 * map sirf har ~15 game-minute mein -- warna frame rate gir jaata.
 */
export class DayNight {
  constructor(scene, sky, weather, opts = {}) {
    this.scene = scene;
    this.sky = sky;
    this.weather = weather;
    this.hour = opts.hour ?? 8.5;
    this.dayMinutes = opts.dayMinutes ?? 24;     // asli minute mein poora din
    this.month = opts.month ?? (new Date().getMonth() + 1);
    this.paused = false;

    this._lastEnvHour = -99;
    this._nextWeatherHour = this.hour + 2 + Math.random() * 4;
    this._emissive = { windows: null, signs: [], lamps: null, headlights: [] };

    this._buildStars();
    this._buildMoon();
    this.sky.setTime(this.hour);
  }

  /** Kitna raat hai: 0 = poora din, 1 = poori raat. */
  get nightness() {
    const t = ((this.hour - 6) / 12) * Math.PI;
    const el = Math.sin(t);
    return THREE.MathUtils.clamp((0.08 - el) / 0.26, 0, 1);
  }

  /** Jinke emissive raat ko badhne chahiye, unhe yahan de do. */
  bindEmissive({ windows, signs, lamps }) {
    if (windows) this._emissive.windows = windows;
    if (signs) this._emissive.signs = signs;
    if (lamps) this._emissive.lamps = lamps;
  }

  _buildStars() {
    const N = 1400;
    const R = this.sky.dome.geometry.parameters.radius * 0.92;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      // upper hemisphere pe hi taare -- neeche pahad hai
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(th) * s * R;
      pos[i * 3 + 1] = Math.abs(u) * R;
      pos[i * 3 + 2] = Math.sin(th) * s * R;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xffffff, size: R * 0.0022, sizeAttenuation: true,
      transparent: true, opacity: 0, depthWrite: false, fog: false,
    }));
    this.stars.renderOrder = -1;
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  _buildMoon() {
    this.moon = new THREE.DirectionalLight(0xaec4e8, 0);
    this.scene.add(this.moon, this.moon.target);
    const R = this.sky.dome.geometry.parameters.radius * 0.86;
    this.moonDisc = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.016, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xe8eef8, fog: false }),
    );
    this.moonDisc.visible = false;
    this.scene.add(this.moonDisc);
    this._moonR = R;
  }

  update(dt, camera) {
    if (!this.paused) {
      this.hour = (this.hour + dt * (24 / (this.dayMinutes * 60))) % 24;
    }

    // rang/light har frame; env map sirf kabhi-kabhi (PMREM mehnga hai)
    // 24 -> 0 wrap ka dhyan: seedha ghatane pe 23.9 se 0.1 ka farak 23.8 aata hai
    let d = Math.abs(this.hour - this._lastEnvHour);
    if (d > 12 && d < 24) d = 24 - d;
    const regen = d > 0.25;
    this.sky.setTime(this.hour, regen);
    if (regen) this._lastEnvHour = this.hour;

    const n = this.nightness;

    // --- taare aur chaand ------------------------------------------------
    this.stars.material.opacity = n * 0.9;
    if (camera) this.stars.position.copy(camera.position);
    this.moon.intensity = n * 0.42;
    const mt = ((this.hour + 12 - 6) / 12) * Math.PI;      // sooraj se ulta
    const mdir = new THREE.Vector3(Math.cos(mt), Math.max(0.1, Math.sin(mt)) * 0.9, -0.3).normalize();
    if (camera) {
      this.moon.target.position.copy(camera.position);
      this.moon.target.updateMatrixWorld();
      this.moon.position.copy(camera.position).addScaledVector(mdir, 300);
      this.moonDisc.position.copy(camera.position).addScaledVector(mdir, this._moonR);
    }
    this.moonDisc.visible = n > 0.15;

    // --- raat ki roshni --------------------------------------------------
    if (this._emissive.windows) this._emissive.windows.emissiveIntensity = n * 1.7;
    if (this._emissive.lamps) this._emissive.lamps.emissiveIntensity = n * 2.4;
    for (const m of this._emissive.signs) m.emissiveIntensity = n * 0.95;

    // --- mausam apne aap badalta hai --------------------------------------
    if (this.hour > this._nextWeatherHour
        || (this._nextWeatherHour > 24 && this.hour < 2)) {
      this._rollWeather();
    }
    this.weather.update(dt, camera);
  }

  /**
   * Agla mausam chuno -- mahine ke hisaab se.
   *
   * Shimla ka calendar: Dec-Feb barf, Jul-Sep monsoon, Mar/Nov kohra.
   * Transition jhatke se nahi hota; Weather khud values ko lerp karta hai.
   */
  _rollWeather() {
    const m = this.month;
    const weights = { clear: 5, fog: 2, monsoon: 1, snow: 1 };
    if (m === 12 || m <= 2) { weights.snow = 7; weights.fog = 4; weights.clear = 3; weights.monsoon = 0; }
    else if (m >= 7 && m <= 9) { weights.monsoon = 8; weights.fog = 3; weights.clear = 3; weights.snow = 0; }
    else if (m === 3 || m === 11) { weights.fog = 6; weights.clear = 5; weights.snow = 1; weights.monsoon = 1; }
    // subah-shaam kohre ka mauka zyada
    if (this.hour < 8 || this.hour > 18) weights.fog *= 2;

    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let pick = "clear";
    for (const [k, v] of Object.entries(weights)) { r -= v; if (r <= 0) { pick = k; break; } }

    this.weather.set(pick, 18);            // 18 second mein smooth transition
    this._nextWeatherHour = this.hour + 3 + Math.random() * 5;
  }

  /** `1` dabane pe -- 3 ghante aage. */
  skip(hours = 3) {
    this.hour = (this.hour + hours) % 24;
    this._lastEnvHour = -99;
  }

  static monthPreset(m) { return Weather.forMonth(m); }
}
