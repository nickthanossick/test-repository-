import * as THREE from "three";
import { MeshBuilder } from "./geometry.js";
import { SpatialGrid, Colliders } from "./grid.js";
import * as TEX from "./textures.js";

/**
 * Shimla ka basa hua hissa: imaaratein, deodar ka jungle, landmarks.
 *
 * Shimla mein ghar dhalan pe *stepped* hote hain -- neeche ek plinth nikalta hai
 * jo dhalan pakadta hai, aur upar teen-chaar manzil, tin ki chhat ke saath.
 *
 * Geometry teen material groups mein banti hai (deewar / chhat / plinth), taaki
 * har ek ka apna PBR texture ho -- plaster, naali-daar tin, aur pathar --
 * par draw calls sirf teen rahein.
 */

const ROOFS = [0x8c3b2e, 0x2f5d8a, 0x3f6b47, 0x6b6b70, 0x9c5a2b];
const WALLS = [0xb8ad98, 0xa99d86, 0x9f8e75, 0xb2a48d, 0x8a7b6c, 0xc0b6a4];

export function buildCity(terrain, roads, districts, pois, rng) {
  const group = new THREE.Group();
  group.name = "city";

  const walls = new MeshBuilder(0.42);
  const roofs = new MeshBuilder(0.5);
  const plinths = new MeshBuilder(0.35);
  const windows = new MeshBuilder(0.9);      // apna material -- raat ko jagmagati hain
  const trim = new MeshBuilder(0.7);         // balcony, railing, chimney, floor bands
  const col = new THREE.Color();
  const placed = new SpatialGrid(16);
  const colliders = new Colliders(24);
  let placedCount = 0;

  for (const d of districts.districts) {
    const c = terrain.geo.toWorld(d.lat, d.lon);
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
        house({ walls, roofs, plinths, windows, trim }, terrain, x, z, d, rng, col, colliders);
      }
    }
  }

  const wallMat = TEX.standard(TEX.plaster(0xffffff), { vertexColors: true });
  const roofMat = TEX.standard(TEX.corrugatedTin(0xffffff), { vertexColors: true, metalness: 0.4 });
  const plinthMat = TEX.standard(TEX.plaster(0xffffff, 77), { vertexColors: true, roughness: 1.0 });

  const windowMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.12, metalness: 0.0,
    emissive: 0xffc978, emissiveIntensity: 0.0,   // raat ko main.js isse badhata hai
  });
  const trimMat = TEX.standard(TEX.fabric(0xffffff, 71, 30), { vertexColors: true, roughness: 0.78 });

  for (const [mb, mat, name] of [[plinths, plinthMat, "plinths"],
                                 [walls, wallMat, "buildings"],
                                 [roofs, roofMat, "roofs"],
                                 [trim, trimMat, "trim"],
                                 [windows, windowMat, "windows"]]) {
    if (!mb.count) continue;
    const mesh = mb.build(mat);
    mesh.name = name;
    group.add(mesh);
  }

  group.userData.buildingCount = placedCount;
  group.userData.colliders = colliders;
  group.add(buildForest(terrain, roads, placed, rng));
  group.add(buildLandmarks(terrain, pois));
  return group;
}

/**
 * Ek Shimla ka pahadi ghar -- mid-poly.
 *
 * Pehle ye do box aur ek pyramid tha. Ab wo cheezein hain jo Shimla ko dekhte
 * hi pehchanwa deti hain:
 *   - dhalan pakadne wala **plinth** aur uske upar ek pathar ka course
 *   - har manzil ke beech ek patli **band** (asli mein RCC ka chajja)
 *   - **khidkiyan** -- deewar mein andar dhansi hui, har manzil pe kataar mein
 *   - **band balcony** -- lakdi/sheeshe ki, dhalan ki taraf; ye sabse Shimla cheez hai
 *   - **gable chhat** bahar nikle eaves ke saath (pyramid nahi)
 *   - kabhi-kabhi **chimney**
 */
function house(mb, terrain, x, z, d, rng, col, colliders) {
  const w = 5 + rng() * 4.5;
  const dep = 5 + rng() * 4.5;
  const floors = 2 + Math.floor(rng() * (d.wealth > 0.7 ? 3 : 2.6));
  const fh = 3.0;
  const yaw = rng() * Math.PI * 2;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  // local (u along width, v along depth) -> world
  const L = (u, v) => [x + u * cy - v * sy, z + u * sy + v * cy];

  const hs = [
    terrain.heightAt(x - w / 2, z - dep / 2), terrain.heightAt(x + w / 2, z - dep / 2),
    terrain.heightAt(x - w / 2, z + dep / 2), terrain.heightAt(x + w / 2, z + dep / 2),
  ];
  const lo = Math.min(...hs), hi = Math.max(...hs);
  const drop = Math.min(hi - lo, 9);
  const base = hi;
  const bodyH = floors * fh;

  // --- plinth: dhalan ko pakadta hua -------------------------------------
  if (drop > 0.8) {
    col.setHex(0x8b8177);
    mb.plinths.box(x, base - drop / 2, z, w * 0.94, drop + 0.6, dep * 0.94, col, yaw);
  }
  col.setHex(0x9a9086);
  mb.plinths.box(x, base + 0.22, z, w * 1.04, 0.44, dep * 1.04, col, yaw);   // pathar ka course

  // --- deewarein ---------------------------------------------------------
  const wallHex = WALLS[(rng() * WALLS.length) | 0];
  col.setHex(wallHex);
  mb.walls.box(x, base + bodyH / 2, z, w, bodyH, dep, col, yaw);

  colliders?.add(x, z, Math.max(w, dep) * 0.62, base - drop - 1, base + bodyH + 4);

  // --- har manzil ka chajja ----------------------------------------------
  col.setHex(0xbfb6a8);
  for (let f = 1; f < floors; f++) {
    mb.trim.box(x, base + f * fh, z, w * 1.035, 0.16, dep * 1.035, col, yaw);
  }

  // --- khidkiyan ---------------------------------------------------------
  // Chaar mein se do facades par -- charon par lagane se triangle count
  // dogna ho jaata hai aur ghane sheher mein peeche wali dikhti bhi nahi.
  const facades = [
    { n: [0, -1], half: dep / 2, span: w },     // -v
    { n: [1, 0], half: w / 2, span: dep },      // +u
  ];
  const glassHex = rng() < 0.5 ? 0x2c3b46 : 0x38414a;
  for (const fa of facades) {
    const cols = Math.max(1, Math.min(2, Math.floor(fa.span / 2.6)));
    for (let f = 0; f < Math.min(floors, 4); f++) {
      const wy = base + f * fh + fh * 0.58;
      for (let i = 0; i < cols; i++) {
        const t = (i + 0.5) / cols - 0.5;
        const along = t * fa.span * 0.82;
        const u = fa.n[0] ? fa.n[0] * (fa.half + 0.03) : along;
        const v = fa.n[0] ? along : fa.n[1] * (fa.half + 0.03);
        const [wx, wz] = L(u, v);
        const sx = fa.n[0] ? 0.18 : 1.05;
        const sz = fa.n[0] ? 1.05 : 0.18;
        col.setHex(0xe6ded0);                                   // safed frame
        mb.trim.box(wx, wy, wz, sx, 1.45, sz, col, yaw);
        col.setHex(glassHex);                                   // sheesha, thoda andar
        mb.windows.box(wx, wy, wz, sx * 0.55, 1.2, sz * 0.55, col, yaw);
      }
    }
  }

  // --- band balcony -- Shimla ki sabse pehchani cheez ---------------------
  if (rng() < 0.5 && floors >= 2) {
    const bf = 1 + Math.floor(rng() * Math.min(floors - 1, 2));
    const by = base + bf * fh + fh * 0.5;
    const bd = 1.15;
    const [bx, bz] = L(0, -(dep / 2 + bd / 2));
    col.setHex(0xd9cfbc);
    mb.trim.box(bx, by, bz, w * 0.74, fh * 0.82, bd, col, yaw);      // band hissa
    col.setHex(0x8a6a48);
    mb.trim.box(bx, by - fh * 0.44, bz, w * 0.80, 0.18, bd * 1.12, col, yaw);  // farsh
    col.setHex(glassHex);
    mb.windows.box(bx, by + 0.1, bz, w * 0.66, fh * 0.5, bd * 0.42, col, yaw); // sheeshe
  }

  // --- gable chhat -------------------------------------------------------
  col.setHex(ROOFS[(rng() * ROOFS.length) | 0]);
  const ridgeAlongX = w >= dep;
  mb.roofs.gableRoof(x, base + bodyH, z, w, dep,
    1.5 + rng() * 1.4, 0.45 + rng() * 0.3, col, yaw, ridgeAlongX);

  // --- chimney -----------------------------------------------------------
  if (rng() < 0.32) {
    const [chx, chz] = L((rng() - 0.5) * w * 0.5, (rng() - 0.5) * dep * 0.5);
    col.setHex(0x7a6a5c);
    mb.trim.box(chx, base + bodyH + 1.6, chz, 0.62, 3.0, 0.62, col, yaw);
    col.setHex(0x4a423a);
    mb.trim.box(chx, base + bodyH + 3.2, chz, 0.78, 0.18, 0.78, col, yaw);
  }
}


/**
 * Deodar ka jungle.
 *
 * Tiles mein banta hai (ek hi bade InstancedMesh ke bajaye) taaki frustum
 * culling kaam kare. Ek world-spanning instanced mesh kabhi cull nahi hota,
 * isliye shadow pass har frame 9000 ped dobara draw karta -- tiles se sirf
 * shadow frustum ke andar wale tiles hi draw hote hain.
 */
function buildForest(terrain, roads, buildings, rng) {
  const TARGET = 9000;
  const TILES = 6;
  const g = new THREE.Group();
  g.name = "forest";

  const trunkGeo = new THREE.CylinderGeometry(0.30, 0.46, 3.4, 6, 1);
  trunkGeo.translate(0, 1.7, 0);
  // deodar: teen layer ke cone, upar jaate hue chhote -- asli silhouette
  const canopyGeo = mergeCones([
    { r: 3.0, h: 4.4, y: 2.6 }, { r: 2.4, h: 4.2, y: 5.6 }, { r: 1.6, h: 4.4, y: 8.6 },
  ]);

  const barkMat = TEX.standard(TEX.bark(), { roughness: 1.0 });
  const needleMat = TEX.standard(TEX.needles(), { vertexColors: true, roughness: 0.95 });

  // pehle saari positions chuno, phir tiles mein baanto
  const spots = [];
  const half = terrain.half - 30;
  let tries = 0;
  while (spots.length < TARGET && tries < TARGET * 14) {
    tries++;
    const x = (rng() * 2 - 1) * half, z = (rng() * 2 - 1) * half;
    const y = terrain.heightAt(x, z);
    if (y > 2380) continue;                        // treeline ke upar barf
    if (terrain.slopeAt(x, z) > 0.86) continue;    // nangi chattan
    const nr = roads.nearestNode(x, z);
    if (nr && nr.dist < 11) continue;              // sadak khaali rakho
    if (buildings.occupied(x, z, 7)) continue;
    if (y < 1800 && rng() > 0.42) continue;        // deodar belt 1800 m se upar
    spots.push([x, y, z, 0.62 + rng() * 0.85, rng() * Math.PI * 2, 0.42 + rng() * 0.20]);
  }

  const size = terrain.worldSize / TILES;
  const buckets = Array.from({ length: TILES * TILES }, () => []);
  for (const s of spots) {
    const tx = Math.min(TILES - 1, Math.max(0, Math.floor((s[0] + terrain.half) / size)));
    const tz = Math.min(TILES - 1, Math.max(0, Math.floor((s[2] + terrain.half) / size)));
    buckets[tz * TILES + tx].push(s);
  }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const c = new THREE.Color();

  for (const bucket of buckets) {
    if (!bucket.length) continue;
    const tm = new THREE.InstancedMesh(trunkGeo, barkMat, bucket.length);
    const cm = new THREE.InstancedMesh(canopyGeo, needleMat, bucket.length);
    cm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(bucket.length * 3), 3);
    bucket.forEach(([x, y, z, s, rot, tint], i) => {
      pos.set(x, y, z);
      scl.set(s, s * (0.85 + (tint - 0.42) * 2.4), s);
      q.setFromAxisAngle(_cityUp, rot);
      m.compose(pos, q, scl);
      tm.setMatrixAt(i, m);
      cm.setMatrixAt(i, m);
      c.setRGB(tint * 0.52, tint * 1.06, tint * 0.58);
      cm.setColorAt(i, c);
    });
    tm.instanceMatrix.needsUpdate = cm.instanceMatrix.needsUpdate = true;
    if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
    tm.castShadow = cm.castShadow = true;
    tm.receiveShadow = cm.receiveShadow = true;
    tm.computeBoundingSphere?.();
    cm.computeBoundingSphere?.();
    g.add(tm, cm);
  }
  g.userData.treeCount = spots.length;
  return g;
}

/** Kai cone ko ek geometry mein -- deodar ki layered silhouette. */
function mergeCones(layers) {
  const pos = [], nor = [], uv = [];
  for (const { r, h, y } of layers) {
    const geo = new THREE.ConeGeometry(r, h, 8, 1);
    geo.translate(0, y + h / 2, 0);
    const p = geo.attributes.position, n = geo.attributes.normal, u = geo.attributes.uv;
    const idx = geo.index;
    for (let i = 0; i < idx.count; i++) {
      const k = idx.getX(i);
      pos.push(p.getX(k), p.getY(k), p.getZ(k));
      nor.push(n.getX(k), n.getY(k), n.getZ(k));
      uv.push(u.getX(k), u.getY(k));
    }
    geo.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

/** POIs pe pehchan-yogya structures. */
function buildLandmarks(terrain, pois) {
  const stone = new MeshBuilder(0.3);
  const metal = new MeshBuilder(0.4);
  const c = new THREE.Color();
  const L = { jakhoo_temple: [7, 52], christ_church: [12, 30], viceregal_lodge: [26, 26],
              railway_station: [21, 10], rana_hotel: [15, 26], vidhan_sabha: [17, 15],
              secretariat: [17, 15], isbt: [25, 8], vicky_garage: [7, 6] };

  for (const p of pois.pois) {
    const { x, z } = terrain.geo.toWorld(p.lat, p.lon);
    const y = terrain.heightAt(x, z);
    switch (p.id) {
      case "jakhoo_temple":                       // 108-ft Hanuman murti
        c.setHex(0xc06326); stone.box(x, y + 6, z, 9, 12, 9, c);
        c.setHex(0xd97f34); stone.box(x, y + 28, z, 5.5, 33, 4.2, c);
        c.setHex(0xeba14a); stone.box(x, y + 47, z, 4.2, 5, 4.2, c);
        break;
      case "christ_church":
        c.setHex(0xbfa27a); stone.box(x, y + 7, z, 13, 14, 22, c);
        c.setHex(0xa88a63); stone.box(x, y + 20, z, 5, 12, 5, c);
        c.setHex(0x8a6a48); metal.pyramid(x, y + 26, z, 6, 9, c);
        break;
      case "viceregal_lodge":
        c.setHex(0x8d7f68); stone.box(x, y + 8, z, 46, 16, 26, c);
        c.setHex(0x6f6353); stone.box(x, y + 20, z, 12, 9, 12, c);
        break;
      case "railway_station":
        c.setHex(0xa03a30); stone.box(x, y + 4, z, 40, 8, 13, c);
        c.setHex(0x6b6259); metal.box(x, y + 8.6, z, 43, 1.2, 15, c);
        break;
      case "ridge": case "scandal_point":
        c.setHex(0x8d857a); stone.box(x, y + 0.4, z, 42, 0.8, 26, c); break;
      case "annandale_ground":
        c.setHex(0x53853f); stone.box(x, y + 0.3, z, 150, 0.6, 110, c); break;
      case "rana_hotel":
        c.setHex(0x7d5648); stone.box(x, y + 11, z, 26, 22, 20, c);
        c.setHex(0xa33030); metal.pyramid(x, y + 22, z, 28, 5, c); break;
      case "vidhan_sabha": case "secretariat":
        c.setHex(0xb8a184); stone.box(x, y + 7, z, 30, 14, 18, c); break;
      case "isbt":
        c.setHex(0x6b7680); stone.box(x, y + 3.5, z, 46, 7, 24, c); break;
      case "vicky_garage":
        c.setHex(0x8a7a60); stone.box(x, y + 2.4, z, 11, 5, 8, c);
        c.setHex(0x3f5f7a); metal.box(x, y + 5.2, z, 12, 0.5, 9, c); break;
      default: break;
    }
  }

  const g = new THREE.Group();
  g.name = "landmarks";
  if (stone.count) {
    const m = stone.build(TEX.standard(TEX.plaster(0xffffff, 13), { vertexColors: true }));
    m.name = "landmark-stone"; g.add(m);
  }
  if (metal.count) {
    const m = metal.build(TEX.standard(TEX.corrugatedTin(0xffffff, 9), { vertexColors: true, metalness: 0.45 }));
    m.name = "landmark-metal"; g.add(m);
  }
  return g;
}

const _cityUp = new THREE.Vector3(0, 1, 0);
