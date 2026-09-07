import * as THREE from "three";
import { faceYaw } from "./human.js";

/**
 * Vicky ka danda aur pathar.
 *
 * Nikhil: "character ji ab power b de -- wo danda. Pathar mar skta, par police
 * k ni man skta, jaise e marega waise arrest hoga. Aur public m b agr jyda
 * logo s marega to police aegi."
 *
 * Ab tak `panga.js` sirf **NPC se khiladi** ka jhagda karta tha -- NPC dhakka
 * deta tha, gaali deta tha, aur khiladi kuch nahi kar sakta tha. Ye ulti taraf
 * hai.
 *
 * Do hathiyar:
 *   G  danda   -- saamne ke arc mein jo bhi aaye, ek jhatke mein
 *   R  pathar  -- ek parabola, jahan lage wahan
 *
 * Police ka niyam yahin lagu hota hai: har maar ka apna heat hai, aur
 * **police par haath** seedha chaar sitare de deta hai. Bheed ke saamne maarne
 * par heat doguna -- yahi "public mein zyada logon ko maroge to police aayegi"
 * wala hissa hai.
 */

const SWING_TIME = 0.42;         // poore swing ka waqt
const SWING_HIT_AT = 0.16;       // itni der baad chot lagti hai
const REACH = 2.3;               // danda kitni door tak
const ARC = Math.PI * 0.62;      // saamne ka kitna hissa
const COOLDOWN = 0.55;

const STONE_SPEED = 17;
const STONE_GRAVITY = 15;
const STONE_LIFE = 3.2;
const STONE_COOLDOWN = 0.8;

/** Heat: aam aadmi, aur police -- Nikhil ka niyam. */
const HEAT_CIVILIAN = 9;
const HEAT_POLICE = 40;          // seedha 4 sitare
const CROWD_WATCHING = 5;        // itne log paas hon to heat doguna
const WATCH_RADIUS = 12;

export class Combat {
  /**
   * @param deps {crowd, wanted, hud, audio, dialogue, player, scene, terrain, panga}
   */
  constructor(deps) {
    this.d = deps;
    this.swing = 0;              // 0 = ruka hua, warna bacha hua waqt
    this.cool = 0;
    this.stoneCool = 0;
    this.stones = [];
    this.hitsThisSwing = null;
    this.totalHits = 0;

    this.stoneGeo = new THREE.SphereGeometry(0.075, 6, 5);
    this.stoneMat = new THREE.MeshStandardMaterial({ color: 0x6e6a63, roughness: 0.95 });
  }

  /** HUD/test ke liye -- abhi danda chal raha hai ya nahi. */
  get swinging() { return this.swing > 0; }

  update(dt, ctl) {
    this.cool = Math.max(0, this.cool - dt);
    this.stoneCool = Math.max(0, this.stoneCool - dt);

    if (ctl.hit && !this.swing && !this.cool) this._startSwing();
    if (ctl.throw && !this.stoneCool) this._throwStone();

    if (this.swing > 0) {
      const before = this.swing;
      this.swing = Math.max(0, this.swing - dt);
      const elapsed = SWING_TIME - this.swing;
      // chot swing ke beech mein lagti hai, shuru ya aakhir mein nahi
      if (before > SWING_TIME - SWING_HIT_AT && elapsed >= SWING_HIT_AT) this._land();
      this._animate(elapsed / SWING_TIME);
      if (this.swing === 0) { this._animate(-1); this.cool = COOLDOWN; }
    }

    this._updateStones(dt);
  }

  _startSwing() {
    this.swing = SWING_TIME;
    this.hitsThisSwing = new Set();
    this.d.audio?.blip(320, 0.08, 0.14);
  }

  /**
   * Swing ka animation. Danda daayein kohni se latka hai, isliye sirf kandha
   * ghumana kaafi hai -- `t` 0..1, ya -1 matlab wapas aam halat mein.
   */
  _animate(t) {
    const rig = this.d.player.mesh.userData.rig;
    const arm = rig?.arms?.[1];
    if (!arm) return;
    if (t < 0) { arm.shoulder.rotation.x = 0; arm.shoulder.rotation.z = 0; return; }
    // upar uthao, phir tez neeche
    const up = Math.min(1, t / 0.38);
    const down = Math.max(0, (t - 0.38) / 0.62);
    arm.shoulder.rotation.x = -up * 2.5 + down * 3.4;
    arm.shoulder.rotation.z = -0.35 * (1 - down);
  }

  /** Saamne ke arc mein jo NPC aaye use chot. */
  _land() {
    const P = this.d.player;
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    let any = false;
    for (const npc of this._targets()) {
      const m = npc.mesh;
      if (!m.visible || this.hitsThisSwing.has(m.uuid)) continue;
      const dx = m.position.x - P.pos.x, dz = m.position.z - P.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > REACH || dist < 0.01) continue;
      // arc: khiladi ke saamne hi
      const dot = (dx / dist) * fx + (dz / dist) * fz;
      if (dot < Math.cos(ARC / 2)) continue;
      this.hitsThisSwing.add(m.uuid);
      this._hit(npc, dx / dist, dz / dist, "danda");
      any = true;
    }
    if (!any) this.d.audio?.blip(180, 0.05, 0.08);
  }

  _throwStone() {
    const P = this.d.player;
    this.stoneCool = STONE_COOLDOWN;
    const mesh = new THREE.Mesh(this.stoneGeo, this.stoneMat);
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    mesh.position.set(P.pos.x + fx * 0.5, P.pos.y + 1.5, P.pos.z + fz * 0.5);
    this.d.scene.add(mesh);
    this.stones.push({
      mesh, life: STONE_LIFE,
      vx: fx * STONE_SPEED, vy: 3.4, vz: fz * STONE_SPEED,
    });
    this.d.audio?.blip(520, 0.06, 0.1);
  }

  _updateStones(dt) {
    for (let i = this.stones.length - 1; i >= 0; i--) {
      const s = this.stones[i];
      s.vy -= STONE_GRAVITY * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.life -= dt;

      let done = s.life <= 0;
      // zameen se takra gaya
      if (!done && s.mesh.position.y <= this.d.terrain.heightAt(s.mesh.position.x, s.mesh.position.z) + 0.08) {
        done = true;
      }
      if (!done) {
        for (const npc of this._targets()) {
          const m = npc.mesh;
          if (!m.visible) continue;
          const dx = m.position.x - s.mesh.position.x;
          const dz = m.position.z - s.mesh.position.z;
          const dy = s.mesh.position.y - m.position.y;
          if (Math.hypot(dx, dz) < 0.55 && dy > 0.2 && dy < 1.9) {
            const d = Math.hypot(dx, dz) || 1;
            this._hit(npc, dx / d, dz / d, "pathar");
            done = true;
            break;
          }
        }
      }
      if (done) {
        this.d.scene.remove(s.mesh);
        this.stones.splice(i, 1);
      }
    }
  }

  /** Jinpar maar padd sakti hai: bheed aur paidal police dono. */
  _targets() {
    const c = this.d.crowd;
    const cops = this.d.wanted?.constables || [];
    return [...c.walkers, ...c.keepers, ...cops];
  }

  /**
   * Chot lagi.
   *
   * Yahin Nikhil ka police wala niyam baithta hai: police par haath = seedha
   * chaar sitare, aur bheed ke saamne maarna = doguna heat.
   */
  _hit(npc, nx, nz, how) {
    const { wanted, hud, audio, dialogue, crowd } = this.d;
    const m = npc.mesh;
    this.totalHits++;

    // peeche girta hai
    const push = how === "danda" ? 1.5 : 0.9;
    m.position.x += nx * push;
    m.position.z += nz * push;
    if (npc.x !== undefined) { npc.x += nx * push; npc.z += nz * push; }
    m.rotation.y = faceYaw(-nx, -nz);          // palat kar dekhta hai
    m.userData.angry = true;

    const police = !!npc.police;
    let heat = police ? HEAT_POLICE : HEAT_CIVILIAN;

    // kitne log dekh rahe hain
    let watching = 0;
    for (const other of [...crowd.walkers, ...crowd.keepers]) {
      if (other.mesh === m || !other.mesh.visible) continue;
      if (other.mesh.position.distanceTo(m.position) < WATCH_RADIUS) watching++;
    }
    if (watching >= CROWD_WATCHING) heat *= 2;

    wanted?.add(heat);
    audio?.blip(how === "danda" ? 150 : 240, 0.18, 0.26);

    if (police) {
      hud?.toast("Police pe haath! Ab to gaye.", 3);
      dialogue?.play("generic:hit_police");
    } else {
      hud?.toast(watching >= CROWD_WATCHING
        ? "Sab dekh rahe hain — police aayegi"
        : (how === "danda" ? "Danda pada" : "Pathar laga"), 1.8);
      dialogue?.play("panga:l3");
    }

    // aas-paas wale ghoom kar dekhne lagte hain -- panga.js wala hi bartav
    for (const other of [...crowd.walkers, ...crowd.keepers]) {
      const om = other.mesh;
      if (om === m || !om.visible) continue;
      if (om.position.distanceTo(m.position) < WATCH_RADIUS) {
        om.rotation.y = faceYaw(m.position.x - om.position.x,
                                m.position.z - om.position.z);
      }
    }
  }

  /** Busted hone par saare pathar hata do. */
  clear() {
    for (const s of this.stones) this.d.scene.remove(s.mesh);
    this.stones.length = 0;
    this.swing = 0;
    this._animate(-1);
  }
}
