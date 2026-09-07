import * as THREE from "three";
import { buildBody } from "./vehicle.js";

/**
 * Route par chalti buses -- HRTC, Lalit, Krishna, Rajdhani Express.
 *
 * Ye poora traffic system nahi hai (wo alag round mein aayega). Bus ek nishchit
 * segment ke polyline par aage-peeche chalti hai, bus stop par rukti hai, aur
 * aage wali bus se doori rakhti hai. Itna hi Sanjauli ki sadak ko zinda kar
 * deta hai, aur khiladi ki gaadi ki tarah ise physics ki zaroorat nahi.
 *
 * `sanjauli.json` ke segments hi raasta dete hain -- wahi naksha jispe dukanein
 * lagti hain, taaki bus aur bazaar kabhi alag na ho jaayein.
 */

const STOP_SECONDS = 4.0;
const LANE_OFFSET = 2.6;          // left-hand traffic -- India
const GAP_M = 14;                 // aage wali bus se kam se kam itni doori

export class BusSystem {
  /**
   * @param mapJson data/sanjauli.json
   * @param routesJson data/routes.json
   */
  constructor(scene, terrain, mapJson, routesJson, vehicleById, budget = 6, ground = null) {
    // sadak ki satah samet -- bina iske bus sadak par tairti dikhti hai
    this.ground = ground || ((x, z) => terrain.heightAt(x, z));
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = "buses";
    scene.add(this.group);
    this.buses = [];

    // Segment ke points world mein + cumulative lambai
    this.segs = new Map();
    for (const s of mapJson.segments) {
      const pts = s.points.map(([lat, lon]) => {
        const w = terrain.geo.toWorld(lat, lon);
        return { x: w.x, z: w.z };
      });
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
      }
      this.segs.set(s.id, { spec: s, pts, cum, total: cum[cum.length - 1] });
    }

    const stopById = new Map(routesJson.stops.map((s) => [s.id, s]));
    let made = 0;
    // Har route par ek bus, phir doosra chakkar -- taaki chaaron operator dikhein
    for (let pass = 0; made < budget; pass++) {
      let placedThisPass = 0;
      for (const route of routesJson.routes) {
        if (made >= budget) break;
        const seg = this.segs.get(route.segment);
        if (!seg) continue;
        const opId = route.operators[pass % route.operators.length];
        const spec = vehicleById.get(opId);
        if (!spec) continue;

        const mesh = buildBody(spec);
        mesh.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
        this.group.add(mesh);

        const stops = route.stops
          .map((id) => stopById.get(id))
          .filter((s) => s && s.segment === route.segment)
          .map((s) => s.t * seg.total)
          .sort((a, b) => a - b);

        this.buses.push({
          mesh, spec, seg, stops,
          d: (0.12 + 0.7 * ((made * 0.37) % 1)) * seg.total,   // route par bikhri hui
          dir: pass % 2 === 0 ? 1 : -1,
          speed: 0,
          wait: 0,
          lastStop: -1,
          route: route.id,
          operator: opId,
        });
        made++; placedThisPass++;
      }
      if (!placedThisPass) break;      // koi route chalne layak nahi -- anant loop se bacho
    }
    this.count = this.buses.length;
  }

  /** Segment par doori d ki jagah aur disha. */
  _at(seg, d) {
    const want = THREE.MathUtils.clamp(d, 0, seg.total);
    let i = 1;
    while (i < seg.cum.length - 1 && seg.cum[i] < want) i++;
    const a = seg.pts[i - 1], b = seg.pts[i];
    const segLen = seg.cum[i] - seg.cum[i - 1] || 1;
    const k = (want - seg.cum[i - 1]) / segLen;
    const ux = (b.x - a.x) / segLen, uz = (b.z - a.z) / segLen;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, ux, uz };
  }

  update(dt) {
    for (const bus of this.buses) {
      const top = bus.spec.top_speed_kmh / 3.6;

      if (bus.wait > 0) {
        bus.wait -= dt;
        bus.speed *= 0.82;
      } else {
        // Aage wali bus se doori -- warna ek doosre mein se guzar jaati hain
        let ahead = Infinity;
        for (const other of this.buses) {
          if (other === bus || other.seg !== bus.seg || other.dir !== bus.dir) continue;
          const gap = (other.d - bus.d) * bus.dir;
          if (gap > 0 && gap < ahead) ahead = gap;
        }
        // Agla stop kitni door hai
        let toStop = Infinity;
        for (let i = 0; i < bus.stops.length; i++) {
          if (i === bus.lastStop) continue;
          const gap = (bus.stops[i] - bus.d) * bus.dir;
          if (gap > 0 && gap < toStop) { toStop = gap; bus._nextStop = i; }
        }
        const brakeFor = Math.min(ahead - GAP_M, toStop - 3);
        const want = brakeFor < 22 ? top * Math.max(0, brakeFor / 22) : top * 0.62;
        bus.speed += (want - bus.speed) * Math.min(1, dt * 1.4);
        bus.d += bus.speed * bus.dir * dt;

        if (toStop < 3 && bus.speed < 3.5) {
          bus.wait = STOP_SECONDS;
          bus.lastStop = bus._nextStop;
        }
      }

      // Segment ke sire par palat jao
      if (bus.d > bus.seg.total - 8) { bus.d = bus.seg.total - 8; bus.dir = -1; bus.lastStop = -1; }
      if (bus.d < 8) { bus.d = 8; bus.dir = 1; bus.lastStop = -1; }

      const p = this._at(bus.seg, bus.d);
      const nx = -p.uz, nz = p.ux;
      // Left-hand traffic: apni disha ke hisaab se baayein lane mein raho
      const off = LANE_OFFSET * bus.dir;
      const x = p.x + nx * off, z = p.z + nz * off;
      const y = this.ground(x, z);
      // origin pahiye ke neeche hai -- koi offset nahi, warna bus tairti hai
      bus.mesh.position.set(x, y, z);

      const heading = Math.atan2(p.ux * bus.dir, -(p.uz * bus.dir));
      const n = this.terrain.normalAt(x, z, _n);
      _q.setFromAxisAngle(_up, heading);
      _align.setFromUnitVectors(_up, n);
      bus.mesh.quaternion.copy(_align).multiply(_q);

      const wheels = bus.mesh.userData.wheels;
      if (wheels) {
        const spin = bus.speed * bus.dir * 0.03;
        for (const hub of wheels) for (const part of hub.children) part.rotation.x += spin;
      }
    }
  }
}

const _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _align = new THREE.Quaternion();
