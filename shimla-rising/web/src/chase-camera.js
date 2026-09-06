import * as THREE from "three";

/** GTA-style chase camera: peeche-upar se, smooth, aur zameen ke andar nahi ghusti. */
export class ChaseCamera {
  constructor(camera, terrain, colliders = null) {
    this.cam = camera;
    this.terrain = terrain;
    this.colliders = colliders;
    this.yaw = 0;
    this.pitch = 0.22;
    this.dist = 7.5;
    this.targetDist = 7.5;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this._init = false;
  }

  handleMouse(dx, dy, sens = 0.0026) {
    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * sens, -0.42, 1.15);
  }

  /** @param mode "foot" | "vehicle" */
  update(dt, target, mode, headingYaw = null) {
    this.targetDist = mode === "vehicle" ? 10.5 : 6.2;
    const height = mode === "vehicle" ? 3.4 : 2.4;
    this.dist += (this.targetDist - this.dist) * Math.min(1, dt * 4);

    // gaadi mein camera dheere-dheere gaadi ke peeche aa jaata hai
    if (mode === "vehicle" && headingYaw !== null) {
      let d = headingYaw - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 1.5);
    }

    const cp = Math.cos(this.pitch);
    const want = _v.set(
      target.x + Math.sin(this.yaw) * this.dist * cp,
      target.y + height + Math.sin(this.pitch) * this.dist,
      target.z + Math.cos(this.yaw) * this.dist * cp,
    );

    // terrain ke neeche mat jaao
    const ground = this.terrain.heightAt(want.x, want.z) + 1.6;
    if (want.y < ground) want.y = ground;

    // Imaarat ke andar mat jaao. Target se camera tak ray march karke pehli
    // deewar dhoondo aur us se thoda pehle ruk jaao -- warna Shimla ki ghani
    // basti mein camera har doosre frame mein kisi chhat ke andar hota hai.
    if (this.colliders) {
      const eyeY = target.y + height;
      const dx = want.x - target.x, dy = want.y - eyeY, dz = want.z - target.z;
      const STEPS = 10;
      for (let i = 1; i <= STEPS; i++) {
        const t = i / STEPS;
        const px = target.x + dx * t, py = eyeY + dy * t, pz = target.z + dz * t;
        if (this.colliders.inside(px, py, pz, 0.9)) {
          const back = Math.max(0.18, (i - 1) / STEPS);
          want.set(target.x + dx * back, eyeY + dy * back, target.z + dz * back);
          const g2 = this.terrain.heightAt(want.x, want.z) + 1.2;
          if (want.y < g2) want.y = g2;
          break;
        }
      }
    }

    if (!this._init) { this.pos.copy(want); this._init = true; }
    else this.pos.lerp(want, Math.min(1, dt * 9));

    this.look.lerp(_l.set(target.x, target.y + (mode === "vehicle" ? 1.4 : 1.5), target.z),
                   Math.min(1, dt * 12));
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
  }
}
const _v = new THREE.Vector3(), _l = new THREE.Vector3();
