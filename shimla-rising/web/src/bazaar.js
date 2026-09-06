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
export function buildBazaar(terrain, roads, shopsJson, mapJson, quality = {}) {
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

    shopUnit(mb, interior, {
      x: bx, y: gy, z: bz, yaw: fyaw, drop,
      width: 4.6, depth: 6.4, rng, spec, kind,
    });

    const fx2 = Math.sin(fyaw), fz2 = -Math.cos(fyaw);   // local -Z = sadak ki taraf
    /*
     * Naam ka board **sadak pe lambvat** nikla hua -- deewar ke saath chipka
     * board apni hi awning ke peeche chhup jaata hai. Dono taraf padha ja sake
     * iske liye do quad peeth-se-peeth (DoubleSide se ek taraf text palat jaata).
     */
    for (const turn of [Math.PI / 2, -Math.PI / 2]) {
      signs.push({
        x: bx + fx2 * 4.9, z: bz + fz2 * 4.9, y: gy + 4.05,
        yaw: fyaw + turn, text: spec.name, sub: spec.sub, width: 2.9,
      });
    }
    if (slot.dense) {
      signs.push({
        x: bx + fx2 * 3.34, z: bz + fz2 * 3.34, y: gy + 5.25,
        yaw: fyaw, text: spec.sub || spec.name, sub: "", width: 3.0 + rng() * 1.0,
      });
    }

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
  const interiorMat = new THREE.MeshStandardMaterial({
    color: 0x3a3128, roughness: 0.9,
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
  const [ix, iz] = F(0, fz + 1.15);
  hex(0x2a231c);
  interior.box(ix, y + (gh - 0.6) / 2, iz, openW, gh - 0.6, 2.0, C, yaw);
  // peeche ki deewar, taaki dukan ke aar-paar dekha na ja sake
  hex(wallHex);
  mb.plaster.box(x, y + gh / 2, z, openW, gh, d * 0.42, C, yaw);

  // lipta hua shutter, mukh ke upar
  const [sx, sz] = F(0, fz + 0.08);
  hex(SHUTTERS[(rng() * SHUTTERS.length) | 0]);
  mb.metal.box(sx, y + gh - 0.78, sz, openW * 0.98, 0.62, 0.16, C, yaw);

  // counter -- kism ke hisaab se
  const [cx2, cz2] = F(0, fz + 0.55);
  if (kind.counter === "glass") {
    hex(0x9fb4bd); mb.glass.box(cx2, y + 0.72, cz2, openW * 0.94, 1.05, 0.62, C, yaw);
    hex(0x54493c); mb.wood.box(cx2, y + 0.11, cz2, openW * 0.96, 0.22, 0.68, C, yaw);
  } else if (kind.counter === "steel") {
    hex(0x8f979c); mb.metal.box(cx2, y + 0.94, cz2, openW * 0.92, 0.09, 0.70, C, yaw);
    hex(0x4a4038); mb.wood.box(cx2, y + 0.45, cz2, openW * 0.88, 0.90, 0.62, C, yaw);
  } else if (kind.counter === "crates") {
    for (let i = 0; i < 4; i++) {
      const u = (i / 3 - 0.5) * openW * 0.80;
      const [qx, qz] = F(u, fz + 0.35 + rng() * 0.5);
      hex([0x8a6a3c, 0x6f5a2e, 0x9a7a44][(rng() * 3) | 0]);
      mb.wood.box(qx, y + 0.26 + rng() * 0.12, qz, 0.60, 0.50, 0.52, C, yaw);
    }
  } else {
    for (let i = 0; i < 3; i++) {                  // latke hue than
      const u = (i / 2 - 0.5) * openW * 0.72;
      const [qx, qz] = F(u, fz + 0.30);
      hex([0xa8324f, 0x2f7d63, 0xd8b23f, 0x2f5d8a][(rng() * 4) | 0]);
      mb.wood.box(qx, y + 1.55, qz, 0.44, 2.0, 0.13, C, yaw);
    }
  }

  // ---- upar ka dhad ----
  hex(wallHex);
  mb.plaster.box(x, y + gh + (bodyH - gh) / 2, z, w, bodyH - gh, d, C, yaw);

  // awning
  const [ax, az] = F(0, fz - 0.65);
  hex(parseInt(kind.awning.slice(1), 16));
  mb.tin.box(ax, y + gh + 0.12, az, w * 0.99, 0.10, 1.25, C, yaw);
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
  const backPos = [], backIdx = [];
  let backN = 0;

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
    const key = s.text + "|" + s.sub;
    let grp = groups.get(key);
    if (!grp) {
      grp = { set: TEX.signboard(s.text, s.sub, "shop", 0), pos: [], uv: [], idx: [], n: 0 };
      groups.set(key, grp);
    }
    const h = s.width / 4;                          // texture 1024x256 = 4:1
    pushQuad(grp.pos, grp.idx, grp, s.x, s.y, s.z, s.yaw, s.width, h, 0);
    // Board ka mukh local -Z par hai. Us disha se dekhne wale ko local +X
    // *baayen* dikhta hai, isliye u ulta dena padta hai -- warna naam aaine
    // jaisa palta hua padhta hai.
    grp.uv.push(1, 0, 0, 0, 0, 1, 1, 1);
    // peeche ki plate -- sab ek hi material, ek hi mesh
    pushQuad(backPos, backIdx, { get n() { return backN; }, set n(v) { backN = v; } },
             s.x, s.y, s.z, s.yaw, s.width * 1.03, h * 1.06, -0.06);
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
      // FrontSide: peeche se board dikhna hi nahi chahiye -- DoubleSide se
      // gali ke us paar wale board ulte padhte the. Peeche plate hai hi.
      side: THREE.FrontSide,
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

  if (backN) {
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.Float32BufferAttribute(backPos, 3));
    bg.setIndex(backIdx);
    bg.computeVertexNormals();
    bg.computeBoundingSphere();
    g.add(new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: 0x24282d, roughness: 0.8 })));
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
