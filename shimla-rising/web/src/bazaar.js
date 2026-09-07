import * as THREE from "three";
import * as TEX from "./textures.js";
import { MeshBuilder } from "./geometry.js";

/**
 * Sanjauli ka bazaar corridor.
 *
 * Ye is round ka dil hai. Pehle dukanein `landmarks.js` ke `bazaar()` se banti
 * thi -- ek POI par 11 alag-alag imaaratein, beech mein khaali jagah. Asli
 * bazaar aisa nahi hota: dukanein **ek doosre se joodi** hoti hain, deewar
 * saanjhi hoti hai, aur sadak ek "canyon" ban jaati hai jiske dono taraf
 * signboard aur sar ke upar taar hote hain. Wahi feel yahan banaya hai.
 *
 * Corridor ek sadak ke polyline ke saath chalta hai. `roads.js` har road ko 10 m
 * pe resample karke har node ka perpendicular (nx, nz) pehle hi nikaal deta hai,
 * isliye yahan sirf us par chalna hai.
 */

const C = new THREE.Color();
const hex = (h) => C.setHex(h);

/** Deterministic RNG -- ek hi dukan har load pe wahi dikhni chahiye. */
function seeded(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6d2b79f5; h >>>= 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WALLS = [0xd6c9ae, 0xc9bda6, 0xbfae92, 0xd2c4ad, 0xc4b49a, 0xcabfa8];
const SHUTTERS = [0x3a4149, 0x4a4038, 0x2f3b46, 0x45403a];
/**
 * Bazaar ko `data/sanjauli.json` ke **slots** se banata hai.
 *
 * Pehle ye ek road ke poore polyline par 5 m ke kadam chalta tha. Us tareeke se
 * "Negi Tea Stall ko chowk se 60 m aage baayein taraf lagao" kehna mumkin nahi
 * tha -- jagah har build pe procedural thi. Ab har dukan ki jagah data mein ek
 * naam ke saath hai (`chowk_dhalli_L_012`), aur `shops.json` mein us slot ka id
 * likh dene se asli dukan apni asli jagah par lag jaati hai.
 *
 * Jab tak slot khaali hain, unme cycle karke naam bhar diye jaate hain -- kaam
 * rukta nahi.
 */
export function buildBazaar(terrain, roads, shopsJson, mapJson, quality = {}, colliders = null) {
  const g = new THREE.Group();
  g.name = "bazaar";

  const mb = {
    plaster: new MeshBuilder(0.20),
    stone: new MeshBuilder(0.28),
    tin: new MeshBuilder(0.35),
    wood: new MeshBuilder(0.5),
    metal: new MeshBuilder(0.6),
    glass: new MeshBuilder(0.5),
  };
  // Dukan ke andar ki roshni ka apna material -- raat ko daynight.js isse
  // jagmagata hai, bilkul gharon ki khidkiyon ki tarah.
  const interior = new MeshBuilder(0.4);

  const shops = shopsJson.shops;
  const kinds = shopsJson.kinds;
  const byName = new Map(shops.map((s) => [s.name, s]));
  const signs = [];
  const wires = [];
  const stalls = [];      // shopkeeper yahan khade honge
  let shopIndex = 0;
  let count = 0;

  // Segment ke points ko world mein badal kar rakh lo -- har slot inhi par baithta hai
  const segs = new Map();
  for (const s of mapJson.segments) {
    const pts = s.points.map(([lat, lon]) => {
      const w = terrain.geo.toWorld(lat, lon);
      return { x: w.x, z: w.z };
    });
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    }
    segs.set(s.id, { spec: s, pts, cum, total: cum[cum.length - 1] });
  }

  /** Segment par t (0..1) ki jagah, disha aur perpendicular. */
  function at(seg, t) {
    const want = t * seg.total;
    let i = 1;
    while (i < seg.cum.length - 1 && seg.cum[i] < want) i++;
    const a = seg.pts[i - 1], b = seg.pts[i];
    const segLen = seg.cum[i] - seg.cum[i - 1] || 1;
    const k = (want - seg.cum[i - 1]) / segLen;
    const ux = (b.x - a.x) / segLen, uz = (b.z - a.z) / segLen;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, ux, uz, nx: -uz, nz: ux };
  }

  const rng = seeded("bazaar:slots");
  let wireCounter = 0;

  for (const slot of mapJson.slots) {
    const seg = segs.get(slot.segment);
    if (!seg) continue;
    // Halke hisse mein har teesri dukan -- asli bazaar chowk ke paas ghana hai
    if (!slot.dense && rng() > 0.34) continue;

    const spec = (slot.shop && byName.get(slot.shop)) || shops[shopIndex++ % shops.length];
    const kind = kinds[spec.kind] || kinds.general;

    const p = at(seg, slot.t);
    const halfW = seg.spec.width_m / 2;
    const off = halfW + 3.4;
    const bx = p.x + p.nx * slot.side * off;
    const bz = p.z + p.nz * slot.side * off;
    const gy = terrain.heightAt(bx, bz);
    // Dhalan pe dukan tairni nahi chahiye -- plinth sadak ke level tak jaata hai
    const front = terrain.heightAt(p.x + p.nx * slot.side * halfW,
                                   p.z + p.nz * slot.side * halfW);
    const drop = Math.max(0, gy - front) + 1.2;
    // Dukan ka mooh sadak ki *taraf*: disha = -(nx,nz)*side, aur MeshBuilder
    // mein local -Z hi aage hai, isliye yaw = atan2(dx, -dz).
    const fyaw = Math.atan2(-p.nx * slot.side, p.nz * slot.side);

    const W = 4.6, D = 6.4;
    shopUnit(mb, interior, {
      x: bx, y: gy, z: bz, yaw: fyaw, drop,
      width: W, depth: D, rng, spec, kind,
    });
    /*
     * Dukan ka collider. Pehle bazaar ki 672 dukanein collider list mein thi hi
     * nahi -- isliye gaadi unme se guzar jaati thi, aur chase camera ka
     * building-avoidance bhi unhe dekh nahi paata tha (screenshot bar-bar dukan
     * ke andar aa jaata tha). Radius aadha diagonal se thoda kam, taaki paas se
     * guzarte waqt gaadi khaamakha na atke.
     */
    // Radius sadak tak na pahunche: dukan centreline se (halfW + 3.4) door hai.
    const shopR = Math.min(Math.hypot(W, D) * 0.42, off - halfW - 0.8);
    if (shopR >= 2) colliders?.add(bx, bz, shopR, gy - drop - 1, gy + 14);

    const fx2 = Math.sin(fyaw), fz2 = -Math.cos(fyaw);   // local -Z = sadak ki taraf
    /*
     * Naam ka board **sadak pe lambvat** nikla hua -- deewar ke saath chipka
     * board apni hi awning ke peeche chhup jaata hai. Dono taraf padha ja sake
     * iske liye do quad peeth-se-peeth (DoubleSide se ek taraf text palat jaata).
     */
    for (const turn of [Math.PI / 2, -Math.PI / 2]) {
      /*
       * Dono quad ko apne-apne mukh ki taraf 3 cm khiskao.
       *
       * Bilkul ek hi jagah par rakhne se DoubleSide ke saath depth test mein
       * kabhi galat wala jeet jaata tha, aur gali ke us paar ka naam **aaine
       * jaisa ulta** padhta tha. Alag karne se har taraf se sahi mukh saamne
       * rehta hai.
       */
      const ox = Math.sin(fyaw + turn) * 0.03;
      const oz = -Math.cos(fyaw + turn) * 0.03;
      signs.push({
        x: bx + fx2 * 4.9 + ox, z: bz + fz2 * 4.9 + oz, y: gy + 4.05,
        yaw: fyaw + turn, text: spec.name, sub: spec.sub, width: 2.9, kind: spec.kind,
      });
    }
    /*
     * Mukhya board -- shutter aur awning ke **beech**, jahan asli dukan par
     * hota hai.
     *
     * Pehle ye awning ke upar 3.95 m par tha. Wahan se ye dikhta to tha, par
     * sadak ke beech se (aankh 1.7 m, doori ~6 m) itna tirchha ki 1024x256 ka
     * texture kuch hi pixel ooncha reh jaata tha -- naam padha hi nahi jaata.
     * Neeche laane se board seedha saamne aata hai:
     *   shutter ka neecha kinara 2.31 m, awning 3.47 m
     *   board 2.53-3.51 m -- theek beech mein
     *   aankh se seedh awning ke bahri kinare (5.5 m, 3.52 m) ke *neeche* se
     *   guzarti hai, isliye awning use dhakti bhi nahi
     */
    signs.push({
      x: bx + fx2 * 3.28, z: bz + fz2 * 3.28, y: gy + 3.02,
      yaw: fyaw, text: spec.name, sub: spec.sub, width: 3.9, kind: spec.kind,
    });

    stalls.push({
      id: slot.id, x: bx, y: gy, z: bz, yaw: fyaw,
      kind: spec.kind, name: spec.name,
      // Dukandaar counter ke *peeche* khada hota hai. Counter dukan ke kendra se
      // 2.65 m sadak ki taraf hai, aur peechhli deewar 1.34 m par -- isliye
      // 2.05 m dono ke beech ki sahi jagah hai. Pehle 1.15 m tha, jisse aadmi
      // peechhli deewar ke andar chala jaata tha aur dikhta hi nahi tha.
      keeperX: bx + fx2 * 2.05, keeperZ: bz + fz2 * 2.05,
    });
    count++;

    // Bijli ke taar -- gali ke aar-paar, har chauthi dukan pe ek khambe ki jodi
    if (slot.side < 0 && (wireCounter++ % 4) === 0) {
      wires.push({ x: p.x, z: p.z, nx: p.nx, nz: p.nz, span: halfW + 4.2 });
    }
  }

  const mats = {
    plaster: TEX.standard(TEX.plaster(0xffffff), { vertexColors: true }),
    stone: TEX.standard(TEX.plaster(0xffffff, 77), { vertexColors: true, roughness: 1.0 }),
    tin: TEX.standard(TEX.corrugatedTin(0xffffff), { vertexColors: true, metalness: 0.4 }),
    wood: TEX.standard(TEX.setRepeat(TEX.fabric(0xffffff, 71, 30), 2), { vertexColors: true, roughness: 0.8 }),
    metal: TEX.standard(TEX.corrugatedTin(0xffffff, 13), { vertexColors: true, metalness: 0.55, roughness: 0.5 }),
    glass: TEX.standard(TEX.plaster(0xffffff, 41), { vertexColors: true, roughness: 0.18, metalness: 0.25 }),
  };
  for (const k of Object.keys(mb)) {
    const m = mb[k].build(mats[k]);
    if (m) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  }
  /*
   * Har trade ka apna rang **diffuse** par aata hai, emissive par nahi.
   * `emissive` MeshStandardMaterial mein ek hi uniform rang hai -- vertex
   * colour use chhoota hi nahi. Pehle sabka `emissive: #ffb45c` tha, isliye
   * chemist ho ya bank, andar ki peeth ek jaisi kesari chamakti thi. Ab
   * vertex colour se din mein trade ka rang dikhta hai, aur emissive sirf
   * garam roshni ki tarah upar chadhta hai jise daynight raat ko badhata hai.
   */
  const interiorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.9,
    emissive: 0xffb45c, emissiveIntensity: 0.0,     // raat ko daynight badhata hai
  });
  const im = interior.build(interiorMat);
  if (im) g.add(im);

  if (wires.length) g.add(buildWires(wires, terrain));
  const signGroup = buildShopSigns(signs);
  g.add(signGroup);

  g.userData.glowingSigns = signGroup.userData.glowingMaterials;
  g.userData.signCount = signs.length;
  g.userData.stalls = stalls;
  g.userData.shopCount = count;
  g.userData.slotCount = 0;
  g.userData.interiorMaterial = interiorMat;
  return g;
}

/**
 * Ek dukan.
 *
 * Ground floor ko ek thos box banane se shutter, counter aur andar ka gehra
 * hissa sab deewar ke *andar* dab jaate the -- sadak se dukan ek khaali safed
 * deewar dikhti thi. Isliye ground floor teen tukdon mein hai: dono taraf
 * khambe aur upar lintel, beech mein khula mukh.
 */
function shopUnit(mb, interior, o) {
  const { x, y, z, yaw, drop, width: w, depth: d, rng, kind } = o;
  const floors = 2 + ((rng() * 2.4) | 0);
  const gh = 3.4;                                  // ground floor -- dukan
  const fh = 3.0;
  const bodyH = gh + (floors - 1) * fh;
  const F = (u, v) => [x + u * Math.cos(yaw) - v * Math.sin(yaw),
                       z + u * Math.sin(yaw) + v * Math.cos(yaw)];
  const fz = -(d / 2);                             // local -Z = sadak ki taraf

  // plinth dhalan tak neeche
  hex(0x8b8177);
  mb.stone.box(x, y - drop / 2, z, w * 0.99, drop + 0.5, d * 0.99, C, yaw);

  const wallHex = WALLS[(rng() * WALLS.length) | 0];

  // ---- ground floor: khula mukh ----
  const openW = w * 0.76, pier = (w - openW) / 2;
  hex(wallHex);
  for (const s2 of [-1, 1]) {                      // dono taraf ke khambe
    const [px, pz] = F(s2 * (openW + pier) / 2, 0);
    mb.plaster.box(px, y + gh / 2, pz, pier, gh, d, C, yaw);
  }
  mb.plaster.box(x, y + gh - 0.30, z, openW, 0.60, d, C, yaw);            // lintel
  // dukan ka andar ka gehra hissa -- raat ko jalta hai
  // Andar ka gehra hissa. Rang har trade ka apna (`kinds[].glow`) -- medical ka
  // thanda safed, dhaba ka garam peela. Ek hi emissive material par vertex
  // colour se, isliye draw call nahi badhta.
  /*
   * Ye ek **patli peeth** hai, poora dabba nahi.
   *
   * Pehle ye 2 m gehra box tha jo mukh se sirf 15 cm andar shuru hota tha --
   * yaani poori khuli bay ise bhar jaati thi, aur counter, shelf, peti sab
   * iske *andar* dab jaate the. Bahar se dukan ek chamakta khaali dabba
   * dikhti thi. Ab ye peechhli deewar par chipki patli patti hai, jiske
   * saamne saara saamaan khada rehta hai.
   */
  const [ix, iz] = F(0, fz + 1.80);
  const glow = kind.glow ? parseInt(kind.glow.slice(1), 16) : 0xffb45c;
  C.setHex(glow).multiplyScalar(0.55);
  interior.box(ix, y + (gh - 0.6) / 2, iz, openW, gh - 0.6, 0.14, C, yaw);
  // peeche ki deewar, taaki dukan ke aar-paar dekha na ja sake
  hex(wallHex);
  mb.plaster.box(x, y + gh / 2, z, openW, gh, d * 0.42, C, yaw);

  // lipta hua shutter, mukh ke upar
  const [sx, sz] = F(0, fz + 0.08);
  hex(SHUTTERS[(rng() * SHUTTERS.length) | 0]);
  mb.metal.box(sx, y + gh - 0.78, sz, openW * 0.98, 0.62, 0.16, C, yaw);

  // counter aur saamaan -- har trade ka apna
  fitOut(mb, { F, y, yaw, openW, fz, rng, kind });

  // ---- upar ka dhad ----
  hex(wallHex);
  mb.plaster.box(x, y + gh + (bodyH - gh) / 2, z, w, bodyH - gh, d, C, yaw);

  // awning
  const [ax, az] = F(0, fz - 0.50);
  hex(parseInt(kind.awning.slice(1), 16));
  mb.tin.box(ax, y + gh + 0.12, az, w * 0.99, 0.10, 0.95, C, yaw);
  hex(0x5a5148);
  for (const s2 of [-1, 1]) {                      // tirchhe brace, deewar se
    const [bx2, bz2] = F(s2 * w * 0.40, fz - 0.45);
    mb.metal.box(bx2, y + gh - 0.42, bz2, 0.05, 0.05, 1.25, C, yaw);
  }

  // ---- upar ki manzilein ----
  for (let f = 1; f < floors; f++) {
    const fy = y + gh + (f - 1) * fh;
    hex(0xbfb6a8);
    mb.plaster.box(x, fy, z, w * 1.04, 0.16, d * 1.04, C, yaw);         // chajja
    const [wx, wz] = F(0, fz - 0.04);
    hex(0xe6ded0); mb.plaster.box(wx, fy + fh * 0.55, wz, w * 0.72, 1.55, 0.14, C, yaw);
    hex(0x2c3b46); mb.glass.box(wx, fy + fh * 0.55, wz, w * 0.60, 1.30, 0.09, C, yaw);
    if (rng() < 0.62) {
      const [bx3, bz3] = F(0, fz - 0.62);
      hex(0xd9cfbc); mb.wood.box(bx3, fy + 0.10, bz3, w * 0.86, 0.12, 1.15, C, yaw);
      hex(0x6f6558);
      for (let i = 0; i < 7; i++) {
        const u = (i / 6 - 0.5) * w * 0.82;
        const [rx, rz] = F(u, fz - 1.16);
        mb.wood.box(rx, fy + 0.52, rz, 0.05, 0.85, 0.05, C, yaw);
      }
      const [hx2, hz2] = F(0, fz - 1.16);
      mb.wood.box(hx2, fy + 0.96, hz2, w * 0.86, 0.07, 0.07, C, yaw);   // handrail
      if (rng() < 0.5) {
        hex([0xd8b23f, 0xa8324f, 0x2f7d63, 0xe8e0d0][(rng() * 4) | 0]);
        const [lx, lz] = F(-w * 0.2, fz - 1.05);
        mb.wood.box(lx, fy + 0.52, lz, 0.55, 0.72, 0.03, C, yaw);
      }
    }
  }

  // chhat + paani ki tanki + dish
  hex([0x8c3b2e, 0x2f5d8a, 0x3f6b47, 0x6b6b70][(rng() * 4) | 0]);
  mb.tin.gableRoof(x, y + bodyH, z, w, d, 1.05, 0.35, C, yaw, false);
  if (rng() < 0.55) {
    const [tx, tz] = F(w * 0.22, 0.9);
    hex(0x1f3f6b); mb.plaster.box(tx, y + bodyH + 1.5, tz, 0.82, 0.9, 0.82, C, yaw);
  }
  if (rng() < 0.35) {
    const [dx2, dz2] = F(-w * 0.26, -1.2);
    hex(0xd8d2c4); mb.metal.box(dx2, y + bodyH + 1.3, dz2, 0.62, 0.10, 0.62, C, yaw);
  }
}

/**
 * Dukanon ke naam ke board.
 *
 * `signs.js` ka buildSigns() POI ke liye hai -- wo apne aap sadak ki taraf
 * offset nikaalta hai. Yahan jagah pehle se pakki hai (dukan ka mukh), isliye
 * board seedha wahin lagta hai. Texture generator dono jagah wahi hai.
 */
function buildShopSigns(signs) {
  const g = new THREE.Group();
  g.name = "shop-signs";
  const glowing = [];

  /*
   * Har board ka apna mesh banane se 2800 dukanon ke board = 5600 draw call
   * ho gaye the aur frame rate gir gaya. Do baaton ka fayda uthate hain:
   *
   *  - `TEX.signboard()` naam se cache hota hai, aur naam sirf ~46 hain, isliye
   *    unique texture bhi ~46 hi hain
   *  - board ek sapaat plane hai, to ek hi texture wale saare board ek
   *    BufferGeometry mein jod diye ja sakte hain
   *
   * Nateeja: ~46 draw call, aur backing ke liye ek.
   */
  const groups = new Map();       // naam -> {set, pos[], uv[], idx[], n}

  const pushQuad = (P, I, nRef, cx, cy, cz, yaw, w, h, depth) => {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    // board ka mukh -Z local; depth se use aage/peeche khiskate hain
    const ox = sn * depth, oz = -c * depth;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      P.push(cx + ox + u * (w / 2) * c, cy + v * (h / 2), cz + oz + u * (w / 2) * sn);
    }

    const b = nRef.n;
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    nRef.n += 4;
  };

  for (const s of signs) {
    const key = s.text + "|" + s.sub;      // naam se kind pakka hai
    let grp = groups.get(key);
    if (!grp) {
      grp = { set: TEX.signboard(s.text, s.sub, s.kind || "shop", 0), pos: [], uv: [], idx: [], n: 0 };
      groups.set(key, grp);
    }
    const h = s.width / 4;                          // texture 1024x256 = 4:1
    pushQuad(grp.pos, grp.idx, grp, s.x, s.y, s.z, s.yaw, s.width, h, 0);
    // Board ka mukh local -Z par hai. Us disha se dekhne wale ko local +X
    // *baayen* dikhta hai, isliye u ulta dena padta hai -- warna naam aaine
    // jaisa palta hua padhta hai.
    grp.uv.push(1, 0, 0, 0, 0, 1, 1, 1);
  }

  for (const grp of groups.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(grp.pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(grp.uv, 2));
    geo.setIndex(grp.idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({
      map: grp.set.map, roughness: grp.set.roughness, metalness: grp.set.metalness,
      /*
       * DoubleSide, aur peeche ki plate hata di.
       *
       * FrontSide ke saath board ka mukh us taraf tha jahan se koi dekhta hi
       * nahi, aur gali se sirf peeche wali gehri plate (0x24282d) dikhti thi --
       * isliye har board khaali gehre neele aayat jaisa lagta tha, jabki texture
       * bilkul sahi tha. Naam wale board waise bhi do quad peeth-se-peeth hain,
       * to har taraf se ek sahi mukh milta hai.
       */
      side: THREE.DoubleSide,
    });
    if (grp.set.emissiveMap) {
      mat.emissiveMap = grp.set.emissiveMap;
      mat.emissive = new THREE.Color(0xffffff);
      // Din mein bhi halka jalta hai. Board awning ki chhaya mein hote hain,
      // aur bina iske sadak se naam padha hi nahi jaata tha. Asli bazaar ke
      // board bhi backlit hote hain.
      mat.emissiveIntensity = 0.30;
      glowing.push(mat);
    }
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    g.add(m);
  }

  g.userData.glowingMaterials = glowing;
  g.userData.materialCount = groups.size;
  return g;
}

/** Sar ke upar ke bijli ke taar -- gali ke aar-paar, khambon ke beech. */
function buildWires(wires, terrain) {
  const g = new THREE.Group();
  g.name = "bazaar-wires";
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 0.9 });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x14110d });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 7.2, 7);
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, wires.length * 2);
  const m = new THREE.Matrix4();
  const linePts = [];
  let n = 0;
  for (const w of wires) {
    const ends = [];
    for (const side of [-1, 1]) {
      const px = w.x + w.nx * side * w.span;
      const pz = w.z + w.nz * side * w.span;
      const py = terrain.heightAt(px, pz);
      m.makeTranslation(px, py + 3.6, pz);
      poles.setMatrixAt(n++, m);
      ends.push(new THREE.Vector3(px, py + 6.6, pz));
    }
    // teen taar, halke jhoole ke saath
    for (let k = 0; k < 3; k++) {
      const sag = 0.35 + k * 0.12;
      const off = (k - 1) * 0.18;
      for (let t = 0; t < 8; t++) {
        for (const tt of [t / 8, (t + 1) / 8]) {
          const p = ends[0].clone().lerp(ends[1], tt);
          p.y += off - Math.sin(tt * Math.PI) * sag;
          linePts.push(p);
        }
      }
    }
  }
  poles.count = n;
  poles.castShadow = true;
  poles.instanceMatrix.needsUpdate = true;
  g.add(poles);
  const lg = new THREE.BufferGeometry().setFromPoints(linePts);
  g.add(new THREE.LineSegments(lg, wireMat));
  return g;
}

/**
 * Dukan ke andar ka saamaan -- trade ke hisaab se.
 *
 * Pehle sirf `kind.counter` ke chaar roop the (glass/steel/crates/cloth),
 * isliye bakery, bank, medical, mobile, salon aur jewel sab bilkul ek jaise
 * dikhte the: board par naam kuch aur, andar kuch aur. Ab har kism ka apna
 * fit-out hai -- `data/shops.json` ka `goods` field ise chunta hai.
 *
 * Saara saamaan usi MeshBuilder set mein jaata hai jo deewar aur chhat banata
 * hai, isliye **draw call nahi badhta**, sirf triangle count.
 */
function fitOut(mb, o) {
  const { F, y, yaw, openW, fz, rng, kind } = o;
  /*
   * F() sirf *jagah* ko dukan ke rukh mein ghumata hai -- box ka apna rukh
   * alag se dena padta hai. Pehle yahan yaw 0 tha, aur isliye har counter,
   * shelf aur peti duniya ke axis par seedhi khadi thi, dukan ke rukh par
   * nahi. Screenshot mein andar ka saara saamaan tirchha aur tuta hua dikhta
   * tha -- bahar ki deewar ek taraf aur andar ka case doosri taraf.
   */
  const box = (which, u, yy, v, sx, sy, sz, h) => {
    const [px, pz] = F(u, v);
    hex(h);
    mb[which].box(px, y + yy, pz, sx, sy, sz, C, yaw);
  };
  const pick = (arr) => arr[(rng() * arr.length) | 0];
  const TOP = 1.245;              // glassCase ka upri satah -- display isi par

  /** Kaanch ka counter -- kai trade mein ek jaisa dhaancha. */
  const glassCase = () => {
    box("glass", 0, 0.72, fz + 0.55, openW * 0.94, 1.05, 0.62, 0x9fb4bd);
    box("wood", 0, 0.11, fz + 0.55, openW * 0.96, 0.22, 0.68, 0x54493c);
  };
  /** Peeche ki deewar par shelf -- kitaab, dawa, dabbe sab isi par. */
  const shelves = (n, hexes) => {
    for (let r = 0; r < n; r++) {
      box("wood", 0, 0.75 + r * 0.62, fz + 1.58, openW * 0.92, 0.06, 0.38, 0x6f5a3c);
      for (let i = 0; i < 7; i++) {
        const u = (i / 6 - 0.5) * openW * 0.82;
        box("plaster", u, 0.90 + r * 0.62, fz + 1.58, openW * 0.09, 0.24, 0.26, pick(hexes));
      }
    }
  };

  switch (kind.goods) {
    case "tea":
      box("metal", 0, 0.94, fz + 0.55, openW * 0.92, 0.09, 0.70, 0x8f979c);
      box("wood", 0, 0.45, fz + 0.55, openW * 0.88, 0.90, 0.62, 0x4a4038);
      box("metal", -openW * 0.30, 1.16, fz + 0.52, 0.30, 0.36, 0.30, 0xb9bec4);   // samovar
      box("metal", -openW * 0.06, 1.08, fz + 0.50, 0.16, 0.19, 0.16, 0x8a9096);   // kettle
      for (let i = 0; i < 6; i++) {                                               // glass ki kataar
        box("glass", openW * (0.10 + i * 0.05), 1.04, fz + 0.50, 0.05, 0.11, 0.05, 0xd8e4ea);
      }
      box("stone", openW * 0.40, 0.55, fz + 1.5, 0.55, 1.10, 0.55, 0x6b5348);     // tandoor
      break;

    case "bakery":
      glassCase();
      for (let r = 0; r < 2; r++) {                                             // counter ke upar tray
        for (let i = 0; i < 4; i++) {
          const u = (i / 3 - 0.5) * openW * 0.78;
          box("wood", u, TOP + 0.06, fz + 0.40 + r * 0.30, openW * 0.16, 0.12, 0.24,
              [0xc98a4e, 0xd9b070, 0xa9713c][(r + i) % 3]);
        }
      }
      shelves(2, [0xd9b070, 0xc98a4e, 0xe8d0a0]);
      break;

    case "bank":
      // Kaanch opaque hai, isliye poori chaudai ka panel dukan ko band dabba bana
      // deta tha -- ab sirf beech mein, dono taraf se andar dikhta hai
      box("glass", 0, 1.42, fz + 0.55, openW * 0.52, 1.30, 0.08, 0xb8ccd8);     // teller kaanch
      box("wood", 0, 0.42, fz + 0.55, openW * 0.96, 0.84, 0.55, 0x5a4a3a);
      box("wood", 0, 0.90, fz + 0.55, openW * 0.90, 0.08, 0.50, 0x7a6248);
      box("plaster", -openW * 0.22, 0.98, fz + 0.50, 0.26, 0.05, 0.20, 0xe8e4dc); // register
      box("wood", openW * 0.18, 0.50, fz + 1.6, 0.34, 0.90, 0.34, 0x3a3f46);      // kursi
      break;

    case "atm":
      box("metal", 0, 1.05, fz + 0.75, openW * 0.60, 2.05, 0.55, 0xd8dce0);       // cabin
      box("glass", 0, 1.42, fz + 0.46, openW * 0.34, 0.34, 0.06, 0x1d3f5c);       // screen
      box("metal", 0, 1.10, fz + 0.46, openW * 0.30, 0.20, 0.06, 0x5a6068);       // keypad
      box("metal", 0, 0.86, fz + 0.46, openW * 0.22, 0.05, 0.06, 0x9aa0a6);       // cash slot
      break;

    case "kirana":
      for (let i = 0; i < 4; i++) {                                               // boriyan
        const u = (i / 3 - 0.5) * openW * 0.80;
        box("wood", u, 0.28, fz + 0.45 + rng() * 0.3, 0.56, 0.56, 0.48,
            pick([0xbfae8a, 0xa8956e, 0xcdbf9c]));
      }
      shelves(3, [0xc94f3a, 0x2f7d63, 0xd8b23f, 0x2f5d8a, 0xe8e0d0]);
      break;

    case "pharmacy":
      glassCase();
      shelves(3, [0xffffff, 0xe8f0f4, 0x4fa08a, 0xd94f4f, 0xf0e4a8]);
      box("plaster", openW * 0.34, 1.30, fz + 0.52, 0.22, 0.30, 0.10, 0x4fa08a);  // cross
      break;

    case "mobile":
      glassCase();
      for (let i = 0; i < 8; i++) {                                               // counter par phone
        box("plaster", (i / 7 - 0.5) * openW * 0.82, TOP + 0.02, fz + 0.55, 0.09, 0.03, 0.17, 0x1b1f26);
      }
      for (let r = 0; r < 3; r++) {                                               // peeche cover
        for (let i = 0; i < 9; i++) {
          box("plaster", (i / 8 - 0.5) * openW * 0.88, 1.05 + r * 0.42, fz + 1.62,
              0.10, 0.18, 0.03, pick([0xc94f3a, 0x2f5d8a, 0x2f7d63, 0xd8b23f, 0x7a3b6b]));
        }
      }
      break;

    case "sweets":
      glassCase();
      for (let i = 0; i < 5; i++) {                                               // counter par thaal
        const u = (i / 4 - 0.5) * openW * 0.80;
        box("metal", u, TOP + 0.03, fz + 0.52, openW * 0.14, 0.06, 0.30, 0xc9ced2);
        box("plaster", u, TOP + 0.11, fz + 0.52, openW * 0.12, 0.10, 0.26,
            pick([0xe8c05a, 0xd9843c, 0xf0e0b0, 0xc94f3a]));
      }
      break;

    case "tailor":
      for (let i = 0; i < 3; i++) {                                               // latke than
        box("wood", (i / 2 - 0.5) * openW * 0.72, 1.55, fz + 0.30, 0.44, 2.0, 0.13,
            pick([0xa8324f, 0x2f7d63, 0xd8b23f, 0x2f5d8a]));
      }
      box("wood", -openW * 0.24, 0.42, fz + 1.5, 0.62, 0.84, 0.44, 0x5a4a3a);     // mez
      box("metal", -openW * 0.24, 0.96, fz + 1.5, 0.44, 0.24, 0.24, 0x2a2e33);    // silai machine
      break;

    case "hardware":
      for (let i = 0; i < 5; i++) {                                               // latki balti
        box("metal", (i / 4 - 0.5) * openW * 0.84, 1.90, fz + 0.35, 0.22, 0.26, 0.22,
            pick([0xc94f3a, 0x2f5d8a, 0x5a6068]));
      }
      for (let i = 0; i < 4; i++) {                                               // paip
        box("metal", -openW * 0.36 + i * 0.07, 0.90, fz + 1.7, 0.05, 1.70, 0.05, 0x8a9096);
      }
      for (let i = 0; i < 3; i++) {
        box("wood", (i / 2 - 0.5) * openW * 0.66, 0.26, fz + 0.50, 0.58, 0.52, 0.50, 0x8a6a3c);
      }
      break;

    case "sabzi":
      for (let i = 0; i < 4; i++) {                                               // peti + dher
        const u = (i / 3 - 0.5) * openW * 0.82;
        box("wood", u, 0.26, fz + 0.42 + rng() * 0.35, 0.60, 0.50, 0.52, 0x8a6a3c);
        box("plaster", u, 0.58, fz + 0.42, 0.52, 0.20, 0.44,
            pick([0x4a8c2f, 0xd94f3a, 0xe8a83c, 0x8ac04a, 0xc9d04a]));
      }
      box("metal", openW * 0.34, 0.98, fz + 0.50, 0.28, 0.06, 0.28, 0xb9bec4);    // tarazu
      break;

    case "copier":
      box("plaster", -openW * 0.24, 0.62, fz + 1.05, 1.05, 1.24, 0.78, 0xd8dce0); // machine
      box("plaster", -openW * 0.24, 1.28, fz + 1.05, 0.98, 0.10, 0.70, 0x2a2e33); // dhakkan
      box("glass", -openW * 0.24, 1.34, fz + 0.78, 0.62, 0.03, 0.32, 0x9fb4bd);   // scanner
      box("wood", openW * 0.30, 0.42, fz + 0.62, openW * 0.34, 0.84, 0.55, 0x5a4a3a);
      for (let i = 0; i < 4; i++) {                                               // kaagaz ke thak
        box("plaster", openW * 0.30, 0.88 + i * 0.09, fz + 0.62, 0.32, 0.08, 0.26, 0xf0eee6);
      }
      break;

    case "salon":
      box("glass", 0, 1.35, fz + 1.62, openW * 0.72, 1.20, 0.06, 0xdce8ee);       // aaina
      box("wood", 0, 0.72, fz + 1.62, openW * 0.86, 0.08, 0.32, 0x6f5a3c);
      box("metal", 0, 0.45, fz + 1.10, 0.42, 0.90, 0.42, 0x2a2e33);               // kursi
      box("plaster", 0, 0.92, fz + 1.10, 0.46, 0.10, 0.46, 0x8a323c);
      break;

    case "books":
      shelves(4, [0xc94f3a, 0x2f5d8a, 0x2f7d63, 0xd8b23f, 0x7a3b6b, 0x8a5a2e]);
      box("wood", 0, 0.42, fz + 0.55, openW * 0.90, 0.84, 0.50, 0x5a4a3a);
      break;

    case "meat":
      for (let i = 0; i < 5; i++) {                                               // latke hook
        const u = (i / 4 - 0.5) * openW * 0.80;
        box("metal", u, 1.95, fz + 0.60, 0.03, 0.34, 0.03, 0xb9bec4);
        box("plaster", u, 1.55, fz + 0.60, 0.16, 0.46, 0.14, 0x9a3a34);
      }
      box("wood", 0, 0.42, fz + 0.60, openW * 0.70, 0.84, 0.60, 0x6f5a3c);        // chopping block
      break;

    case "jewel":
      glassCase();
      for (let i = 0; i < 9; i++) {                                               // counter par ghadi
        box("metal", (i / 8 - 0.5) * openW * 0.84, TOP + 0.05, fz + 0.52, 0.07, 0.10, 0.05, 0xe8c95a);
      }
      shelves(1, [0xe8c95a, 0xd8d8dc]);
      break;

    default:
      glassCase();
      shelves(2, [0xc9bda6, 0xd2c4ad]);
  }
}
