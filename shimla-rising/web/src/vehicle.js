import * as THREE from "three";
import * as TEX from "./textures.js";

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
    // Sadak ki satah terrain se 0.5 m upar hai -- bina iske gaadi sadak mein
    // aadhi ghusi rehti thi (aur bus tairti dikhti thi)
    this.ground = opts.ground || ((x, z) => terrain.heightAt(x, z));
    this.colliders = opts.colliders || null;
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
    this.pos.set(x, this.ground(x, z), z);
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
    const hHere = this.ground(this.pos.x, this.pos.z);
    const hAhead = this.ground(this.pos.x + f.x * ahead, this.pos.z + f.z * ahead);
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
    const mx = _f.x * this.speed * dt + _r.x * this.slip * dt;
    const mz = _f.z * this.speed * dt + _r.z * this.slip * dt;

    /*
     * Deewar ke aar-paar nahi. 100 km/h par gaadi ek frame mein 1.4 m chalti hai,
     * par 20 fps par 5.5 m -- aur 6 m ki dukan ke paar nikal jaati hai. Isliye
     * sweep chhote kadmon mein chalta hai. Takkar par raftaar ka utna hi hissa
     * jaata hai jitna deewar ki taraf tha, isliye kinare se ragadte hue nikalna
     * mumkin rehta hai par seedhi takkar rok deti hai.
     */
    if (this.colliders) {
      const hit = this.colliders.sweep(this.pos, mx, mz, VEHICLE_RADIUS,
                                       this.pos.y + 1.0, 0.6);
      if (hit.hit) {
        const into = -(_f.x * hit.nx + _f.z * hit.nz) * this.speed;   // deewar ki taraf
        if (into > 0) {
          this.speed -= into * 0.92;
          this.slip *= 0.3;
          this.lastImpact = into;                  // main.js awaaz/nuksan ke liye padhta hai
        }
      }
    } else {
      this.pos.x += mx; this.pos.z += mz;
    }

    // world bounds
    const lim = this.terrain.half - 12;
    if (Math.abs(this.pos.x) > lim || Math.abs(this.pos.z) > lim) {
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, -lim, lim);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, -lim, lim);
      this.speed *= 0.35;
    }

    // bahut khadi dhalan pe gaadi nahi chadhti
    if (grade > 0.62 && this.speed > 0) this.speed *= 0.90;

    this.pos.y = this.ground(this.pos.x, this.pos.z);
    this.syncMesh();
  }

  /** Gaadi ko terrain ke normal ke saath jhukao -- pahad pe ye zaroori dikhta hai. */
  syncMesh() {
    const t = this.terrain;
    const n = t.normalAt(this.pos.x, this.pos.z, _n);
    /*
     * Koi offset nahi.
     *
     * Nikhil: *"bus float krri"*. `buildBody()` ka origin **pahiye ke neeche**
     * hai (hub `y = rad` par, tyre ka radius wahi `rad`), yaani model apne
     * aap zameen par baithta hai. Yahan `body[1] * 0.5 - 0.35` jodna purane
     * waqt ka bacha hua tha jab dhad ek box tha jiska center origin par hota
     * tha -- ab wo gaadi ko taxi ke liye 0.39 m aur bus ke liye 1.18 m upar
     * uthata tha. Bus par yahi saaf dikhta tha.
     */
    this.mesh.position.copy(this.pos);

    _q.setFromAxisAngle(_up, this.yaw);
    _align.setFromUnitVectors(_up, n);
    this.mesh.quaternion.copy(_align).multiply(_q);

    const w = this.mesh.userData.wheels;
    if (w) {
      const spin = this.speed * 0.045;
      for (const hub of w) {
        if (hub.userData.steers) hub.rotation.y = this.steer * 0.42;
        for (const part of hub.children) part.rotation.x += spin;
      }
    }
  }
}

/**
 * Gaadi ka model.
 *
 * Pehle ye do box aur chaar cylinder tha. Ab: chamfered body (teekhe kone
 * hataakar), alag greenhouse (sheeshe), asli tyre + rim, headlight/taillight
 * (emissive), bumper, aur number plate. Paint clear-coat jaisa hai.
 */
export function buildBody(spec) {
  const g = new THREE.Group();
  const [w, h, l] = spec.body;

  const paintMat = TEX.standard(TEX.carPaint(spec.color), { roughness: 0.3, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x18242e, roughness: 0.06, metalness: 0.1,
    transparent: true, opacity: 0.72,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.55, metalness: 0.35 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.22, metalness: 0.9 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.3, metalness: 0.85 });

  const add = (mesh, parent = g) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const shape = spec.shape || "hatch";
  const isBike = shape === "bike";
  const isBig = shape === "bus" || shape === "truck";

  /**
   * Har gaadi ka apna anupaat -- yahi use pehchan deta hai.
   * Alto ooncha aur chhota, Maruti 800 neecha aur choka, Baleno lamba aur
   * dhalaan wali chhat ka, Thar khada aur bhaari.
   */
  const P = {
    tallboy: { body: 0.46, cab: 0.44, cabL: 0.52, cabZ: -0.02, wheel: 0.30, roofDrop: 0.00 },
    classic: { body: 0.50, cab: 0.36, cabL: 0.46, cabZ: -0.04, wheel: 0.28, roofDrop: 0.00 },
    hatch:   { body: 0.48, cab: 0.36, cabL: 0.54, cabZ: -0.08, wheel: 0.34, roofDrop: 0.06 },
    offroad: { body: 0.52, cab: 0.40, cabL: 0.48, cabZ: -0.02, wheel: 0.40, roofDrop: 0.00 },
    bus:     { body: 0.68, cab: 0.42, cabL: 0.82, cabZ: 0.00, wheel: 0.26, roofDrop: 0.00 },
    truck:   { body: 0.68, cab: 0.42, cabL: 0.34, cabZ: -0.28, wheel: 0.26, roofDrop: 0.00 },
    bike:    { body: 0.42, cab: 0.30, cabL: 0.30, cabZ: 0.00, wheel: 0.30, roofDrop: 0.00 },
  }[shape] || { body: 0.5, cab: 0.4, cabL: 0.5, cabZ: -0.05, wheel: 0.32, roofDrop: 0 };

  const bodyH = h * P.body;

  // --- body: chamfered box, teekhe kone nahi ---------------------------
  const body = add(new THREE.Mesh(chamferBox(w, bodyH, l, Math.min(0.16, w * 0.12)), paintMat));
  body.position.y = bodyH / 2;

  if (!isBike) {
    // bumper + chrome patti
    for (const dz of [l / 2 - 0.06, -l / 2 + 0.06]) {
      const b = add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, bodyH * 0.24, 0.14), trimMat));
      b.position.set(0, bodyH * 0.3, dz);
    }
    const strip = add(new THREE.Mesh(new THREE.BoxGeometry(w * 1.005, 0.035, l * 0.82), chromeMat));
    strip.position.y = bodyH * 0.82;
  }

  // --- greenhouse (sheeshe) ---------------------------------------------
  const cabL = l * P.cabL;
  const cabH = h * P.cab;
  const cab = add(new THREE.Mesh(
    chamferBox(w * 0.87, cabH, cabL, Math.min(0.12, w * 0.1)), glassMat));
  cab.position.set(0, bodyH + cabH / 2 - 0.02, isBike ? 0 : l * P.cabZ);
  // Baleno jaisi gaadi ki chhat peeche ki taraf dhalti hai
  const roofW = w * (0.80 - P.roofDrop);
  const roof = add(new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.06, cabL * 0.86), paintMat));
  roof.position.set(0, bodyH + cabH - 0.01 - P.roofDrop * h * 0.5, isBike ? 0 : l * P.cabZ);

  if (shape === "offroad") {
    // Thar: khada windshield + roll bar
    const wsh = add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, cabH * 0.95, 0.07), glassMat));
    wsh.position.set(0, bodyH + cabH * 0.5, -cabL / 2 + l * P.cabZ);
    for (const dx of [-1, 1]) {
      const bar = add(new THREE.Mesh(new THREE.BoxGeometry(0.07, cabH, 0.07), trimMat));
      bar.position.set(dx * w * 0.40, bodyH + cabH * 0.5, cabL * 0.35 + l * P.cabZ);
    }
  }
  if (spec.spare_wheel) {
    const sp = add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 14), rubberMat));
    sp.rotation.x = Math.PI / 2;
    sp.position.set(0, bodyH + 0.34, l / 2 + 0.14);
  }
  if (!isBike && !isBig) {
    // side mirrors + darwaze ki lakeer
    for (const dx of [-1, 1]) {
      const mir = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.16), trimMat));
      mir.position.set(dx * (w / 2 + 0.07), bodyH + cabH * 0.55, -cabL * 0.34 + l * P.cabZ);
      const seam = add(new THREE.Mesh(new THREE.BoxGeometry(0.012, bodyH * 0.7, 0.02), trimMat));
      seam.position.set(dx * (w / 2 + 0.005), bodyH * 0.52, l * P.cabZ);
    }
  }

  // --- lights ------------------------------------------------------------
  if (!isBike) {
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff3d0, emissive: 0xffe9b0, emissiveIntensity: 0.9, roughness: 0.2 });
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0x7a1410, emissive: 0xd6301f, emissiveIntensity: 0.7, roughness: 0.3 });
    for (const dx of [-1, 1]) {
      const hl = add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, bodyH * 0.2, 0.06), headMat));
      hl.position.set(dx * w * 0.32, bodyH * 0.62, -l / 2 - 0.01);
      const tl = add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.17, bodyH * 0.16, 0.05), tailMat));
      tl.position.set(dx * w * 0.34, bodyH * 0.66, l / 2 + 0.01);
    }
    // HP number plate
    const plate = add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, 0.1, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xe9e6dd, roughness: 0.7 })));
    plate.position.set(0, bodyH * 0.34, l / 2 + 0.05);
    // Battiyon ka material bahar dikha do -- traffic raat ko headlight jalata
    // hai aur brake par taillight tez karta hai. Har gaadi ka apna material
    // hai (yahin bana), isliye ek ki batti doosri par nahi jaati.
    g.userData.lightMats = { head: headMat, tail: tailMat };
  }

  if (spec.roof_sign) {
    const sign = add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 0.2, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xf2e6c8, emissive: 0x554626,
        emissiveIntensity: 0.4, roughness: 0.6 })));
    sign.position.y = bodyH + cabH + 0.09;
  }
  if (spec.siren) {
    const bar = add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, 0.09, 0.24), trimMat));
    bar.position.y = bodyH + cabH + 0.07;
    for (const [dx, hex] of [[-0.24, 0xff3b30], [0.24, 0x2f7de0]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w * 0.24, 0.13, 0.2),
        new THREE.MeshStandardMaterial({ color: hex, emissive: hex,
          emissiveIntensity: 1.6, roughness: 0.35 }));
      b.position.set(dx * w, bodyH + cabH + 0.14, 0);
      g.add(b);
      (g.userData.beacons ||= []).push(b);
    }
  }

  // --- pahiye: tyre + rim ------------------------------------------------
  const wheels = [];
  const rad = Math.min(isBig ? 0.55 : 0.42, h * P.wheel);
  const width = isBike ? 0.14 : 0.24;
  const tyreGeo = new THREE.CylinderGeometry(rad, rad, width, 18, 1);
  tyreGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(rad * 0.58, rad * 0.58, width * 1.04, 10, 1);
  rimGeo.rotateZ(Math.PI / 2);

  const axles = isBike ? [[0, l * 0.34], [0, -l * 0.34]]
    : [[-w / 2, l * 0.32], [w / 2, l * 0.32], [-w / 2, -l * 0.32], [w / 2, -l * 0.32]];
  for (const [dx, dz] of axles) {
    const hub = new THREE.Group();
    hub.position.set(dx * 0.94, rad, dz);
    hub.userData.steers = dz < 0;          // aage ke pahiye (-Z forward hai)
    add(new THREE.Mesh(tyreGeo, rubberMat), hub);
    add(new THREE.Mesh(rimGeo, rimMat), hub);
    g.add(hub);
    wheels.push(hub);
  }
  g.userData.wheels = wheels;
  return g;
}

/**
 * Chamfered box -- teekhe kinaron ko halka kaat deta hai.
 *
 * Asli gaadi ka koi kinara bilkul teekha nahi hota; sharp box turant "programmer
 * art" jaisa dikhta hai. BoxGeometry ke vertices ko andar ki taraf khiskana
 * sabse sasta tareeka hai, bina kisi bevel modifier ke.
 */
function chamferBox(w, h, d, c) {
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const p = g.attributes.position;
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ex = Math.abs(Math.abs(v.x) - hx) < 1e-4;
    const ey = Math.abs(Math.abs(v.y) - hy) < 1e-4;
    const ez = Math.abs(Math.abs(v.z) - hz) < 1e-4;
    const edges = (ex ? 1 : 0) + (ey ? 1 : 0) + (ez ? 1 : 0);
    if (edges >= 2) {
      if (ex) v.x -= Math.sign(v.x) * c;
      if (ey) v.y -= Math.sign(v.y) * c * 0.7;
      if (ez) v.z -= Math.sign(v.z) * c;
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Gaadi ka collision radius -- lambai/chaudai ke beech ka. */
const VEHICLE_RADIUS = 1.5;
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _align = new THREE.Quaternion();
