import * as THREE from "three";

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

    // chalne ka bob
    const t = performance.now() / 1000;
    const bob = moving ? Math.sin(t * (this.running ? 15 : 9)) * (this.running ? 0.07 : 0.04) : 0;
    this.mesh.position.y += bob;
    const legs = this.mesh.userData.legs;
    if (legs) {
      const sw = moving ? Math.sin(t * (this.running ? 15 : 9)) * (this.running ? 0.8 : 0.5) : 0;
      legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
    }
  }
}

function buildAvatar() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0x9a6b46, flatShading: true });
  const jacket = new THREE.MeshLambertMaterial({ color: 0xc8442e, flatShading: true });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x33405c, flatShading: true });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), jacket);
  torso.position.y = 1.16; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), skin);
  head.position.y = 1.6; g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.26),
    new THREE.MeshLambertMaterial({ color: 0x1c1712, flatShading: true }));
  hair.position.y = 1.74; g.add(hair);

  const legs = [];
  for (const dx of [-0.12, 0.12]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.86, 0.19), jeans);
    leg.geometry.translate(0, -0.43, 0);
    leg.position.set(dx, 0.86, 0);
    g.add(leg); legs.push(leg);
  }
  for (const dx of [-0.31, 0.31]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 0.16), jacket);
    arm.position.set(dx, 1.16, 0); g.add(arm);
  }
  g.userData.legs = legs;
  return g;
}
