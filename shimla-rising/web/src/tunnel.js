import * as THREE from "three";
import * as TEX from "./textures.js";
import { MeshBuilder } from "./geometry.js";

/**
 * Asli tunnel -- bore ke saath, sirf portal nahi.
 *
 * Pehle `landmarks.js` ka `tunnel()` ek chapta portal tha: pathar ka box, beech
 * mein kaala box (andhera mukh), upar lintel. Uske aar-paar se gaadi nikal
 * jaati thi aur doosri taraf koi portal tha hi nahi -- yaani tunnel sirf ek
 * deewar par chipki tasveer thi.
 *
 * Ab poora bore banta hai: sadak ki disha mein lambai, dono sire par portal,
 * beech mein deewarein aur mehraab, aur chhat par battiyan. Sadak seedhi
 * guzarti hai; collider sirf **dono taraf ki deewaron** par lagta hai, beech
 * khaali rehta hai.
 *
 * Do tunnel hain aur dono alag hain:
 *   Sanjauli (1852)  -- single lane, pathar ka arch, tang
 *   Sanjauli-Dhalli  -- naya, double lane, concrete
 */

const C = new THREE.Color();
const hex = (h) => C.setHex(h);

const SPECS = {
  tunnel_old: {
    width: 5.6, height: 5.2, length: 46, arch: 9,
    stone: true, portalHex: 0x8d857a, liningHex: 0x6f685e, lamps: 5,
  },
  tunnel_new: {
    width: 9.6, height: 6.4, length: 154, arch: 11,
    stone: false, portalHex: 0xa8a49c, liningHex: 0x8f8b84, lamps: 14,
  },
};

/**
 * @param pois  data/pois.json
 * @param roads RoadNetwork -- tunnel sadak ki disha mein banta hai
 * @param colliders dono taraf ki deewarein isme jaati hain
 */
export function buildTunnels(terrain, roads, pois, colliders = null) {
  const g = new THREE.Group();
  g.name = "tunnels";

  const mb = {
    stone: new MeshBuilder(0.30),
    lining: new MeshBuilder(0.35),
    road: new MeshBuilder(0.25),
  };
  const lampPositions = [];
  let built = 0;

  for (const p of pois.pois) {
    const spec = SPECS[p.landmark];
    if (!spec) continue;
    const { x, z } = terrain.geo.toWorld(p.lat, p.lon);
    const y = terrain.heightAt(x, z);

    // Sadak ki disha -- tunnel usi ke saath lamba hota hai
    const n = roads.nearestNode(x, z, (r) => r.type !== "rail");
    const tx = n ? -n.node.nz : 1, tz = n ? n.node.nx : 0;
    const yaw = Math.atan2(tx, -tz);
    // local: u = lambai (sadak ke saath), v = chaudai
    const L = (u, v) => [x + tx * u - tz * v, z + tz * u + tx * v];

    bore(mb, { x, y, z, yaw, L, spec, terrain });
    for (let i = 0; i < spec.lamps; i++) {
      const u = (i / (spec.lamps - 1) - 0.5) * (spec.length - 6);
      const [lx, lz] = L(u, 0);
      lampPositions.push({ x: lx, y: y + spec.height - 0.35, z: lz });
    }

    // Collider sirf dono taraf ki deewaron par -- beech se guzarna hai
    if (colliders) {
      const half = spec.width / 2 + 1.1;
      for (let i = 0; i < 9; i++) {
        const u = (i / 8 - 0.5) * spec.length;
        for (const side of [-1, 1]) {
          const [cx, cz] = L(u, side * half);
          colliders.add(cx, cz, 1.4, y - 2, y + spec.height + 3);
        }
      }
    }
    built++;
  }

  const mats = {
    stone: TEX.standard(TEX.plaster(0xffffff, 13), { vertexColors: true, roughness: 1.0 }),
    lining: TEX.standard(TEX.plaster(0xffffff, 61), { vertexColors: true, roughness: 0.92 }),
    road: TEX.standard(TEX.asphalt(), { vertexColors: true, roughness: 0.95 }),
  };
  for (const k of Object.keys(mb)) {
    const m = mb[k].build(mats[k]);
    if (m) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  }

  if (lampPositions.length) g.add(buildLamps(lampPositions));
  g.userData.tunnelCount = built;
  return g;
}

/** Ek tunnel ka poora bore -- dono portal, deewarein, mehraab, farsh. */
function bore(mb, o) {
  const { x, y, z, yaw, L, spec } = o;
  const hw = spec.width / 2;
  const half = spec.length / 2;
  const wallT = 1.1;                      // deewar ki motai

  // ---- dono taraf ki deewar ----
  hex(spec.liningHex);
  for (const side of [-1, 1]) {
    const [wx, wz] = L(0, side * (hw + wallT / 2));
    mb.lining.box(wx, y + spec.height / 2, wz, spec.length, spec.height, wallT, C, yaw + Math.PI / 2);
  }

  // ---- mehraab: chhat ko kai patti mein banate hain ----
  // Ek hi box se chhat chapti lagti hai; arch segments se andar se gol dikhta hai.
  const SEG = spec.arch;
  const rise = spec.height * 0.34;
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI, a1 = ((i + 1) / SEG) * Math.PI;
    const am = (a0 + a1) / 2;
    const vy = y + spec.height - rise + Math.sin(am) * rise;
    const vv = Math.cos(am) * hw;
    const segW = (Math.cos(a0) - Math.cos(a1)) * hw;
    const [sx, sz] = L(0, vv);
    hex(spec.liningHex);
    mb.lining.box(sx, vy, sz, spec.length, 0.42, Math.abs(segW) + 0.12, C, yaw + Math.PI / 2);
  }

  // ---- farsh: tunnel ke andar sadak ---------------------------------------
  hex(0x3a3a3e);
  mb.road.box(x, y + 0.04, z, spec.length, 0.10, spec.width, C, yaw + Math.PI / 2);

  // ---- dono sire par portal ----
  for (const end of [-1, 1]) {
    const [px, pz] = L(end * half, 0);
    hex(spec.portalHex);
    // portal ka mukh -- beech mein chhed chhodne ke liye teen tukde
    const pierW = 2.4;
    for (const side of [-1, 1]) {
      const [qx, qz] = L(end * half, side * (hw + pierW / 2));
      mb.stone.box(qx, y + spec.height / 2, qz, 1.6, spec.height + 1.4, pierW, C, yaw + Math.PI / 2);
    }
    // upar ka lintel / keystone
    mb.stone.box(px, y + spec.height + 0.9, pz, 1.8, 1.8, spec.width + pierW * 2, C, yaw + Math.PI / 2);
    if (spec.stone) {
      // 1852 wala pathar ka arch -- voussoir ki patti
      hex(0x9a9086);
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI;
        const [vx, vz] = L(end * half, Math.cos(a) * hw);
        mb.stone.box(vx, y + spec.height - rise + Math.sin(a) * rise, vz,
                     1.9, 0.7, 0.9, C, yaw + Math.PI / 2);
      }
      // keystone
      hex(0xb0a696);
      mb.stone.box(px, y + spec.height + 0.05, pz, 2.0, 1.0, 1.0, C, yaw + Math.PI / 2);
    }
  }
}

/**
 * Chhat ki battiyan.
 *
 * Ye `daynight.js` ki emissive list mein **nahi** jaati -- tunnel mein din
 * mein bhi andhera hai, isliye ye hamesha jalti rehti hain.
 */
function buildLamps(positions) {
  const g = new THREE.Group();
  g.name = "tunnel-lamps";
  const geo = new THREE.BoxGeometry(0.55, 0.10, 0.22);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xfff0cf, emissive: 0xffd89a, emissiveIntensity: 1.6, roughness: 0.4,
  });
  const im = new THREE.InstancedMesh(geo, mat, positions.length);
  const m = new THREE.Matrix4();
  positions.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, m); });
  im.instanceMatrix.needsUpdate = true;
  g.add(im);
  return g;
}
