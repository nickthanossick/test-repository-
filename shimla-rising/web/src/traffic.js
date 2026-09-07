import * as THREE from "three";
import { MeshBuilder } from "./geometry.js";
import { buildBody } from "./vehicle.js";

/**
 * Sadak par chalti gaadiyan.
 *
 * Nikhil: *"road p koi car nahi h na kuch"*. Ab tak sadak par sirf **khadi**
 * gaadiyan thi (main.js ka `parked`) aur route par chalti buses -- beech ki
 * aam traffic thi hi nahi, isliye Sanjauli ki sadak khaali lagti thi.
 *
 * Tareeka wahi hai jo `buses.js` ka hai, aur yahi is round mein sabse sasta
 * bhi hai: gaadi `roads.json` ki polyline par ek `d` (doori) rakhti hai, uske
 * saath aage badhti hai, sire par palat jaati hai. Koi physics nahi, koi
 * pathfinding nahi -- lekin dekhne mein sadak zinda ho jaati hai.
 *
 * **Junction ka asli logic (signal, right of way) is round mein nahi hai** --
 * chowk par gaadiyan ek doosre ke aar-paar nikal jaayengi. Ye jaan-boojh kar
 * chhoda hai; poora traffic AI apne aap mein ek round hai.
 *
 * ## Lag
 *
 * Ek poori `buildBody()` gaadi ~24 mesh ki hoti hai. 12 gaadiyan seedha 288
 * draw call ban jaati -- aur ye saari khiladi ke aas-paas hi hoti hain, yaani
 * saari nazar mein. Isliye wahi teen-tier wala tareeka jo kirdaaron par chalta
 * hai: **paas ki gaadi poori** (chamfer, sheeshe, tyre, batti), aur **door ki
 * gaadi ek merged mesh** (1 draw call). 60 m ke baad koi ye farak dekh hi nahi
 * sakta.
 */

const DRIVABLE = new Set(["arterial", "street", "lane", "track"]);
const LANE_OFFSET = 2.0;          // left-hand traffic -- India
const GAP_M = 9;                  // aage wali gaadi se kam se kam itni doori
const FULL_LOD_M = 85;            // itne paas poori gaadi, aage merged
const RECYCLE_M = 300;            // itni door nikal gayi to naye sire se
const SPAWN_MIN = 45, SPAWN_MAX = 190;

/** Aam Shimla traffic -- taxi sabse zyada, bike/thar kam. */
const MIX = ["taxi", "alto", "alto", "maruti800", "taxi", "baleno",
             "scooter", "thar", "maruti800", "taxi", "alto", "scooter"];

export class Traffic {
  /**
   * @param roads RoadNetwork
   * @param vehicleById data.vehicleById
   * @param opts {count, ground, audio, rng}
   */
  constructor(scene, terrain, roads, vehicleById, opts = {}) {
    this.terrain = terrain;
    this.ground = opts.ground || ((x, z) => terrain.heightAt(x, z));
    this.audio = opts.audio || null;
    this.rng = opts.rng || Math.random;
    this.group = new THREE.Group();
    this.group.name = "traffic";
    scene.add(this.group);
    this.cars = [];

    // ---- lanes: har chalne layak sadak ki polyline + cumulative lambai ----
    this.lanes = [];
    for (const r of roads.roads) {
      if (!DRIVABLE.has(r.type)) continue;
      const pts = r.points.map((p) => ({ x: p.x, z: p.z }));
      if (pts.length < 3) continue;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
      }
      const total = cum[cum.length - 1];
      if (total < 70) continue;         // itni chhoti sadak par gaadi ghoomti hi nahi
      this.lanes.push({ road: r, pts, cum, total, limit: (r.spec.speed_kmh || 30) / 3.6 });
    }

    const want = Math.max(0, opts.count ?? 12);
    for (let i = 0; i < want && this.lanes.length; i++) {
      this.cars.push(this._make(vehicleById, i));
    }
    this.count = this.cars.length;
  }

  _make(vehicleById, i) {
    const spec = vehicleById.get(MIX[i % MIX.length]) || vehicleById.get("alto");
    const mesh = new THREE.Group();
    const full = buildBody(spec);
    full.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    const lite = buildLite(spec);
    // shuru mein sasta wala -- pehla `_sync` bataayega ki paas hai ya door
    full.visible = false;
    mesh.add(full, lite);
    this.group.add(mesh);
    const car = {
      mesh, full, lite, spec,
      lane: null, d: 0, dir: 1, speed: 0, horn: 2 + this.rng() * 20,
      top: (spec.top_speed_kmh || 90) / 3.6,
    };
    return car;
  }

  /**
   * Gaadi ko khiladi ke aas-paas kisi sadak par rakho.
   *
   * Bilkul saamne nahi (`SPAWN_MIN`) -- warna gaadi aankhon ke aage prakat
   * hoti dikhti hai -- aur `SPAWN_MAX` se aage bhi nahi, warna wo kisi ko
   * dikhegi hi nahi aur sirf CPU khaayegi. Koi lane in dono ke beech na mile
   * to jo sabse paas is daayre ke aaye wahi le lete hain.
   */
  _place(car, playerPos) {
    /*
     * Pehle random lane + random doori aazmaate the, par Shimla ka naksha
     * itna phaila hua hai ki 24 mein se ek bhi try daayre mein nahi girti thi
     * -- saari gaadiyan door kahin nikal jaati thi. Ab seedha saare lane-points
     * (roads.js pehle hi 10 m par resample kar chuka hai) dekh kar daayre wale
     * chhaan lete hain. ~3600 point ka ek chakkar, aur wo bhi tabhi jab koi
     * gaadi recycle ho -- har frame nahi.
     */
    const band = [];
    for (const lane of this.lanes) {
      for (let i = 1; i < lane.pts.length - 1; i++) {
        const q = lane.pts[i];
        const dist = Math.hypot(q.x - playerPos.x, q.z - playerPos.z);
        if (dist > SPAWN_MIN && dist < SPAWN_MAX) band.push({ lane, d: lane.cum[i] });
      }
    }
    let pick;
    if (band.length) {
      pick = band[(this.rng() * band.length) | 0];
    } else {
      // khiladi kahin pahad ke beech hai jahan is daayre mein sadak hi nahi --
      // sabse nazdeek sadak par daal do, kam se kam gaadi kahin to hogi
      let best = null, bd = Infinity;
      for (const lane of this.lanes) {
        for (let i = 1; i < lane.pts.length - 1; i++) {
          const q = lane.pts[i];
          const dd = (q.x - playerPos.x) ** 2 + (q.z - playerPos.z) ** 2;
          if (dd < bd) { bd = dd; best = { lane, d: lane.cum[i] }; }
        }
      }
      pick = best || { lane: this.lanes[0], d: this.lanes[0].total * 0.5 };
    }
    car.lane = pick.lane;
    car.d = pick.d;
    car.dir = this.rng() < 0.5 ? 1 : -1;
    car.speed = car.lane.limit * 0.5;
    this._sync(car, playerPos);
  }

  /**
   * Jagah, dhalan ke saath jhukav, aur LOD.
   *
   * LOD **camera** se naapta hai, khiladi se nahi. Khel mein dono lagbhag ek
   * hi jagah hote hain, par flashcard aur screenshot ke waqt camera kahin aur
   * chala jaata hai -- tab paas ki gaadi bhi merged wali dikhti thi.
   */
  _sync(car, playerPos) {
    const eye = this.eye || playerPos;
    const p = at(car.lane, car.d);
    const nx = -p.uz, nz = p.ux;
    const off = LANE_OFFSET * car.dir;
    const x = p.x + nx * off, z = p.z + nz * off;
    car.mesh.position.set(x, this.ground(x, z), z);

    const heading = Math.atan2(p.ux * car.dir, -(p.uz * car.dir));
    const n = this.terrain.normalAt(x, z, _n);
    _q.setFromAxisAngle(_up, heading);
    _align.setFromUnitVectors(_up, n);
    car.mesh.quaternion.copy(_align).multiply(_q);

    const near = Math.hypot(x - eye.x, z - eye.z) < FULL_LOD_M;
    if (car.full.visible !== near) { car.full.visible = near; car.lite.visible = !near; }
    if (near) {
      const wheels = car.full.userData.wheels;
      if (wheels) {
        const spin = car.speed * car.dir * 0.05;
        for (const hub of wheels) for (const part of hub.children) part.rotation.x += spin;
      }
      /*
       * Battiyan.
       *
       * Raat ko headlight, aur brake lagte hi taillight tez. Ye sirf paas ki
       * gaadi par chalta hai -- door wali merged mesh hai, uska emissive
       * badalna sab par ek saath lag jaata.
       */
      const L = car.full.userData.lightMats;
      if (L) {
        L.head.emissiveIntensity = this.night ? 2.4 : 0.35;
        L.tail.emissiveIntensity = car.braking ? 2.6 : (this.night ? 1.1 : 0.4);
      }
    }
  }

  /**
   * @param playerPos gaadi kahan spawn/recycle ho -- khiladi ke aas-paas
   * @param camPos    LOD kis se naapa jaaye (na diya to khiladi hi)
   */
  update(dt, playerPos, camPos = null, { night = false } = {}) {
    if (!this.lanes.length) return;
    this.eye = camPos || playerPos;
    this.night = night;
    for (const car of this.cars) {
      if (!car.lane) { this._place(car, playerPos); continue; }
      const lane = car.lane;

      // ---- aage kaun hai: doosri gaadi, ya khud khiladi ----
      let ahead = Infinity;
      for (const other of this.cars) {
        if (other === car || other.lane !== lane || other.dir !== car.dir) continue;
        const gap = (other.d - car.d) * car.dir;
        if (gap > 0 && gap < ahead) ahead = gap;
      }
      // Khiladi bhi rukawat hai -- warna gaadi seedha usme se nikal jaati hai
      const p0 = at(lane, car.d);
      const px = playerPos.x - p0.x, pz = playerPos.z - p0.z;
      const along = (px * p0.ux + pz * p0.uz) * car.dir;
      const side = Math.abs(px * -p0.uz + pz * p0.ux);
      if (along > 0 && along < 20 && side < 3.5) ahead = Math.min(ahead, along);

      const top = Math.min(car.top, lane.limit) * 0.92;
      const brake = ahead - GAP_M;
      const want = brake < 20 ? top * Math.max(0, brake / 20) : top;
      car.braking = want < car.speed - 0.4;
      car.speed += (want - car.speed) * Math.min(1, dt * 1.8);
      car.d += car.speed * car.dir * dt;

      // sire par palat jao -- junction ka logic is round mein nahi hai
      if (car.d > lane.total - 6) { car.d = lane.total - 6; car.dir = -1; }
      if (car.d < 6) { car.d = 6; car.dir = 1; }

      this._sync(car, playerPos);
      const dist = car.mesh.position.distanceTo(playerPos);

      // ---- horn: ruki hui gaadi, aur khiladi paas ho ----
      car.horn -= dt;
      if (car.horn <= 0) {
        car.horn = 9 + this.rng() * 26;
        if (dist < 55 && car.speed < top * 0.4) this.audio?.horn(0.35, 0.10);
      }

      // ---- bahut door nikal gayi to naye sire se ----
      if (dist > RECYCLE_M) this._place(car, playerPos);
    }
  }

  /** Test/HUD ke liye -- khiladi ke itne paas kitni gaadiyan chal rahi hain. */
  movingNear(playerPos, radius = 120) {
    let n = 0;
    for (const c of this.cars) {
      if (!c.lane) continue;
      if (c.mesh.position.distanceTo(playerPos) < radius && Math.abs(c.speed) > 0.5) n++;
    }
    return n;
  }
}

/** Polyline par doori `d` ki jagah aur disha. */
function at(lane, d) {
  const want = THREE.MathUtils.clamp(d, 0, lane.total);
  let i = 1;
  while (i < lane.cum.length - 1 && lane.cum[i] < want) i++;
  const a = lane.pts[i - 1], b = lane.pts[i];
  const segLen = lane.cum[i] - lane.cum[i - 1] || 1;
  const k = (want - lane.cum[i - 1]) / segLen;
  return {
    x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k,
    ux: (b.x - a.x) / segLen, uz: (b.z - a.z) / segLen,
  };
}

/**
 * Door ki gaadi -- sab kuch ek merged mesh mein, ek draw call.
 *
 * Silhouette wahi rehta hai (dhad, greenhouse, chaar pahiye, battiyan), sirf
 * chamfer aur alag material chale jaate hain. 60 m se aage ye farak dikhta hi
 * nahi.
 */
function buildLite(spec) {
  const [w, h, l] = spec.body;
  const mb = new MeshBuilder(0.5);
  const c = new THREE.Color();
  const bodyH = h * 0.48;
  const cabH = h * 0.36;
  const paint = new THREE.Color(spec.color);

  // dhad -- do parat, taaki kinara ekdum seedha na lage
  c.copy(paint);
  mb.box(0, bodyH * 0.55, 0, w, bodyH * 0.9, l, c);
  c.copy(paint).multiplyScalar(0.94);
  mb.box(0, bodyH * 0.12, 0, w * 0.96, bodyH * 0.3, l * 0.99, c);

  // greenhouse -- chhat neeche wale hisse se sankri
  c.copy(paint).multiplyScalar(0.9);
  mb.box(0, bodyH + cabH * 0.5, -l * 0.06, w * 0.86, cabH, l * 0.5, c);
  c.copy(paint).multiplyScalar(1.06);
  mb.box(0, bodyH + cabH - 0.02, -l * 0.06, w * 0.74, 0.05, l * 0.44, c);   // chhat

  c.setHex(0x141a20);                                  // sheeshe: aage, peeche, bagal
  mb.box(0, bodyH + cabH * 0.52, -l * 0.31, w * 0.80, cabH * 0.72, 0.05, c);
  mb.box(0, bodyH + cabH * 0.52, l * 0.19, w * 0.78, cabH * 0.66, 0.05, c);
  for (const dx of [-1, 1]) {
    mb.box(dx * w * 0.43, bodyH + cabH * 0.52, -l * 0.06, 0.04, cabH * 0.62, l * 0.42, c);
  }

  c.setHex(0x1b1e22);                                  // bumper
  for (const dz of [-1, 1]) mb.box(0, bodyH * 0.34, dz * l * 0.5, w * 0.97, bodyH * 0.26, 0.12, c);
  c.setHex(0xfff0cc); mb.box(0, bodyH * 0.66, -l / 2 - 0.03, w * 0.68, bodyH * 0.2, 0.05, c);
  c.setHex(0xc4301f); mb.box(0, bodyH * 0.7, l / 2 + 0.03, w * 0.68, bodyH * 0.16, 0.05, c);

  c.setHex(0x14161a);
  const rad = Math.min(0.42, h * 0.32);
  for (const dx of [-1, 1]) {
    for (const dz of [0.32, -0.32]) {
      mb.box(dx * w * 0.47, rad, dz * l, 0.2, rad * 2, rad * 1.9, c);
    }
  }
  const m = mb.build(LITE_MAT);
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}

/** Saanjha material -- saari door ki gaadiyan isi par, taaki batching bani rahe. */
const LITE_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.42, metalness: 0.25 });

const _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _align = new THREE.Quaternion();
