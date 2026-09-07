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

const HEAD_R = 0.098;

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
 */
export function buildHuman(o = {}) {
  const build = o.build || "male";
  const female = build === "female" || build === "girl";
  const young = build === "girl" || build === "boy";
  const lite = o.lod === "crowd";
  const elder = build === "elder";
  const SKIN = o.skin ?? 0xc08a5e;
  const HAIR = o.hair ?? (elder ? 0xb8b2a8 : 0x140f0a);
  const HEAD_Y = 1.626;

  const g = new THREE.Group();
  const props = {};        // beedi, phone -- player.js inhe chalata hai
  const skinMat = TEX.standard(TEX.skin(SKIN), { roughness: 0.62 });
  const faceMat = TEX.standard(TEX.face(SKIN, elder ? 61 : 19, { elder, female }), { roughness: 0.56 });
  const topMat = TEX.standard(TEX.setRepeat(TEX.fabric(o.top ?? 0xbb3a2a, 23), 2), { roughness: 0.88 });
  if (topMat.normalMap) topMat.normalScale.set(1.5, 1.5);   // silvatein saaf dikhein
  const botMat = TEX.standard(TEX.setRepeat(TEX.fabric(o.bottom ?? 0x35425e, 51, 60), 2), { roughness: 0.94 });
  const hairMat = new THREE.MeshStandardMaterial({ color: HAIR, roughness: elder ? 0.86 : 0.66 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x241d16, roughness: 0.5 });
  const soleMat = new THREE.MeshStandardMaterial({ color: 0x4a423c, roughness: 0.9 });

  const add = (mesh, parent = g) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // ================================================================== sir
  // Kirdaar ka aage -Z hai, isliye chehra -Z par aur pichhla sir +Z par.
  const headGeo = deform(new THREE.SphereGeometry(HEAD_R * (female ? 0.955 : 1), 26, 22), (v) => {
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

  const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.058, 0.10, 12), skinMat));
  neck.position.set(0, 1.494, 0.004);
  neck.rotation.x = -0.06;

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
  } else {
    if (!lite) {
      const zip = add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.30, 0.010),
        new THREE.MeshStandardMaterial({ color: 0x6d1f16, roughness: 0.6 })));
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

  const hips = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.128, 0.09, 6, 14), botMat));
  hips.scale.set(female ? 1.38 : 1.30, 1, 0.80);
  hips.position.y = 1.012;

  // ================================================================ baazu
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * (female ? 0.201 : 0.228), 1.386, 0);
    g.add(shoulder);
    const delt = add(new THREE.Mesh(new THREE.SphereGeometry(female ? 0.055 : 0.062, 12, 10), topMat), shoulder);
    delt.scale.set(0.95, 0.90, 0.95);
    const upper = add(new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.043, 0.235, 12), topMat), shoulder);
    upper.position.y = -0.128;
    const elbow = new THREE.Group();
    elbow.position.y = -0.252;
    shoulder.add(elbow);
    // Aurton ka kurta kohni tak hota hai aur uske aage baazu nangi -- iske bina
    // haath kurte ke rang mein hi gum ho jaate the.
    const fore = add(new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.033, 0.215, 12),
      female ? skinMat : topMat), elbow);
    fore.position.y = -0.104;
    if (!lite) {
      const cuff = add(new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.035, 0.028, 12),
        new THREE.MeshStandardMaterial({ color: female ? (o.top ?? 0xa8324f) : 0x8f2b1e, roughness: 0.9 })), elbow);
      cuff.position.y = female ? 0.004 : -0.206;
    }
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
    /*
     * Danda -- seedha `elbow` group se latakta hai, isliye kohni ke saath
     * ghoomta hai aur swing ke liye alag se kuch animate nahi karna padta.
     * Sirf daayein haath mein.
     */
    if (o.danda && side === 1) {
      const dandaMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.86 });
      const stick = add(new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.023, 0.95, 8), dandaMat), elbow);
      stick.position.set(0, -0.30, -0.10);
      stick.rotation.x = Math.PI / 2 - 0.25;         // haath mein aage ki taraf
      // dono sire par lohe ki patti -- asli lathi par yahi hoti hai
      const ring = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.5, metalness: 0.6 });
      for (const t of [-0.42, 0.42]) {
        const r = add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.04, 8), ring), elbow);
        r.position.set(0, -0.30 - Math.sin(0.25) * t, -0.10 + Math.cos(0.25) * t);
        r.rotation.x = Math.PI / 2 - 0.25;
      }
    }

    /*
     * Beedi -- baayen haath mein (daayan danda pakadta hai).
     *
     * `props` mein reference rakhte hain taaki `player.js` ka state machine
     * ise dikha/chhupa sake aur kash ke waqt ember tez kar sake.
     */
    if (o.beedi && side === -1) {
      const beediMat = new THREE.MeshStandardMaterial({ color: 0x6b5a3f, roughness: 0.95 });
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
        new THREE.MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.35, metalness: 0.4 })), ph);
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

  // ============================================================== taangein
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.088, 0.955, 0);
    g.add(hip);
    const thigh = add(new THREE.Mesh(new THREE.CylinderGeometry(0.083, 0.063, 0.335, 12), botMat), hip);
    thigh.position.y = -0.168;
    const knee = new THREE.Group();
    knee.position.y = -0.345;
    hip.add(knee);
    const shin = add(new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.041, 0.335, 12), botMat), knee);
    shin.position.y = -0.163;
    // Joota: edi ooncha, panja neecha aur aage patla -- ek hi box dabba lagta tha
    const shoe = add(new THREE.Mesh(new THREE.BoxGeometry(0.093, 0.058, 0.150), shoeMat), knee);
    shoe.position.set(0, -0.350, 0.012);
    /*
     * Sneaker -- sirf khiladi ke liye (`o.sneakers`).
     *
     * Nikhil: "pura pahadi bawa lagna chahie thik sneaker". Motha safed sole,
     * upar ki patti, aur laces. NPC par ye nahi lagta -- wo 30+ hote hain aur
     * unke liye ye sirf tri count hai; khiladi ek hi hai, isliye yahan detail
     * lagbhag muft hai.
     */
    if (o.sneakers && !lite) {
      const midMat = new THREE.MeshStandardMaterial({ color: 0xf0efe9, roughness: 0.72 });
      const mid = add(new THREE.Mesh(new THREE.BoxGeometry(0.101, 0.036, 0.252), midMat), knee);
      mid.position.set(0, -0.383, -0.024);
      mid.rotation.x = -0.05;
      const toecap = add(new THREE.Mesh(new THREE.SphereGeometry(0.050, 12, 10), midMat), knee);
      toecap.position.set(0, -0.372, -0.118);
      toecap.scale.set(0.92, 0.52, 0.72);
      // panel aur laces
      const panel = add(new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.046, 0.088),
        new THREE.MeshStandardMaterial({ color: 0xc9342c, roughness: 0.62 })), knee);
      panel.position.set(0, -0.334, -0.052);
      for (let i = 0; i < 3; i++) {
        const lace = add(new THREE.Mesh(new THREE.BoxGeometry(0.070, 0.007, 0.007),
          new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.85 })), knee);
        lace.position.set(0, -0.318 + i * 0.014, -0.030 - i * 0.022);
      }
      const cuff = add(new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.049, 0.030, 12),
        new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.9 })), knee);
      cuff.position.set(0, -0.300, 0.010);
    }
    if (!lite) {
      const toe = add(new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.042, 0.098), shoeMat), knee);
      toe.position.set(0, -0.360, -0.106);
      toe.rotation.x = -0.16;
      const sole = add(new THREE.Mesh(new THREE.BoxGeometry(0.099, 0.020, 0.242), soleMat), knee);
      sole.position.set(0, -0.386, -0.028);
      sole.rotation.x = -0.05;
      const heel = add(new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.026, 0.070), soleMat), knee);
      heel.position.set(0, -0.398, 0.062);
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
    put(bottom);
    mb.box(side * 0.088, 0.72, 0, 0.13, 0.56, 0.14, c);
    put(0x241d16);
    mb.box(side * 0.088, 0.40, -0.025, 0.10, 0.07, 0.24, c);                  // joota
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

/** Saanjha material -- sab door ke kirdaar isi par, taaki batching bani rahe. */
const FAR_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
