import * as THREE from "three";
import { MeshBuilder } from "./geometry.js";
import * as TEX from "./textures.js";

/**
 * data/roads.json ki lat/lon polylines se sadak ke ribbon mesh banata hai,
 * terrain pe drape karke.
 *
 * Saath hi ek flat `nodes` list deta hai jise city.js building placement ke liye
 * aur wanted.js police navigation ke liye use karta hai -- Shimla mein imaarat
 * hamesha sadak ke kinare hi hoti hai, isliye placement roads pe hi tikta hai.
 */
export class RoadNetwork {
  constructor(geo, terrain, roadsJson) {
    this.geo = geo;
    this.terrain = terrain;
    this.types = roadsJson.road_types;
    this.roads = [];
    this.nodes = [];

    for (const r of roadsJson.roads) {
      const pts = r.points.map(([lat, lon]) => {
        const { x, z } = geo.toWorld(lat, lon);
        return new THREE.Vector3(x, terrain.heightAt(x, z), z);
      });
      const dense = resample(pts, 10);
      for (const p of dense) p.y = terrain.heightAt(p.x, p.z);
      const spec = this.types[r.type];
      const road = { ...r, points: dense, spec };
      this.roads.push(road);
      // Har node ka perpendicular pehle hi nikaal lo. city.js har candidate ke liye
      // ye maangta hai -- runtime pe indexOf() karna O(n^2) ban jaata tha.
      for (let i = 0; i < dense.length; i++) {
        const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)];
        const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
        this.nodes.push({ pos: dense[i], road, nx: -dz / L, nz: dx / L });
      }
    }
  }

  /** Sabse nazdeek sadak ka point. Police AI aur spawn ke liye. */
  nearestNode(x, z, filter = null) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      if (filter && !filter(n.road)) continue;
      const dx = n.pos.x - x, dz = n.pos.z - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = n; }
    }
    return best ? { node: best, dist: Math.sqrt(bd) } : null;
  }

  /** Point kis road pe hai (agar width ke andar ho). Mall Road check ke liye. */
  roadAt(x, z, slack = 3) {
    const n = this.nearestNode(x, z);
    if (!n) return null;
    return n.dist <= n.node.road.spec.width_m / 2 + slack ? n.node.road : null;
  }

  /**
   * Sadak ka mesh + uska furniture.
   *
   * Shimla ki har pahadi sadak ek hi tarah bani hai: chadhai wali taraf pathar
   * ki **retaining wall**, aur khaai wali taraf **parapet + lohe ki railing**.
   * Bina inke sadak sirf pahad pe chipki hui ek patti lagti hai; inke saath
   * turant Shimla lagti hai. Uphill/downhill har segment pe terrain se hi
   * naapa jaata hai, isliye ye apne aap sahi taraf lagte hain.
   */
  buildMesh() {
    const road = new MeshBuilder(0.16);
    const stone = new MeshBuilder(0.55);
    const metal = new MeshBuilder(0.8);
    const col = new THREE.Color();
    const edge = new THREE.Color();
    const stoneCol = new THREE.Color(0x8d857a);
    const railCol = new THREE.Color(0x3d4147);
    const lampCol = new THREE.Color(0x2b2f34);
    let lampAccum = 0;

    for (const r of this.roads) {
      col.set(r.spec.color);
      edge.copy(col).multiplyScalar(1.28);
      const w = r.spec.width_m / 2;
      const pts = r.points;
      const isRail = r.type === "rail";
      const lift = isRail ? 0.35 : 0.5;
      const furniture = !isRail && r.type !== "pedestrian";

      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len, nz = dx / len;

        // Har kona alag se terrain pe drape -- centerline use karne se sadak ka
        // kinara zameen ke neeche chala jaata hai aur gayab ho jaati hai.
        const v = (p, sOff) => {
          const X = p.x + nx * sOff, Z = p.z + nz * sOff;
          return new THREE.Vector3(X, this.terrain.heightAt(X, Z) + lift, Z);
        };
        road.quadUp(v(a, -w), v(b, -w), v(b, w), v(a, w), col, len, w * 2);

        if (isRail) {
          const sl = new THREE.Color(0.30, 0.26, 0.22);
          for (const off of [-0.55, 0.55]) {
            road.quadUp(v(a, off - 0.09), v(b, off - 0.09), v(b, off + 0.09), v(a, off + 0.09), sl, len, 0.18);
          }
          continue;
        }

        // beech ki safed patti -- arterial pe. Isse sadak ka size padha ja sakta hai;
        // bina iske ek khaali asphalt ribbon zaroorat se zyada chaudi lagti hai.
        if (r.type === "arterial") {
          const white = new THREE.Color(0xc9c4b4);
          road.quadUp(v(a, -0.09), v(b, -0.09), v(b, 0.09), v(a, 0.09), white, len, 0.18);
        }

        // kinare ki patti
        const k = w + 0.42;
        road.quadUp(v(a, w), v(b, w), v(b, k), v(a, k), edge, len, 0.42);
        road.quadUp(v(a, -k), v(b, -k), v(b, -w), v(a, -w), edge, len, 0.42);
        if (!furniture) continue;

        // --- kaunsi taraf chadhai hai? -------------------------------------
        const probe = w + 3.0;
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        const hL = this.terrain.heightAt(mx - nx * probe, mz - nz * probe);
        const hR = this.terrain.heightAt(mx + nx * probe, mz + nz * probe);
        const roadY = this.terrain.heightAt(mx, mz) + lift;
        const upSide = hL > hR ? -1 : 1;
        const upH = Math.max(hL, hR);
        const downH = Math.min(hL, hR);
        const yaw = Math.atan2(nz, nx);

        // --- pathar ki retaining wall -- chadhai wali taraf ---------------
        // Wall/parapet ki height sadak ke *kinare* se naapo, centre se nahi.
        // Centre se naapne pe khadi dhalan par ye zameen se upar latak jaate the.
        const wx = mx + nx * upSide * (w + 0.55), wz2 = mz + nz * upSide * (w + 0.55);
        const wallGround = this.terrain.heightAt(wx, wz2);
        const wallTop = Math.min(Math.max(wallGround, roadY) + 0.6, roadY + 4.0);
        const wallBottom = Math.min(roadY, wallGround) - 1.2;   // zameen ke andar tak
        const wallH = wallTop - wallBottom;
        if (wallH > 1.0) {
          stone.box(wx, (wallTop + wallBottom) / 2, wz2, 0.55, wallH, len * 1.02, stoneCol, yaw);
        }

        // --- parapet + railing -- khaai wali taraf ------------------------
        const dSide = -upSide;
        const px = mx + nx * dSide * (w + 0.35), pz = mz + nz * dSide * (w + 0.35);
        const pGround = this.terrain.heightAt(px, pz);
        const edgeY = Math.min(roadY, pGround + lift);          // sadak ka asli kinara
        if (roadY - downH > 0.8) {
          // parapet sadak ke kinare se neeche zameen tak jaata hai
          const pBottom = Math.min(pGround, edgeY) - 1.0;
          const pTop = edgeY + 0.58;
          stone.box(px, (pTop + pBottom) / 2, pz, 0.34, pTop - pBottom, len * 1.02, stoneCol, yaw);
          metal.box(px, edgeY + 1.02, pz, 0.07, 0.07, len * 1.02, railCol, yaw);
          metal.box(px, edgeY + 0.80, pz, 0.05, 0.05, len * 1.02, railCol, yaw);
          const posts = Math.max(2, Math.round(len / 2.4));
          for (let q = 0; q < posts; q++) {
            const t = (q + 0.5) / posts;
            const qx = a.x + dx * t + nx * dSide * (w + 0.35);
            const qz = a.z + dz * t + nz * dSide * (w + 0.35);
            const qy = Math.min(this.terrain.heightAt(qx, qz) + lift, roadY);
            metal.box(qx, qy + 0.79, qz, 0.06, 0.62, 0.06, railCol, yaw);
          }
        }

        // street light -- arterial aur street pe
        lampAccum += len;
        if (lampAccum > 30 && (r.type === "arterial" || r.type === "street")) {
          lampAccum = 0;
          const lx = mx + nx * dSide * (w + 0.9), lz2 = mz + nz * dSide * (w + 0.9);
          const ly = Math.min(this.terrain.heightAt(lx, lz2) + lift, roadY);
          metal.box(lx, ly + 2.3, lz2, 0.14, 4.6, 0.14, lampCol, yaw);
          metal.box(lx - nx * dSide * 0.55, ly + 4.6, lz2 - nz * dSide * 0.55,
                    1.2, 0.11, 0.11, lampCol, yaw);
          metal.box(lx - nx * dSide * 1.05, ly + 4.44, lz2 - nz * dSide * 1.05,
                    0.42, 0.22, 0.3, lampCol, yaw);
        }
      }
    }

    const g = new THREE.Group();
    g.name = "roads";
    const roadMesh = road.build(TEX.standard(TEX.asphalt(), { vertexColors: true, roughness: 0.92 }));
    roadMesh.name = "road-surface";
    roadMesh.castShadow = false;
    g.add(roadMesh);
    if (stone.count) {
      const m = stone.build(TEX.standard(TEX.plaster(0xffffff, 91), { vertexColors: true, roughness: 1.0 }));
      m.name = "road-walls";
      g.add(m);
    }
    if (metal.count) {
      const m = metal.build(new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.42, metalness: 0.75 }));
      m.name = "road-railings";
      g.add(m);
    }
    return g;
  }

}

/** Polyline ko barabar doori pe dobara sample karo. */
function resample(pts, step) {
  const out = [pts[0].clone()];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const seg = a.distanceTo(b);
    let t = carry;
    while (t < seg) {
      out.push(a.clone().lerp(b, t / seg));
      t += step;
    }
    carry = t - seg;
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}
