import * as THREE from "three";
import { buildHuman } from "./human.js";
import { buildDog, buildCow, animateQuadruped } from "./animals.js";

/**
 * Sheher ki bheed -- dukandaar, paidal log, aur sadak ke jaanwar.
 *
 * Poore bazaar mein 500+ dukanein hain; har ek pe ek animated humanoid rakhna
 * na banega na chalega. Isliye **pool + doori se cull**: ek nishchit sankhya
 * mein kirdaar bante hain aur khiladi ke aas-paas ki khaali jagahon par
 * *dobara istemaal* hote hain. Jo door chala gaya wo agle frame kisi paas ki
 * dukan pe khada mil jaata hai.
 *
 * Kirdaar wahi `human.js` wale hain jo Vicky banata hai -- ek jagah sudhaar
 * karo, sab par lagta hai.
 */

const KEEPER_RANGE = 95;          // itni doori ke andar hi dukandaar dikhte hain
const RECYCLE_AT = 118;           // isse door jaate hi slot chhod do
const WALK_SPEED = 1.25;
/**
 * Itni doori ke andar NPC poore detail wale roop mein aa jaata hai (naak, kaan,
 * bhauh, collar, cuff, angootha, joote ka sole, topi ki phundi). Pehle har NPC
 * hamesha lite roop mein rehta tha, isliye Vicky ke bagal mein khada dukandaar
 * saaf taur par usse ghatiya dikhta tha.
 *
 * Dono roop load par ek saath ban jaate hain aur sirf `visible` badalta hai --
 * runtime par kuch banta nahi, isliye chalte-chalte hichki nahi aati.
 */
const DETAIL_RANGE = 26;
const DETAIL_HYSTERESIS = 4;      // baar-baar switch na ho

/** Deterministic RNG -- ek hi jagah ka aadmi har baar wahi dikhna chahiye. */
function seeded(n) {
  let h = (n * 2654435761) >>> 0;
  return () => {
    h += 0x6d2b79f5; h >>>= 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKIN = [0xc08a5e, 0xb07a52, 0xcf9a70, 0xa9744a, 0xd0a37c];
const MALE_TOP = [0xbb3a2a, 0x2f5d8a, 0x3f6b47, 0x6f6a5c, 0x4a4438, 0x8a5a2e];
const FEMALE_TOP = [0xa8324f, 0x2f7d63, 0x7a3b6b, 0x2f5d8a, 0xb8532a];
const DUPATTA = [0xd8b23f, 0xe08a3c, 0xd0d8e8, 0xc93f5f];
const BOTTOM = [0x35425e, 0x2f3b52, 0x453a52, 0x3b3b42];

/**
 * Ek kirdaar ke dono roop -- seed se, taaki dono bilkul ek jaise dikhein aur
 * har load par wahi mile.
 */
function makePerson(i) {
  const r = seeded(i * 7919 + 13);
  const roll = r();
  const build = roll < 0.46 ? "male" : roll < 0.84 ? "female" : "elder";
  const pick = (arr) => arr[(r() * arr.length) | 0];
  const opts = {
    build,
    skin: pick(SKIN),
    top: build === "female" ? pick(FEMALE_TOP) : pick(MALE_TOP),
    bottom: pick(BOTTOM),
    dupatta: pick(DUPATTA),
    // Pahadi topi zyadatar aadmiyon aur buzurgon ke sar pe
    topi: build !== "female" && r() < 0.72,
    height: 0.95 + r() * 0.1,
  };
  return {
    lite: buildHuman({ ...opts, lod: "crowd" }),
    full: buildHuman(opts),
  };
}

/**
 * Doori ke hisaab se roop badlo. Dono mesh ki transform ek jaisi rakhi jaati
 * hai, isliye switch dikhta nahi.
 */
function setDetail(entry, dist) {
  const wantFull = entry.full
    ? dist < (entry.detailed ? DETAIL_RANGE + DETAIL_HYSTERESIS : DETAIL_RANGE)
    : false;
  if (wantFull === entry.detailed) return;
  entry.detailed = wantFull;
  const from = wantFull ? entry.lite : entry.full;
  const to = wantFull ? entry.full : entry.lite;
  to.position.copy(from.position);
  to.rotation.copy(from.rotation);
  to.visible = from.visible;
  from.visible = false;
  entry.mesh = to;
}

export class Crowd {
  /**
   * @param stalls bazaar.userData.stalls -- har dukan ka counter aur mooh
   * @param budget {keepers, walkers, dogs, cows}
   */
  constructor(scene, terrain, roads, stalls, budget) {
    this.terrain = terrain;
    this.roads = roads;
    this.stalls = stalls;
    this.group = new THREE.Group();
    this.group.name = "crowd";
    scene.add(this.group);

    const addPerson = (seed, extra) => {
      const { lite, full } = makePerson(seed);
      lite.visible = false; full.visible = false;
      this.group.add(lite); this.group.add(full);
      return { lite, full, mesh: lite, detailed: false, ...extra };
    };

    this.keepers = [];
    for (let i = 0; i < budget.keepers; i++) {
      this.keepers.push(addPerson(i, { stall: null }));
    }

    this.walkers = [];
    for (let i = 0; i < budget.walkers; i++) {
      this.walkers.push(addPerson(1000 + i,
        { seg: null, d: 0, dir: 1, side: 1, phase: Math.random() * 10 }));
    }

    this.animals = [];
    for (let i = 0; i < budget.dogs; i++) {
      const mesh = buildDog({ coat: [0xa97f56, 0x6f5a44, 0x8a7256][i % 3] });
      mesh.visible = false;
      this.group.add(mesh);
      this.animals.push({ mesh, kind: "dog", stall: null, phase: Math.random() * 10 });
    }
    for (let i = 0; i < budget.cows; i++) {
      const mesh = buildCow({ hide: [0xb59a76, 0xc9bda8][i % 2] });
      mesh.visible = false;
      this.group.add(mesh);
      this.animals.push({ mesh, kind: "cow", stall: null, phase: Math.random() * 10 });
    }

    this._taken = new Set();
    this._t = 0;
  }

  get count() {
    const detailed = [...this.keepers, ...this.walkers].filter((e) => e.detailed).length;
    return { keepers: this.keepers.length, walkers: this.walkers.length,
             animals: this.animals.length, detailed };
  }

  /** Khiladi ke paas ki ek khaali dukan dhoondo. */
  _claimStall(pos, minGap = 0) {
    for (let tries = 0; tries < 40; tries++) {
      const i = (Math.random() * this.stalls.length) | 0;
      if (this._taken.has(i)) continue;
      const s = this.stalls[i];
      const d = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (d > KEEPER_RANGE || d < minGap) continue;
      this._taken.add(i);
      return { i, s };
    }
    return null;
  }

  update(dt, playerPos) {
    this._t += dt;

    // ---- dukandaar: counter ke peeche khade, sadak ki taraf mooh ----
    for (const k of this.keepers) {
      if (k.stall) {
        const d = Math.hypot(k.stall.s.x - playerPos.x, k.stall.s.z - playerPos.z);
        if (d > RECYCLE_AT) { this._taken.delete(k.stall.i); k.stall = null; k.mesh.visible = false; }
      }
      if (!k.stall) {
        const got = this._claimStall(playerPos);
        if (!got) continue;
        k.stall = got;
        const s = got.s;
        k.mesh.position.set(s.keeperX, this.terrain.heightAt(s.keeperX, s.keeperZ), s.keeperZ);
        k.mesh.rotation.y = s.yaw;          // dukan ka mooh sadak ki taraf, wahi keeper ka
        k.mesh.visible = true;
      }
      setDetail(k, Math.hypot(k.mesh.position.x - playerPos.x,
                              k.mesh.position.z - playerPos.z));
      // khade rehte hain, par saans ka halka bob
      const rig = k.mesh.userData.rig;
      if (rig) {
        const sway = Math.sin(this._t * 1.3 + k.stall.i) * 0.045;
        rig.arms[0].shoulder.rotation.x = sway;
        rig.arms[1].shoulder.rotation.x = -sway;
      }
    }

    // ---- paidal log: bazaar ke kinare chalte hue ----
    for (const w of this.walkers) {
      if (!w.stall) {
        const got = this._claimStall(playerPos, 12);
        if (!got) continue;
        w.stall = got;
        w.dir = Math.random() < 0.5 ? 1 : -1;
        // dukan ke saamne, sadak ke kinare pe
        const fx = Math.sin(got.s.yaw), fz = -Math.cos(got.s.yaw);
        w.x = got.s.x + fx * 5.2;
        w.z = got.s.z + fz * 5.2;
        w.ux = -fz * w.dir; w.uz = fx * w.dir;      // sadak ke saath
        w.mesh.visible = true;
      }
      w.x += w.ux * WALK_SPEED * dt;
      w.z += w.uz * WALK_SPEED * dt;
      w.mesh.position.set(w.x, this.terrain.heightAt(w.x, w.z), w.z);
      w.mesh.rotation.y = Math.atan2(w.ux, w.uz);
      const d = Math.hypot(w.x - playerPos.x, w.z - playerPos.z);
      setDetail(w, d);
      walkGait(w.mesh, this._t + w.phase);
      if (d > RECYCLE_AT) {
        this._taken.delete(w.stall.i);
        w.stall = null;
        w.mesh.visible = false;
      }
    }

    // ---- kutte aur gaay ----
    for (const a of this.animals) {
      if (!a.stall) {
        const got = this._claimStall(playerPos, 18);
        if (!got) continue;
        a.stall = got;
        const fx = Math.sin(got.s.yaw), fz = -Math.cos(got.s.yaw);
        const out = a.kind === "cow" ? 7.5 : 6.0;
        const x = got.s.x + fx * out, z = got.s.z + fz * out;
        a.mesh.position.set(x, this.terrain.heightAt(x, z), z);
        a.mesh.rotation.y = got.s.yaw + (Math.random() - 0.5) * 1.6;
        a.mesh.visible = true;
      }
      animateQuadruped(a.mesh, this._t + a.phase, false);
      const p = a.mesh.position;
      if (Math.hypot(p.x - playerPos.x, p.z - playerPos.z) > RECYCLE_AT) {
        this._taken.delete(a.stall.i);
        a.stall = null;
        a.mesh.visible = false;
      }
    }
  }
}

/** Chalne ka gait -- player.js wale `_animate()` ka halka roop. */
function walkGait(mesh, t) {
  const rig = mesh.userData.rig;
  if (!rig) return;
  const sw = Math.sin(t * 7.4) * 0.42;
  const sw2 = -sw;
  rig.legs[0].hip.rotation.x = sw;
  rig.legs[1].hip.rotation.x = sw2;
  rig.legs[0].knee.rotation.x = Math.max(0, -sw) * 1.05;
  rig.legs[1].knee.rotation.x = Math.max(0, -sw2) * 1.05;
  rig.arms[0].shoulder.rotation.x = sw2 * 0.72;
  rig.arms[1].shoulder.rotation.x = sw * 0.72;
  rig.arms[0].elbow.rotation.x = -Math.abs(sw2) * 0.5 - 0.14;
  rig.arms[1].elbow.rotation.x = -Math.abs(sw) * 0.5 - 0.14;
}
