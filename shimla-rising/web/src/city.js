import * as THREE from "three";
import { MeshBuilder } from "./geometry.js";
import { SpatialGrid, Colliders } from "./grid.js";

/**
 * Shimla ka basa hua hissa: imaaratein, deodar ka jungle, aur street lights.
 *
 * Imaaratein sadak ke kinare lagti hain, district ke hisaab se. Shimla mein
 * ghar dhalan pe *stepped* hote hain -- neeche ki taraf ek plinth nikalta hai
 * jo dhalan ko pakadta hai, aur upar teen-chaar manzil. Wahi yahan model kiya hai:
 * har ghar ka plinth uske downhill side ki dhalan se calculate hota hai.
 */

const ROOFS = [0x8c3b2e, 0x2f5d8a, 0x3f6b47, 0x6b6b70, 0x9c5a2b];
const WALLS = [0xd8cdb8, 0xc9bda6, 0xbfae95, 0xd2c4ad, 0xa8998a, 0xe0d6c4];

export function buildCity(terrain, roads, districts, pois, rng) {
  const group = new THREE.Group();
  group.name = "city";

  const mb = new MeshBuilder();
  const col = new THREE.Color();
  const placed = new SpatialGrid(16);
  const colliders = new Colliders(24);
  let placedCount = 0;

  for (const d of districts.districts) {
    const c = terrain.geo.toWorld(d.lat, d.lon);
    // is district ke aas-paas ke road nodes
    const near = roads.nodes.filter((n) => {
      const dx = n.pos.x - c.x, dz = n.pos.z - c.z;
      return dx * dx + dz * dz < d.radius_m * d.radius_m;
    });
    if (!near.length) continue;

    // Shimla ghana basa hua sheher hai -- pahad pe ek ke upar ek ghar.
    const density = 0.60 + d.wealth * 0.30 + (d.id === "sanjauli" ? 0.45 : 0);
    for (const n of near) {
      if (rng() > density) continue;
      const w = n.road.spec.width_m / 2;
      for (const side of [-1, 1]) {
        if (rng() > 0.80) continue;
        const off = w + 4.5 + rng() * 10;
        const x = n.pos.x + side * off * n.nx;
        const z = n.pos.z + side * off * n.nz;
        if (placed.occupied(x, z, 8.5)) continue;
        placed.add(x, z);
        placedCount++;
        house(mb, terrain, x, z, d, rng, col, colliders);
      }
    }
  }

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = mb.build(mat);
  mesh.name = "buildings";
  group.add(mesh);
  group.userData.buildingCount = placedCount;

  group.add(buildForest(terrain, roads, placed, rng));
  group.add(buildLandmarks(terrain, pois, mat, colliders));
  group.userData.colliders = colliders;
  return group;
}

/** Ek Shimla-style pahadi ghar: dhalan pakadne wala plinth + manzilein + tin ki chhat. */
function house(mb, terrain, x, z, d, rng, col, colliders) {
  const w = 5 + rng() * 4.5;
  const dep = 5 + rng() * 4.5;
  const floors = 2 + Math.floor(rng() * (d.wealth > 0.7 ? 3 : 2.6));
  const fh = 3.0;
  const yaw = rng() * Math.PI * 2;

  // chaaron kone ki zameen -- plinth kitna gehra chahiye
  const hs = [
    terrain.heightAt(x - w / 2, z - dep / 2), terrain.heightAt(x + w / 2, z - dep / 2),
    terrain.heightAt(x - w / 2, z + dep / 2), terrain.heightAt(x + w / 2, z + dep / 2),
  ];
  const lo = Math.min(...hs), hi = Math.max(...hs);
  const drop = Math.min(hi - lo, 9);

  const base = hi;
  if (drop > 0.8) {                                  // stepped plinth
    col.setHex(0x6f6459);
    mb.box(x, base - drop / 2, z, w * 0.92, drop + 0.6, dep * 0.92, col, yaw);
  }
  col.setHex(WALLS[(rng() * WALLS.length) | 0]);
  const bodyH = floors * fh;
  mb.box(x, base + bodyH / 2, z, w, bodyH, dep, col, yaw);

  colliders?.add(x, z, Math.max(w, dep) * 0.62, base - drop - 1, base + bodyH + 3);

  col.setHex(ROOFS[(rng() * ROOFS.length) | 0]);
  if (rng() < 0.62) {
    mb.pyramid(x, base + bodyH, z, Math.max(w, dep) * 1.12, 1.6 + rng() * 1.3, col, yaw);
  } else {
    mb.box(x, base + bodyH + 0.28, z, w * 1.1, 0.55, dep * 1.1, col, yaw);   // flat tin
  }
}

/**
 * Deodar ka jungle. Shimla ki pehchaan.
 * InstancedMesh isliye ki 9000 ped alag Mesh banane pe frame rate mar jaata.
 */
function buildForest(terrain, roads, buildings, rng) {
  const TARGET = 9000;
  const g = new THREE.Group();
  g.name = "forest";

  const trunk = new THREE.CylinderGeometry(0.28, 0.42, 3.2, 5);
  trunk.translate(0, 1.6, 0);
  const canopy = new THREE.ConeGeometry(2.5, 11, 7);
  canopy.translate(0, 8.2, 0);

  const tm = new THREE.InstancedMesh(trunk,
    new THREE.MeshLambertMaterial({ color: 0x4a3a2c, flatShading: true }), TARGET);
  const cm = new THREE.InstancedMesh(canopy,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), TARGET);
  cm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TARGET * 3), 3);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const c = new THREE.Color();
  const half = terrain.half - 30;
  let n = 0, tries = 0;

  while (n < TARGET && tries < TARGET * 14) {
    tries++;
    const x = (rng() * 2 - 1) * half, z = (rng() * 2 - 1) * half;
    const y = terrain.heightAt(x, z);
    if (y > 2380) continue;                                  // treeline ke upar barf
    if (terrain.slopeAt(x, z) > 0.86) continue;              // nangi chattan
    const nr = roads.nearestNode(x, z);
    if (nr && nr.dist < 11) continue;                        // sadak khaali rakho
    if (buildings.occupied(x, z, 7)) continue;                // ghar ke andar ped nahi

    // deodar belt 1800-2400 m; us se neeche chir pine, patla jungle
    const band = y > 1800 ? 1.0 : 0.42;
    if (rng() > band) continue;

    const s = 0.62 + rng() * 0.85;
    pos.set(x, y, z);
    scl.set(s, s * (0.85 + rng() * 0.5), s);
    q.setFromAxisAngle(_cityUp, rng() * Math.PI * 2);
    m.compose(pos, q, scl);
    tm.setMatrixAt(n, m);
    cm.setMatrixAt(n, m);
    const t = 0.24 + rng() * 0.13;
    c.setRGB(t * 0.55, t + 0.09, t * 0.62);
    cm.setColorAt(n, c);
    n++;
  }
  tm.count = cm.count = n;
  tm.instanceMatrix.needsUpdate = cm.instanceMatrix.needsUpdate = true;
  if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
  tm.frustumCulled = cm.frustumCulled = false;
  g.add(tm, cm);
  g.userData.treeCount = n;
  return g;
}

/** POIs pe pehchan-yogya structures -- Jakhoo ki murti, Christ Church ka spire, etc. */
function buildLandmarks(terrain, pois, mat, colliders) {
  const mb = new MeshBuilder();
  const c = new THREE.Color();
  const L = { jakhoo_temple: [7, 52], christ_church: [12, 30], viceregal_lodge: [26, 26],
              railway_station: [21, 10], rana_hotel: [15, 26], vidhan_sabha: [17, 15],
              secretariat: [17, 15], isbt: [25, 8], vicky_garage: [7, 6] };
  for (const p of pois.pois) {
    const { x, z } = terrain.geo.toWorld(p.lat, p.lon);
    const y = terrain.heightAt(x, z);
    if (L[p.id]) colliders?.add(x, z, L[p.id][0], y - 2, y + L[p.id][1]);
    switch (p.id) {
      case "jakhoo_temple":                       // 108-ft Hanuman murti
        c.setHex(0xd06a2a); mb.box(x, y + 6, z, 9, 12, 9, c);
        c.setHex(0xe08b3a); mb.box(x, y + 28, z, 5.5, 33, 4.2, c);
        c.setHex(0xf0a850); mb.box(x, y + 47, z, 4.2, 5, 4.2, c);
        break;
      case "christ_church":                       // neo-Gothic spire
        c.setHex(0xbfa27a); mb.box(x, y + 7, z, 13, 14, 22, c);
        c.setHex(0xa88a63); mb.box(x, y + 20, z, 5, 12, 5, c);
        c.setHex(0x8a6a48); mb.pyramid(x, y + 26, z, 6, 9, c);
        break;
      case "viceregal_lodge":                     // 1888 ka Rashtrapati Niwas
        c.setHex(0x8d7f68); mb.box(x, y + 8, z, 46, 16, 26, c);
        c.setHex(0x6f6353); mb.box(x, y + 20, z, 12, 9, 12, c);
        break;
      case "railway_station":                     // toy-train shed
        c.setHex(0xa03a30); mb.box(x, y + 4, z, 40, 8, 13, c);
        c.setHex(0x5a5148); mb.box(x, y + 8.6, z, 43, 1.2, 15, c);
        break;
      case "ridge": case "scandal_point":
        c.setHex(0x7d7468); mb.box(x, y + 0.4, z, 42, 0.8, 26, c); break;
      case "annandale_ground":
        c.setHex(0x4b7a44); mb.box(x, y + 0.3, z, 150, 0.6, 110, c); break;
      case "rana_hotel":
        c.setHex(0x6d4a3c); mb.box(x, y + 11, z, 26, 22, 20, c);
        c.setHex(0x9c2b2b); mb.pyramid(x, y + 22, z, 28, 5, c); break;
      case "vidhan_sabha": case "secretariat":
        c.setHex(0xb8a184); mb.box(x, y + 7, z, 30, 14, 18, c); break;
      case "isbt":
        c.setHex(0x5f6b74); mb.box(x, y + 3.5, z, 46, 7, 24, c); break;
      case "vicky_garage":
        c.setHex(0x7a6a52); mb.box(x, y + 2.4, z, 11, 5, 8, c);
        c.setHex(0x3f5f7a); mb.box(x, y + 5.2, z, 12, 0.5, 9, c); break;
      default: break;
    }
  }
  const mesh = mb.build(mat);
  mesh.name = "landmarks";
  return mesh;
}

const _cityUp = new THREE.Vector3(0, 1, 0);
