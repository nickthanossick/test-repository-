/**
 * Bahut simple uniform spatial hash.
 *
 * Building spacing aur tree-vs-building checks ke liye. Pehle ye linear scan
 * tha -- 9000 ped x 400 building = 3.6M distance checks har load pe. Grid se
 * ye constant-time ho jaata hai, aur load ~2s se ~200ms pe aa jaata hai.
 */
export class SpatialGrid {
  constructor(cell = 16) { this.cell = cell; this.map = new Map(); }

  _key(x, z) { return ((x / this.cell) | 0) + "," + ((z / this.cell) | 0); }

  add(x, z) {
    const k = this._key(x, z);
    let a = this.map.get(k);
    if (!a) this.map.set(k, (a = []));
    a.push(x, z);
  }

  /** Kya (x,z) ke `r` metre ke andar pehle se kuch hai? */
  occupied(x, z, r) {
    const r2 = r * r;
    const cx = (x / this.cell) | 0, cz = (z / this.cell) | 0;
    const span = Math.ceil(r / this.cell);
    for (let iz = cz - span; iz <= cz + span; iz++) {
      for (let ix = cx - span; ix <= cx + span; ix++) {
        const a = this.map.get(ix + "," + iz);
        if (!a) continue;
        for (let i = 0; i < a.length; i += 2) {
          const dx = a[i] - x, dz = a[i + 1] - z;
          if (dx * dx + dz * dz < r2) return true;
        }
      }
    }
    return false;
  }
}

/**
 * Building ke mote-mote cylinder colliders.
 *
 * Poore merged building mesh (600k+ triangles) pe raycast karna har frame
 * bahut mehnga hai -- three.js ka raycaster brute-force hai, koi BVH nahi.
 * Iske bajaye har imaarat ko ek cylinder maan lete hain. Camera occlusion aur
 * spawn-safety ke liye itna kaafi hai, aur constant-time hai.
 */
export class Colliders {
  constructor(cell = 24) { this.cell = cell; this.map = new Map(); this.count = 0; }

  add(x, z, r, y0, y1) {
    const k = ((x / this.cell) | 0) + "," + ((z / this.cell) | 0);
    let a = this.map.get(k);
    if (!a) this.map.set(k, (a = []));
    a.push({ x, z, r, y0, y1 });
    this.count++;
  }

  /** Kya (x,y,z) kisi imaarat ke andar hai? */
  inside(x, y, z, pad = 0) {
    const cx = (x / this.cell) | 0, cz = (z / this.cell) | 0;
    for (let iz = cz - 1; iz <= cz + 1; iz++) {
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        const a = this.map.get(ix + "," + iz);
        if (!a) continue;
        for (const c of a) {
          if (y < c.y0 - pad || y > c.y1 + pad) continue;
          const dx = c.x - x, dz = c.z - z, rr = c.r + pad;
          if (dx * dx + dz * dz < rr * rr) return c;
        }
      }
    }
    return null;
  }

  /**
   * `pos` ko har overlapping cylinder ke bahar dhakel do.
   *
   * Ye sirf dhakka nahi, **pakki rok** hai: lautne ke baad pos kisi bhi cylinder
   * ke andar nahi hota. Do baar chalate hain kyunki do imaaraton ke kone mein ek
   * se bahar nikaalte hi doosre mein ghus jaate hain.
   *
   * Push horizontal hi hai -- oopar se nahi nikaalte, warna khiladi deewar par
   * chadh jaata. Aur `hitX/hitZ` (unit normal) wapas milta hai taaki gaadi apni
   * raftaar ka utna hissa kaat sake jitna deewar ki taraf tha.
   *
   * @returns {hit: boolean, nx: number, nz: number, depth: number}
   */
  resolve(pos, radius, y, iterations = 3) {
    let hit = false, nx = 0, nz = 0, depth = 0;
    for (let it = 0; it < iterations; it++) {
      const c = this.inside(pos.x, y, pos.z, radius);
      if (!c) break;
      hit = true;
      let dx = pos.x - c.x, dz = pos.z - c.z;
      let d = Math.hypot(dx, dz);
      if (d < 1e-4) { dx = 1; dz = 0; d = 1; }     // theek kendra par -- kisi bhi disha mein
      const push = c.r + radius - d;
      if (push <= 0) break;
      dx /= d; dz /= d;
      pos.x += dx * (push + 1e-3);
      pos.z += dz * (push + 1e-3);
      if (push > depth) { depth = push; nx = dx; nz = dz; }
    }
    return { hit, nx, nz, depth };
  }

  /**
   * Ek jagah se doosri jagah tak sarko, par kisi cylinder ke *paar* mat jao.
   *
   * Tez raftaar par ye zaroori hai: 100 km/h ki gaadi ek frame mein ~1.4 m
   * chalti hai, par 20 fps par 5.5 m -- aur 6 m ki dukan ke aar-paar nikal
   * jaati hai. Isliye raaste ko chhote kadmon mein toda jaata hai.
   *
   * @param pos badla jaata hai (in place)
   */
  sweep(pos, dx, dz, radius, y, maxStep = 1.0) {
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / maxStep));
    let out = { hit: false, nx: 0, nz: 0, depth: 0 };
    for (let i = 0; i < steps; i++) {
      pos.x += dx / steps;
      pos.z += dz / steps;
      const r = this.resolve(pos, radius, y);
      if (r.hit) out = r;
    }
    return out;
  }

  /** Sabse nazdeek khaali jagah dhoondo -- spawn/teleport ke liye. */
  freeSpotNear(x, z, y, pad = 1.5, step = 4, rings = 8) {
    if (!this.inside(x, y, z, pad)) return { x, z };
    for (let r = 1; r <= rings; r++) {
      for (let a = 0; a < 12; a++) {
        const th = (a / 12) * Math.PI * 2;
        const nx = x + Math.cos(th) * r * step, nz = z + Math.sin(th) * r * step;
        if (!this.inside(nx, y, nz, pad)) return { x: nx, z: nz };
      }
    }
    return { x, z };
  }
}
