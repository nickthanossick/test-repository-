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
