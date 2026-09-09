import * as THREE from "three";
import { ChunkedBuilder } from "./geometry.js";
import { SpatialGrid, Colliders } from "./grid.js";
import * as TEX from "./textures.js";
import { buildLandmarks, landmarkClearance } from "./landmarks.js";
import { buildSigns } from "./signs.js";

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
/** Itni door tak poora ped; uske aage ek hi cone. */
const NEAR_FOREST_M = 240;

/*
 * Deewaron ka rang -- asli Himachal jaisa, sirf beige nahi.
 *
 * Nikhil: *"graphics AAA level chahie."* Sabse bada eyesore yahi tha -- poora
 * sheher ek hi beige box lagta tha, kyunki palette mein har rang bhoora/beige
 * hi tha. Asli Shimla/Himachal ke ghar rangeen hote hain: cream, halka neela,
 * pudina hara, gulaabi, sarson-peela, halka jamuni. Palette light/pastel ki
 * taraf jhuki hai (jaisa asli mein), par ab variety hai -- door se bhi sheher
 * "jeeta hua" lagta hai, ek chapta beige nahi.
 */
const WALLS = [
  0xe4ddcd, 0xd8cdb8, 0xcabfa6, 0xdccbb0,     // cream / beige (aam)
  0xa9c4cf, 0x9fb8c8, 0xb3c9d1,               // halka neela
  0xadc4a8, 0xbccaa6, 0xa7bd9c,               // pudina hara
  0xd6b3ac, 0xd0aaa2,                         // halka gulaabi
  0xceac6a, 0xbe9a58,                         // sarson / geru
  0xb6adc0,                                   // halka jamuni
  0xd9c0a0,                                   // halka aadu
];

// Dukaan ke board ka rang -- chatak, taaki gali "market" lage (SA jaisa).
const SHOP_COLORS = [
  0xc0392b, 0x2f6db0, 0x2e8b57, 0xe0a030, 0x8e44ad,
  0xd35400, 0x16a085, 0xc0143c, 0x2c7873,
];

/*
 * Dukaan ke naam ke board -- gali ko "padhne layak" banate hain (SA se upar).
 *
 * SA/Vice City ki galiyon mein har dukaan par uska naam likha hai; wahi cheez
 * "basic" aur "asli" ka farak hai. Par har naya naam = naya texture = naya draw
 * call, isliye poora pool sirf itna hi -- har naam ke `kind` se board ka rang
 * bhi aata hai (`signboard`), aur ek hi naam ke saare board ek `InstancedMesh`
 * mein aate hain: kul draw call = pool ka size (~15), ghar ki ginti se nahi.
 */
const SHOP_NAMES = [
  ["NEGI STORE", "Kirana", "general"], ["SHARMA JI", "General", "shop"],
  ["APNA DHABA", "Chai · Khana", "dhaba"], ["THAKUR MEDICOS", "Chemist", "medical"],
  ["HIMACHAL SWEETS", "Mithai", "sweets"], ["VERMA CLOTH", "Kapda", "cloth"],
  ["KUMAR MOBILE", "Recharge", "mobile"], ["PAHADI BAKERY", "Bakery", "bakery"],
  ["RANA HARDWARE", "Loha · Paint", "hardware"], ["MEHTA STUDIO", "Photocopy", "photocopy"],
  ["SANJAULI TEA", "Cafe", "dhaba"], ["DEV JEWELLERS", "Sona-Chandi", "jewel"],
  ["GUPTA SABZI", "Sabziwala", "sabzi"], ["NEW BOOK DEPOT", "Books", "books"],
  ["SHIMLA SALON", "Hair · Beauty", "salon"],
];

// Parked scooter ke rang + thele par sabzi/crate ke rang + bunting jhandiyan.
const SCOOTER_COLORS = [0xb0392b, 0x2f6db0, 0x2e8b57, 0x37424c, 0xd0d2d4, 0xc27a1e];
const CRATE_COLORS = [0xc0392b, 0xe0a030, 0x2e8b57, 0xd35400, 0x8e44ad];
const BUNTING_COLORS = [0xd23b2e, 0xe8b93a, 0x2f8f4f, 0x2f6db0, 0xe86f2e];

export function buildCity(terrain, roads, districts, pois, rng, quality = {}, opts = {}) {
  const group = new THREE.Group();
  group.name = "city";

  /*
   * Khaane-wale builder -- ek hi mesh nahi, 1 km ke tukde.
   *
   * Pehle poora sheher paanch mesh mein merge hota tha. Draw call to bach
   * jaate the, par har mesh ka bounding sphere 3,930 m ka ban jaata tha --
   * yaani wo kabhi frustum-cull nahi hoti thi aur **saare 3,594 ghar har
   * frame, dono pass mein** draw hote the. Naapa gaya: sirf `trim` 394k
   * triangle. `ChunkedBuilder` wahi merging karta hai, par jagah ke hisaab se
   * baant kar, taaki three.js door ke khaane chhod sake.
   */
  const walls = new ChunkedBuilder(1/3);   // facade tile = 1 manzil (3 m) -- khidki har floor/bay par
  const roofs = new ChunkedBuilder(0.5);
  const plinths = new ChunkedBuilder(0.35);
  const windows = new ChunkedBuilder(0.9);   // apna material -- raat ko jagmagati hain
  const facades = quality.windowFacades ?? 2;
  const trim = new ChunkedBuilder(0.7);      // balcony, railing, chimney, floor bands, parapet
  const shop = new ChunkedBuilder(1 / 3);    // ground-floor shutter + board (facade jaisa tile)
  const props = new ChunkedBuilder(0.5);     // chhat ki paani ki tanki, bijli ke khambe + taar
  const col = new THREE.Color();
  const boards = [];   // dukaan-naam board ki jagahein {x,y,z,yaw,idx} -- neeche instanced
  const placed = new SpatialGrid(16);
  // Bazaar corridor ki dukanein pehle ban chuki hain (bazaar.js). Unki jagahein
  // usi grid mein daal do taaki generic ghar unke andar na ghusein -- `occupied()`
  // ka check pehle se hai, bas isse feed karna tha.
  for (const st of opts.keepClear || []) placed.add(st.x, st.z);
  // College ka poora campus bhi reserve -- warna forecourt aur basketball
  // court ke beech generic ghar khade ho jaate hain (landmarks neeche bante
  // hain, is scatter ke baad).
  for (const st of landmarkClearance(terrain, pois)) placed.add(st.x, st.z);
  // Colliders ab main.js banata hai aur bazaar ke saath saanjha hai
  const colliders = opts.colliders || new Colliders(24);
  let placedCount = 0;

  // R30: `scatter:false` par generic ghar-bikhraav band -- world sirf Sanjauli
  // corridor (bazaar + curated landmarks) + pahad/jungle rehta hai. Baaki sab
  // (forest, landmarks, signs) waise hi banta hai.
  const districtList = opts.scatter === false ? [] : districts.districts;
  for (const d of districtList) {
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
      /*
       * Do kataar, ek nahi.
       *
       * Sadak chaudi karne aur ghar peeche khiskaane ke baad imaaratein 3588
       * se **2049** reh gayi thi -- sadak to khul gayi par Sanjauli khaali
       * lagne laga. Nikhil ko dono chahiye: khuli sadak aur zinda sheher.
       *
       * Jawab dhalan mein hai: asli Shimla mein ghar sadak ke *peeche*, ek ke
       * upar ek chadhte jaate hain. Isliye ab har node par do kataar hain --
       * saamne wali (footpath ke turant baad) aur peeche wali (14-24 m aur
       * peeche). Ghanapan wapas aata hai bina sadak ko chhue.
       */
      for (const side of [-1, 1]) {
        for (const row of [0, 1]) {
          if (rng() > (row === 0 ? 0.86 : 0.62)) continue;
        /*
         * Ghar **poora** sadak ke bahar.
         *
         * Pehle centre `w + 4.5` se shuru hota tha aur ghar ka apna naap baad
         * mein `house()` ke andar tay hota tha (5-9.5 m chauda, random yaw).
         * Nateeja: ek gali par ghar ka kona sadak ke **do metre andar** aa
         * jaata tha. Collider to `roadClear` se chhota kar diya jaata tha
         * (line neeche), par **mesh nahi** -- isliye deewar sadak par jhukti
         * dikhti thi aur usme se gaadi nikal bhi jaati thi. Nikhil: *"bhout
         * conjusted sa h"*.
         *
         * Ab naap pehle nikaalte hain, uska aadha vikarn jodte hain, aur uske
         * baad 6 m ka footpath chhodte hain -- yaani geometry kabhi sadak
         * chhooti hi nahi.
         */
        const bw = 5 + rng() * 4.5, bdep = 5 + rng() * 4.5;
        const halfDiag = Math.hypot(bw, bdep) / 2;
        const off = w + 6 + halfDiag + rng() * 8 + (row ? 14 + rng() * 10 : 0);
        const x = n.pos.x + side * off * n.nx;
        const z = n.pos.z + side * off * n.nz;
        // Ghar-ghar ka faasla bhi khula -- 8.5 par do 9.5 m ke ghar ek doosre
        // mein ghus jaate the.
        if (placed.occupied(x, z, 13)) continue;
        // Peeche wali kataar bahut khadi dhalan par nahi -- wahan ghar
        // plinth par tairta dikhta hai
        if (row && terrain.slopeAt(x, z) > 0.72) continue;
        placed.add(x, z);
        placedCount++;
        // Ghar ka mooh sadak ki taraf -- front face (-v) par board/dukaan/balcony
        // sab sadak ko dikhein (random yaw se board ulta chhapta tha). Halka
        // jitter taaki bilkul kataar-band robotic na lage.
        const faceYaw = Math.atan2(-side * n.nx, side * n.nz);
        house({ walls, roofs, plinths, windows, trim, shop, props, boards }, terrain, x, z, d, rng, col, colliders, facades,
              off - w - 1.0, bw, bdep, faceYaw);
        }
      }
    }
  }

  // GTA SA-jaisa: deewar par painted khidki-grid (facade texture), flat plaster nahi
  const wallMat = TEX.standard(TEX.facade(), { vertexColors: true });
  const roofMat = TEX.standard(TEX.corrugatedTin(0xffffff), { vertexColors: true, metalness: 0.4 });
  const plinthMat = TEX.standard(TEX.plaster(0xffffff, 77), { vertexColors: true, roughness: 1.0 });

  const windowMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.12, metalness: 0.0,
    emissive: 0xffc978, emissiveIntensity: 0.0,   // raat ko main.js isse badhata hai
  });
  const trimMat = TEX.standard(TEX.fabric(0xffffff, 71, 30), { vertexColors: true, roughness: 0.78 });
  const shopMat = TEX.standard(TEX.shopfront(), { vertexColors: true });
  // tanki/khambe/taar -- saada vertex-colour material (rang per-box set hota hai)
  const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2 });

  // Bijli ke khambe aur taar -- gali ka SA-jaisa clutter.
  buildStreetLines(terrain, roads, { props }, rng, quality);

  for (const [mb, mat, name] of [[plinths, plinthMat, "plinths"],
                                 [walls, wallMat, "buildings"],
                                 [roofs, roofMat, "roofs"],
                                 [trim, trimMat, "trim"],
                                 [shop, shopMat, "shopfronts"],
                                 [props, propMat, "props"],
                                 [windows, windowMat, "windows"]]) {
    if (!mb.count) continue;
    const mesh = mb.build(mat);
    mesh.name = name;
    group.add(mesh);
  }

  group.userData.buildingCount = placedCount;
  group.userData.colliders = colliders;
  group.add(buildForest(terrain, roads, placed, rng, quality.treeCount ?? 9000));

  // Asli jagahein: har named POI ki apni imaarat, aur uske naam ka board.
  const lm = buildLandmarks(terrain, roads, pois, colliders, { corridorOnly: opts.corridorLandmarks });
  group.userData.crowdSpots = lm.userData.crowdSpots;
  group.userData.platforms = lm.userData.platforms;
  group.userData.spawns = lm.userData.spawns;
  group.add(lm);
  const signs = buildSigns(lm.userData.signs, terrain);
  group.add(signs);
  group.userData.landmarkCount = lm.userData.landmarkCount;
  group.userData.signCount = signs.userData.count;

  // Dukaan-naam board: naam ke hisaab se poolo (ek naam = ek texture = ek mesh),
  // aur har naam ke saare board ek InstancedMesh mein -- kul ~15 draw call, chahe
  // hazaaron dukaan hon. Raat ko jagmagate hain (glowing list mein daal diye).
  const boardGlow = [];
  if (boards.length) {
    const byIdx = new Map();
    for (const bd of boards) {
      if (!byIdx.has(bd.idx)) byIdx.set(bd.idx, []);
      byIdx.get(bd.idx).push(bd);
    }
    const geo = new THREE.PlaneGeometry(1, 0.25);              // 4:1, texture jaisa
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    const e = new THREE.Euler(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    for (const [idx, list] of byIdx) {
      const [name, sub, kind] = SHOP_NAMES[idx];
      const set = TEX.signboard(name, sub, kind, 100 + idx);
      // FrontSide -- peeche se board dikhta hi nahi (DoubleSide se pichhli taraf
      // se naam ulta chhapta tha). Har board apni sadak ki taraf mooh kiye hai.
      const mat = new THREE.MeshStandardMaterial({
        map: set.map, roughness: set.roughness, metalness: set.metalness,
        emissiveMap: set.map, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0,
      });
      boardGlow.push(mat);
      const inst = new THREE.InstancedMesh(geo, mat, list.length);
      for (let i = 0; i < list.length; i++) {
        const bd = list[i];
        // +Z ko front-outward (sadak ki taraf = sin yaw, -cos yaw) par le jaao:
        // rotation.y = PI - yaw. Isse FrontSide board sadak se seedha padha jaata
        // hai, ulta nahi (yaw+PI galat disha deta tha).
        e.set(0, Math.PI - bd.yaw, 0); q.setFromEuler(e);
        pos.set(bd.x, bd.y, bd.z); scl.set(bd.w, bd.w, 1);
        m.compose(pos, q, scl); inst.setMatrixAt(i, m);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.name = "shopboards";
      group.add(inst);
    }
  }
  group.userData.glowingSigns = signs.userData.glowingMaterials.concat(boardGlow);
  group.userData.windowMaterial = windowMat;
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
function house(mb, terrain, x, z, d, rng, col, colliders, facadeCount = 2, roadClear = 99,
               fixedW = 0, fixedDep = 0, faceYaw = null) {
  // Naap bulane wala pehle hi nikaal chuka ho sakta hai -- usi se wo setback
  // ginta hai, isliye yahan dobara random lena galat hoga.
  const w = fixedW || (5 + rng() * 4.5);
  const dep = fixedDep || (5 + rng() * 4.5);
  // Zyada height variety -- SA mein 2 manzil ke ghar se 6 manzil ke block tak.
  const floors = 2 + Math.floor(rng() * (d.wealth > 0.7 ? 4.4 : 3.2));
  const fh = 3.0;
  // Sadak ki taraf mooh (front -v us disha mein), halke jitter ke saath. Purana
  // random yaw board ko ulta aur dukaan ko deewar ki taraf kar deta tha.
  const yaw = faceYaw == null ? rng() * Math.PI * 2 : faceYaw + (rng() - 0.5) * 0.4;
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

  /*
   * Do archetype:
   *   urban       -- flat chhat, neeche **dukaan** (shutter+board), upar
   *                  khidkiyon wali manzilein, chhat pe paani ki tanki
   *   residential -- gable chhat, poori deewar khidkiyon wali
   * Ooncha ghar aksar urban; chhota aksar residential -- SA jaisa mix.
   */
  const urban = floors >= 3 || rng() < 0.5;
  const shopH = 3.0;
  const wallBot = urban ? base + shopH : base;
  const wallH = urban ? bodyH - shopH : bodyH;

  // --- ground floor: dukaan (sirf urban) ---------------------------------
  if (urban) {
    col.setHex(SHOP_COLORS[(rng() * SHOP_COLORS.length) | 0]);
    col.multiplyScalar(0.85 + rng() * 0.25);
    mb.shop.box(x, base + shopH / 2, z, w * 1.02, shopH, dep * 1.02, col, yaw);
  }

  // --- deewarein (upar ki manzilein) -- facade texture se khidkiyan --------
  const wallHex = WALLS[(rng() * WALLS.length) | 0];
  col.setHex(wallHex);
  // Har ghar par halki chamak-jhilmil (0.9..1.08) -- ek hi rang wale ghar bhi
  // thode alag lagein, taaki ekdum saaf dohraav na dikhe.
  col.multiplyScalar(0.9 + rng() * 0.18);
  mb.walls.box(x, wallBot + wallH / 2, z, w, wallH, dep, col, yaw);

  // Collider sadak tak na pahunche: ghar centreline se `off` door hai, aur
  // road ka aadha hissa khaali rehna chahiye warna gaadi kinare par hi atak
  // jaati hai.
  const cr = Math.min(Math.max(w, dep) * 0.62, Math.max(0, roadClear));
  if (cr >= 2) colliders?.add(x, z, cr, base - drop - 1, base + bodyH + 4);

  // Front face (sadak/dhalan ki taraf, local -v): ispar chhajje, AC, board.
  // Ye woh "SA se upar" gehrai hai -- flat texture ke upar asli 3D relief jispe
  // dhoop se sachi chhaya padti hai. Sab merged builder mein, draw call same.
  const fx = sy, fz = -cy;                                  // front outward normal
  const front = (u, out) => [x + u * cy + (dep / 2 + out) * sy,
                             z + u * sy - (dep / 2 + out) * cy];

  // --- har manzil ka chajja (ab gehra -- sachi shelf) --------------------
  col.setHex(0xbfb6a8);
  for (let f = 1; f < floors; f++) {
    mb.trim.box(x, base + f * fh, z, w * 1.06, 0.22, dep * 1.06, col, yaw);
    // front par thoda aur bahar nikla hua chhajja -- khidki ke upar dhoop-chhaya
    const [sx, sz] = front(0, 0.28);
    col.setHex(0xd7cebd);
    mb.trim.box(sx, base + f * fh + 0.02, sz, w * 0.9, 0.14, 0.62, col, yaw);
    col.setHex(0xbfb6a8);
  }

  // --- upar cornice + AC units (front face) ------------------------------
  // Deewar ke sabse upar ek bahar nikla cornice band -- imaarat ko "topi".
  {
    const [cx2, cz2] = front(0, 0.34);
    col.setHex(0xcbc2b2);
    mb.trim.box(cx2, wallBot + wallH - 0.35, cz2, w * 0.98, 0.4, 0.7, col, yaw);
  }
  // window AC -- sparse, front face, kisi manzil par latka hua dabba
  const nAc = urban ? (rng() < 0.6 ? 1 : 0) + (rng() < 0.3 ? 1 : 0) : (rng() < 0.35 ? 1 : 0);
  for (let a = 0; a < nAc; a++) {
    const af = 1 + Math.floor(rng() * Math.max(1, floors - 1));
    const au = (rng() - 0.5) * w * 0.6;
    const [ax, az] = front(au, 0.28);
    col.setHex(0xe8e6df);
    mb.props.box(ax, base + af * fh - 0.1, az, 0.86, 0.56, 0.5, col, yaw);
    col.setHex(0x9aa0a2);                                    // grille
    const [ax2, az2] = front(au, 0.55);
    mb.props.box(ax2, base + af * fh - 0.1, az2, 0.8, 0.5, 0.06, col, yaw);
  }

  // --- dukaan ka naam-board + gali ki zindagi (sirf urban) ---------------
  if (urban) {
    // naam-board: shopfront ke signboard-patti par, thoda bahar nikla hua.
    // Sirf jagah note karte hain -- board mesh neeche pool se instanced banta hai.
    const idx = (rng() * SHOP_NAMES.length) | 0;
    const [bx0, bz0] = front(0, 0.16);
    mb.boards.push({ x: bx0, y: base + shopH - 0.62, z: bz0, yaw, idx, w: Math.min(w * 0.86, 4.4) });
    // dukaan ke aage khadi scooter/thela -- gali "zinda" lage
    if (rng() < 0.5) {
      const su = (rng() - 0.5) * w * 0.5;
      const [px0, pz0] = front(su, 1.35 + rng() * 0.6);
      if (rng() < 0.6) scooter(mb.props, px0, base, pz0, yaw + (rng() - 0.5), col, rng);
      else handcart(mb.props, px0, base, pz0, yaw + (rng() - 0.5), col, rng);
    }
  }

  // --- khidkiyan ---------------------------------------------------------
  // Ab khidkiyan **facade texture** mein painted hain (GTA SA jaisa) -- har
  // manzil, har bay par, charon deewaron pe, aur ek bhi extra polygon nahi.
  // Pehle yahan har khidki do box (frame + sheesha) banati thi; wo hata diya.
  const glassHex = rng() < 0.5 ? 0x2c3b46 : 0x38414a;

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

  if (urban) {
    // --- flat chhat: slab + parapet + paani ki tanki (SA rooftop) --------
    const ry = base + bodyH;
    col.setHex(0x9a9086);
    mb.roofs.box(x, ry + 0.08, z, w, 0.16, dep, col, yaw);            // chhat slab
    col.setHex(0xcbc2b2);
    const pt = 0.26, ph = 0.72;
    const parap = (u, v, sx, sz) => {
      const [px, pz] = L(u, v);
      mb.trim.box(px, ry + ph / 2, pz, sx, ph, sz, col, yaw);
    };
    parap(0, dep / 2, w, pt); parap(0, -dep / 2, w, pt);
    parap(w / 2, 0, pt, dep); parap(-w / 2, 0, pt, dep);
    // paani ki kaali tanki (Sintex) -- 1-2
    const nt = 1 + (rng() < 0.55 ? 1 : 0);
    for (let t = 0; t < nt; t++) {
      const [tx, tz] = L((rng() - 0.5) * w * 0.5, (rng() - 0.5) * dep * 0.5);
      col.setHex(0x24242a); mb.props.box(tx, ry + 0.55, tz, 1.0, 0.9, 1.0, col, yaw);
      col.setHex(0x121216); mb.props.box(tx, ry + 1.06, tz, 0.7, 0.16, 0.7, col, yaw);
    }
    // kabhi seedhi chadhne wali chhoti kothari (staircase head)
    if (rng() < 0.4) {
      col.setHex(wallHex); col.multiplyScalar(0.9);
      const [sx2, sz2] = L(w * 0.22, dep * 0.18);
      mb.walls.box(sx2, ry + 1.2, sz2, w * 0.34, 2.4, dep * 0.3, col, yaw);
    }
  } else {
    // --- gable chhat -----------------------------------------------------
    col.setHex(ROOFS[(rng() * ROOFS.length) | 0]);
    const ridgeAlongX = w >= dep;
    mb.roofs.gableRoof(x, base + bodyH, z, w, dep,
      1.5 + rng() * 1.4, 0.45 + rng() * 0.3, col, yaw, ridgeAlongX);
    // --- chimney -------------------------------------------------------
    if (rng() < 0.32) {
      const [chx, chz] = L((rng() - 0.5) * w * 0.5, (rng() - 0.5) * dep * 0.5);
      col.setHex(0x7a6a5c);
      mb.trim.box(chx, base + bodyH + 1.6, chz, 0.62, 3.0, 0.62, col, yaw);
      col.setHex(0x4a423a);
      mb.trim.box(chx, base + bodyH + 3.2, chz, 0.78, 0.18, 0.78, col, yaw);
    }
  }
}

/**
 * Bijli ke khambe aur latakte taar -- gali ka SA/Indian clutter.
 *
 * Har arterial/street ke kinare ~45 m par ek concrete khamba, uspar crossarm,
 * aur do lagataar khambon ke beech ek jhulta taar (2 tukdon mein sag). Sab
 * `props` merged builder mein jaata hai, isliye draw call nahi badhta. Low tier
 * par khambe patle aur taar band -- perf ke liye.
 */
function buildStreetLines(terrain, roads, mb, rng, quality) {
  const wires = (quality.treeCount ?? 9000) > 12000;   // medium+ par hi taar
  const col = new THREE.Color();
  const groundY = (x, z) => roads.groundAt(x, z);
  for (const road of roads.roads) {
    if (road.type === "rail" || road.type === "pedestrian") continue;
    const w = road.spec.width_m / 2;
    const pts = road.points;
    let prevTop = null, acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      if (acc < 45) { continue; }
      acc = 0;
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i)];
      const dx = b.x - a.x, dz = b.z - a.z, L2 = Math.hypot(dx, dz) || 1;
      const nx = -dz / L2, nz = dx / L2;                 // road ke lambvat
      const px = pts[i].x + nx * (w + 1.2), pz = pts[i].z + nz * (w + 1.2);
      const gy = groundY(px, pz);
      const poleH = 6.5;
      const yaw = Math.atan2(nz, nx);
      col.setHex(0x8a8378); mb.props.box(px, gy + poleH / 2, pz, 0.22, poleH, 0.22, col, yaw);
      col.setHex(0x6b6459); mb.props.box(px, gy + poleH - 0.5, pz, 1.5, 0.12, 0.12, col, yaw);  // crossarm
      const top = { x: px, y: gy + poleH - 0.35, z: pz };
      if (wires && prevTop) {
        // do lagataar khambon ke beech jhulta taar (2 tukde, beech mein sag)
        const midx = (prevTop.x + top.x) / 2, midz = (prevTop.z + top.z) / 2;
        const sag = Math.min(1.4, Math.hypot(top.x - prevTop.x, top.z - prevTop.z) * 0.03);
        const mid = { x: midx, y: (prevTop.y + top.y) / 2 - sag, z: midz };
        col.setHex(0x1a1a1c);
        wireSeg(mb.props, prevTop, mid, col);
        wireSeg(mb.props, mid, top, col);
        // kabhi-kabhi rangeen jhandiyan (bunting) -- tehwaar wali gali
        if (rng() < 0.28) {
          const n = 4;
          for (let f = 1; f <= n; f++) {
            const t = f / (n + 1);
            const fxp = prevTop.x + (top.x - prevTop.x) * t;
            const fzp = prevTop.z + (top.z - prevTop.z) * t;
            const fyp = (prevTop.y + (top.y - prevTop.y) * t) - sag * (1 - Math.abs(2 * t - 1)) - 0.28;
            col.setHex(BUNTING_COLORS[(rng() * BUNTING_COLORS.length) | 0]);
            mb.props.box(fxp, fyp, fzp, 0.26, 0.34, 0.03, col, yaw);
          }
        }
      }
      prevTop = top;
    }
  }
}

/** Do bindu ke beech ek patla taar (box). */
function wireSeg(builder, p0, p1, col) {
  const dx = p1.x - p0.x, dz = p1.z - p0.z;
  const cx = (p0.x + p1.x) / 2, cy = (p0.y + p1.y) / 2, cz = (p0.z + p1.z) / 2;
  // box ka local +x world disha (cos yaw, sin yaw) mein jaata hai
  const horiz = Math.hypot(dx, dz) || 1;
  builder.box(cx, cy, cz, horiz, 0.05, 0.05, col, Math.atan2(dz, dx));
}

/**
 * Khadi scooter -- dukaan ke aage. Chhoti si, box-based, par gali turant zinda
 * lagti hai (SA mein har footpath par gaadiyan khadi hain). `props` merged mesh
 * mein jaati hai, isliye draw call nahi badhta. `v` = lambaai, `u` = side.
 */
function scooter(b, x, gy, z, yaw, col, rng) {
  const cw = Math.cos(yaw), sw = Math.sin(yaw);
  const P = (u, v) => [x + u * cw - v * sw, z + u * sw + v * cw];
  const body = SCOOTER_COLORS[(rng() * SCOOTER_COLORS.length) | 0];
  let p;
  col.setHex(body);
  p = P(0, -0.12); b.box(p[0], gy + 0.62, p[1], 0.36, 0.5, 0.66, col, yaw);   // seat/body
  p = P(0, 0.34);  b.box(p[0], gy + 0.38, p[1], 0.3, 0.12, 0.62, col, yaw);   // footboard
  p = P(0, 0.6);   b.box(p[0], gy + 0.78, p[1], 0.34, 0.62, 0.14, col, yaw);  // front apron
  col.setHex(0x232327);
  p = P(0, 0.66);  b.box(p[0], gy + 0.24, p[1], 0.12, 0.46, 0.46, col, yaw);  // aage ka pahiya
  p = P(0, -0.56); b.box(p[0], gy + 0.24, p[1], 0.16, 0.46, 0.5, col, yaw);   // peeche ka pahiya
  col.setHex(0x141416);
  p = P(0, 0.62);  b.box(p[0], gy + 1.0, p[1], 0.52, 0.07, 0.07, col, yaw);   // handle
}

/**
 * Thela (haath-gaadi) -- sabzi/phal wala. Lakdi ka platform, do pahiye, aur upar
 * rangeen crate. Bhi `props` mein.
 */
function handcart(b, x, gy, z, yaw, col, rng) {
  const cw = Math.cos(yaw), sw = Math.sin(yaw);
  const P = (u, v) => [x + u * cw - v * sw, z + u * sw + v * cw];
  let p;
  col.setHex(0x8a6a44);
  p = P(0, 0); b.box(p[0], gy + 0.72, p[1], 1.9, 0.14, 0.98, col, yaw);       // platform
  col.setHex(0x6b5232);
  for (const [u, v] of [[0.82, 0.36], [0.82, -0.36], [-0.82, 0.36], [-0.82, -0.36]]) {
    p = P(u, v); b.box(p[0], gy + 0.36, p[1], 0.1, 0.72, 0.1, col, yaw);      // taangein
  }
  col.setHex(0x1b1b1f);
  for (const s of [-1, 1]) { p = P(s * 0.88, 0); b.box(p[0], gy + 0.3, p[1], 0.14, 0.58, 0.58, col, yaw); }  // pahiye
  for (let i = 0; i < 3; i++) {                                              // sabzi ke crate
    col.setHex(CRATE_COLORS[(rng() * CRATE_COLORS.length) | 0]);
    p = P((i - 1) * 0.56, (rng() - 0.5) * 0.28);
    b.box(p[0], gy + 0.98, p[1], 0.44, 0.34, 0.62, col, yaw);
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
function buildForest(terrain, roads, buildings, rng, TARGET = 9000) {
  const TILES = 8;
  const g = new THREE.Group();
  g.name = "forest";

  const trunkGeo = new THREE.CylinderGeometry(0.30, 0.46, 3.4, 6, 1);
  trunkGeo.translate(0, 1.7, 0);
  /*
   * Do prajaati -- Shimla ki dhalan par dono hain aur silhouette alag hai.
   *
   * **Deodar** chaudi, teen layer ka cone, gehra hara. **Chir pine** patli
   * aur oonchi, upar hi taaj. Ek hi shakl ke 9,000 ped turant "copy-paste"
   * lagte hain; do shakl aur alag-alag tint se jungle asli lagta hai.
   */
  const deodarGeo = mergeCones([
    { r: 3.0, h: 4.4, y: 2.6 }, { r: 2.4, h: 4.2, y: 5.6 }, { r: 1.6, h: 4.4, y: 8.6 },
  ]);
  const chirGeo = mergeCones([
    { r: 1.5, h: 3.6, y: 6.4 }, { r: 2.0, h: 3.4, y: 8.2 }, { r: 1.1, h: 3.0, y: 10.6 },
  ]);
  /*
   * Door ka roop: ek hi cone, bina trunk, 6 phalak. 72 triangle se 12.
   *
   * 200 m se aage aankh sirf silhouette padhti hai -- na chhaal dikhti hai, na
   * teen layer ka farak. Isi wajah se ped ki ginti teen guna ho sakti hai bina
   * budget phate: door ke hazaron ped ab utne hi mehnge hain jitne pehle
   * saikdon.
   */
  const farGeo = mergeCones([{ r: 2.6, h: 9.6, y: 2.4 }]);

  const barkMat = TEX.standard(TEX.bark(), { roughness: 1.0 });
  const needleMat = TEX.standard(TEX.needles(), { vertexColors: true, roughness: 0.95 });

  // pehle saari positions chuno, phir tiles mein baanto
  /*
   * Ped **jhund** mein ugte hain, bikhre hue nahi.
   *
   * Pehle poore 64 km² par eksaman random scatter tha. 9,000 ped bahut lagte
   * hain, par us phailav par wo prati km² sirf 140 hote hain -- yaani dhalan
   * par gine-chune ped, jungle nahi. Asli deodar stand mein ugta hai: ghane
   * jhund, beech mein khaali maidan.
   *
   * Isliye pehle kuch **kendra** chunte hain aur unke aas-paas ped daalte
   * hain. Ginti wahi rehti hai, par dikhta ghana jungle hai -- aur khaali
   * maidan bhi asli lagte hain.
   */
  const spots = [];
  const half = terrain.half - 30;
  const CLUMP_R = 120;
  let clumpX = 0, clumpZ = 0, clumpLeft = 0;
  let tries = 0;
  while (spots.length < TARGET && tries < TARGET * 14) {
    tries++;
    if (clumpLeft <= 0) {
      clumpX = (rng() * 2 - 1) * half;
      clumpZ = (rng() * 2 - 1) * half;
      clumpLeft = 18 + ((rng() * 46) | 0);
    }
    clumpLeft--;
    // jhund ke andar bhi kinare patle -- sqrt se beech ghana hota hai
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * CLUMP_R;
    const x = THREE.MathUtils.clamp(clumpX + Math.cos(a) * rr, -half, half);
    const z = THREE.MathUtils.clamp(clumpZ + Math.sin(a) * rr, -half, half);
    const y = terrain.heightAt(x, z);
    if (y > 2380) continue;                        // treeline ke upar barf
    const slope = terrain.slopeAt(x, z);
    if (slope > 0.86) continue;                    // nangi chattan
    // Khadi dhalan par jungle patla hota hai -- jad tikti nahi. Yahi
    // terrain ke splat se bhi mel khata hai (wahan chattan dikhti hai).
    if (slope > 0.55 && rng() < (slope - 0.55) * 2.2) continue;
    /*
     * Sadak khaali rakho -- ab uski **apni chaudai** ke hisaab se.
     *
     * Pehle ye 11 m fix tha. Sadak chaudi hone ke baad (arterial 17 m) uska
     * aadha hi 8.5 m hai, yaani ped sadak ke kinare par nahi, kinare ke andar
     * ug aate. Ab aadhi chaudai + 6 m ka footpath.
     */
    const nr = roads.nearestNode(x, z);
    if (nr && nr.dist < nr.node.road.spec.width_m / 2 + 6) continue;
    if (buildings.occupied(x, z, 7)) continue;
    if (y < 1800 && rng() > 0.42) continue;        // deodar belt 1800 m se upar
    // chir neeche zyada, deodar upar zyada
    const chir = rng() < THREE.MathUtils.clamp((2200 - y) / 500, 0.12, 0.78);
    spots.push([x, y, z, 0.62 + rng() * 0.85, rng() * Math.PI * 2, 0.42 + rng() * 0.20, chir]);
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
  const tiles = [];

  buckets.forEach((bucket, bi) => {
    if (!bucket.length) return;
    const n = bucket.length;
    const tm = new THREE.InstancedMesh(trunkGeo, barkMat, n);
    const deo = bucket.filter((s) => !s[6]).length;
    const cmD = new THREE.InstancedMesh(deodarGeo, needleMat, Math.max(1, deo));
    const cmC = new THREE.InstancedMesh(chirGeo, needleMat, Math.max(1, n - deo));
    const far = new THREE.InstancedMesh(farGeo, needleMat, n);
    for (const im of [cmD, cmC, far]) {
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(im.count * 3), 3);
    }

    let iD = 0, iC = 0;
    bucket.forEach(([x, y, z, s, rot, tint, chir], i) => {
      pos.set(x, y, z);
      scl.set(s, s * (0.85 + (tint - 0.42) * 2.4), s);
      q.setFromAxisAngle(_cityUp, rot);
      m.compose(pos, q, scl);
      tm.setMatrixAt(i, m);
      far.setMatrixAt(i, m);
      // chir thoda halka aur peela-hara, deodar gehra neela-hara
      if (chir) c.setRGB(tint * 0.62, tint * 1.02, tint * 0.46);
      else c.setRGB(tint * 0.46, tint * 1.02, tint * 0.62);
      far.setColorAt(i, c);
      const im = chir ? cmC : cmD;
      const k = chir ? iC++ : iD++;
      im.setMatrixAt(k, m);
      im.setColorAt(k, c);
    });
    for (const im of [tm, cmD, cmC, far]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.receiveShadow = true;
      im.computeBoundingSphere?.();
    }
    tm.castShadow = cmD.castShadow = cmC.castShadow = true;
    far.castShadow = false;         // door ke ped ki chhaya kaun dekhta hai

    const tx = bi % TILES, tz = (bi / TILES) | 0;
    tiles.push({
      near: [tm, cmD, cmC], far,
      cx: -terrain.half + (tx + 0.5) * size,
      cz: -terrain.half + (tz + 0.5) * size,
      isNear: null,
    });
    g.add(tm, cmD, cmC, far);
  });

  /*
   * Har frame: kaun sa tile paas hai.
   *
   * Sirf 64 doori ka hisaab -- kuch bhi nahi. Tile ka aadha vikarn jodte hain
   * taaki jis tile mein khiladi khada hai wo hamesha "paas" gine.
   */
  const halfDiag = size * 0.71;
  g.userData.update = (camPos) => {
    for (const t of tiles) {
      const d = Math.hypot(t.cx - camPos.x, t.cz - camPos.z) - halfDiag;
      const near = d < NEAR_FOREST_M;
      if (near === t.isNear) continue;
      t.isNear = near;
      for (const im of t.near) im.visible = near;
      t.far.visible = !near;
    }
  };
  g.userData.update({ x: 0, z: 0 });
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

const _cityUp = new THREE.Vector3(0, 1, 0);
