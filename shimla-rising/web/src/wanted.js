import * as THREE from "three";
import { Vehicle } from "./vehicle.js";
import { buildHuman, faceYaw } from "./human.js";

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
    // sadak ki satah samet -- warna jeep sadak mein aadhi ghusi rehti hai
    this.ground = (x, z) => roads.groundAt(x, z);
    this.spec = vehicleSpecs.get("police_jeep");
    this.stars = 0;
    this.heat = 0;              // 0..100, sitare isi se nikalte hain
    this.chasers = [];
    this.maxChasers = 5;
    this.onStarsChanged = () => {};

    /*
     * Paidal constable.
     *
     * Nikhil: "public m b agr jyda logo s marega to police aegi". Jeep se wo
     * nahi hota -- gali mein, seedhiyon par, bazaar ke beech gaadi pahunchti
     * hi nahi. Isliye khiladi paidal ho to khaki wardi wale paidal aate hain,
     * aur wahi pakadte bhi hain.
     */
    this.constables = [];
    this.maxConstables = 3;
    this.arrestTimer = 0;
    this.onArrest = () => {};
  }

  add(amount) { this.heat = Math.min(100, this.heat + amount); this._sync(); }
  clear() {
    this.heat = 0;
    this.arrestTimer = 0;
    this._sync();
    this._despawnAll();
    while (this.constables.length) this._despawnConstable(0);
  }

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

    this._updateConstables(dt, playerPos, inVehicle);
  }

  // ------------------------------------------------------------- paidal police

  _updateConstables(dt, playerPos, inVehicle) {
    // Gaadi mein ho to paidal constable ka koi matlab nahi -- jeep peecha karti hai
    const want = (!inVehicle && this.stars > 0)
      ? Math.min(this.maxConstables, this.stars) : 0;
    while (this.constables.length < want) this._spawnConstable(playerPos);
    while (this.constables.length > want) this._despawnConstable(this.constables.length - 1);

    let closest = Infinity;
    for (const c of this.constables) {
      const m = c.mesh;
      const dx = playerPos.x - m.position.x, dz = playerPos.z - m.position.z;
      const d = Math.hypot(dx, dz);
      closest = Math.min(closest, d);
      if (d > 1.4) {
        const sp = Math.min(4.6, 2.6 + this.stars * 0.5);
        m.position.x += (dx / d) * sp * dt;
        m.position.z += (dz / d) * sp * dt;
      }
      m.position.y = this.ground(m.position.x, m.position.z);
      m.rotation.y = faceYaw(dx, dz);
      // chalne ki halki chaal
      c.phase += dt * 9;
      const rig = m.userData.rig;
      if (rig) {
        const s = Math.sin(c.phase) * 0.5;
        rig.legs[0].hip.rotation.x = s;
        rig.legs[1].hip.rotation.x = -s;
        rig.arms[0].shoulder.rotation.x = -s * 0.6;
        rig.arms[1].shoulder.rotation.x = s * 0.6;
      }
      // bahut door reh gaya to paas le aao, warna peecha khatam lagta hai
      if (d > 160) this._placeConstable(c, playerPos);
    }

    /*
     * Pakad. Constable itne paas itni der raha to BUSTED.
     *
     * Ek hi frame ke touch par arrest karna kharab lagta hai -- bhaagne ka
     * mauka milna chahiye, isliye ghadi chalti hai aur door hote hi wapas
     * girti hai.
     */
    if (closest < 2.2) {
      this.arrestTimer += dt;
      if (this.arrestTimer >= 1.2) { this.arrestTimer = 0; this.onArrest(); }
    } else {
      this.arrestTimer = Math.max(0, this.arrestTimer - dt * 1.5);
    }
  }

  _spawnConstable(playerPos) {
    const mesh = buildHuman({
      build: "male", lod: "crowd",
      skin: 0xb07c4f,
      top: 0x8a7f5a,        // khaki wardi
      bottom: 0x6f6647,
      topi: false,
    });
    mesh.castShadow = true;
    const c = { mesh, phase: Math.random() * 6, police: true };
    this.scene.add(mesh);
    this.constables.push(c);
    this._placeConstable(c, playerPos);
  }

  /** Khiladi ke aas-paas, par nazar ke bilkul saamne nahi. */
  _placeConstable(c, playerPos) {
    const a = Math.random() * Math.PI * 2;
    const r = 26 + Math.random() * 16;
    const x = playerPos.x + Math.cos(a) * r;
    const z = playerPos.z + Math.sin(a) * r;
    c.mesh.position.set(x, this.ground(x, z), z);
  }

  _despawnConstable(i) {
    const c = this.constables[i];
    if (!c) return;
    this.scene.remove(c.mesh);
    c.mesh.traverse((o) => o.geometry?.dispose?.());
    this.constables.splice(i, 1);
  }

  _spawn(playerPos) {
    // khiladi se 120-220 m door, sadak pe
    const ang = Math.random() * Math.PI * 2;
    const r = 130 + Math.random() * 90;
    const tx = playerPos.x + Math.cos(ang) * r;
    const tz = playerPos.z + Math.sin(ang) * r;
    const n = this.roads.nearestNode(tx, tz, (rd) => rd.type !== "pedestrian" && rd.type !== "rail");
    const p = n ? n.node.pos : { x: tx, z: tz };
    const v = new Vehicle(this.spec, this.terrain,
                          { police: true, ground: this.ground });
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
