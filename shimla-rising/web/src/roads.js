import * as THREE from "three";
import { MeshBuilder, ChunkedBuilder } from "./geometry.js";
import * as TEX from "./textures.js";

/**
 * data/roads.json ki lat/lon polylines se sadak ke ribbon mesh banata hai,
 * terrain pe drape karke.
 *
 * Saath hi ek flat `nodes` list deta hai jise city.js building placement ke liye
 * aur wanted.js police navigation ke liye use karta hai -- Shimla mein imaarat
 * hamesha sadak ke kinare hi hoti hai, isliye placement roads pe hi tikta hai.
 */
/** Ring search itni door tak. 40 m ke cell par ye ~1.2 km hai. */
const MAX_SPAN = 30;

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
        // `i` isliye ki `groundAt()` node ke bajaye uske **segment** par
        // project kar sake -- node par karne se mod aur chaurahe par jawab
        // kood jaata hai (naapa gaya: 18 m tak).
        this.nodes.push({ pos: dense[i], road, i, nx: -dz / L, nz: dx / L });
      }
    }

    this._buildIndex();
  }

  /**
   * Nodes ka uniform grid.
   *
   * Sadak har 10 m par resample hoti hai, isliye 35 km ke network mein **3,603
   * nodes** hain. `nearestNode()` inpar seedha loop chalata tha -- aur wo ek
   * frame mein 30-50 baar bulaya jaata hai (khiladi, bheed, traffic, bus,
   * police, sab `groundAt()` se), yaani **har frame ~1.5 lakh doori ka
   * hisaab**. Ye `renderer.info` mein dikhta hi nahi, isliye draw call theek
   * lagne par bhi khel atakta tha. Nikhil: *"abhi it lags"*.
   *
   * Cell 40 m ka hai: 10 m ke nodes ke saath ek cell mein mutthi bhar nodes
   * aate hain, aur pehla ring aksar hi jawab de deta hai.
   */
  _buildIndex() {
    this._cell = 40;
    this._grid = new Map();
    for (let i = 0; i < this.nodes.length; i++) {
      const p = this.nodes[i].pos;
      const k = this._key(p.x, p.z);
      let a = this._grid.get(k);
      if (!a) this._grid.set(k, (a = []));
      a.push(i);
    }
  }

  _key(x, z) { return ((x / this._cell) | 0) * 100003 + ((z / this._cell) | 0); }

  /**
   * Sabse paas ka **segment** -- sabse paas ka node nahi.
   *
   * Ye farak Shimla mein bahut bada hai. `nearestNode()` seedhi Euclidean
   * doori naapta hai, jisme sadak ke **saath** wali doori bhi ginti hai: do
   * node ke beech khade ho to apne hi segment ka node 5 m door hota hai.
   * Hairpin par (aur Shimla lagbhag hairpin se hi bana hai) mod ki doosri
   * limb ka koi node usse bhi paas nikal aata hai -- aur wo limb 5 m neeche
   * hoti hai.
   *
   * Naapa gaya: 591 bindu mein 11 aise the. `navbahar_road` ke node 37 ka
   * kinara node **122** par gir raha tha -- yaani usi sadak ki doosri limb,
   * 850 m aage aur **5.05 m neeche**. Wahin khiladi zameen ke andar dhansta
   * tha aur gaadi uchhalti thi.
   *
   * Isliye yahan chunav **lambvat (perpendicular) doori** se hota hai: har
   * paas wale node ke dono segment par project karo aur sabse paas wala
   * segment lo. Apni limb ki lambvat doori 5.85 m hai, doosri limb ki 7 m se
   * zyada -- ab sahi limb jeetti hai.
   */
  nearestSegment(x, z) {
    const cell = this._cell;
    const cx = (x / cell) | 0, cz = (z / cell) | 0;
    let best = null, bd = Infinity;

    for (let span = 0; span <= MAX_SPAN; span++) {
      /*
       * `nearestNode()` jaisa jaldi rukna -- par hadd **11 m dheeli**.
       *
       * Wahan har node apne cell mein hi hota hai, isliye `(span-1)*cell` ek
       * pakki hadd hai. Yahan hum node ki nahi, uske **segment** ki doori
       * naapte hain, aur segment apne node se 10 m tak bahar nikalta hai
       * (nodes har 10 m par resample hote hain). Bina is chhoot ke agle ring
       * ka koi segment paas hote hue bhi chhoot sakta tha.
       */
      const ringMin = (span - 1) * cell - 11;
      if (best && ringMin > 0 && ringMin * ringMin > bd) break;

      for (let iz = cz - span; iz <= cz + span; iz++) {
        const edgeZ = iz === cz - span || iz === cz + span;
        for (let ix = cx - span; ix <= cx + span; ix++) {
          if (!edgeZ && ix !== cx - span && ix !== cx + span) continue;
          const arr = this._grid.get(ix * 100003 + iz);
          if (!arr) continue;
          for (const k of arr) {
            const n = this.nodes[k];
            const pts = n.road.points, i = n.i;
            for (let j = i - 1; j <= i; j++) {
              if (j < 0 || j + 1 >= pts.length) continue;
              const a = pts[j], b = pts[j + 1];
              const ex = b.x - a.x, ez = b.z - a.z;
              const L2 = ex * ex + ez * ez || 1;
              const t = ((x - a.x) * ex + (z - a.z) * ez) / L2;
              const tc = t < 0 ? 0 : t > 1 ? 1 : t;
              const px = a.x + ex * tc, pz = a.z + ez * tc;
              const d = (x - px) * (x - px) + (z - pz) * (z - pz);
              if (d < bd) { bd = d; best = { road: n.road, a, b, t: tc }; }
            }
          }
        }
      }
    }
    if (!best) return null;
    best.dist = Math.sqrt(bd);
    return best;
  }

  /**
   * Segment ki khinchi hui satah (lift samet). Sadak chaudai mein samtal hai.
   *
   * Oonchai node ke apne `y` se aati hai, `terrain.heightAt()` se nahi. Do
   * wajah: (1) `groundAt()` har frame 30-50 baar chalta hai aur ye do
   * heightmap lookup bachata hai, aur (2) `buildMesh()` bhi wahi `y` istemaal
   * karta hai, isliye **jo dikhta hai aur jispar chalte hain wo ek hi cheez
   * hai** -- dono alag-alag hisaab karein to phir se khisak sakte the. Node ka
   * `y` constructor mein bharta hai aur terrain uske baad badalta nahi.
   */
  _segmentY(s) {
    return s.a.y + (s.b.y - s.a.y) * s.t + (s.road.type === "rail" ? 0.35 : 0.5);
  }

  /**
   * Sabse nazdeek sadak ka point. Police AI, spawn aur zameen ki oonchai ke liye.
   *
   * Beech se bahar ki taraf ring-by-ring dekhte hain. Ek ring mein kuch mila
   * to bhi ruk nahi sakte -- agle ring ka koi node aur paas ho sakta hai --
   * isliye ek ring aur dekh kar hi rukte hain (`ringMin` se jaanch).
   *
   * `filter` ke saath jawab bahut door ho sakta hai (jaise Mall par khade
   * hokar "koi non-pedestrian sadak" poochhna), isliye ring khatm hone par
   * seedha loop fallback hai -- wo kabhi-kabhaar hi chalta hai.
   */
  nearestNode(x, z, filter = null) {
    const cell = this._cell;
    const cx = (x / cell) | 0, cz = (z / cell) | 0;
    let best = null, bd = Infinity;

    for (let span = 0; span <= MAX_SPAN; span++) {
      // Is ring ka koi bhi node itne se paas nahi ho sakta -- pichhla jawab
      // pakka hai to yahin ruk jao.
      const ringMin = (span - 1) * cell;
      if (best && ringMin > 0 && ringMin * ringMin > bd) break;

      for (let iz = cz - span; iz <= cz + span; iz++) {
        const edgeZ = iz === cz - span || iz === cz + span;
        for (let ix = cx - span; ix <= cx + span; ix++) {
          // sirf ring ka kinara -- andar ke cell pichhle span mein dekh liye
          if (!edgeZ && ix !== cx - span && ix !== cx + span) continue;
          const a = this._grid.get(ix * 100003 + iz);
          if (!a) continue;
          for (const i of a) {
            const n = this.nodes[i];
            if (filter && !filter(n.road)) continue;
            const dx = n.pos.x - x, dz = n.pos.z - z;
            const d = dx * dx + dz * dz;
            if (d < bd) { bd = d; best = n; }
          }
        }
      }
    }

    if (!best) return this._nearestLinear(x, z, filter);
    return { node: best, dist: Math.sqrt(bd) };
  }

  /** Ring khatm, kuch nahi mila -- poora scan. Filter wale sawaal par hi lagta hai. */
  _nearestLinear(x, z, filter) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      if (filter && !filter(n.road)) continue;
      const dx = n.pos.x - x, dz = n.pos.z - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = n; }
    }
    return best ? { node: best, dist: Math.sqrt(bd) } : null;
  }

  /**
   * Chalne layak farsh (campus ke terrace jaise).
   *
   * `groundAt()` sirf terrain + sadak jaanta hai. College ka campus cut-and-
   * fill se banaya gaya ek ooncha slab hai -- uspar khada karne se khiladi
   * uske andar dab jaata tha. `landmarks.js` ab apne farsh ki aayat bata deta
   * hai aur wahi yahan aakar baithti hai.
   *
   * Ye **sirf khiladi** ke liye hai (`main.js` ka `playerGround`). Gaadi ka
   * ground isse nahi guzarta, warna cars campus par chadh jaayengi.
   */
  setPlatforms(list) { this.platforms = list || []; }

  /** `(x, z)` par farsh ki oonchai, ya `null`. */
  platformAt(x, z) {
    const ps = this.platforms;
    if (!ps || !ps.length) return null;
    let best = null;
    for (const p of ps) {
      const dx = x - p.x, dz = z - p.z;
      const cy = Math.cos(-p.yaw), sy = Math.sin(-p.yaw);
      const u = dx * cy - dz * sy, v = dx * sy + dz * cy;
      if (Math.abs(u) <= p.hu && Math.abs(v) <= p.hv && (best === null || p.y > best)) best = p.y;
    }
    return best;
  }

  groundAt(x, z) {
    /*
     * **Sadak ki asli, khinchi hui satah** -- centre ki terrain oonchai nahi.
     *
     * Sadak ka mesh chaudai mein **samtal** hai: har quad ke dono kinare
     * apne segment ki centreline oonchai par hote hain (dekho `buildMesh()`).
     * Par yahan pehle `terrain.heightAt(x, z) + lift` lautaya jaata tha --
     * yaani beech ki *zameen*, jo khinchi hui satah se dhalan par bilkul alag
     * hoti hai.
     *
     * Naapa gaya (2426 bindu): 48% jagah 15 cm se zyada ka farak, aur sabse
     * bure kone par **17.39 m**. Isi wajah se khiladi, gaadi, bus aur bheed --
     * sab dhalan wali sadak par usme dhans jaate the ya upar tairte the.
     * Nikhil: *"character b sadak k andr ghus gya... gadiyan b wat the hell"*.
     *
     * Ye keeda pehle bhi tha, par 12.5 m ki sadak par kinara sirf 6.25 m door
     * tha; 17 m par lever dugna ho gaya aur baat khul kar saamne aa gayi.
     *
     * Ab bilkul wahi hisaab jo `buildMesh()` khud karta hai: sabse paas wale
     * **segment** par project karo aur uske dono sire ki centreline oonchai ke
     * beech lerp karo. Chaudai oonchai badalti hi nahi.
     */
    const s = this.nearestSegment(x, z);
    if (!s) return this.terrain.heightAt(x, z);
    // kinare ki patti (0.42 m) tak bhi sadak hi hai
    if (s.dist > s.road.spec.width_m / 2 + 0.42) return this.terrain.heightAt(x, z);
    return this._segmentY(s);
  }

  /**
   * Point kis sadak par hai (chaudai ke andar ho to).
   *
   * Ye bhi `nearestSegment()` se, `nearestNode()` se nahi. Node se naapne par
   * do node ke beech khada bindu apne hi node se 5 m door hota tha, isliye
   * `roadAt(x, z, 0)` sadak ke beecho-beech bhi `null` lauta deta tha --
   * yaani "sadak par ho ya nahi" ka jawab har 10 m par jhilmilata tha, aur
   * gaadi ka jhukav uske saath badalta tha.
   */
  roadAt(x, z, slack = 3) {
    const s = this.nearestSegment(x, z);
    if (!s) return null;
    return s.dist <= s.road.spec.width_m / 2 + slack ? s.road : null;
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
    /*
     * Khaane-wale builder. Sadak 35 km lambi hai, isliye ek merged mesh ka
     * bounding sphere poore world jitna (4,054 m) ban jaata tha -- aur
     * `road-railings` akele 208k triangle hai, har frame dono pass mein.
     * Ab har 1 km ka apna mesh.
     */
    const road = new ChunkedBuilder(0.16);
    const stone = new ChunkedBuilder(0.55);
    const metal = new ChunkedBuilder(0.8);
    const lamps = new ChunkedBuilder(0.9);   // sirf lamp ke sir -- raat ko jalte hain
    const col = new THREE.Color();
    const edge = new THREE.Color();
    const stoneCol = new THREE.Color(0x8d857a);
    /*
     * Kate hue aur bhare hue chehre ka rang.
     *
     * Ye dono pehle `edge * 0.62` the -- yaani asphalt ka gehra roop, jo
     * bade chehre par **kaala** dikhta tha. Ab dono zameen ke rang ke hain:
     * bhraav (fill) mitti-bhoori, aur kata hua chehra (cut) chattan-slaiti.
     * Isse sadak ke kinare pahad jaise lagte hain, deewar jaise nahi.
     */
    const fillCol = new THREE.Color(0x6e6047);
    const cutCol = new THREE.Color(0x7a736a);
    const railCol = new THREE.Color(0x3d4147);
    const lampCol = new THREE.Color(0x2b2f34);
    let lampAccum = 0;
    /*
     * Jo sach mein khincha gaya uska naap -- taaki jaanch formula dobara likhne
     * ke bajaye **banane wale ka apna hisaab** parkhe. (Do baar ye galti ho
     * chuki hai: jaanch ne wahi ganit likha jo code mein tha, aur dono ek saath
     * galat rahe.)
     */
    const face = { wallMax: 0, fillMaxDeg: 0, cutMaxDeg: 0 };

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

        /*
         * **Sadak apni chaudai bhar samtal hai** -- dhalan par drape nahi hoti.
         *
         * Pehle har kona alag se terrain par rakha jaata tha. Uska matlab ye
         * tha ki sadak zameen par ek chaadar ki tarah bichh jaati thi, aur
         * dhalan par wo ek **tirchha plane** ban jaati thi. Heightmap par
         * naapa gaya: **9% segment 3 m se zyada tirchhe**, aur sabse bure par
         * dono kinaron mein **12.7 m** ka farak. Screenshot mein Nikhil ko
         * yahi dikha -- ek bada kaala tirchha plane, jispar sab dhans rahe the
         * aur gaadiyan uchhal rahi thi.
         *
         * Asli pahadi sadak aisi nahi hoti: wo pahad ko **kaat kar** banti hai
         * aur uski satah chaudai mein samtal hoti hai (halka camber chhod kar).
         * Isliye ab dono kinare **centreline ki oonchai** par hain. Lambai
         * mein dhalan waise ki waisi rehti hai -- Shimla ki chadhai bachi
         * rehti hai.
         *
         * Kata hua chehra neeche `cutFace` dhakta hai, warna slab ka kinara
         * hawa mein dikhta.
         */
        // `groundAt()` bhi theek yahi do sankhya padhta hai (`_segmentY`)
        const ha = a.y + lift, hb = b.y + lift;
        const v = (p, sOff) => {
          const X = p.x + nx * sOff, Z = p.z + nz * sOff;
          return new THREE.Vector3(X, p === a ? ha : hb, Z);
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

        /*
         * Kinare ke neeche ki khaali jagah -- **chhoti par mitti, badi par
         * pathar ki deewar**.
         *
         * Satah ab chaudai bhar samtal hai, isliye dhalan par sadak ka nichla
         * kinara zameen se kai metre upar reh jaata hai. Bina bhare wo ek
         * tairta hua slab dikhta hai.
         *
         * Pehli koshish mein maine yahan sirf mitti ka dhalan (34 degree)
         * banaya tha. Wo galat tha, aur screenshot mein saaf dikha: jis dhalan
         * par sadak hai wo khud ~30 degree ki hai, isliye 34 degree ka bhraav
         * zameen se milta hi nahi -- wo 16 m tak faila aur poori pahadi ko ek
         * bade gehre wedge se dhak diya. (Wahi "bada kaala plane" wapas aa
         * gaya tha, bas doosri shakal mein.)
         *
         * Asli Shimla yahi samasya pathar se hal karti hai: sadak ke neeche
         * **retaining wall**, aur uske upar parapet + railing (jo neeche pehle
         * se banta hai). Mitti ka dhalan sirf wahan jahan girna chhota ho.
         */
        for (const sd of [-1, 1]) {
          const ex = (a.x + b.x) / 2 + nx * sd * k, ez = (a.z + b.z) / 2 + nz * sd * k;
          const gh = this.terrain.heightAt(ex, ez);
          const edgeY = (ha + hb) / 2;
          const drop = edgeY - gh;
          if (drop <= 0.35) continue;                        // zameen upar hai -- cut ka kaam

          if (drop <= 2.5) {
            // chhota girna: mitti ka dhalan, apne kon (angle of repose) par
            const run = Math.max(0.9, drop * 1.48);
            face.fillMaxDeg = Math.max(face.fillMaxDeg, Math.atan2(drop, run) * 180 / Math.PI);
            const top = (p) => v(p, sd * k);
            const foot = (p) => {
              const X = p.x + nx * sd * (k + run), Z = p.z + nz * sd * (k + run);
              return new THREE.Vector3(X, Math.min(this.terrain.heightAt(X, Z), gh) - 0.15, Z);
            };
            if (sd > 0) road.quadUp(top(a), top(b), foot(b), foot(a), fillCol, len, run);
            else road.quadUp(foot(a), foot(b), top(b), top(a), fillCol, len, run);
            continue;
          }

          // bada girna: pathar ki retaining wall, sadak ke kinare se neeche
          const wTop = edgeY + 0.05;
          const wBot = Math.max(gh - 0.8, wTop - 7.5);
          const h = wTop - wBot;
          face.wallMax = Math.max(face.wallMax, h);
          stone.box(ex, (wTop + wBot) / 2, ez, 0.5, h, len * 1.02, stoneCol,
                    Math.atan2(nz, nx));
          /*
           * Wall 7.5 m par rukti hai. Usse gehra girna ho to uske pair se
           * neeche mitti ka dhalan zameen tak jaata hai -- yahi asli sadak
           * bhi karti hai (deewar, phir uske neeche bhraav).
           */
          if (wBot > gh + 0.3) {
            const rest = wBot - gh;
            const run = Math.min(10, Math.max(0.9, rest * 1.48));
            face.fillMaxDeg = Math.max(face.fillMaxDeg, Math.atan2(rest, run) * 180 / Math.PI);
            const top = (p) => new THREE.Vector3(p.x + nx * sd * k, wBot, p.z + nz * sd * k);
            const foot = (p) => {
              const X = p.x + nx * sd * (k + run), Z = p.z + nz * sd * (k + run);
              return new THREE.Vector3(X, Math.min(this.terrain.heightAt(X, Z), gh) - 0.15, Z);
            };
            if (sd > 0) road.quadUp(top(a), top(b), foot(b), foot(a), fillCol, len, run);
            else road.quadUp(foot(a), foot(b), top(b), top(a), fillCol, len, run);
          }
        }
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
        /*
         * Kata hua chehra: **pathar ki wall + uske upar dhalwan cut face**.
         *
         * `roadY + 4.0` ka purana clamp tab bana tha jab sadak drape hoti thi
         * aur kinara khud zameen par hota tha; ab satah samtal hai, isliye
         * chadhai wali taraf pahad sadak se bahut ooncha reh jaata hai aur
         * clamp ke saath slab hawa mein latakta dikhta tha.
         *
         * Par clamp poora hata dena bhi galat tha -- naapa gaya: 1,129 mein se
         * 23 jagah wall 8 m se ooper chali gayi aur sabse oonchi **24.8 m**.
         * 25 m ki seedhi deewar Shimla mein hoti hi nahi, aur screenshot mein
         * wo ek kaali chattan jaisi dikhti thi.
         *
         * Asli pahadi sadak dono karti hai: neeche 6 m tak seedhi pathar ki
         * wall, aur uske upar pahad ko **dhalwan kaat** kar chhod diya jaata
         * hai (chattan hone se ye bhraav se khadi rehti hai -- lagbhag 60
         * degree, yaani `run = drop * 0.58`). Wahi yahan bhi.
         */
        const cutTop = Math.max(wallGround, roadY) + 0.6;
        const wallTop = Math.min(cutTop, roadY + 6.0);
        /*
         * Neev 7.5 m se gehri nahi.
         *
         * Sirf upar se 6 m par rokna kaafi nahi tha: neev `wallGround - 1.2`
         * tak jaati thi, aur jahan sadak dono taraf se ooncha bhraav hai wahan
         * `wallGround` sadak se kai metre neeche hota hai -- naapa gaya, kul
         * **12.1 m** ki pathar ki deewar.
         */
        const wallBottom = Math.max(Math.min(roadY, wallGround) - 1.2, wallTop - 7.5);
        const wallH = wallTop - wallBottom;
        /*
         * Wall sirf wahan jahan sach mein **kaat** hui hai.
         *
         * Pehle ye har segment par banti thi, chahe pahad sadak se neeche hi
         * kyun na ho. Ridge par (jahan sadak dono taraf se ooncha bhraav hai)
         * retaining wall hoti hi nahi -- wahan dono taraf bhraav hota hai, aur
         * wahi upar `fill skirt` banata hai.
         */
        if (wallGround > roadY + 0.3 && wallH > 1.0) {
          face.wallMax = Math.max(face.wallMax, wallH);
          stone.box(wx, (wallTop + wallBottom) / 2, wz2, 0.55, wallH, len * 1.02, stoneCol, yaw);
        }
        if (cutTop > wallTop + 0.5) {
          // wall ke sar se pahad tak dhalwan chehra
          const run = Math.min(14, (cutTop - wallTop) * 0.58);
          face.cutMaxDeg = Math.max(face.cutMaxDeg,
            Math.atan2(cutTop - wallTop, run) * 180 / Math.PI);
          const bx = nx * upSide, bz = nz * upSide;
          const lowY = wallTop;
          const V = (p, out, y) => new THREE.Vector3(
            p.x + bx * (w + 0.55 + out), y, p.z + bz * (w + 0.55 + out));
          const t0 = V(a, run, cutTop), t1 = V(b, run, cutTop);
          const b0 = V(a, 0, lowY), b1 = V(b, 0, lowY);
          if (upSide > 0) road.quadUp(b0, b1, t1, t0, cutCol, len, run);
          else road.quadUp(t0, t1, b1, b0, cutCol, len, run);
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
          lamps.box(lx - nx * dSide * 1.05, ly + 4.44, lz2 - nz * dSide * 1.05,
                    0.42, 0.22, 0.3, new THREE.Color(0xfff0c8), yaw);
        }
      }
    }

    this.faceStats = face;

    const g = new THREE.Group();
    g.name = "roads";
    /*
     * `ChunkedBuilder.build()` ek Group deta hai (har khaane ka apna mesh), aur
     * three.js mein `castShadow` Group se bachchon par nahi jaata -- isliye
     * yahan traverse karke lagana padta hai.
     */
    const emit = (builder, mat, name, cast = true) => {
      if (!builder.count) return null;
      const grp = builder.build(mat);
      grp.name = name;
      if (!cast) grp.traverse((o) => { o.castShadow = false; });
      g.add(grp);
      return grp;
    };
    emit(road, TEX.standard(TEX.asphalt(), { vertexColors: true, roughness: 0.92 }),
         "road-surface", false);
    emit(stone, TEX.standard(TEX.plaster(0xffffff, 91), { vertexColors: true, roughness: 1.0 }),
         "road-walls");
    emit(metal, TEX.mat("road:rail", () => new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.42, metalness: 0.75 })), "road-railings");
    if (lamps.count) {
      // Apna material, taaki daynight.js raat ko sirf lamp ke sir jaga sake
      const lampMat = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.3,
        emissive: 0xffd98a, emissiveIntensity: 0,
      });
      emit(lamps, lampMat, "road-lamps", false);
      g.userData.lampMaterial = lampMat;
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
