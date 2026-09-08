import * as THREE from "three";
import * as TEX from "./textures.js";
import { MeshBuilder } from "./geometry.js";

/**
 * Sab insaani kirdaaron ka saanjha builder -- Vicky aur sadak pe chalne wale
 * NPC dono yahi se bante hain.
 *
 * Level PS2-daur ke open-world ped jaisa hai: geometry kam, texture zyada.
 * Sir ek dhala hua gola hai (talu saankra, gaal ki haddi, jabda patla), dhad ka
 * profile oonchai ke saath badalta hai, aur chehra canvas pe painted hai.
 */

/** Har vertex pe fn lagao. UV nahi badalte, isliye chehra apni jagah rehta hai. */
export function deform(geo, fn) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Chhallon ki ladi se ek **lagataar shell**.
 *
 * Dhad pehle teen alag primitive ka tha -- ek capsule (jacket), ek cylinder
 * (hem) aur ek capsule (kulha) -- aur jahan wo ek doosre mein ghuste the wahan
 * saaf **seam** dikhti thi. Nikhil ne yahi pakda: "abhi bhi wahi low poly".
 * Ek hi lofted shell mein wo jod hote hi nahi, aur profile har oonchai par
 * badal sakta hai (kandha chauda, kamar patli, hem ka halka flare).
 *
 * UV cylinder jaisa hi hai (u chaaron taraf 0..1, v oonchai mein 0..1) taaki
 * wahi kapde ka material bina badle chale.
 *
 * @param rings [{y, rx, rz, dz}] neeche se upar; dz aage/peeche ka khisakav
 */
function loft(rings, seg = 24, o = {}) {
  const pos = [], uv = [];
  const at = (r, k) => {
    const a = (k / seg) * Math.PI * 2;
    return [Math.sin(a) * r.rx, r.y, Math.cos(a) * r.rz + (r.dz || 0)];
  };
  const acc = [0];
  for (let i = 1; i < rings.length; i++) acc.push(acc[i - 1] + Math.abs(rings[i].y - rings[i - 1].y));
  const vmax = acc[acc.length - 1] || 1;
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    const v0 = acc[i] / vmax, v1 = acc[i + 1] / vmax;
    for (let k = 0; k < seg; k++) {
      const p00 = at(a, k), p01 = at(a, k + 1), p10 = at(b, k), p11 = at(b, k + 1);
      const u0 = k / seg, u1 = (k + 1) / seg;
      pos.push(...p00, ...p11, ...p10, ...p00, ...p01, ...p11);
      uv.push(u0, v0, u1, v1, u0, v1, u0, v0, u1, v0, u1, v1);
    }
  }
  const cap = (r, up) => {
    const c = [0, r.y, r.dz || 0];
    for (let k = 0; k < seg; k++) {
      const p0 = at(r, k), p1 = at(r, k + 1);
      if (up) pos.push(...c, ...p0, ...p1); else pos.push(...c, ...p1, ...p0);
      uv.push(0.5, 0.5, 0, 0, 1, 0);
    }
  };
  if (o.capTop) cap(rings[rings.length - 1], true);
  if (o.capBottom) cap(rings[0], false);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * Kai chhoti geometry ko ek buffer mein -- ek hi material, ek draw call.
 *
 * Haath ke liye chahiye: hatheli + chaar ungliyan + angootha = chhe tukde,
 * aur do haath = 12 draw call sirf ungliyon ke. Ye sab ek hi twacha material
 * par hain, isliye inhe jodne mein kuch nahi jaata.
 */
function mergeParts(parts) {
  const pos = [], nor = [], uv = [];
  const nm = new THREE.Matrix3();
  for (const { geo, matrix } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
    const v = new THREE.Vector3();
    nm.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      pos.push(v.x, v.y, v.z);
      if (n) { v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); }
      uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (nor.length === pos.length) out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  else out.computeVertexNormals();
  return out;
}

/**
 * Bushehri topi.
 *
 * Asli topi ka dhaancha: gehre **hare velvet** ka body, uske upar **bhoora buna
 * hua band** jo chapti chhat tak jaata hai, dono ke beech **laal-sunehri patti**,
 * aur chhat ke ek kinare pe rang-birangi **phundi**. Pehle main ise oon ka ek
 * hi tukda banata tha jiske base pe maroon band tha -- wo asli topi nahi thi.
 *
 * @param r topi ki chaudai (sir ke hisaab se)
 */
export function buildTopi(r = 0.128, lite = false) {
  const g = new THREE.Group();
  const velvetMat = TEX.standard(TEX.velvet(0x14543c), { roughness: 0.58 });
  const wovenMat = TEX.standard(TEX.wovenBand(0x8a6a4c), { roughness: 0.92 });
  const stripeMat = TEX.standard(TEX.topiStripe(), { roughness: 0.74 });

  const add = (m) => { m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };

  // hara velvet body -- neeche ka lagbhag aadha hissa
  add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.99, 0.040, 26), velvetMat))
    .position.y = 0.020;
  // laal-sunehri patti
  add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.012, r * 1.012, 0.009, 26), stripeMat))
    .position.y = 0.0445;
  // bhoora buna hua band + chapti chhat (ek hi cylinder, dono cap ke saath)
  add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.015, r * 1.015, 0.026, 26), wovenMat))
    .position.y = 0.062;

  // phundi -- chhat ke ek kinare pe teen gucche
  const POM = [
    { hex: 0x2c3f9e, a: -0.55, s: 1.00 },   // neela
    { hex: 0x8e1f2f, a: -0.18, s: 1.12 },   // maroon
    { hex: 0xe0c65a, a: 0.62, s: 1.02 },    // peela
  ];
  for (const { hex, a, s } of (lite ? [] : POM)) {
    const pom = add(new THREE.Mesh(new THREE.SphereGeometry(0.0155 * s, 10, 8),
      TEX.standard(TEX.pompom(hex), { roughness: 0.98 })));
    pom.position.set(Math.sin(a) * r * 0.66, 0.0805, Math.cos(a) * r * 0.66 - r * 0.10);
  }
  return g;
}

/**
 * Kisi disha ki taraf mooh karne ka yaw.
 *
 * Kirdaar ka **aage `-Z`** hai (naak `-Z` par banti hai). `rotation.y = yaw`
 * ke baad model ka `-Z` `(-sin yaw, -cos yaw)` par jaata hai. Seedha
 * `atan2(dx, dz)` daalne se wo `(-dx, -dz)` ban jaata tha -- **theek ulta**,
 * yaani chehra peeche aur pair aage. Nikhil ne yahi pakda tha.
 *
 * Isliye har jagah rukh yahin se aana chahiye.
 */
export const faceYaw = (dx, dz) => Math.atan2(-dx, -dz);

const HEAD_R = 0.098;

/**
 * Saanjha material -- lite aur far dono roop isi par.
 *
 * Rang vertex se aata hai, isliye har kirdaar ka apna material nahi chahiye.
 * Yahi batching bhi bachata hai aur material ki ginti bhi.
 */
const FAR_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });

/**
 * @param o.build   "male" | "female" | "elder"
 * @param o.skin    twacha ka hex
 * @param o.top     upar ke kapde ka hex
 * @param o.bottom  neeche ke kapde ka hex
 * @param o.hair    baalon ka hex
 * @param o.topi    topi pehne ya nahi
 * @param o.height  kul oonchai ka guna (1 = ~1.75 m)
 * @param o.lod     "crowd" -> chhoti detail chhod do (naak, kaan, bhauh, cuff,
 *                  zip, sole, topi ki phundi). Bheed mein 50 kirdaar hote hain
 *                  aur har ek ke ~30 alag mesh se draw call phat jaate the;
 *                  ye cheezein 15 m se aage waise bhi dikhti nahi.
 * @param o.hero    **sirf Vicky**. Dhad ek lagataar lofted shell ban jaata hai
 *                  (capsule + hem + kulha ke teen jod khatam), har mod par
 *                  joint ka gola aata hai taaki mudte waqt gap na dikhe,
 *                  haath mein asli ungliyan aati hain, aur twacha/chehra/kapda
 *                  ka texture do-chaar guna resolution par banta hai.
 *
 *                  Ye NPC par jaan-boojh kar band hai: bheed mein 34-120 log
 *                  hote hain aur lag wahin se aati hai, jabki khiladi ek hi
 *                  hai -- uspar kharch lagbhag muft hai.
 */
export function buildHuman(o = {}) {
  const build = o.build || "male";
  const female = build === "female" || build === "girl";
  const young = build === "girl" || build === "boy";
  const lite = o.lod === "crowd";
  const hero = !!o.hero && !lite;
  const elder = build === "elder";
  const SKIN = o.skin ?? 0xc08a5e;
  const HAIR = o.hair ?? (elder ? 0xb8b2a8 : 0x140f0a);
  const HEAD_Y = 1.626;

  const g = new THREE.Group();
  const props = {};        // beedi, phone -- player.js inhe chalata hai
  /*
   * Material cache se.
   *
   * Texture pehle se sanjhe the, par material har kirdaar ke liye naye bante
   * the -- aur `crowd.js` har vyakti ke **teen** LOD roop banata hai, yaani
   * teen guna. Naapa gaya: duniya banne par 1,197 material. Ab ek hi rang/
   * texture ka material sab jagah ek hi hai. Koi bhi material jo runtime par
   * badalta ho (beedi ka angaara) neeche `new` se hi banta hai.
   */
  const TOP = o.top ?? 0xbb3a2a, BOT = o.bottom ?? 0x35425e;
  /*
   * Hero ka apna texture set -- alag cache key, isliye NPC ke sanjhe material
   * ko koi farak nahi padta. 128 px ka weave paas se chapta lagta tha; 512 px
   * par dhaage dikhte hain aur `folds` se silvatein normal map mein aa jaati
   * hain, jo AO ke saath milkar kapde ko sach mein kapda banata hai.
   */
  const HS = hero ? 512 : 0;
  const skinMat = TEX.standardCached(`h:skin:${SKIN}:${HS}`,
    TEX.skin(SKIN, 7, hero ? { size: 512 } : {}), { roughness: 0.62 });
  const faceMat = TEX.standardCached(
    `h:face:${SKIN}:${elder ? 1 : 0}:${female ? 1 : 0}:${HS}`,
    TEX.face(SKIN, elder ? 61 : 19, { elder, female, ss: hero ? 2 : 1 }), { roughness: 0.56 });
  const topMat = TEX.mat(`h:top:${TOP}:${HS}`, () => {
    const set = hero ? TEX.fabric(TOP, 23, 46, { size: 512, folds: 0.34 }) : TEX.fabric(TOP, 23);
    const m = TEX.standard(TEX.setRepeat(set, 2), { roughness: 0.88 });
    if (m.normalMap) m.normalScale.set(hero ? 2.1 : 1.5, hero ? 2.1 : 1.5);  // silvatein saaf dikhein
    return m;
  });
  const botMat = TEX.mat(`h:bot:${BOT}:${HS}`, () => {
    const set = hero ? TEX.fabric(BOT, 51, 60, { size: 512, folds: 0.26 }) : TEX.fabric(BOT, 51, 60);
    const m = TEX.standard(TEX.setRepeat(set, 2), { roughness: 0.94 });
    if (m.normalMap && hero) m.normalScale.set(1.8, 1.8);
    return m;
  });
  const hairMat = TEX.plain(HAIR, elder ? 0.86 : 0.66);
  const shoeMat = TEX.plain(0x241d16, 0.5);
  const soleMat = TEX.plain(0x4a423c, 0.9);

  const add = (mesh, parent = g) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // ================================================================== sir
  // Kirdaar ka aage -Z hai, isliye chehra -Z par aur pichhla sir +Z par.
  // Hero par segment badhe hue hain -- dialogue mein camera chehre ke bilkul
  // paas jaata hai aur wahan 26x22 ka silhouette kone-daar dikhta tha.
  const headGeo = deform(new THREE.SphereGeometry(HEAD_R * (female ? 0.955 : 1),
    hero ? 40 : 26, hero ? 32 : 22), (v) => {
    const t = v.y / HEAD_R;                       // -1 thodi .. +1 talu
    v.y *= 1.22;
    if (t < 0) {                                  // jabda neeche jaate hue saankra
      const k = Math.pow(-t, 1.35);
      v.x *= 1 - (female ? 0.50 : 0.46) * k;
      v.z *= 1 - 0.22 * k;
      if (v.z < 0) v.z -= 0.012 * k;
    } else {
      v.x *= 1 - 0.13 * t * t;
      v.z *= 1 - 0.06 * t * t;
    }
    v.z *= v.z > 0 ? 1.10 : 0.92;
    const cheek = Math.exp(-Math.pow((t + 0.12) * 3.1, 2));
    v.x *= 1 + (female ? 0.05 : 0.07) * cheek;
  });
  const head = add(new THREE.Mesh(headGeo, faceMat));
  head.position.y = HEAD_Y;

  if (!lite) {
    const nose = add(new THREE.Mesh(new THREE.ConeGeometry(female ? 0.022 : 0.026, 0.055, 6), skinMat));
    nose.position.set(0, HEAD_Y - 0.012, -HEAD_R * 0.90);
    nose.rotation.set(Math.PI * 0.52, 0, 0);
    nose.scale.set(1, 1, 0.72);

    const brow = add(new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 8,
      0, Math.PI * 2, 0, Math.PI * 0.5), skinMat));
    brow.position.set(0, HEAD_Y + 0.036, -HEAD_R * 0.60);
    brow.scale.set(1.55, female ? 0.30 : 0.38, 0.95);
    brow.rotation.x = -0.30;

    for (const side of [-1, 1]) {
      const ear = add(new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), skinMat));
      ear.position.set(side * HEAD_R * 0.98, HEAD_Y - 0.004, 0.006);
      ear.scale.set(0.42, 1.25, 0.85);
    }
  }

  // baal: aankhein face texture mein phi = 0.44*PI pe hain, isliye hairline
  // uske upar rukni chahiye warna wo aankhon ko dhak leti hai.
  if (female) {
    const cap = add(new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.06, 22, 16,
      0, Math.PI * 2, 0, Math.PI * 0.40), hairMat));
    cap.scale.set(1.03, 1.24, 1.03);
    cap.position.y = HEAD_Y;
    if (young) {
      // Khule baal kandhon tak -- college wali ladkiyon ka aam roop
      const fall = add(new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.094, 0.30, 14, 1, true), hairMat));
      fall.position.set(0, HEAD_Y - 0.175, 0.020);
      fall.scale.set(1.0, 1, 0.88);
      const back = add(new THREE.Mesh(new THREE.SphereGeometry(0.104, 16, 12,
        0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.30), hairMat));
      back.position.set(0, HEAD_Y, 0.016);
      back.scale.set(1.0, 1.3, 1.0);
    } else {
      const bun = add(new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 12), hairMat));
      bun.position.set(0, HEAD_Y - 0.048, 0.098);
      bun.scale.set(1.0, 1.05, 0.86);
      const braid = add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.016, 0.20, 8), hairMat));
      braid.position.set(0, HEAD_Y - 0.155, 0.088);
    }
  } else {
    const hair = add(new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.045, 22, 14,
      0, Math.PI * 2, Math.PI * 0.24, Math.PI * 0.16), hairMat));
    hair.scale.set(1.02, 1.24, 1.02);
    hair.position.y = HEAD_Y;
    if (!lite) {
      for (const side of [-1, 1]) {
        const burn = add(new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), hairMat));
        burn.position.set(side * HEAD_R * 0.93, HEAD_Y + 0.016, -0.012);
        burn.scale.set(0.40, 1.5, 1.0);
      }
    }
  }
  // Pichhle sir ke baal khopdi se chipke rehne chahiye. Pehle ye 0.085 ka gola
  // tha jo peeche jood jaisa ubhar aata tha.
  const nape = add(new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.03, 18, 14,
    0, Math.PI * 2, Math.PI * 0.10, Math.PI * 0.34), hairMat));
  nape.scale.set(1.0, 1.22, 1.0);
  nape.position.set(0, HEAD_Y, 0.014);

  if (hero) {
    // Gardan bhi lofted -- jabde ke neeche patli, collar par chaudi. Bailan ka
    // sidha sira collar ke andar ek saaf ring chhod jaata tha.
    const neck = add(new THREE.Mesh(loft([
      { y: 1.428, rx: 0.068, rz: 0.070 },
      { y: 1.470, rx: 0.055, rz: 0.058 },
      { y: 1.512, rx: 0.048, rz: 0.050 },
      { y: 1.552, rx: 0.047, rz: 0.049 },
    ], 18, { capTop: true, capBottom: true }), skinMat));
    neck.position.z = 0.004;
  } else {
    const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.058, 0.10, 12), skinMat));
    neck.position.set(0, 1.494, 0.004);
    neck.rotation.x = -0.06;
  }

  if (o.topi !== false && !female) {
    const topi = buildTopi(0.128, lite);
    topi.position.y = HEAD_Y + 0.070;
    topi.rotation.x = -0.06;
    g.add(topi);
  }

  // ================================================================= dhad
  // Seena chauda, kamar patli. Aurton mein kandhe saankre aur kamar aur patli.
  // Jawaan log patle: kandhe thode saankre, kamar aur patli
  const SH = (female ? 1.13 : 1.30) - (young ? 0.06 : 0);
  if (hero) {
    /*
     * Ek lagataar jacket shell -- hem se collar tak.
     *
     * Pehle yahan **teen** alag tukde the: ek capsule (dhad), ek cylinder
     * (hem) aur upar ek cylinder (collar). Har jod par ek kinaara dikhta tha,
     * aur kandhe par capsule ka gol sira baazu ke cylinder se takraata tha --
     * yahi "joda hua" ehsaas deta tha.
     *
     * Chhalle asli jacket ke profile par hain: hem par halka flare, kamar
     * patli, seena chauda, aur upar trapezius ki dhal jispar kandha baithta
     * hai (baazu ka pivot x = 0.228 par hai, aur yahan chaudai 0.196 + delt
     * 0.066 = 0.262 -- yaani overlap, gap nahi).
     */
    const jacket = loft([
      { y: 1.048, rx: 0.178, rz: 0.130 },      // hem ka flare
      { y: 1.082, rx: 0.170, rz: 0.125 },
      { y: 1.132, rx: 0.163, rz: 0.120 },      // kamar
      { y: 1.196, rx: 0.173, rz: 0.127 },
      { y: 1.258, rx: 0.185, rz: 0.134 },      // seena
      { y: 1.320, rx: 0.193, rz: 0.137 },
      { y: 1.372, rx: 0.196, rz: 0.138 },      // bagal / kandhe ki chaudai
      { y: 1.408, rx: 0.187, rz: 0.131 },
      { y: 1.438, rx: 0.148, rz: 0.114 },      // trapezius ki dhal
      { y: 1.458, rx: 0.104, rz: 0.093 },
      { y: 1.474, rx: 0.098, rz: 0.089 },      // collar
    ], 26, { capBottom: true });
    add(new THREE.Mesh(jacket, topMat));
  } else {
    const torsoGeo = deform(new THREE.CapsuleGeometry(0.145, 0.30, 8, 20), (v) => {
      const t = THREE.MathUtils.clamp(v.y / 0.22, -1, 1);
      const w = SH + 0.20 * Math.max(0, t) - (female ? 0.30 : 0.22) * Math.max(0, -t);
      const d = 0.70 + 0.06 * Math.max(0, t) - 0.10 * Math.max(0, -t);
      v.x *= w; v.z *= d;
    });
    add(new THREE.Mesh(torsoGeo, topMat)).position.y = 1.228;

    if (!lite) {
      const collar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.085, 0.045, 14, 1, true), topMat));
      collar.position.y = 1.446;
      collar.scale.set(1.18, 1, 0.86);
    }
  }

  if (female) {
    // kameez: kamar se ghutnon ke beech tak lamba kurta
    // Jawaan: chhoti kurti (kamar se thoda neeche). Badi umr: ghutnon tak kurta.
    const kl = young ? 0.24 : 0.36;
    const kurta = add(new THREE.Mesh(new THREE.CylinderGeometry(0.152, young ? 0.168 : 0.186, kl, 18), topMat));
    kurta.position.y = young ? 1.015 : 0.955;
    kurta.scale.set(1.10, 1, 0.80);
    // Dupatta sirf badi umr ki auraton par. Jawaan ladkiyan kurti + jeans mein
    // dupatta nahi lagati -- college ke aas-paas yahi aam hai.
    if (!young) {
    // Dupatta ek kandhe se tirchha girta hai. Pehle ye poora cylinder tha, jo
    // saamne se ek chapte peele panel (bib) jaisa dikhta tha.
    const dupMat = TEX.standard(TEX.setRepeat(TEX.fabric(o.dupatta ?? 0xd8b23f, 91), 2),
      { roughness: 0.9, side: THREE.DoubleSide });
    const sash = add(new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.42, 0.014), dupMat));
    sash.position.set(-0.052, 1.268, -0.116);
    sash.rotation.z = 0.42;
    const sashBack = add(new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.40, 0.014), dupMat));
    sashBack.position.set(0.030, 1.272, 0.112);
    sashBack.rotation.z = -0.30;
    // kandhe ke upar se jaata hua hissa
    const overShoulder = add(new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.104, 0.115, 14, 1, true,
      Math.PI * 0.72, Math.PI * 0.62), dupMat));
    overShoulder.position.set(-0.098, 1.372, 0);
    overShoulder.rotation.x = Math.PI / 2;
    overShoulder.rotation.z = 0.30;
    // peeche latakta hua sira
    const tailEnd = add(new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.24, 0.012), dupMat));
    tailEnd.position.set(0.108, 1.075, 0.116);
    tailEnd.rotation.z = -0.14;
    }
  } else if (hero) {
    // Zip shell ki satah par -- hem alag se nahi chahiye, wo loft mein hai.
    const zip = add(new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.40, 0.008),
      TEX.plain(0x6d1f16, 0.6)));
    zip.position.set(0, 1.252, -0.132);
    // zip ka pull
    const pull = add(new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.026, 0.006),
      TEX.plain(0x8c8b86, 0.4, { metalness: 0.7 })));
    pull.position.set(0, 1.318, -0.137);
  } else {
    if (!lite) {
      const zip = add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.30, 0.010),
        TEX.plain(0x6d1f16, 0.6)));
      zip.position.set(0, 1.265, -0.104);
      const hem = add(new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.148, 0.036, 18), topMat));
      hem.position.y = 1.083;
      hem.scale.set(1.30, 1, 0.72);
    }
  }

  if (elder) {
    // kandhon pe shawl -- pahadi buzurgon ki pehchan
    const shawlMat = TEX.standard(TEX.setRepeat(TEX.fabric(o.shawl ?? 0x8a8574, 17), 2), { roughness: 0.95 });
    const shawl = add(new THREE.Mesh(new THREE.CylinderGeometry(0.196, 0.176, 0.26, 18, 1, true), shawlMat));
    shawl.position.y = 1.318;
    shawl.scale.set(1.16, 1, 0.80);
  }

  if (hero) {
    /*
     * Jeans ka upri hissa -- jacket ke hem ke neeche se ghutne ke pivot tak.
     * Upar ka chhalla jaan-boojh kar jacket ke andar ghusa hua hai (1.062 vs
     * hem 1.048) taaki dono ke beech kabhi daraar na dikhe, aur neeche ka
     * chhalla itna chauda hai ki dono jaangh (x = +-0.088, r = 0.086) uske
     * andar rahein.
     */
    const jeans = loft([
      { y: 0.944, rx: 0.182, rz: 0.128 },      // jaangh ke joint par
      { y: 0.978, rx: 0.176, rz: 0.126 },
      { y: 1.012, rx: 0.172, rz: 0.123 },      // kulha, sabse chauda
      { y: 1.062, rx: 0.161, rz: 0.116 },
      { y: 1.096, rx: 0.152, rz: 0.111 },      // jacket ke andar
    ], 24, { capTop: true, capBottom: true });
    add(new THREE.Mesh(jeans, botMat));
  } else {
    const hips = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.128, 0.09, 6, 14), botMat));
    hips.scale.set(female ? 1.38 : 1.30, 1, 0.80);
    hips.position.y = 1.012;
  }

  // ================================================================ baazu
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    /*
     * Hero ka kandha **andar** khiska hua hai.
     *
     * Pehla render dekh kar saaf tha: pivot 0.228 par tha aur deltoid ka gola
     * 0.066 ka -- yaani baazu dhad (0.196) se lagbhag 10 cm bahar nikal rahi
     * thi. Nateeja gubbaare jaisi aasteen, Victorian puff sleeve jaisi. Asli
     * kandha dhad se sirf 3-4 cm bahar hota hai. Pivot andar laane se baazu
     * dhad ke andar dhas jaati hai -- jo achha hai, gap wahi bharta hai.
     */
    shoulder.position.set(side * (female ? 0.201 : (hero ? 0.186 : 0.228)),
      hero ? 1.376 : 1.386, 0);
    g.add(shoulder);
    /*
     * Kandha aur kohni -- dono par ab **joint ka gola** hai.
     *
     * Pehle upper arm ek cylinder tha jiska sira kohni par khula rehta tha,
     * aur forearm ek alag group mein shuru hota tha. Jaise hi baazu mudta,
     * do bailan ke beech ek saaf **khaali khaancha** dikhta tha -- yahi
     * "plastic ka putla" wala ehsaas deta hai. Gola pivot par baithta hai,
     * isliye kitna bhi mudo, jod bhara rehta hai.
     */
    const delt = add(new THREE.Mesh(new THREE.SphereGeometry(female ? 0.055 : (hero ? 0.058 : 0.062), 12, 10),
      topMat), shoulder);
    // Hero par gola X mein dabaya hua hai -- bahar ki taraf ubhaar nahi,
    // neeche ki taraf dhalaan chahiye, jaise asli deltoid.
    delt.scale.set(hero ? 0.88 : 0.95, hero ? 1.06 : 0.90, 0.95);
    const upper = add(new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.043, 0.235, hero ? 16 : 12), topMat), shoulder);
    upper.position.y = -0.128;
    const elbow = new THREE.Group();
    elbow.position.y = -0.252;
    shoulder.add(elbow);
    if (hero) {
      const joint = add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), topMat), elbow);
      joint.scale.set(1.0, 0.92, 1.0);
    }
    // Aurton ka kurta kohni tak hota hai aur uske aage baazu nangi -- iske bina
    // haath kurte ke rang mein hi gum ho jaate the.
    const fore = add(new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.033, 0.215, hero ? 16 : 12),
      female ? skinMat : topMat), elbow);
    fore.position.y = -0.104;
    if (!lite) {
      const cuff = add(new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.035, 0.028, 12),
        TEX.plain(female ? (o.top ?? 0xa8324f) : 0x8f2b1e, 0.9)), elbow);
      cuff.position.y = female ? 0.004 : -0.206;
    }
    if (hero) {
      /*
       * Asli haath -- hatheli, chaar ungliyan aur angootha, sab **ek hi
       * merged mesh** mein.
       *
       * Pehle yahan ek chapta gola (hatheli) aur ek box (chaar ungliyon ka
       * ishaara) tha. Paas se wo dastana lagta tha, aur yahi wo cheez hai jo
       * screenshot mein sabse pehle "putla" bata deti hai.
       *
       * Ungliyan halki mudi hui hain (asli haath kabhi seedha nahi hota) aur
       * chhoti se badi ka kram hai. Merge se ye sab ek draw call hi rehta
       * hai -- 6 ki jagah 1.
       */
      const parts = [];
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
      const put = (geo, x, y, z, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
        E.set(rx, 0, rz);
        M.compose(new THREE.Vector3(x, y, z), Q.setFromEuler(E), new THREE.Vector3(sx, sy, sz));
        parts.push({ geo, matrix: M.clone() });
      };
      // hatheli -- chaudi, patli, kinare gol
      put(new THREE.CapsuleGeometry(0.024, 0.030, 5, 12), 0, -0.262, -0.004, 0, 0, 1.42, 1.0, 0.62);
      // chaar ungliyan -- lambai ka kram: tarjani, madhyama sabse lambi, phir chhoti
      const FING = [
        { x: -0.0225, len: 0.048 },
        { x: -0.0075, len: 0.054 },
        { x: 0.0075, len: 0.050 },
        { x: 0.0225, len: 0.040 },
      ];
      for (const f of FING) {
        put(new THREE.CapsuleGeometry(0.0078, f.len, 3, 7),
          side * f.x, -0.300 - f.len * 0.28, -0.010, 0.30, 0, 1, 1, 0.86);
      }
      // angootha -- hatheli se alag kon par
      put(new THREE.CapsuleGeometry(0.0105, 0.032, 3, 7),
        side * -0.028, -0.278, -0.014, 0.32, side * 0.70);
      const hand = add(new THREE.Mesh(mergeParts(parts), skinMat), elbow);
      hand.name = "hand";
    } else {
    // Haath: hatheli + angootha. Pehle sirf ek chapta gola tha, jo paas se
    // dastane jaisa lagta tha.
    const hand = add(new THREE.Mesh(new THREE.SphereGeometry(0.040, 10, 8), skinMat), elbow);
    hand.scale.set(0.82, 1.55, 0.52);
    hand.position.y = -0.256;
    if (!lite) {
      const thumb = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.030, 3, 6), skinMat), elbow);
      thumb.position.set(side * -0.026, -0.246, -0.012);
      thumb.rotation.set(0.35, 0, side * 0.62);
      // ungliyon ka ishaara -- ek hi mesh, kinare par khaanche
      const fingers = add(new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.052, 0.020), skinMat), elbow);
      fingers.position.set(0, -0.298, -0.004);
      fingers.rotation.x = 0.22;
    }
    }
    /*
     * Danda -- seedha `elbow` group se latakta hai, isliye kohni ke saath
     * ghoomta hai aur swing ke liye alag se kuch animate nahi karna padta.
     * Sirf daayein haath mein.
     */
    if (o.danda && side === 1) {
      /*
       * Danda ek **group** hai, do alag mesh nahi.
       *
       * Pehle lathi ka bailan aur uske dono lohe ke chhalle alag-alag `elbow`
       * ke andar rakhe the, aur chhallon ki jagah haath se ganit karke nikaali
       * gayi thi -- wo ganit galat thi. Render mein ek chhalla lathi se poore
       * 30 cm door, hawa mein latka dikhta tha (screenshot mein saaf kaala
       * tukda). Ab chhalle lathi ke *andar* hain: group ghooma do, sab saath
       * ghoomta hai, aur ganit ki koi gunjaish hi nahi bachti.
       */
      const dandaMat = TEX.plain(0x6b4a2a, 0.86);
      const ringMat = TEX.plain(0x4a4f55, 0.5, { metalness: 0.6 });
      /*
       * Pakad **lathi wali** hai, bhaale wali nahi.
       *
       * Pehle `rotation.x = PI/2 - 0.25` tha, yaani danda lagbhag **letaa
       * hua** aage-peeche taan kar pakda hua. Chalte waqt wo baazu ke saath
       * jhoolta tha aur peeche se dekhne par lagta tha ki bandook taani hui
       * hai. Pahadi aadmi lathi **latka kar** chalta hai: mutthi upar, danda
       * neeche, halka aage jhuka hua. Isliye ab wo lagbhag khada hai aur
       * mutthi uske upri hisse par padti hai.
       */
      const danda = new THREE.Group();
      danda.position.set(0, -0.29, -0.02);
      danda.rotation.set(0.20, 0, side * 0.06);
      elbow.add(danda);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.023, 0.95, 8), dandaMat), danda)
        .position.y = -0.30;                          // mutthi lathi ke upar
      // dono sire par lohe ki patti -- asli lathi par yahi hoti hai
      for (const t of [-0.75, 0.145]) {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.04, 8), ringMat), danda)
          .position.y = t;
      }
    }

    /*
     * Beedi -- baayen haath mein (daayan danda pakadta hai).
     *
     * `props` mein reference rakhte hain taaki `player.js` ka state machine
     * ise dikha/chhupa sake aur kash ke waqt ember tez kar sake.
     */
    if (o.beedi && side === -1) {
      const beediMat = TEX.plain(0x6b5a3f, 0.95);
      const b = add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.075, 6), beediMat), elbow);
      b.position.set(-0.016, -0.300, -0.030);
      b.rotation.set(1.35, 0, 0.25);
      const ember = add(new THREE.Mesh(new THREE.SphereGeometry(0.0075, 6, 5),
        new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff5a10,
                                         emissiveIntensity: 1.4, roughness: 0.7 })), elbow);
      ember.position.set(-0.016, -0.300, -0.066);
      props.beedi = b;
      props.ember = ember;
    }

    /*
     * Phone -- baayen haath mein, shuru mein chhupa hua. `H` par jeb se
     * nikalta hai aur kaan tak jaata hai.
     */
    if (o.phone && side === -1) {
      const ph = new THREE.Group();
      const body = add(new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.135, 0.011),
        TEX.plain(0x1b1f26, 0.35, { metalness: 0.4 })), ph);
      const scr = add(new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.112, 0.004),
        new THREE.MeshStandardMaterial({ color: 0x2a4a68, emissive: 0x2f5f8a,
                                         emissiveIntensity: 0.5, roughness: 0.2 })), ph);
      scr.position.z = 0.008;
      ph.position.set(-0.030, -0.300, -0.020);
      ph.rotation.set(0.2, 0, 0.15);
      ph.visible = false;
      elbow.add(ph);
      props.phone = ph;
    }

    arms.push({ shoulder, elbow });
  }

  /*
   * Student ka jhola -- ek kandhe par latka bag aur tirchhi patti.
   *
   * Campus par sab ek jaise rahgeer lagte the; bag hi wo ek cheez hai jisse
   * door se bhi student pehchana jaata hai.
   */
  if (o.bag) {
    const bagMat = TEX.standard(TEX.setRepeat(TEX.fabric(o.bag === true ? 0x2f4a6b : o.bag, 37), 2),
                                { roughness: 0.92 });
    const body = add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.30, 0.13), bagMat));
    body.position.set(0.10, 1.10, -0.17);
    body.rotation.z = -0.10;
    const flap = add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.10, 0.145), bagMat));
    flap.position.set(0.10, 1.24, -0.17);
    flap.rotation.z = -0.10;
    // patti -- ek kandhe se doosri kamar tak
    const strap = add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.46, 0.03), bagMat));
    strap.position.set(-0.02, 1.28, -0.045);
    strap.rotation.set(0.16, 0, 0.52);
  }

  /*
   * ============================================================== taangein
   *
   * **Pair ab zameen par hain.**
   *
   * Ye is round ka sabse bada aur sabse chhupa hua keeda tha. `player.js`
   * `mesh.position.copy(this.pos)` karta hai aur `this.pos.y = ground` hai --
   * yaani model ka origin theek zameen par baithta hai. Par taang ki lambai
   * kuch aur kehti thi: kulha 0.955, ghutna uska -0.345, aur joota us se
   * -0.411 -- kul milakar talwa **y = +0.199** par. Har kirdaar, Vicky se
   * lekar har NPC tak, **20 cm hawa mein** khada tha.
   *
   * Screenshot mein ye saaf dikha: chhaya ka dhabba (y = 0.02) pairon se ek
   * haath neeche tha. Isse contact shadow, AO aur nayi post-processing sab
   * bekaar ho rahe the -- kirdaar zameen par *rakha* hua nahi, *tairta* hua
   * lagta tha. Realism ka ye ek bada hissa yahin mar raha tha.
   *
   * Ab lambai asli anupaat par hai (1.75 m ke aadmi ke liye): kulha 0.955,
   * ghutna 0.485, takhna 0.085, talwa 0. Sar 1.626 par jaha tha wahin hai,
   * isliye upar ka kuch nahi badla.
   */
  const HIP_Y = 0.955;
  const KNEE_DROP = 0.470;        // kulhe se ghutne tak
  const ANKLE_DROP = 0.400;       // ghutne se takhne tak
  /*
   * `GROUND` = ghutne ke group mein zameen (world y = 0) kahan padti hai.
   * Joote ka har tukda isi ke sapeksh rakha jaata hai, absolute number se
   * nahi -- pehle wahi absolute number chupke se galat the.
   */
  const GROUND = -(HIP_Y - KNEE_DROP);
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.088, 0.955, 0);
    g.add(hip);
    if (hero) {
      /*
       * Kulhe ka gola -- jaangh ke pivot par, jeans ke shell ke andar.
       *
       * Chalte waqt jaangh 30-35 digree tak ghoomti hai, aur bailan ka chapta
       * sira shell ke andar se bahar aa jaata tha -- ek chhota sa aadha
       * chaand jo har kadam par jhilmilata tha. Gola pivot par hai, isliye
       * ghoomne se uska outline badalta hi nahi.
       */
      const cap = add(new THREE.Mesh(new THREE.SphereGeometry(0.084, 12, 10), botMat), hip);
      cap.scale.set(1.0, 0.92, 0.96);
    }
    const thigh = add(new THREE.Mesh(new THREE.CylinderGeometry(0.083, 0.063, KNEE_DROP, hero ? 16 : 12), botMat), hip);
    thigh.position.y = -KNEE_DROP / 2;
    const knee = new THREE.Group();
    knee.position.y = -KNEE_DROP;
    hip.add(knee);
    if (hero) {
      const cap = add(new THREE.Mesh(new THREE.SphereGeometry(0.064, 12, 10), botMat), knee);
      cap.scale.set(1.0, 0.90, 1.02);
    }
    const shin = add(new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.041, ANKLE_DROP, hero ? 16 : 12), botMat), knee);
    shin.position.y = -ANKLE_DROP / 2;
    const heroShoe = hero && o.sneakers;
    if (!heroShoe) {
      // Joota: edi ooncha, panja neecha aur aage patla -- ek hi box dabba lagta tha
      const shoe = add(new THREE.Mesh(new THREE.BoxGeometry(0.093, 0.058, 0.150), shoeMat), knee);
      shoe.position.set(0, GROUND + 0.061, 0.012);
    }
    /*
     * Sneaker -- sirf khiladi ke liye (`o.sneakers`).
     *
     * Nikhil: "pura pahadi bawa lagna chahie thik sneaker".
     *
     * Pehla hero render dekh kar pata chala ki ye **theek nahi** tha: sneaker
     * ka dhera *upar se* jud raha tha jabki neeche wala saada joota (shoe +
     * toe + sole + heel) bhi bana rehta tha. Yaani ek gehra dabba, uspar safed
     * midsole, uske neeche phir gehra sole aur edi -- kul milakar platform
     * heel jaisa **eent**. Ab hero ka sneaker poora apna hai aur saada joota
     * banta hi nahi.
     */
    if (heroShoe) {
      const upperMat = TEX.plain(0x232833, 0.86);          // gehra canvas
      const midMat = TEX.plain(0xeceae2, 0.74);            // safed midsole
      const outMat = TEX.plain(0x3a3f47, 0.92);            // rubber outsole
      /*
       * Upper ek hi merged tukda: tikhna (heel) se panja tak ek dhalta hua
       * dhaancha, aur takhne ka collar. Alag-alag box rakhne par har kinaara
       * dikhta tha.
       */
      const up = [];
      const put = (arr, geo, x, y, z, rx = 0, sx = 1, sy = 1, sz = 1) => {
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(x, y, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)),
          new THREE.Vector3(sx, sy, sz));
        arr.push({ geo, matrix: m });
      };
      // takhne ka collar -- jeans ke sire se milta hua, isse gap band hota hai
      put(up, new THREE.CylinderGeometry(0.046, 0.050, 0.052, 14), 0, GROUND + 0.105, 0.006);
      // joote ka body: peeche ooncha, aage neecha
      put(up, new THREE.BoxGeometry(0.088, 0.055, 0.115), 0, GROUND + 0.060, 0.026);
      put(up, new THREE.BoxGeometry(0.086, 0.042, 0.100), 0, GROUND + 0.052, -0.062, -0.06);
      // panja -- gol, warna aage se joota kata hua lagta hai
      put(up, new THREE.SphereGeometry(0.046, 14, 10), 0, GROUND + 0.058, -0.108, 0, 0.94, 0.78, 0.86);
      add(new THREE.Mesh(mergeParts(up), upperMat), knee);

      // midsole -- patla, aur panje/edi par gol
      const mid = [];
      put(mid, new THREE.BoxGeometry(0.096, 0.022, 0.238), 0, GROUND + 0.022, -0.020);
      put(mid, new THREE.SphereGeometry(0.048, 14, 10), 0, GROUND + 0.026, -0.116, 0, 1.0, 0.46, 0.80);
      put(mid, new THREE.SphereGeometry(0.046, 14, 10), 0, GROUND + 0.026, 0.082, 0, 1.0, 0.46, 0.72);
      add(new THREE.Mesh(mergeParts(mid), midMat), knee);

      // outsole -- sirf ek patli parat, jo theek zameen par baithti hai
      const out = add(new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.011, 0.236), outMat), knee);
      out.position.set(0, GROUND + 0.0055, -0.020);

      // laal panel aur laces
      const panel = add(new THREE.Mesh(new THREE.BoxGeometry(0.090, 0.040, 0.070),
        TEX.plain(0xc23a2c, 0.64)), knee);
      panel.position.set(0, GROUND + 0.078, -0.028);
      const laces = [];
      for (let i = 0; i < 3; i++) {
        put(laces, new THREE.BoxGeometry(0.062, 0.006, 0.006), 0, GROUND + 0.092 + i * 0.011, -0.014 - i * 0.020);
      }
      add(new THREE.Mesh(mergeParts(laces), TEX.plain(0xf4f2ec, 0.85)), knee);
    } else if (o.sneakers && !lite) {
      const midMat = TEX.plain(0xf0efe9, 0.72);
      const mid = add(new THREE.Mesh(new THREE.BoxGeometry(0.101, 0.036, 0.252), midMat), knee);
      mid.position.set(0, GROUND + 0.028, -0.024);
      mid.rotation.x = -0.05;
      const toecap = add(new THREE.Mesh(new THREE.SphereGeometry(0.050, 12, 10), midMat), knee);
      toecap.position.set(0, GROUND + 0.039, -0.118);
      toecap.scale.set(0.92, 0.52, 0.72);
      // panel aur laces
      const panel = add(new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.046, 0.088),
        TEX.plain(0xc9342c, 0.62)), knee);
      panel.position.set(0, GROUND + 0.077, -0.052);
      for (let i = 0; i < 3; i++) {
        const lace = add(new THREE.Mesh(new THREE.BoxGeometry(0.070, 0.007, 0.007),
          TEX.plain(0xf4f2ec, 0.85)), knee);
        lace.position.set(0, GROUND + 0.093 + i * 0.014, -0.030 - i * 0.022);
      }
      const cuff = add(new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.049, 0.030, 12),
        TEX.plain(0x2a2f38, 0.9)), knee);
      cuff.position.set(0, GROUND + 0.111, 0.010);
    }
    if (!lite && !heroShoe) {
      const toe = add(new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.042, 0.098), shoeMat), knee);
      toe.position.set(0, GROUND + 0.051, -0.106);
      toe.rotation.x = -0.16;
      const sole = add(new THREE.Mesh(new THREE.BoxGeometry(0.099, 0.020, 0.242), soleMat), knee);
      sole.position.set(0, GROUND + 0.023, -0.028);
      sole.rotation.x = -0.05;
      const heel = add(new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.026, 0.070), soleMat), knee);
      heel.position.set(0, GROUND + 0.013, 0.062);
    }
    legs.push({ hip, knee });
  }

  /*
   * Zameen ki chhaya. Sooraj se aane wali shadow chhaya wale hisse mein hoti hi
   * nahi, isliye wahan kirdaar zameen se **kata hua** tairta lagta tha. Ye ek
   * halka gol dhabba hai jo hamesha uske neeche rehta hai.
   */
  if (!lite) {
    const shade = new THREE.Mesh(
      new THREE.CircleGeometry(0.30, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22,
                                    depthWrite: false }),
    );
    shade.rotation.x = -Math.PI / 2;
    shade.position.y = 0.02;
    shade.renderOrder = -1;
    g.add(shade);
  }

  g.userData.rig = { arms, legs, head };
  g.userData.props = props;

  if (elder) {
    // buzurg thode jhuke hue aur chhote hote hain
    g.rotation.x = 0.07;
    g.scale.setScalar(0.94);
  }
  if (o.height) g.scale.multiplyScalar(o.height);
  return g;
}

/**
 * Door ka kirdaar -- **ek hi merged mesh**.
 *
 * Paas wale roop 48 aur 23 alag mesh ke hain. Bheed badhaane par yahi draw call
 * phaad deta hai (pichhle round mein 348 se 908). 40 m se aage koi ungli,
 * cuff ya topi ki phundi dikhti hi nahi -- wahan poora kirdaar ek buffer mein
 * daal dena kaafi hai.
 *
 * `MeshBuilder` pehle se merged geometry + vertex colour karta hai, aur city,
 * bazaar aur landmarks sab isi se bante hain -- wahi yahan bhi.
 */
/**
 * Beech ka roop -- **paanch mesh**, par chaal ab bhi chalti hai.
 *
 * Ye round 17 ka sabse bada perf sudhaar hai. `buildHuman({lod:"crowd"})` ka
 * "lite" roop **23 alag mesh** ka tha, aur `medium` tier par Sanjauli Chowk
 * par naapa gaya to akeli bheed **506 draw call** kha rahi thi -- poore
 * drishya ka sabse bada hissa, sheher se bhi zyada.
 *
 * Jo hissa hilta nahi (sir, baal, topi, dhad, kulhe) wo ek merged mesh mein
 * ja sakta hai. Sirf wahi alag rehna chahiye jo mudta hai: do baazu, do
 * taangein. Isliye:
 *
 *     1 dhad + 2 baazu + 2 taang = 5 draw call   (23 ki jagah)
 *
 * Rig ka dhaancha bilkul wahi rehta hai (`{arms:[{shoulder,elbow}], legs:
 * [{hip,knee}]}`), isliye `walkGait()` aur `panga.js` bina badle chalte hain.
 * Kohni aur ghutna ab mudte nahi -- 15 m se aage wo dikhta hi nahi.
 *
 * Sab kuch ek hi `FAR_MAT` par hai (vertex colour se rang), isliye material
 * bhi nahi badhte.
 */
export function buildHumanLite(o = {}) {
  const build = o.build || "male";
  const female = build === "female" || build === "girl";
  const elder = build === "elder";
  const skin = o.skin ?? 0xc08a5e;
  const top = o.top ?? 0xbb3a2a;
  const bottom = o.bottom ?? 0x35425e;
  const hair = o.hair ?? (elder ? 0xb8b2a8 : 0x140f0a);

  const g = new THREE.Group();
  const c = new THREE.Color();

  // ---- dhad: sir se kulhe tak, ek hi mesh ----
  const body = new MeshBuilder(0.6);
  c.setHex(skin);
  body.box(0, 1.626, 0, 0.185, 0.235, 0.195, c);              // sir
  body.box(0, 1.494, 0.004, 0.098, 0.10, 0.098, c);           // gardan
  c.setHex(hair);
  body.box(0, 1.716, 0.012, 0.196, 0.086, 0.202, c);          // baal
  c.setHex(top);
  body.box(0, 1.33, 0, female ? 0.355 : 0.395, 0.27, 0.215, c);   // seena
  body.box(0, 1.14, 0, female ? 0.305 : 0.335, 0.24, 0.195, c);   // kamar
  c.setHex(bottom);
  body.box(0, 1.012, 0, female ? 0.35 : 0.325, 0.15, 0.205, c);   // kulhe
  if (o.topi !== false && !female) {
    c.setHex(0x14543c); body.box(0, 1.748, 0, 0.248, 0.058, 0.248, c);
    c.setHex(0x8a6a4c); body.box(0, 1.784, 0, 0.258, 0.030, 0.258, c);
  }
  const torso = body.build(FAR_MAT);
  torso.castShadow = true;
  torso.receiveShadow = true;
  g.add(torso);

  // ---- baazu: har taraf ek merged mesh, shoulder ke local space mein ----
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * (female ? 0.201 : 0.228), 1.386, 0);
    g.add(shoulder);
    const mb = new MeshBuilder(0.6);
    c.setHex(top);
    mb.box(0, -0.128, 0, 0.098, 0.30, 0.098, c);              // upar ka baazu
    // aurton ka kurta kohni tak -- aage nangi baazu
    c.setHex(female ? skin : top);
    mb.box(0, -0.356, 0, 0.082, 0.225, 0.082, c);             // kohni se aage
    c.setHex(skin);
    mb.box(0, -0.508, 0, 0.072, 0.09, 0.05, c);               // haath
    const m = mb.build(FAR_MAT);
    m.castShadow = true;
    shoulder.add(m);
    // `elbow` sirf isliye ki purana code use dhoondh sake -- ismein kuch nahi
    const elbow = new THREE.Group();
    elbow.position.y = -0.252;
    shoulder.add(elbow);
    arms.push({ shoulder, elbow });
  }

  // ---- taangein: har taraf ek merged mesh, hip ke local space mein ----
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.088, 0.955, 0);
    g.add(hip);
    /*
     * Wahi lambai jo poore roop mein hai -- kulha 0.955, ghutna 0.485,
     * takhna 0.085, talwa 0. Pehle yahan bhi taangein chhoti thi aur talwa
     * 0.231 par tha; LOD badalte waqt kirdaar 3 cm upar-neeche kood jaata
     * tha aur dono hi roop hawa mein khade the.
     */
    const mb = new MeshBuilder(0.6);
    c.setHex(bottom);
    mb.box(0, -0.235, 0, 0.145, 0.470, 0.145, c);             // jangh
    mb.box(0, -0.670, 0, 0.115, 0.400, 0.115, c);             // pindli
    c.setHex(0x241d16);
    mb.box(0, -0.910, 0.012, 0.093, 0.090, 0.155, c);         // joota, talwa y=0 par
    const m = mb.build(FAR_MAT);
    m.castShadow = true;
    hip.add(m);
    const knee = new THREE.Group();
    knee.position.y = -0.470;
    hip.add(knee);
    legs.push({ hip, knee });
  }

  if (o.height) g.scale.setScalar(o.height);
  g.userData.rig = { arms, legs, head: torso };
  g.userData.lite = true;
  return g;
}

export function buildHumanFar(o = {}) {
  const build = o.build || "male";
  const female = build === "female" || build === "girl";
  const elder = build === "elder";
  const mb = new MeshBuilder(0.6);
  const c = new THREE.Color();
  const put = (hex) => c.setHex(hex);

  const skin = o.skin ?? 0xc08a5e;
  const top = o.top ?? 0xbb3a2a;
  const bottom = o.bottom ?? 0x35425e;
  const hair = o.hair ?? (elder ? 0xb8b2a8 : 0x140f0a);

  // sir -- ek box, chehre ka rang
  put(skin); mb.box(0, 1.626, 0, 0.19, 0.24, 0.20, c);
  put(hair); mb.box(0, 1.716, 0.012, 0.20, 0.09, 0.21, c);      // baal
  put(skin); mb.box(0, 1.494, 0.004, 0.10, 0.10, 0.10, c);      // gardan

  // dhad -- seena chauda, kamar patli (do box se ishaara)
  put(top);
  mb.box(0, 1.33, 0, female ? 0.36 : 0.40, 0.26, 0.22, c);
  mb.box(0, 1.14, 0, female ? 0.31 : 0.34, 0.24, 0.20, c);
  put(bottom);
  mb.box(0, 1.00, 0, female ? 0.36 : 0.33, 0.14, 0.21, c);      // kulhe

  // baazu aur taangein -- ek-ek box
  for (const side of [-1, 1]) {
    put(top);
    mb.box(side * (female ? 0.20 : 0.225), 1.26, 0, 0.09, 0.44, 0.10, c);
    put(skin);
    mb.box(side * (female ? 0.20 : 0.225), 1.00, 0, 0.075, 0.10, 0.085, c);   // haath
    // taang kulhe (0.955) se takhne (0.085) tak, joota 0 se 0.09 tak --
    // door ke roop mein bhi pair zameen par hone chahiye, warna 40 m par
    // poori bheed tairti hui dikhti hai
    put(bottom);
    mb.box(side * 0.088, 0.520, 0, 0.13, 0.870, 0.14, c);
    put(0x241d16);
    mb.box(side * 0.088, 0.045, -0.025, 0.10, 0.090, 0.24, c);                // joota
  }

  if (o.topi !== false && !female) {
    put(0x14543c); mb.box(0, 1.746, 0, 0.25, 0.06, 0.25, c);    // hari topi
    put(0x8a6a4c); mb.box(0, 1.782, 0, 0.26, 0.03, 0.26, c);    // bhoora band
  }

  const g = new THREE.Group();
  const m = mb.build(FAR_MAT);
  if (m) { m.castShadow = true; m.receiveShadow = false; g.add(m); }
  if (o.height) g.scale.setScalar(o.height);
  // rig nahi -- door ke kirdaar ki chaal dikhti hi nahi, isliye animate bhi nahi karte
  g.userData.far = true;
  return g;
}

