import * as THREE from "three";
import { MeshBuilder } from "./geometry.js";
import * as TEX from "./textures.js";

/**
 * Shimla ki asli jagahein -- har ek ki apni pehchan wali imaarat.
 *
 * Pehle ye city.js ke andar ek 12-case ka `switch` tha jisme har jagah do-teen
 * box thi. Nateeja: 32 POI mein se 20 ke aas-paas wahi procedural ghar bikhre
 * hote the, aur Sanjauli Chowk, Kasumpti aur Chhota Shimla bilkul ek jaise
 * lagte the.
 *
 * Ab ek registry hai: har POI ka `landmark` field batata hai kaunsa builder
 * chalega, aur builders reusable hain -- bazaar ki kataar, colonial block,
 * college campus, dukan, mandir, tunnel. Iske upar **naam ka board** lagta hai,
 * jo sabse zyada farak deta hai.
 */

// ---------------------------------------------------------------- helpers

/** Deterministic per-POI RNG -- har jagah har baar ek jaisi banti hai. */
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5; h |= 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Imaarat ka mukh sabse nazdeek sadak ki taraf ghumao.
 *
 * Local -Z ko sadak ki disha pe rakhte hain. MeshBuilder ka yaw (x,z) ko
 * ghumata hai, to local (0,0,-1) -> (sin yaw, -cos yaw); usse sadak ki disha
 * ke barabar rakhne pe yaw = atan2(dx, -dz).
 */
function facing(roads, x, z) {
  const n = roads.nearestNode(x, z, (r) => r.type !== "rail");
  if (!n) return 0;
  const dx = n.node.pos.x - x, dz = n.node.pos.z - z;
  if (Math.hypot(dx, dz) < 0.5) return 0;
  return Math.atan2(dx, -dz);
}

/** Sadak ki disha (tangent) -- bazaar ki kataar isi ke saath lagti hai. */
function roadTangent(roads, x, z) {
  const n = roads.nearestNode(x, z, (r) => r.type !== "rail");
  if (!n) return { tx: 1, tz: 0, dist: Infinity };
  return { tx: -n.node.nz, tz: n.node.nx, dist: n.dist };
}

const C = new THREE.Color();
const hex = (h) => C.setHex(h);

// ---------------------------------------------------------------- builders
//
// Har builder ko ctx milta hai: { x, z, y, yaw, L(u,v), rng, poi }
// aur mb: { stone, plaster, tin, wood, glass, metal } -- alag material groups.

/** College / school campus -- lamba block + arcade + tower + gate. */
function campus(c, mb) {
  const { x, z, y, yaw, L, rng } = c;
  const w = 30 + rng() * 12, d = 12, h = 7.4;

  // lawn -- zameen mein dhansi hui, taaki dhalan pe tairti hui na lage
  hex(0x3f6b39); mb.stone.box(x, y - 0.35, z, w * 1.35, 1.0, d * 2.3, C, yaw);

  // main block, do manzil
  hex(0xd9cdb4); mb.plaster.box(x, y + h / 2, z, w, h, d, C, yaw);
  hex(0xc2b598);
  mb.plaster.box(x, y + h * 0.5, z, w * 1.01, 0.22, d * 1.01, C, yaw);   // string course
  hex(0x8f2f28); mb.tin.gableRoof(x, y + h, z, w, d, 2.4, 0.7, C, yaw, true);

  // ground floor arcade -- colonial campus ki pehchan
  const cols = Math.floor(w / 3.2);
  for (let i = 0; i < cols; i++) {
    const u = (i / (cols - 1) - 0.5) * (w - 1.6);
    const [px, pz] = L(u, -(d / 2 + 1.1));
    hex(0xe4dac4); mb.plaster.box(px, y + 1.7, pz, 0.5, 3.4, 0.5, C, yaw);
  }
  const [ax, az] = L(0, -(d / 2 + 1.1));
  hex(0xd0c4a8); mb.plaster.box(ax, y + 3.55, az, w - 1.0, 0.36, 2.4, C, yaw);

  // ek sire pe chapel/hall tower
  const [tx, tz] = L(w / 2 - 3.4, 1.5);
  hex(0xcfc2a6); mb.plaster.box(tx, y + 7.5, tz, 6.4, 15, 6.4, C, yaw);
  hex(0x7a2b24); mb.tin.pyramid(tx, y + 15, tz, 7.2, 5.2, C, yaw);

  // khidkiyan
  for (let f = 0; f < 2; f++) {
    for (let i = 0; i < cols; i++) {
      const u = (i / (cols - 1) - 0.5) * (w - 2.4);
      const [wx, wz] = L(u, -(d / 2 + 0.04));
      hex(0xe9e2d2); mb.plaster.box(wx, y + 1.9 + f * 3.3, wz, 1.15, 1.7, 0.16, C, yaw);
      hex(0x2c3b46); mb.glass.box(wx, y + 1.9 + f * 3.3, wz, 0.85, 1.4, 0.1, C, yaw);
    }
  }

  // boundary wall + gate posts
  for (const s of [-1, 1]) {
    const [gx, gz] = L(s * 4.2, -(d / 2 + 12));
    hex(0x9a9086); mb.stone.box(gx, y + 1.5, gz, 1.0, 3.0, 1.0, C, yaw);
  }
}

/** Bazaar ki kataar -- sadak ke saath sitti hui dukanein, upar ghar. */
function bazaar(c, mb) {
  const { x, z, y, terrain, rng, poi } = c;
  const { tx, tz } = roadTangent(c.roads, x, z);
  const yaw = Math.atan2(tx, -tz) + Math.PI / 2;
  const count = poi.id.includes("sanjauli") ? 11 : 7;
  const unit = 4.6;

  for (let i = 0; i < count; i++) {
    const t = (i - (count - 1) / 2) * unit;
    const sx = x + tx * t, sz = z + tz * t;
    // dukanein sadak ke dono taraf
    for (const side of [-1, 1]) {
      if (side > 0 && rng() > 0.72) continue;
      const off = side * (5.2 + rng() * 1.4);
      const bx = sx - tz * off, bz = sz + tx * off;
      const g = terrain.heightAt(bx, bz);
      const floors = 2 + Math.floor(rng() * 2);
      const bh = floors * 3.1;

      hex(0x8b8177); mb.stone.box(bx, g - 1.2, bz, unit * 0.95, 3.0, 6.2, C, yaw);   // plinth
      hex([0xc9bda6, 0xd2c4ad, 0xb8ad98, 0xc0b6a4][(rng() * 4) | 0]);
      mb.plaster.box(bx, g + bh / 2, bz, unit * 0.92, bh, 6.0, C, yaw);

      // ground floor shutter, sadak ki taraf
      const fx = bx + tz * side * 3.05, fz = bz - tx * side * 3.05;
      hex(0x33393f); mb.metal.box(fx, g + 1.35, fz, unit * 0.72, 2.5, 0.14, C, yaw);
      // awning
      hex([0x8c3b2e, 0x2f5d8a, 0x3f6b47][(rng() * 3) | 0]);
      mb.tin.box(bx + tz * side * 3.9, g + 2.95, bz - tx * side * 3.9,
                 unit * 0.9, 0.12, 1.9, C, yaw);
      // upar balcony
      hex(0xd9cfbc);
      mb.wood.box(bx + tz * side * 3.5, g + 4.6, bz - tx * side * 3.5,
                  unit * 0.78, 2.3, 0.9, C, yaw);
      hex(0x2c3b46);
      mb.glass.box(bx + tz * side * 3.55, g + 4.7, bz - tx * side * 3.55,
                   unit * 0.66, 1.5, 0.5, C, yaw);
      hex([0x8c3b2e, 0x2f5d8a, 0x6b6b70][(rng() * 3) | 0]);
      mb.tin.gableRoof(bx, g + bh, bz, unit * 0.92, 6.0, 1.3, 0.4, C, yaw, false);
    }
  }
}

/** Ek chhoti dukan -- Buddy's, dhaba, daftar. */
function shopfront(c, mb) {
  const { x, z, y, yaw, L, rng } = c;
  const w = 6.5, d = 6.0;
  hex(0x8b8177); mb.stone.box(x, y - 1.0, z, w * 1.05, 2.6, d * 1.05, C, yaw);
  hex(0xd2c4ad); mb.plaster.box(x, y + 3.1, z, w, 6.2, d, C, yaw);
  const [fx, fz] = L(0, -(d / 2 + 0.05));
  hex(0x2c3b46); mb.glass.box(fx, y + 1.5, fz, w * 0.74, 2.6, 0.14, C, yaw);   // sheeshe ka front
  hex(0x33393f); mb.metal.box(fx, y + 0.15, fz, w * 0.78, 0.3, 0.2, C, yaw);
  const [ax, az] = L(0, -(d / 2 + 1.0));
  hex(0x8c3b2e); mb.tin.box(ax, y + 3.25, az, w * 0.98, 0.12, 2.1, C, yaw);    // awning
  hex(0x6b6b70); mb.tin.gableRoof(x, y + 6.2, z, w, d, 1.3, 0.42, C, yaw, true);
}

/** Victorian colonial block -- Gaiety, Town Hall, Vidhan Sabha. */
function colonial(c, mb) {
  const { x, z, y, yaw, L, rng, poi } = c;
  const w = 22 + rng() * 8, d = 14, h = 12;
  hex(0x9a9086); mb.stone.box(x, y + 0.5, z, w * 1.08, 1.0, d * 1.08, C, yaw);
  hex(0xc8b89a); mb.plaster.box(x, y + h / 2, z, w, h, d, C, yaw);
  hex(0xb0a084);
  for (const fy of [0.34, 0.68]) mb.plaster.box(x, y + h * fy, z, w * 1.02, 0.3, d * 1.02, C, yaw);
  hex(0xa8987c); mb.plaster.box(x, y + h + 0.35, z, w * 1.06, 0.7, d * 1.06, C, yaw);   // cornice
  hex(0x6d4a3c); mb.tin.gableRoof(x, y + h + 0.7, z, w, d, 3.2, 0.8, C, yaw, true);

  // arched khidkiyan (do manzil)
  const cols = Math.floor(w / 3.0);
  for (let f = 0; f < 3; f++) {
    for (let i = 0; i < cols; i++) {
      const u = (i / (cols - 1) - 0.5) * (w - 2.6);
      const [wx, wz] = L(u, -(d / 2 + 0.04));
      const wy = y + 2.2 + f * 3.5;
      hex(0xe6dcc6); mb.plaster.box(wx, wy, wz, 1.25, 2.1, 0.18, C, yaw);
      hex(0x2c3b46); mb.glass.box(wx, wy, wz, 0.9, 1.7, 0.11, C, yaw);
      hex(0xe6dcc6); mb.plaster.box(wx, wy + 1.2, wz, 1.4, 0.35, 0.2, C, yaw);   // arch head
    }
  }

  // Town Hall pe clock tower
  if (poi.id === "town_hall" || poi.id === "gaiety") {
    const [cx2, cz2] = L(w / 2 - 2.6, 0);
    hex(0xc0ae90); mb.plaster.box(cx2, y + h * 0.5 + 5, cz2, 5.0, h + 10, 5.0, C, yaw);
    hex(0xf0ead8); mb.plaster.box(cx2, y + h + 8.4, cz2, 5.3, 2.4, 5.3, C, yaw);   // clock face
    hex(0x5c3f33); mb.tin.pyramid(cx2, y + h + 9.6, cz2, 5.6, 4.4, C, yaw);
  }
}

/** Mandir -- aangan, shikhara, ghanti ka arch. */
function temple(c, mb) {
  const { x, z, y, yaw, L, rng } = c;
  hex(0x9a9086); mb.stone.box(x, y + 0.25, z, 26, 0.5, 26, C, yaw);       // aangan
  hex(0xd8c9a8); mb.plaster.box(x, y + 3.2, z, 10, 6.4, 10, C, yaw);      // garbhagriha
  // shikhara -- ghatte hue box ka dher
  let s = 8.6, sy = y + 6.4;
  for (let i = 0; i < 6; i++) {
    hex(i % 2 ? 0xd6b98a : 0xc9a877);
    mb.plaster.box(x, sy + 0.9, z, s, 1.8, s, C, yaw);
    sy += 1.8; s *= 0.82;
  }
  hex(0xe8c33a); mb.metal.box(x, sy + 0.7, z, 1.0, 1.4, 1.0, C, yaw);     // kalash
  // ghanti ka arch
  for (const sgn of [-1, 1]) {
    const [gx, gz] = L(sgn * 3.4, -7.2);
    hex(0xb9a888); mb.plaster.box(gx, y + 2.0, gz, 0.7, 4.0, 0.7, C, yaw);
  }
  const [bx, bz] = L(0, -7.2);
  hex(0xb9a888); mb.plaster.box(bx, y + 4.2, bz, 7.5, 0.55, 0.7, C, yaw);
  hex(0xc9a23a); mb.metal.box(bx, y + 3.5, bz, 0.5, 0.8, 0.5, C, yaw);    // ghanti
  // boundary
  for (const sgn of [-1, 1]) {
    const [px, pz] = L(sgn * 13, 0);
    hex(0xa79c8e); mb.stone.box(px, y + 1.0, pz, 0.5, 2.0, 26, C, yaw);
  }
}

/** Tunnel ka portal. */
function tunnel(c, mb, wide) {
  const { x, z, y, yaw, L } = c;
  const w = wide ? 9.5 : 6.0;
  hex(0x8d857a);
  mb.stone.box(x, y + 3.4, z, w + 5, 7.0, 3.2, C, yaw);                    // portal face
  hex(0x14161a);
  mb.stone.box(x, y + 2.3, z, w, 4.6, 3.6, C, yaw);                        // andhera mukh
  hex(0x9a9086);
  mb.stone.box(x, y + 5.2, z, w + 6, 1.0, 3.6, C, yaw);                    // lintel
  for (const sgn of [-1, 1]) {
    const [px, pz] = L(sgn * (w / 2 + 2.6), 0);
    mb.stone.box(px, y + 2.6, pz, 1.4, 5.4, 3.6, C, yaw);
  }
}

/** Chauraha -- island, bollard, board ka khamba. */
function junction(c, mb) {
  const { x, z, y, yaw } = c;
  hex(0x9a9086); mb.stone.box(x, y + 0.22, z, 5.4, 0.44, 5.4, C, yaw);
  hex(0x4f7a41); mb.stone.box(x, y + 0.5, z, 4.2, 0.3, 4.2, C, yaw);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    hex(0xd8d2c4);
    mb.stone.box(x + Math.cos(a) * 3.2, y + 0.5, z + Math.sin(a) * 3.2, 0.28, 0.9, 0.28, C, yaw);
  }
}

/** Khula maidan / plaza -- Ridge, Scandal Point. */
function plaza(c, mb) {
  const { x, z, y, yaw, L } = c;
  hex(0x8d857a); mb.stone.box(x, y + 0.3, z, 46, 0.6, 26, C, yaw);
  for (const sgn of [-1, 1]) {
    const [rx, rz] = L(0, sgn * 13);
    hex(0x3d4147); mb.metal.box(rx, y + 1.1, rz, 46, 0.08, 0.08, C, yaw);
    for (let i = 0; i < 16; i++) {
      const [px, pz] = L((i / 15 - 0.5) * 44, sgn * 13);
      mb.metal.box(px, y + 0.85, pz, 0.07, 1.1, 0.07, C, yaw);
    }
  }
  for (let i = 0; i < 5; i++) {
    const [bx, bz] = L((i / 4 - 0.5) * 34, -8);
    hex(0x6d4a3c); mb.wood.box(bx, y + 0.75, bz, 2.0, 0.14, 0.6, C, yaw);
    mb.wood.box(bx, y + 1.15, bz, 2.0, 0.6, 0.12, C, yaw);
  }
}

/** Timber/cement yard. */
function yard(c, mb) {
  const { x, z, y, yaw, L, rng } = c;
  hex(0x6f6a60); mb.stone.box(x, y + 0.2, z, 34, 0.4, 26, C, yaw);
  for (let i = 0; i < 5; i++) {
    const [lx, lz] = L(-10 + i * 1.5, -6 + rng() * 10);
    for (let k = 0; k < 3 - (i % 2); k++) {
      hex(0x7a5a34);
      mb.wood.box(lx, y + 0.7 + k * 1.05, lz, 1.0, 1.0, 9.5, C, yaw);      // deodar ke latthe
    }
  }
  const [sx, sz] = L(9, 4);
  hex(0xb6ab97); mb.plaster.box(sx, y + 2.4, sz, 9, 4.8, 7, C, yaw);
  hex(0x6b6b70); mb.tin.box(sx, y + 4.95, sz, 9.6, 0.24, 7.6, C, yaw);
  for (const sgn of [-1, 1]) {
    const [fx, fz] = L(sgn * 17, 0);
    hex(0x55504a); mb.metal.box(fx, y + 1.2, fz, 0.2, 2.4, 26, C, yaw);
  }
}

const BUILDERS = {
  campus, bazaar, shopfront, colonial, temple, junction, plaza, yard,
  tunnel_old: (c, mb) => tunnel(c, mb, false),
  tunnel_new: (c, mb) => tunnel(c, mb, true),
  church: (c, mb) => { colonial(c, mb); },
  institution: (c, mb) => { colonial(c, mb); },
  palace: (c, mb) => {
    const { x, z, y, yaw } = c;
    hex(0x8d7f68); c.mbRef.plaster.box(x, y + 8, z, 46, 16, 26, C, yaw);
    hex(0x6f6353); c.mbRef.plaster.box(x, y + 20, z, 12, 9, 12, C, yaw);
    hex(0x5c4a3a); c.mbRef.tin.gableRoof(x, y + 16, z, 46, 26, 4.0, 1.0, C, yaw, true);
  },
  hotel: (c, mb) => {
    const { x, z, y, yaw } = c;
    hex(0x7d5648); mb.plaster.box(x, y + 11, z, 26, 22, 20, C, yaw);
    hex(0xa33030); mb.tin.gableRoof(x, y + 22, z, 26, 20, 3.6, 0.8, C, yaw, true);
  },
  station: (c, mb) => {
    const { x, z, y, yaw } = c;
    hex(0xa03a30); mb.plaster.box(x, y + 4, z, 40, 8, 13, C, yaw);
    hex(0x6b6259); mb.tin.box(x, y + 8.6, z, 43, 1.2, 15, C, yaw);
  },
  busstand: (c, mb) => {
    const { x, z, y, yaw } = c;
    hex(0x6b7680); mb.plaster.box(x, y + 3.5, z, 46, 7, 24, C, yaw);
    hex(0x8d857a); mb.stone.box(x, y + 0.3, z, 60, 0.6, 34, C, yaw);
  },
  ground: (c, mb) => {
    const { x, z, y, yaw } = c;
    hex(0x53853f); mb.stone.box(x, y + 0.3, z, 150, 0.6, 110, C, yaw);
    hex(0xd8d2c4); mb.stone.box(x, y + 0.62, z, 18, 0.06, 18, C, yaw);      // helipad
  },
  garage: (c, mb) => {
    const { x, z, y, yaw, L } = c;
    hex(0x8a7a60); mb.plaster.box(x, y + 2.4, z, 11, 5, 8, C, yaw);
    hex(0x3f5f7a); mb.tin.box(x, y + 5.2, z, 12, 0.5, 9, C, yaw);
    const [dx2, dz2] = L(0, -4.1);
    hex(0x33393f); mb.metal.box(dx2, y + 1.9, dz2, 6.5, 3.8, 0.16, C, yaw);
  },
  house: (c, mb) => {
    const { x, z, y, yaw } = c;
    hex(0xc9bda6); mb.plaster.box(x, y + 4.6, z, 9, 9.2, 8, C, yaw);
    hex(0x2f5d8a); mb.tin.gableRoof(x, y + 9.2, z, 9, 8, 1.8, 0.5, C, yaw, true);
  },
  gate: (c, mb) => {
    const { x, z, y, yaw, L } = c;
    for (const sgn of [-1, 1]) {
      const [px, pz] = L(sgn * 3.2, 0);
      hex(0x9a9086); mb.stone.box(px, y + 1.5, pz, 0.8, 3.0, 0.8, C, yaw);
    }
    hex(0xc2413a); mb.metal.box(x, y + 1.5, z, 6.6, 0.16, 0.16, C, yaw);     // barrier
    const [hx, hz] = L(5.2, 1.0);
    hex(0xb6ab97); mb.plaster.box(hx, y + 1.4, hz, 3.0, 2.8, 3.0, C, yaw);
    hex(0x6b6b70); mb.tin.pyramid(hx, y + 2.8, hz, 3.4, 1.1, C, yaw);
  },
};

// ------------------------------------------------------------------- build

/**
 * Har landmark kism ka mota footprint -- collider ke liye.
 *
 * `r: 0` ka matlab **collider bilkul nahi**, aur ye jaan-boojh kar hai:
 * tunnel, chowk, maidan, gate, parking aur bazaar-row ke aar-paar se guzarna
 * hota hai. Wahan cylinder rakhne se sadak hi band ho jaati.
 */
const FOOTPRINT = {
  campus: { r: 18, h: 14 },
  shopfront: { r: 5.0, h: 8 },
  colonial: { r: 14, h: 17 },
  temple: { r: 10, h: 15 },
  church: { r: 12, h: 19 },
  institution: { r: 14, h: 15 },
  palace: { r: 20, h: 18 },
  hotel: { r: 12, h: 16 },
  station: { r: 14, h: 10 },
  busstand: { r: 10, h: 8 },
  garage: { r: 7.0, h: 6 },
  house: { r: 6.0, h: 11 },
  // guzarne wali jagahein -- yahan collider nahi
  bazaar: { r: 0 }, junction: { r: 0 }, plaza: { r: 0 }, yard: { r: 0 },
  tunnel_old: { r: 0 }, tunnel_new: { r: 0 }, ground: { r: 0 }, gate: { r: 0 },
};

export function buildLandmarks(terrain, roads, pois, colliders = null) {
  const mb = {
    stone: new MeshBuilder(0.32), plaster: new MeshBuilder(0.42),
    tin: new MeshBuilder(0.5), wood: new MeshBuilder(0.6),
    glass: new MeshBuilder(0.9), metal: new MeshBuilder(0.8),
  };
  const signs = [];

  for (const p of pois.pois) {
    const fn = BUILDERS[p.landmark];
    if (!fn) continue;
    const { x, z } = terrain.geo.toWorld(p.lat, p.lon);
    const y = terrain.heightAt(x, z);
    const yaw = facing(roads, x, z);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const ctx = {
      x, z, y, yaw, terrain, roads, poi: p, rng: seeded(p.id), mbRef: mb,
      L: (u, v) => [x + u * cy - v * sy, z + u * sy + v * cy],
    };
    fn(ctx, mb);

    /*
     * Pehle 51 named landmark mein se ek bhi collider list mein nahi tha --
     * gaadi St. Bede's aur hospital dono ke aar-paar nikal jaati thi.
     *
     * Par collider sadak par nahi chadhna chahiye. Bus stop (r 10), police
     * station (r 14) aur mandir (r 10) sadak ke bilkul kinare hain, aur unke
     * poore radius se sadak ka centreline hi block ho jaata tha -- gaadi wahan
     * se guzar hi nahi sakti thi. Isliye radius ko nazdeek ki sadak ke kinare
     * tak kaat dete hain, aur bahut chhota bache to collider hi nahi rakhte.
     */
    const fp = FOOTPRINT[p.landmark];
    if (colliders && fp && fp.r > 0) {
      const near = roads.nearestNode(x, z, (r) => r.type !== "rail");
      let r = fp.r;
      if (near) {
        const clear = near.dist - near.node.road.spec.width_m / 2 - 1.0;
        r = Math.min(r, clear);
      }
      if (r >= 3) colliders.add(x, z, r, y - 3, y + fp.h);
    }

    if (p.sign) {
      signs.push({ x, z, y, yaw, text: p.sign, sub: p.sign_sub || "",
                   kind: signKind(p), id: p.id });
    }
  }

  const g = new THREE.Group();
  g.name = "landmarks";
  const MATS = {
    stone: () => TEX.standard(TEX.plaster(0xffffff, 13), { vertexColors: true, roughness: 1.0 }),
    plaster: () => TEX.standard(TEX.plaster(0xffffff), { vertexColors: true }),
    tin: () => TEX.standard(TEX.corrugatedTin(0xffffff, 9), { vertexColors: true, metalness: 0.42 }),
    wood: () => TEX.standard(TEX.fabric(0xffffff, 71, 26), { vertexColors: true, roughness: 0.82 }),
    glass: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12,
      emissive: 0xffc978, emissiveIntensity: 0.0 }),
    metal: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.72 }),
  };
  for (const [key, builder] of Object.entries(mb)) {
    if (!builder.count) continue;
    const mesh = builder.build(MATS[key]());
    mesh.name = `landmark-${key}`;
    g.add(mesh);
  }
  g.userData.signs = signs;
  g.userData.landmarkCount = pois.pois.filter((p) => BUILDERS[p.landmark]).length;
  return g;
}

function signKind(p) {
  if (p.landmark === "campus" || p.landmark === "institution" || p.landmark === "palace") return "stone";
  if (p.landmark === "junction" || p.landmark === "tunnel_new" || p.landmark === "tunnel_old") return "road";
  return "shop";
}
