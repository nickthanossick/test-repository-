import * as THREE from "three";
import { MeshBuilder } from "./geometry.js";

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

  buildMesh() {
    const mb = new MeshBuilder();
    const col = new THREE.Color();
    const edge = new THREE.Color();

    for (const road of this.roads) {
      col.set(road.spec.color);
      edge.copy(col).multiplyScalar(1.35);
      const w = road.spec.width_m / 2;
      const pts = road.points;

      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len, nz = dx / len;      // perpendicular
        // Har kone ki height alag se terrain se lo, centerline se nahi.
        // Pehle centerline Y use kar rahe the -- 10 m ke terrain quads pe sadak
        // ka kinara zameen ke *neeche* chala jaata tha aur sadak gayab ho jaati thi.
        const lift = road.type === "rail" ? 0.35 : 0.5;
        const v = (p, s) => {
          const X = p.x + nx * s, Z = p.z + nz * s;
          return new THREE.Vector3(X, this.terrain.heightAt(X, Z) + lift, Z);
        };
        mb.quadUp(v(a, -w), v(b, -w), v(b, w), v(a, w), col);

        if (road.type !== "rail") {                // kinare ki parapet/railing
          const k = w + 0.45;
          mb.quadUp(v(a, w), v(b, w), v(b, k), v(a, k), edge);
          mb.quadUp(v(a, -k), v(b, -k), v(b, -w), v(a, -w), edge);
        } else {                                   // toy-train ki patriyan
          const sl = new THREE.Color(0.30, 0.26, 0.22);
          for (const off of [-0.55, 0.55]) {
            mb.quadUp(v(a, off - 0.09), v(b, off - 0.09), v(b, off + 0.09), v(a, off + 0.09), sl);
          }
        }
      }
    }
    const mesh = mb.build(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.name = "roads";
    return mesh;
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
