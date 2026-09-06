import * as THREE from "three";

/**
 * Mausam. Shimla mein ye gameplay hai, decoration nahi.
 *
 * - `snow`   Dec-Feb. Grip 0.55 tak gir jaati hai -- Act 3 isi pe bana hai.
 * - `monsoon` Jul-Sep. Grip 0.8, visibility kam, landslide ka khatra.
 * - `fog`    Subah-shaam. Sirf visibility.
 */
const PRESETS = {
  clear:   { grip: 1.00, fogNear: 900, fogFar: 5200, particles: 0,     tint: null },
  fog:     { grip: 0.94, fogNear: 90,  fogFar: 1100, particles: 0,     tint: 0xc9d3dc },
  monsoon: { grip: 0.80, fogNear: 220, fogFar: 2300, particles: 5500,  tint: 0x8d9aa6, rain: true },
  snow:    { grip: 0.55, fogNear: 140, fogFar: 1500, particles: 4200,  tint: 0xdfe7ee },
};

export class Weather {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.mode = "clear";
    this.grip = 1;
    this.area = 320;

    const N = 6000;
    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N);
    for (let i = 0; i < N; i++) this._respawn(i, true);

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.9, sizeAttenuation: true,
      transparent: true, opacity: 0.85, depthWrite: false, fog: false,
    }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
    this.max = N;
    this.active = 0;
  }

  _respawn(i, initial = false) {
    const a = this.area;
    this.pos[i * 3] = (Math.random() * 2 - 1) * a;
    this.pos[i * 3 + 1] = initial ? Math.random() * 120 : 60 + Math.random() * 60;
    this.pos[i * 3 + 2] = (Math.random() * 2 - 1) * a;
    this.vel[i] = 0.5 + Math.random();
  }

  set(mode) {
    const p = PRESETS[mode] || PRESETS.clear;
    this.mode = mode;
    this.grip = p.grip;
    this.active = Math.min(this.max, p.particles);
    this.points.visible = this.active > 0;
    this.points.material.color.setHex(p.rain ? 0x9fb4c4 : 0xffffff);
    this.points.material.size = p.rain ? 0.45 : 1.0;
    this.points.material.opacity = p.rain ? 0.5 : 0.85;
    this.points.geometry.setDrawRange(0, this.active);

    const fog = this.scene.fog;
    if (fog) {
      fog.near = p.fogNear; fog.far = p.fogFar;
      if (p.tint) fog.color.lerp(new THREE.Color(p.tint), 0.6);
    }
    return this;
  }

  update(dt, camera) {
    if (!this.active) return;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const fall = this.mode === "snow" ? 4.5 : 26;
    const drift = this.mode === "snow" ? 2.2 : 0.5;
    const t = performance.now() / 1000;
    for (let i = 0; i < this.active; i++) {
      const j = i * 3;
      this.pos[j + 1] -= fall * this.vel[i] * dt;
      this.pos[j] += Math.sin(t + i) * drift * dt;
      // camera ke aas-paas wrap karo -- particles hamesha khiladi ke paas rahein
      if (this.pos[j + 1] + cy < this.terrain.heightAt(this.pos[j] + cx, this.pos[j + 2] + cz) - cy) {
        this._respawn(i);
      }
      if (this.pos[j + 1] < -40) this._respawn(i);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.position.set(cx, cy, cz);
  }

  /** Mahine se mausam. Shimla ka asli calendar. */
  static forMonth(m) {
    if (m === 12 || m <= 2) return "snow";
    if (m >= 7 && m <= 9) return "monsoon";
    if (m === 3 || m === 11) return "fog";
    return "clear";
  }
}
