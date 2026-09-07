import * as THREE from "three";

/**
 * Mission engine. data/missions.json ko chalata hai.
 *
 * Supported objective types (jo bhi missions.json mein hai, sab yahan handle hote hain):
 *   goto      poi tak pahuncho (paidal ya gaadi, koi bhi)
 *   drive_to  poi tak pahuncho -- gaadi mein hona zaroori
 *   collect   poi ke aas-paas N pickups uthao
 *   evade     wanted level 0 karo
 *   survive   N second tak zinda/chhupe raho
 *   race      checkpoints ko kram se, time limit mein
 */
export class MissionSystem {
  constructor(scene, terrain, data) {
    this.scene = scene;
    this.terrain = terrain;
    this.data = data;
    this.byId = new Map(data.missions.missions.map((m) => [m.id, m]));
    // Pehla mission data se aata hai, yahan hardcode nahi -- missions ke naam
    // badalne par engine aur test dono ko alag-alag theek karna padta tha.
    this.available = new Set([data.missions.start_mission]);
    this.completed = new Set();
    this.active = null;
    this.objIndex = 0;
    this.timer = 0;
    this.pickups = [];
    this.markers = new THREE.Group();
    this.markers.name = "mission-markers";
    scene.add(this.markers);

    this.onEvent = () => {};      // (type, payload)
    this._refreshStartMarkers();
  }

  poiPos(id) {
    const p = this.data.poiById.get(id);
    if (!p) return null;
    const { x, z } = this.terrain.geo.toWorld(p.lat, p.lon);
    return new THREE.Vector3(x, this.terrain.heightAt(x, z), z);
  }

  get currentObjective() {
    return this.active ? this.active.objectives[this.objIndex] : null;
  }

  /** Jo missions abhi shuru ho sakte hain, unke start markers dikhao. */
  _refreshStartMarkers() {
    this.markers.clear();
    if (this.active) {
      this._markObjective();
      return;
    }
    for (const id of this.available) {
      const m = this.byId.get(id);
      if (!m || (this.completed.has(id) && !m.repeatable)) continue;
      const p = this.poiPos(m.start_poi);
      if (p) this.markers.add(marker(p, m.side ? 0x5aa9e6 : 0xe8c33a, 3.2));
    }
  }

  _markObjective() {
    this.markers.clear();
    const o = this.currentObjective;
    if (!o) return;
    if (o.type === "race") {
      const p = this.poiPos(o.checkpoints[this.raceIndex]);
      if (p) this.markers.add(marker(p, 0x6cc27a, 4.5));
    } else if (o.poi) {
      const p = this.poiPos(o.poi);
      if (p) this.markers.add(marker(p, 0xe8c33a, o.type === "collect" ? 5 : 3.4));
    }
    for (const pk of this.pickups) this.markers.add(pk.mesh);
  }

  /** Kya khiladi kisi available mission ke start pe khada hai? */
  startableAt(pos) {
    if (this.active) return null;
    for (const id of this.available) {
      const m = this.byId.get(id);
      if (!m || (this.completed.has(id) && !m.repeatable)) continue;
      const p = this.poiPos(m.start_poi);
      // Nikhil: "mission easy hojae shuru" -- 20 m par marker ke bilkul
      // upar khada hona padta tha; 32 m par bas paas jaana kaafi hai
      if (p && p.distanceTo(pos) < 32) return m;
    }
    return null;
  }

  /**
   * Mission shuru.
   *
   * Objectives seedha shuru nahi hote: pehle mission ke flashcards chalte hain
   * ("har mission p phle flashcards ake thoda btaenge ki kya h"), aur unke
   * band hone par hi ghadi chalti hai. Card ke bina -- ya bina card wale
   * mission mein -- `done` turant chal jaata hai, isliye purana bartav wahi
   * rehta hai.
   */
  start(m) {
    this.active = m;
    this.objIndex = 0;
    this.raceIndex = 0;
    this.timer = 0;
    this.cardsUp = !!(m.cards && m.cards.length);
    const begin = () => {
      this.cardsUp = false;
      this._beginObjective();
      this.onEvent("mission_start", m);
    };
    if (this.cardsUp) this.onEvent("cards", { cards: m.cards, done: begin });
    else begin();
  }

  _beginObjective() {
    const o = this.currentObjective;
    this._clearPickups();
    if (!o) return;
    if (o.type === "collect") this._spawnPickups(o);
    if (o.type === "survive") this.timer = o.seconds;
    if (o.type === "race") { this.raceIndex = 0; this.timer = o.time_s; }
    this._markObjective();
    this.onEvent("objective", o);
  }

  _spawnPickups(o) {
    const base = this.poiPos(o.poi);
    if (!base) return;
    for (let i = 0; i < o.count; i++) {
      const a = (i / o.count) * Math.PI * 2 + Math.random();
      const r = (o.spread || 30) * (0.35 + Math.random() * 0.65);
      const x = base.x + Math.cos(a) * r, z = base.z + Math.sin(a) * r;
      const y = this.terrain.heightAt(x, z) + 1.2;
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.9),
        new THREE.MeshBasicMaterial({ color: 0xe8c33a }),
      );
      mesh.position.set(x, y, z);
      this.pickups.push({ mesh, taken: false });
    }
  }

  _clearPickups() {
    for (const p of this.pickups) p.mesh.geometry.dispose();
    this.pickups = [];
  }

  fail(reason) {
    const m = this.active;
    this.active = null;
    this._clearPickups();
    this._refreshStartMarkers();
    this.onEvent("mission_failed", { mission: m, reason });
  }

  _complete() {
    const m = this.active;
    this.completed.add(m.id);
    for (const u of m.unlocks || []) this.available.add(u);
    if (m.repeatable) this.available.add(m.id);
    this.active = null;
    this._clearPickups();
    this._refreshStartMarkers();
    this.onEvent("mission_complete", m);
  }

  update(dt, ctx) {
    const t = performance.now() / 1000;
    for (const c of this.markers.children) {
      if (c.userData.spin) { c.rotation.y += dt * 1.4; c.position.y = c.userData.baseY + Math.sin(t * 2) * 0.35; }
    }
    // Card khule hone par objective ki ghadi nahi chalti -- warna "survive"
    // aur "race" ka waqt padhne mein hi nikal jaata.
    if (!this.active || this.cardsUp) return;

    const o = this.currentObjective;
    if (!o) { this._complete(); return; }
    const pos = ctx.playerPos;
    let done = false;

    switch (o.type) {
      case "goto": {
        const p = this.poiPos(o.poi);
        done = p && p.distanceTo(pos) < (o.radius || 12);
        break;
      }
      case "drive_to": {
        const p = this.poiPos(o.poi);
        done = ctx.inVehicle && p && p.distanceTo(pos) < (o.radius || 20);
        break;
      }
      case "collect": {
        for (const pk of this.pickups) {
          if (!pk.taken && pk.mesh.position.distanceTo(pos) < 4.5) {
            pk.taken = true;
            pk.mesh.visible = false;
            this.onEvent("pickup", { left: this.pickups.filter((x) => !x.taken).length });
          }
        }
        done = this.pickups.every((p) => p.taken);
        break;
      }
      case "evade":
        done = ctx.stars === 0;
        break;
      case "survive":
        this.timer -= dt;
        done = this.timer <= 0;
        break;
      case "race": {
        this.timer -= dt;
        if (this.timer <= 0) { this.fail("Time khatam."); return; }
        const cp = this.poiPos(o.checkpoints[this.raceIndex]);
        if (cp && cp.distanceTo(pos) < 24) {
          this.raceIndex++;
          if (this.raceIndex >= o.checkpoints.length) done = true;
          else { this._markObjective(); this.onEvent("checkpoint", { left: o.checkpoints.length - this.raceIndex }); }
        }
        break;
      }
      default: done = true;
    }

    if (done) {
      this.objIndex++;
      if (this.objIndex >= this.active.objectives.length) this._complete();
      else this._beginObjective();
    }
  }
}

function marker(pos, color, radius) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.28, 6, 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
  );
  ring.rotation.x = Math.PI / 2;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, 60, 6, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  g.add(ring, beam);
  g.position.copy(pos);
  g.position.y += 1.6;
  g.userData.spin = true;
  g.userData.baseY = g.position.y;
  return g;
}
