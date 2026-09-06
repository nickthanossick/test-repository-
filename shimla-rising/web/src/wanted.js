import * as THREE from "three";
import { Vehicle } from "./vehicle.js";

/**
 * Himachal Police ka heat system. 0-5 sitare.
 *
 * Shimla-specific niyam: **Mall Road pe gaadi le jaana apne aap 2 sitare deta hai.**
 * Asli Shimla mein Mall pedestrian-only hai (sirf ambulance/fire ko chhoot),
 * isliye ye game ka sabse pehchana jurm hai.
 */
export class WantedSystem {
  constructor(scene, terrain, roads, vehicleSpecs) {
    this.scene = scene;
    this.terrain = terrain;
    this.roads = roads;
    this.spec = vehicleSpecs.get("police_jeep");
    this.stars = 0;
    this.heat = 0;              // 0..100, sitare isi se nikalte hain
    this.chasers = [];
    this.maxChasers = 5;
    this.onStarsChanged = () => {};
  }

  add(amount) { this.heat = Math.min(100, this.heat + amount); this._sync(); }
  clear() { this.heat = 0; this._sync(); this._despawnAll(); }

  _sync() {
    // Pehla sitara 8 heat pe. Warna zaraa si heat (jaise ek frame ka glitch) bhi
    // poora ek sitara dikha deti thi.
    const s = this.heat < 8 ? 0 : Math.min(5, 1 + Math.floor((this.heat - 8) / 18));
    if (s !== this.stars) { this.stars = s; this.onStarsChanged(s); }
  }

  update(dt, playerPos, inVehicle, weatherGrip, district, onRoad) {
    // Mall Road pe gaadi -> lagatar heat
    if (inVehicle && onRoad?.type === "pedestrian") this.add(dt * 26);
    else if (inVehicle && district?.vehicle_restricted) this.add(dt * 14);

    // dheere-dheere thanda -- par tabhi jab koi peecha na kar raha ho
    const near = this.chasers.some((c) => c.mesh.position.distanceTo(playerPos) < 85);
    if (!near) this.heat = Math.max(0, this.heat - dt * (this.stars >= 4 ? 2.2 : 4.5));
    this._sync();

    const want = this.stars === 0 ? 0 : Math.min(this.maxChasers, this.stars);
    while (this.chasers.length < want) this._spawn(playerPos);
    while (this.chasers.length > want) this._despawn(this.chasers.length - 1);

    for (const c of this.chasers) this._drive(c, dt, playerPos, weatherGrip);
  }

  _spawn(playerPos) {
    // khiladi se 120-220 m door, sadak pe
    const ang = Math.random() * Math.PI * 2;
    const r = 130 + Math.random() * 90;
    const tx = playerPos.x + Math.cos(ang) * r;
    const tz = playerPos.z + Math.sin(ang) * r;
    const n = this.roads.nearestNode(tx, tz, (rd) => rd.type !== "pedestrian" && rd.type !== "rail");
    const p = n ? n.node.pos : { x: tx, z: tz };
    const v = new Vehicle(this.spec, this.terrain, { police: true });
    v.placeAt(p.x, p.z, Math.random() * Math.PI * 2);
    this.scene.add(v.mesh);
    this.chasers.push(v);
  }

  _despawn(i) {
    const v = this.chasers[i];
    if (!v) return;
    this.scene.remove(v.mesh);
    v.mesh.traverse((o) => o.geometry?.dispose?.());
    this.chasers.splice(i, 1);
  }
  _despawnAll() { while (this.chasers.length) this._despawn(0); }

  /** Seedha-saada peecha: khiladi ki taraf steer karo, aggression sitaron se. */
  _drive(v, dt, target, grip) {
    const dx = target.x - v.pos.x, dz = target.z - v.pos.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(-dx, -dz);          // vehicle forward = (-sin, -cos)
    let d = want - v.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;

    const aggro = 0.55 + this.stars * 0.09;
    v.update(dt, {
      throttle: dist > 14 ? aggro : -0.4,
      steer: THREE.MathUtils.clamp(d * 1.6, -1, 1),
      handbrake: false,
    }, grip);

    // beacon blink
    const b = v.mesh.userData.beacons;
    if (b) {
      const on = Math.floor(performance.now() / 220) % 2;
      b[0].visible = !!on; b[1].visible = !on;
    }
    // bahut door nikal gaye to teleport karke wapas -- warna peecha khatam lagta hai
    if (dist > 520) {
      const n = this.roads.nearestNode(target.x, target.z, (rd) => rd.type !== "pedestrian");
      if (n) v.placeAt(n.node.pos.x, n.node.pos.z, v.yaw);
    }
  }
}
