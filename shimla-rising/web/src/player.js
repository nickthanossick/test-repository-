import * as THREE from "three";
import * as TEX from "./textures.js";

/**
 * Paidal Vicky.
 *
 * Shimla-specific: **chadhai pe stamina jaldi khatam hoti hai.** Ye koi
 * decoration nahi -- Jakhoo ki chadhai (Ridge 2205 m se mandir 2455 m, 1.1 km mein)
 * asli mein saans phula deti hai, aur mission a1_m5 isi pe bana hai. Uphill
 * daudne ka kharch dhalan ke saath teen guna tak badh jaata hai.
 */
export class Player {
  constructor(terrain) {
    this.terrain = terrain;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.vy = 0;
    this.grounded = true;
    this.health = 100;
    this.stamina = 100;
    this.running = false;
    this.height = 1.75;
    this.mesh = buildAvatar();
  }

  placeAt(x, z, yaw = 0) {
    this.pos.set(x, this.terrain.heightAt(x, z), z);
    this.yaw = yaw; this.vy = 0;
    this.mesh.position.copy(this.pos);
    return this;
  }

  update(dt, ctl, camYaw) {
    const WALK = 3.1, RUN = 6.4;

    let mx = ctl.strafe, mz = ctl.forward;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const moving = len > 0.01;

    // camera-relative movement
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    const dx = mx * cos - mz * sin;
    const dz = mx * sin + mz * cos;

    // --- dhalan aur stamina ----------------------------------------------
    const h0 = this.terrain.heightAt(this.pos.x, this.pos.z);
    const probe = 1.5;
    const hAhead = this.terrain.heightAt(this.pos.x + dx * probe, this.pos.z + dz * probe);
    const grade = moving ? (hAhead - h0) / probe : 0;      // + = chadhai

    this.running = ctl.run && this.stamina > 1 && moving;
    let speed = this.running ? RUN : WALK;
    speed *= THREE.MathUtils.clamp(1 - grade * 0.85, 0.42, 1.28);   // chadhai dheemi, utraai tez

    if (this.running) {
      const uphill = Math.max(0, grade);
      this.stamina -= dt * (9 + uphill * 46);              // chadhai pe teen guna kharch
    } else {
      this.stamina += dt * (moving ? 5.5 : 13);
    }
    this.stamina = THREE.MathUtils.clamp(this.stamina, 0, 100);

    if (moving) {
      this.pos.x += dx * speed * dt;
      this.pos.z += dz * speed * dt;
      this.yaw = Math.atan2(dx, dz);
    }

    const lim = this.terrain.half - 8;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -lim, lim);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -lim, lim);

    // --- gravity / jump ---------------------------------------------------
    const ground = this.terrain.heightAt(this.pos.x, this.pos.z);
    if (ctl.jump && this.grounded) { this.vy = 5.2; this.grounded = false; }
    this.vy -= 19.6 * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= ground) {
      if (this.vy < -14) this.health = Math.max(0, this.health + (this.vy + 14) * 2.4);  // giravat ka nuksan
      this.pos.y = ground; this.vy = 0; this.grounded = true;
    }

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;

    this._animate(moving);
  }

  /** Chalne/daudne ka simple procedural gait -- kandha aur ghutna asli joints par. */
  _animate(moving) {
    const rig = this.mesh.userData.rig;
    if (!rig) return;
    const t = performance.now() / 1000;
    const freq = this.running ? 13 : 8;
    const amp = moving ? (this.running ? 0.85 : 0.48) : 0;
    this._gait = (this._gait ?? 0) + (moving ? 0 : 0);
    const sw = Math.sin(t * freq) * amp;
    const sw2 = Math.sin(t * freq + Math.PI) * amp;

    rig.legs[0].hip.rotation.x = sw;
    rig.legs[1].hip.rotation.x = sw2;
    // ghutna sirf peeche mudta hai
    rig.legs[0].knee.rotation.x = Math.max(0, -sw) * 1.1;
    rig.legs[1].knee.rotation.x = Math.max(0, -sw2) * 1.1;
    // haath ulti taraf jhoolte hain
    rig.arms[0].shoulder.rotation.x = sw2 * 0.8;
    rig.arms[1].shoulder.rotation.x = sw * 0.8;
    rig.arms[0].elbow.rotation.x = -Math.abs(sw2) * 0.55 - (moving ? 0.12 : 0.25);
    rig.arms[1].elbow.rotation.x = -Math.abs(sw) * 0.55 - (moving ? 0.12 : 0.25);

    // saans/bob
    this.mesh.position.y += moving
      ? Math.abs(Math.sin(t * freq)) * (this.running ? 0.055 : 0.028)
      : Math.sin(t * 1.6) * 0.008;
  }
}

/**
 * Vicky ka model.
 *
 * Pehle ye chhe box ka aakar tha. Ab proper humanoid hai: sir (chehre ke
 * texture ke saath), baal, gardan, jacket, alag upper-arm/forearm/haath,
 * jaangh/pindli/joota -- sab smooth-shaded aur PBR textured.
 *
 * Ang alag nodes mein isliye hain ki chalne ka animation asli joints par
 * ghoome, na ki poora dhad hilaakar.
 */
function buildAvatar() {
  const g = new THREE.Group();

  const skinMat = TEX.standard(TEX.skin(0xb07d55), { roughness: 0.66 });
  const faceMat = TEX.standard(TEX.face(0xb07d55), { roughness: 0.62 });
  const jacketMat = TEX.standard(TEX.setRepeat(TEX.fabric(0xc8442e, 23), 2), { roughness: 0.9 });
  const jeansMat = TEX.standard(TEX.setRepeat(TEX.fabric(0x33405c, 51, 60), 2), { roughness: 0.95 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x1a130d, roughness: 0.72 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x2a2119, roughness: 0.55 });

  const add = (mesh, parent = g) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // --- sir ---------------------------------------------------------------
  const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 16), faceMat));
  head.scale.set(1, 1.16, 0.94);
  head.position.y = 1.60;
  // baal -- upar aur peeche ka hissa dhak dete hain
  const hair = add(new THREE.Mesh(new THREE.SphereGeometry(0.121, 18, 14,
    0, Math.PI * 2, 0, Math.PI * 0.56), hairMat));
  hair.scale.set(1, 1.14, 0.98);
  hair.position.y = 1.605;
  const nape = add(new THREE.Mesh(new THREE.SphereGeometry(0.113, 14, 10,
    Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.30, Math.PI * 0.42), hairMat));
  nape.position.set(0, 1.585, 0.008);
  nape.scale.set(1, 1.1, 1.02);

  add(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.09, 10), skinMat))
    .position.y = 1.487;

  // --- dhad --------------------------------------------------------------
  const torso = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.30, 6, 14), jacketMat));
  torso.scale.set(1.28, 1, 0.72);
  torso.position.y = 1.235;
  const hips = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.10, 5, 12), jeansMat));
  hips.scale.set(1.24, 1, 0.78);
  hips.position.y = 0.965;

  // --- baazu -------------------------------------------------------------
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.215, 1.375, 0);
    g.add(shoulder);
    const upper = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.19, 5, 10), jacketMat), shoulder);
    upper.position.y = -0.135;
    const elbow = new THREE.Group();
    elbow.position.y = -0.265;
    shoulder.add(elbow);
    const fore = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.047, 0.17, 5, 10), jacketMat), elbow);
    fore.position.y = -0.12;
    const hand = add(new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), skinMat), elbow);
    hand.scale.set(0.85, 1.25, 0.6);
    hand.position.y = -0.245;
    arms.push({ shoulder, elbow });
  }

  // --- taangein ----------------------------------------------------------
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.093, 0.92, 0);
    g.add(hip);
    const thigh = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.24, 5, 10), jeansMat), hip);
    thigh.position.y = -0.17;
    const knee = new THREE.Group();
    knee.position.y = -0.345;
    hip.add(knee);
    const shin = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.24, 5, 10), jeansMat), knee);
    shin.position.y = -0.165;
    const shoe = add(new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.07, 0.24), shoeMat), knee);
    shoe.position.set(0, -0.315, -0.035);
    legs.push({ hip, knee });
  }

  g.userData.rig = { arms, legs, head };
  return g;
}
