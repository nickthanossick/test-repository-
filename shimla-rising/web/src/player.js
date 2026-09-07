import * as THREE from "three";
import { buildHuman } from "./human.js";

/**
 * Paidal Vicky.
 *
 * Shimla-specific: **chadhai pe stamina jaldi khatam hoti hai.** Ye koi
 * decoration nahi -- Jakhoo ki chadhai (Ridge 2205 m se mandir 2455 m, 1.1 km mein)
 * asli mein saans phula deti hai, aur mission a1_m5 isi pe bana hai. Uphill
 * daudne ka kharch dhalan ke saath teen guna tak badh jaata hai.
 */
export class Player {
  constructor(terrain, colliders = null) {
    this.colliders = colliders;
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
    /** Khiladi ka collision radius -- kandhe se thoda kam. */
const PLAYER_RADIUS = 0.42;
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
      // Deewar ke aar-paar nahi -- sweep chhote kadmon mein chalta hai aur har
      // kadam ke baad bahar dhakel deta hai, isliye tez chaal pe bhi paar nahi
      // hota. Slide apne aap hoti hai: push sirf normal ki disha mein lagta hai.
      const mx = dx * speed * dt, mz = dz * speed * dt;
      if (this.colliders) {
        this.colliders.sweep(this.pos, mx, mz, PLAYER_RADIUS,
                             this.pos.y + 0.9, 0.35);
      } else {
        this.pos.x += mx; this.pos.z += mz;
      }
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
 * Vicky.
 *
 * Poora humanoid `human.js` mein hai taaki sadak pe chalne wale NPC bhi wahi
 * dhaancha istemaal karein -- ek hi jagah se sudhaar sab pe lagta hai.
 */
function buildAvatar() {
  return buildHuman({
    build: "male",
    skin: 0xc08a5e,
    top: 0xbb3a2a,        // laal jacket
    bottom: 0x35425e,     // neeli jeans
    topi: true,
    danda: true,          // daayein haath mein -- `combat.js` isse ghumata hai
  });
}
