/**
 * Panga -- NPC se takrane par jhagda.
 *
 * NPC static collider grid mein nahi ja sakte: wo chalte hain aur khiladi ke
 * aas-paas recycle hote rehte hain. Isliye unka apna chhota check hai -- har
 * NPC ek cylinder, aur sirf khiladi ke paas walon se milaan hota hai. Bheed
 * waise bhi ~50 hai, to ye sasta padta hai.
 *
 * Takkar badhti hai aur apne aap thandi bhi hoti hai:
 *   1  NPC ghoom kar dekhta hai aur ek line bolta hai
 *   2  dhakka deta hai -- khiladi peeche khiskta hai, thodi health jaati hai
 *   3  haath chalata hai -- zyada health, aur aas-paas wale dekhne lagte hain
 *   gaadi se takkar seedha level 3, aur police ka dhyan bhi khinchta hai
 *
 * Ye mission system nahi hai aur usse kuch lena-dena bhi nahi -- missions ko
 * chhua nahi gaya.
 */

const NPC_RADIUS = 0.38;
const PLAYER_RADIUS = 0.42;
const COOLDOWN = 8.0;          // itni der door raho to NPC thanda
const ESCALATE_WINDOW = 8.0;   // itni der ke andar dobara laga to level badhega
const SHOVE_BACK = 1.35;       // khiladi kitna peeche khiskta hai
const WATCH_RADIUS = 9.0;      // level 3 par itne aas-paas wale ghoom kar dekhte hain

export class Panga {
  /**
   * @param crowd Crowd -- keepers/walkers isi se aate hain
   * @param deps {dialogue, hud, audio, wanted, player}
   */
  constructor(crowd, deps) {
    this.crowd = crowd;
    this.d = deps;
    this.state = new Map();     // mesh.uuid -> {level, last, until}
    this.active = 0;
  }

  /** Abhi kitne NPC gusse mein hain -- HUD/test ke liye. */
  get angryCount() { return this.active; }

  _lines(kind) {
    const L = this.d.dialogue?.lines || {};
    return L[kind] || null;
  }

  _say(kind, seconds = 2.6) {
    const beat = this._lines(kind);
    if (!beat || !beat.length) return;
    const line = beat[(Math.random() * beat.length) | 0];
    this.d.dialogue.say(line.speaker || "rahgeer", line.text, seconds);
  }

  /** @param movers khiladi ya gaadi: {pos, radius, speed, inVehicle} */
  update(dt, mover) {
    const px = mover.pos.x, pz = mover.pos.z;
    const myR = mover.radius ?? PLAYER_RADIUS;
    let angry = 0;

    const all = [...this.crowd.keepers, ...this.crowd.walkers];
    for (const npc of all) {
      const m = npc.mesh;
      if (!m.visible) continue;

      const st = this.state.get(m.uuid);
      if (st) {
        st.until -= dt;
        if (st.until <= 0) {
          // Thanda ho gaya -- wapas apne kaam par
          this.state.delete(m.uuid);
          m.userData.angry = false;
        } else {
          angry++;
          // gusse mein khiladi ki taraf mooh kiye rehta hai
          m.rotation.y = Math.atan2(px - m.position.x, pz - m.position.z);
        }
      }

      const dx = m.position.x - px, dz = m.position.z - pz;
      const d = Math.hypot(dx, dz);
      const touch = NPC_RADIUS + myR;
      if (d > touch) continue;

      // ---- takkar ----
      // NPC thos hai: khiladi ko bahar dhakelo, warna uske andar se guzar jaata
      const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
      const push = touch - d;
      mover.pos.x -= nx * push;
      mover.pos.z -= nz * push;

      const now = performance.now() / 1000;
      const prev = this.state.get(m.uuid);
      let level;
      if (mover.inVehicle) {
        level = 3;                                     // gaadi maar di -- seedha jhagda
      } else if (prev && now - prev.last < ESCALATE_WINDOW) {
        level = Math.min(3, prev.level + 1);
      } else {
        level = 1;
      }
      if (prev && prev.level === level && now - prev.last < 1.2) continue;   // ek hi takkar

      this.state.set(m.uuid, { level, last: now, until: COOLDOWN });
      m.userData.angry = true;
      this._react(level, m, mover, nx, nz);
    }
    this.active = angry;
  }

  _react(level, mesh, mover, nx, nz) {
    const { dialogue, hud, audio, wanted, player } = this.d;
    mesh.rotation.y = Math.atan2(mover.pos.x - mesh.position.x,
                                 mover.pos.z - mesh.position.z);

    if (mover.inVehicle) {
      this._say("panga:car", 3.0);
      hud?.toast("Panga ho gaya!", 2.2);
      audio?.blip(180, 0.22, 0.25);
      wanted?.add(9);                     // sadak par gaadi maarna police ka mamla
      return;
    }

    if (level === 1) {
      this._say("panga:l1", 2.6);
      audio?.blip(420, 0.09, 0.16);
      return;
    }

    // Level 2+ par NPC haath chalata hai -- khiladi peeche khiskta hai
    if (player) {
      player.pos.x -= nx * SHOVE_BACK;
      player.pos.z -= nz * SHOVE_BACK;
      player.health = Math.max(0, player.health - (level === 2 ? 4 : 11));
    }

    if (level === 2) {
      this._say("panga:l2", 2.8);
      hud?.toast("Dhakka lag gaya", 1.6);
      audio?.blip(260, 0.16, 0.22);
    } else {
      this._say("panga:l3", 3.2);
      hud?.toast("Ladai shuru!", 2.4);
      audio?.blip(150, 0.26, 0.3);
      wanted?.add(4);                     // sar-e-aam jhagda
      // aas-paas wale ghoom kar dekhne lagte hain
      for (const other of [...this.crowd.keepers, ...this.crowd.walkers]) {
        const om = other.mesh;
        if (om === mesh || !om.visible) continue;
        const dd = Math.hypot(om.position.x - mesh.position.x,
                              om.position.z - mesh.position.z);
        if (dd < WATCH_RADIUS) {
          om.rotation.y = Math.atan2(mesh.position.x - om.position.x,
                                     mesh.position.z - om.position.z);
        }
      }
    }
  }
}
