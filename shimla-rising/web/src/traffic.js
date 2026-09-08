import * as THREE from "three";
import { MeshBuilder } from "./geometry.js";
import { buildBody, buildLiteBody, LITE_MAT } from "./vehicle.js";
import { buildHuman } from "./human.js";

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
/*
 * Left-hand traffic -- India. Ye ab sadak ki **apni chaudai** ka hissa hai,
 * fix number nahi: 17 m ki arterial par 2 m ka offset saari gaadiyon ko beech
 * ki patti par chipka deta tha, jaise sadak ek hi lane ki ho.
 */
const LANE_FRAC = 0.3;
const LANE_MIN = 1.6, LANE_MAX = 4.6;
const laneOffset = (spec) =>
  Math.min(LANE_MAX, Math.max(LANE_MIN, (spec?.width_m ?? 8) * 0.5 * LANE_FRAC * 2));
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
    this.fleeing = [];          // gaadi se nikale hue driver, bhaagte hue

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
    const lite = buildLiteBody(spec);
    /*
     * Gaadi mein driver.
     *
     * Nikhil: *"gadi rok k andr bethne ka option rkh, gadi wale ko bhar nikal
     * k"*. Bina driver ke gaadi se kisi ko bahar nikalne ka matlab hi nahi
     * banta. Poora kirdaar mehnga padta (23 mesh), isliye sirf sar aur kandha
     * -- ek merged mesh, sheeshe ke peeche itna hi dikhta hai.
     *
     * India mein steering daayein hoti hai. Model ka aage `-Z` hai, upar `+Y`
     * hai, isliye daayan haath `+X` par padta hai.
     */
    const driver = buildDriverBust(spec, i);
    full.add(driver);
    // shuru mein sasta wala -- pehla `_sync` bataayega ki paas hai ya door
    full.visible = false;
    mesh.add(full, lite);
    this.group.add(mesh);
    const car = {
      mesh, full, lite, spec, driver,
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
    const off = laneOffset(car.lane?.road?.spec) * car.dir;
    const x = p.x + nx * off, z = p.z + nz * off;
    car.mesh.position.set(x, this.ground(x, z), z);

    /*
     * Gaadi ka rukh.
     *
     * Model ka aage `-Z` hai, aur `rotation.y = h` use `(-sin h, -cos h)`
     * par le jaata hai. Chalne ki disha `(ux, uz) * dir` hai, isliye
     * `h = atan2(-ux*dir, -uz*dir)`. Pehle yahan `atan2(ux*dir, -(uz*dir))`
     * tha -- `sin` ka chinh ulta, yaani gaadi ka mooh sadak ke aar-paar
     * mirror ho jaata tha. Chalti wo seedhi thi par dikhti tirchhi/bagal ko
     * sarakti hui -- Nikhil ki "gaadiyan float ho rahi, straight line mein
     * nahi jaa rahi".
     */
    const heading = Math.atan2(-p.ux * car.dir, -(p.uz * car.dir));
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
    this._updateFleeing(dt);
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

  /**
   * Khiladi ke paas ki chalti gaadi -- jise roka ja sakta hai.
   *
   * `null` agar itne paas koi nahi. HUD isse prompt dikhata hai.
   */
  nearest(pos, max = 7) {
    let best = null, bd = max;
    for (const c of this.cars) {
      if (!c.lane) continue;
      const d = c.mesh.position.distanceTo(pos);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /**
   * Gaadi roko, driver ko bahar nikalo.
   *
   * Nikhil: *"gadi rok k andr bethne ka option rkh gadi wale ko bhar nikal
   * k"*. Gaadi traffic ke hisaab se hat jaati hai (`main.js` use ek asli
   * `Vehicle` bana kar `parked` mein daal deta hai), driver bahar aakar bhaag
   * jaata hai, aur uski jagah kahin aur ek nayi gaadi aa jaati hai taaki
   * sadak khaali na ho.
   *
   * @returns {{spec, x, z, yaw}|null}
   */
  carjack(pos, max = 7) {
    const car = this.nearest(pos, max);
    if (!car) return null;

    const p = car.mesh.position;
    const yaw = car.mesh.rotation.y;
    const out = { spec: car.spec, x: p.x, z: p.z, yaw: yawOf(car.mesh) };

    // driver bahar -- bhaagta hua
    this._eject(p, pos, car.spec, this.cars.indexOf(car));

    // gaadi ab traffic ki nahi rahi; uski jagah nayi kahin aur
    car.driver.visible = false;
    car.mesh.visible = false;
    car.lane = null;
    car.taken = true;
    this._place(car, pos);
    car.mesh.visible = true;
    car.driver.visible = true;
    car.taken = false;
    return out;
  }

  /** Bahar nikala hua driver -- kuch second bhaagta hai, phir gayab. */
  _eject(carPos, playerPos, spec, seed) {
    const mesh = buildHuman({
      build: seed % 4 === 0 ? "female" : "male", lod: "crowd",
      skin: [0xb07c4f, 0xc08a5e, 0x9a6a41][Math.abs(seed) % 3],
      top: [0x3d4a63, 0x6d3630, 0x2f5545][Math.abs(seed + 1) % 3],
      bottom: 0x35425e,
    });
    mesh.castShadow = true;
    // gaadi se door, khiladi ke ulti taraf
    let ax = carPos.x - playerPos.x, az = carPos.z - playerPos.z;
    const L = Math.hypot(ax, az) || 1;
    ax /= L; az /= L;
    mesh.position.set(carPos.x + ax * 1.6, this.ground(carPos.x, carPos.z), carPos.z + az * 1.6);
    this.group.add(mesh);
    this.fleeing.push({ mesh, ux: ax, uz: az, life: 14, phase: Math.random() * 6 });
  }

  _updateFleeing(dt) {
    for (let i = this.fleeing.length - 1; i >= 0; i--) {
      const f = this.fleeing[i];
      f.life -= dt;
      const sp = 4.2;
      f.mesh.position.x += f.ux * sp * dt;
      f.mesh.position.z += f.uz * sp * dt;
      f.mesh.position.y = this.ground(f.mesh.position.x, f.mesh.position.z);
      f.mesh.rotation.y = Math.atan2(-f.ux, -f.uz);      // aage = (-sin, -cos)
      f.phase += dt * 11;
      const rig = f.mesh.userData.rig;
      if (rig) {
        const g = Math.sin(f.phase) * 0.62;
        rig.legs[0].hip.rotation.x = g;
        rig.legs[1].hip.rotation.x = -g;
        rig.arms[0].shoulder.rotation.x = -g * 0.7;
        rig.arms[1].shoulder.rotation.x = g * 0.7;
      }
      if (f.life <= 0) {
        this.group.remove(f.mesh);
        f.mesh.traverse((o) => o.geometry?.dispose?.());
        this.fleeing.splice(i, 1);
      }
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

/**
 * Mesh ka apna yaw, terrain ke jhukav ko hata kar.
 *
 * Traffic ki gaadi ka quaternion `align * yaw` hai (pehle dhalan ke saath
 * jhukav, phir rukh), isliye `rotation.y` seedha padhna galat nikalta hai.
 * Model ka aage `-Z` hai -- use world mein le jaakar wahi yaw wapas nikaalte
 * hain jo `Vehicle` samajhta hai.
 */
function yawOf(mesh) {
  mesh.updateMatrixWorld(true);
  const f = _fwd.set(0, 0, -1).applyQuaternion(mesh.getWorldQuaternion(_qw));
  return Math.atan2(-f.x, -f.z);
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
/**
 * Driver ka sirf sar aur kandha -- ek merged mesh.
 *
 * Sheeshe ke peeche se itna hi dikhta hai, aur ye sirf paas wali (full LOD)
 * gaadi par lagta hai. Rang seed se aate hain taaki har gaadi mein alag banda
 * baithe.
 */
function buildDriverBust(spec, seed) {
  const [w, h, l] = spec.body;
  const mb = new MeshBuilder(0.6);
  const c = new THREE.Color();
  const SKIN = [0xb07c4f, 0xc08a5e, 0x9a6a41, 0xd0a071];
  const SHIRT = [0x3d4a63, 0x6d3630, 0x2f5545, 0x7a6a3c, 0x45414a];
  c.setHex(SHIRT[seed % SHIRT.length]);
  mb.box(0, 0.10, 0.02, 0.40, 0.30, 0.20, c);              // kandhe
  c.setHex(SKIN[seed % SKIN.length]);
  mb.box(0, 0.28, 0.00, 0.10, 0.09, 0.10, c);              // gardan
  mb.box(0, 0.40, 0.00, 0.185, 0.22, 0.19, c);             // sar
  c.setHex(0x140f0a);
  mb.box(0, 0.485, 0.012, 0.195, 0.075, 0.20, c);          // baal
  if (seed % 3 === 0) {                                     // kabhi topi
    c.setHex(0x14543c); mb.box(0, 0.525, 0, 0.24, 0.055, 0.24, c);
  }
  const m = mb.build(LITE_MAT);
  m.castShadow = false;
  m.receiveShadow = false;
  // daayein seat par, cabin ke aage wale hisse mein
  const bodyH = h * 0.48, cabH = h * 0.36;
  m.position.set(w * 0.22, bodyH + cabH * 0.10, -l * 0.06 - l * 0.06);
  return m;
}


const _n = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _qw = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _align = new THREE.Quaternion();
