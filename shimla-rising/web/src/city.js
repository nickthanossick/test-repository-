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
  const trim = new ChunkedBuilder(0.7);      // balcony, railing, chimney, floor bands
  const col = new THREE.Color();
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
        house({ walls, roofs, plinths, windows, trim }, terrain, x, z, d, rng, col, colliders, facades,
              off - w - 1.0, bw, bdep);
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
  group.add(buildForest(terrain, roads, placed, rng, quality.treeCount ?? 9000));

  // Asli jagahein: har named POI ki apni imaarat, aur uske naam ka board.
  const lm = buildLandmarks(terrain, roads, pois, colliders);
  group.userData.crowdSpots = lm.userData.crowdSpots;
  group.userData.platforms = lm.userData.platforms;
  group.userData.spawns = lm.userData.spawns;
  group.add(lm);
  const signs = buildSigns(lm.userData.signs, terrain);
  group.add(signs);
  group.userData.landmarkCount = lm.userData.landmarkCount;
  group.userData.signCount = signs.userData.count;
  group.userData.glowingSigns = signs.userData.glowingMaterials;
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
               fixedW = 0, fixedDep = 0) {
  // Naap bulane wala pehle hi nikaal chuka ho sakta hai -- usi se wo setback
  // ginta hai, isliye yahan dobara random lena galat hoga.
  const w = fixedW || (5 + rng() * 4.5);
  const dep = fixedDep || (5 + rng() * 4.5);
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
  // Har ghar par halki chamak-jhilmil (0.9..1.08) -- ek hi rang wale ghar bhi
  // thode alag lagein, taaki ekdum saaf dohraav na dikhe.
  col.multiplyScalar(0.9 + rng() * 0.18);
  mb.walls.box(x, base + bodyH / 2, z, w, bodyH, dep, col, yaw);

  // Collider sadak tak na pahunche: ghar centreline se `off` door hai, aur
  // road ka aadha hissa khaali rehna chahiye warna gaadi kinare par hi atak
  // jaati hai.
  const cr = Math.min(Math.max(w, dep) * 0.62, Math.max(0, roadClear));
  if (cr >= 2) colliders?.add(x, z, cr, base - drop - 1, base + bodyH + 4);

  // --- har manzil ka chajja ----------------------------------------------
  col.setHex(0xbfb6a8);
  for (let f = 1; f < floors; f++) {
    mb.trim.box(x, base + f * fh, z, w * 1.035, 0.16, dep * 1.035, col, yaw);
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
