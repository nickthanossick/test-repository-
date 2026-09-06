import * as THREE from "three";

/**
 * Arcade gaadi.
 *
 * Ye rigid-body simulation nahi hai -- jaan-boojh kar. Shimla ki sadak matlab
 * lagatar hairpin, 15% grade, aur 6 m chaudi gali. Ek proper raycast-suspension
 * sim yahan zyaadatar ulat jaata ya atak jaata. Iske bajaye: heading + speed
 * integrate karte hain, gaadi ko terrain pe chipka dete hain, aur dhalan ko
 * seedha throttle/brake mein feed karte hain. Chalane mein mazaa aata hai aur
 * kabhi phansti nahi.
 */
export class Vehicle {
  constructor(spec, terrain, opts = {}) {
    this.spec = spec;
    this.terrain = terrain;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;          // m/s, forward
    this.slip = 0;           // lateral velocity, m/s
    this.steer = 0;
    this.isPolice = !!opts.police;
    this.topSpeed = (spec.top_speed_kmh / 3.6);
    this.mesh = buildBody(spec);
    this.mesh.userData.vehicle = this;
  }

  get kmh() { return Math.abs(this.speed) * 3.6; }

  placeAt(x, z, yaw = 0) {
    this.pos.set(x, this.terrain.heightAt(x, z), z);
    this.yaw = yaw;
    this.speed = 0; this.slip = 0;
    this.syncMesh();
    return this;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /**
   * @param ctl {throttle:-1..1, steer:-1..1, handbrake:bool}
   * @param grip 0..1 -- weather se (barf pe kam)
   */
  update(dt, ctl, grip = 1) {
    const s = this.spec;
    const g = s.grip * grip;

    // --- dhalan: Shimla mein yahi sab kuch decide karta hai --------------
    const f = this.forward(_f);
    const ahead = 3;
    const hHere = this.terrain.heightAt(this.pos.x, this.pos.z);
    const hAhead = this.terrain.heightAt(this.pos.x + f.x * ahead, this.pos.z + f.z * ahead);
    const grade = (hAhead - hHere) / ahead;             // + = chadhai

    let a = 0;
    if (ctl.throttle > 0) a += s.accel * ctl.throttle * (this.speed < 0 ? 1.8 : 1);
    else if (ctl.throttle < 0) {
      a += (this.speed > 0.4 ? -s.brake * 14 : s.accel * 0.55 * ctl.throttle);
    }
    a -= 9.81 * grade * 0.85;                            // gravity
    a -= this.speed * 0.30 + Math.sign(this.speed) * 0.55;   // drag + rolling
    if (ctl.handbrake) a -= Math.sign(this.speed) * 13;

    this.speed += a * dt;
    const cap = this.topSpeed * (grade > 0.06 ? 0.72 : 1);   // chadhai pe dheemi
    this.speed = THREE.MathUtils.clamp(this.speed, -this.topSpeed * 0.32, cap);
    if (Math.abs(this.speed) < 0.12 && ctl.throttle === 0) this.speed = 0;

    // --- steering ---------------------------------------------------------
    const target = ctl.steer * (s.class === "bus" || s.class === "truck" ? 0.55 : 1);
    this.steer += (target - this.steer) * Math.min(1, dt * 7);
    const speedFactor = Math.min(1, Math.abs(this.speed) / 7) * (1 - Math.min(0.55, Math.abs(this.speed) / (this.topSpeed * 1.7)));
    const turn = this.steer * speedFactor * 2.2 * Math.sign(this.speed || 1);
    this.yaw += turn * dt;

    // --- lateral slip: barf pe / handbrake pe gaadi baahar khisakti hai ----
    const slipIn = turn * Math.abs(this.speed) * (1 - g) * (ctl.handbrake ? 2.6 : 1);
    this.slip += (slipIn - this.slip) * Math.min(1, dt * 3.2);
    this.slip *= 1 - Math.min(0.95, dt * 2.4 * g);

    // --- integrate --------------------------------------------------------
    this.forward(_f);
    _r.set(-_f.z, 0, _f.x);
    this.pos.addScaledVector(_f, this.speed * dt);
    this.pos.addScaledVector(_r, this.slip * dt);

    // world bounds
    const lim = this.terrain.half - 12;
    if (Math.abs(this.pos.x) > lim || Math.abs(this.pos.z) > lim) {
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, -lim, lim);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, -lim, lim);
      this.speed *= 0.35;
    }

    // bahut khadi dhalan pe gaadi nahi chadhti
    if (grade > 0.62 && this.speed > 0) this.speed *= 0.90;

    this.pos.y = this.terrain.heightAt(this.pos.x, this.pos.z);
    this.syncMesh();
  }

  /** Gaadi ko terrain ke normal ke saath jhukao -- pahad pe ye zaroori dikhta hai. */
  syncMesh() {
    const t = this.terrain;
    const n = t.normalAt(this.pos.x, this.pos.z, _n);
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += this.spec.body[1] * 0.5 - 0.35;

    _q.setFromAxisAngle(_up, this.yaw);
    _align.setFromUnitVectors(_up, n);
    this.mesh.quaternion.copy(_align).multiply(_q);

    const w = this.mesh.userData.wheels;
    if (w) {
      const spin = this.speed * 0.55;
      for (const wh of w) {
        wh.rotation.x += spin * 0.016;
        if (wh.userData.steers) wh.rotation.y = this.steer * 0.5;
      }
    }
  }
}

function buildBody(spec) {
  const g = new THREE.Group();
  const [w, h, l] = spec.body;
  const col = new THREE.Color(spec.color);
  const mat = new THREE.MeshLambertMaterial({ color: col, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22242a, flatShading: true });
  const glass = new THREE.MeshLambertMaterial({ color: 0x2b3a4a, flatShading: true });

  const bodyH = h * 0.55;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, l), mat);
  body.position.y = bodyH / 2;
  g.add(body);

  const cabL = spec.class === "bus" || spec.class === "truck" ? l * 0.82 : l * 0.46;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, h * 0.42, cabL), glass);
  cab.position.set(0, bodyH + h * 0.21, spec.class === "bike" ? 0 : -l * 0.04);
  g.add(cab);

  if (spec.roof_sign) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 0.26, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x1b1b1b }));
    s.position.y = bodyH + h * 0.45;
    g.add(s);
  }
  if (spec.siren) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.2, 0.34),
      new THREE.MeshLambertMaterial({ color: 0x1b1b1b }));
    s.position.y = bodyH + h * 0.45;
    g.add(s);
    for (const [dx, hex] of [[-0.28, 0xff3b30], [0.28, 0x2f7de0]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, 0.16, 0.3),
        new THREE.MeshBasicMaterial({ color: hex }));
      b.position.set(dx * w, bodyH + h * 0.53, 0);
      g.add(b);
      (g.userData.beacons ||= []).push(b);
    }
  }

  // pahiye
  const wheels = [];
  const isBike = spec.class === "bike";
  const rad = Math.min(0.52, h * 0.26);
  const geo = new THREE.CylinderGeometry(rad, rad, isBike ? 0.16 : 0.28, 8);
  geo.rotateZ(Math.PI / 2);
  const axles = isBike ? [[0, l * 0.34], [0, -l * 0.34]]
    : [[-w / 2, l * 0.32], [w / 2, l * 0.32], [-w / 2, -l * 0.32], [w / 2, -l * 0.32]];
  for (const [dx, dz] of axles) {
    const m = new THREE.Mesh(geo, dark);
    m.position.set(dx * 0.92, rad, dz);
    m.userData.steers = dz > 0;
    g.add(m);
    wheels.push(m);
  }
  g.userData.wheels = wheels;
  return g;
}

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _align = new THREE.Quaternion();
