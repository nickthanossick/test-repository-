import * as THREE from "three";
import * as TEX from "./textures.js";

/**
 * Paidal Vicky.
 *
 * Shimla-specific: **chadhai pe stamina jaldi khatam hoti hai.** Ye koi
 * decoration nahi -- Jakhoo ki chadhai (Ridge 2205 m se mandir 2455 m, 1.1 km mein)
 * asli mein saans phula deti hai, aur mission a1_m5 isi pe bana hai. Uphill
 * daudne ka kharch dhalan ke saath teen guna tak badh jaata hai.
 */
export class Player {
  constructor(terrain) {
    this.terrain = terrain;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.vy = 0;
    this.grounded = true;
    this.health = 100;
    this.stamina = 100;
    this.running = false;
    this.height = 1.75;
    this.mesh = buildAvatar();
  }

  placeAt(x, z, yaw = 0) {
    this.pos.set(x, this.terrain.heightAt(x, z), z);
    this.yaw = yaw; this.vy = 0;
    this.mesh.position.copy(this.pos);
    return this;
  }

  update(dt, ctl, camYaw) {
    const WALK = 3.1, RUN = 6.4;

    let mx = ctl.strafe, mz = ctl.forward;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const moving = len > 0.01;

    // camera-relative movement
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    const dx = mx * cos - mz * sin;
    const dz = mx * sin + mz * cos;

    // --- dhalan aur stamina ----------------------------------------------
    const h0 = this.terrain.heightAt(this.pos.x, this.pos.z);
    const probe = 1.5;
    const hAhead = this.terrain.heightAt(this.pos.x + dx * probe, this.pos.z + dz * probe);
    const grade = moving ? (hAhead - h0) / probe : 0;      // + = chadhai

    this.running = ctl.run && this.stamina > 1 && moving;
    let speed = this.running ? RUN : WALK;
    speed *= THREE.MathUtils.clamp(1 - grade * 0.85, 0.42, 1.28);   // chadhai dheemi, utraai tez

    if (this.running) {
      const uphill = Math.max(0, grade);
      this.stamina -= dt * (9 + uphill * 46);              // chadhai pe teen guna kharch
    } else {
      this.stamina += dt * (moving ? 5.5 : 13);
    }
    this.stamina = THREE.MathUtils.clamp(this.stamina, 0, 100);

    if (moving) {
      this.pos.x += dx * speed * dt;
      this.pos.z += dz * speed * dt;
      this.yaw = Math.atan2(dx, dz);
    }

    const lim = this.terrain.half - 8;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -lim, lim);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -lim, lim);

    // --- gravity / jump ---------------------------------------------------
    const ground = this.terrain.heightAt(this.pos.x, this.pos.z);
    if (ctl.jump && this.grounded) { this.vy = 5.2; this.grounded = false; }
    this.vy -= 19.6 * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= ground) {
      if (this.vy < -14) this.health = Math.max(0, this.health + (this.vy + 14) * 2.4);  // giravat ka nuksan
      this.pos.y = ground; this.vy = 0; this.grounded = true;
    }

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;

    this._animate(moving);
  }

  /** Chalne/daudne ka simple procedural gait -- kandha aur ghutna asli joints par. */
  _animate(moving) {
    const rig = this.mesh.userData.rig;
    if (!rig) return;
    const t = performance.now() / 1000;
    const freq = this.running ? 13 : 8;
    const amp = moving ? (this.running ? 0.85 : 0.48) : 0;
    this._gait = (this._gait ?? 0) + (moving ? 0 : 0);
    const sw = Math.sin(t * freq) * amp;
    const sw2 = Math.sin(t * freq + Math.PI) * amp;

    rig.legs[0].hip.rotation.x = sw;
    rig.legs[1].hip.rotation.x = sw2;
    // ghutna sirf peeche mudta hai
    rig.legs[0].knee.rotation.x = Math.max(0, -sw) * 1.1;
    rig.legs[1].knee.rotation.x = Math.max(0, -sw2) * 1.1;
    // haath ulti taraf jhoolte hain
    rig.arms[0].shoulder.rotation.x = sw2 * 0.8;
    rig.arms[1].shoulder.rotation.x = sw * 0.8;
    rig.arms[0].elbow.rotation.x = -Math.abs(sw2) * 0.55 - (moving ? 0.12 : 0.25);
    rig.arms[1].elbow.rotation.x = -Math.abs(sw) * 0.55 - (moving ? 0.12 : 0.25);

    // saans/bob
    this.mesh.position.y += moving
      ? Math.abs(Math.sin(t * freq)) * (this.running ? 0.055 : 0.028)
      : Math.sin(t * 1.6) * 0.008;
  }
}

/**
 * Vicky ka model -- GTA San Andreas ke ped jitna level.
 *
 * Pehle ye gola + capsule ka dher tha: gol sir, ek jaisi mote baazu, aur
 * cartoon jaisi badi aankhein. Ab:
 *
 *  - sir ek asli khopdi ka aakar hai (gaal chaude, jabda saankra, thodi aage),
 *    alag naak, kaan aur bhauhon ka ubhaar -- gola nahi
 *  - dhad ka profile oonchai ke saath badalta hai: seena chauda, kamar patli
 *  - kandhe pe deltoid, baazu kandhe se kalai tak patli hoti hai
 *  - jacket ka collar, zip, cuff aur kamar ka hem
 *  - chehra texture SA jaisa painted hai (chhoti aankhein, moochh, naak ki
 *    chhaya) -- geometry kam, texture zyada, bilkul us daur ke games jaise
 *
 * Ang alag nodes mein hain taaki chalne ka animation asli joints par ghoome.
 */

/** Har vertex pe fn lagao. UV nahi badalte, isliye chehra apni jagah rehta hai. */
function deform(geo, fn) {
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

const HEAD_R = 0.098;
const HEAD_Y = 1.626;

function buildAvatar() {
  const g = new THREE.Group();

  // Gehua rang. Canvas ke colour-space bug se pehle ye asal mein aadhi
  // brightness pe likhta tha; ab seedha dikhta hai.
  const SKIN = 0xc08a5e;
  const skinMat = TEX.standard(TEX.skin(SKIN), { roughness: 0.68 });
  const faceMat = TEX.standard(TEX.face(SKIN), { roughness: 0.60 });
  const jacketMat = TEX.standard(TEX.setRepeat(TEX.fabric(0xbb3a2a, 23), 2), { roughness: 0.88 });
  const jeansMat = TEX.standard(TEX.setRepeat(TEX.fabric(0x35425e, 51, 60), 2), { roughness: 0.94 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x140f0a, roughness: 0.66 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x241d16, roughness: 0.5 });
  const soleMat = new THREE.MeshStandardMaterial({ color: 0x4a423c, roughness: 0.9 });

  const add = (mesh, parent = g) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // ================================================================== sir
  // Khopdi: gole ko asli sir ke silhouette mein dhaalte hain. Kirdaar ka
  // aage -Z hai, isliye chehra -Z par aur pichhla sir +Z par hai.
  const headGeo = deform(new THREE.SphereGeometry(HEAD_R, 26, 22), (v) => {
    const t = v.y / HEAD_R;                       // -1 thodi .. +1 talu
    v.y *= 1.22;                                  // sir lamba, gol nahi
    if (t < 0) {                                  // jabda: neeche jaate hue saankra
      const k = Math.pow(-t, 1.35);
      v.x *= 1 - 0.46 * k;
      v.z *= 1 - 0.22 * k;
      if (v.z < 0) v.z -= 0.012 * k;              // thodi thodi aage
    } else {                                      // talu thoda saankra
      v.x *= 1 - 0.13 * t * t;
      v.z *= 1 - 0.06 * t * t;
    }
    if (v.z > 0) v.z *= 1.10;                     // pichhli khopdi ubhri hui
    else v.z *= 0.92;                             // chehra chapta
    // gaal ki haddi -- aankhon ke thoda neeche sabse chaudi jagah
    const cheek = Math.exp(-Math.pow((t + 0.12) * 3.1, 2));
    v.x *= 1 + 0.07 * cheek;
  });
  const head = add(new THREE.Mesh(headGeo, faceMat));
  head.position.y = HEAD_Y;

  // naak -- do chhote wedge, kyunki painted naak akeli chapti lagti hai
  const nose = add(new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.055, 6), skinMat));
  nose.position.set(0, HEAD_Y - 0.012, -HEAD_R * 0.90);
  nose.rotation.set(Math.PI * 0.52, 0, 0);
  nose.scale.set(1, 1, 0.72);

  // bhauhon ka ubhaar -- SA ke chehron ki pehchan yahi hai
  const brow = add(new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 8,
    0, Math.PI * 2, 0, Math.PI * 0.5), skinMat));
  brow.position.set(0, HEAD_Y + 0.036, -HEAD_R * 0.60);
  brow.scale.set(1.55, 0.38, 0.95);
  brow.rotation.x = -0.30;

  // kaan
  for (const side of [-1, 1]) {
    const ear = add(new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), skinMat));
    ear.position.set(side * HEAD_R * 0.98, HEAD_Y - 0.004, 0.006);
    ear.scale.set(0.42, 1.25, 0.85);
  }

  // baal: hairline aankhon se upar rukti hai (face texture mein aankhen
  // phi = 0.44*PI pe hain, aur topi upar se dhak leti hai, isliye baal
  // 0.30*PI pe khatam -- maatha khula rehta hai.
  // Topi sir ka upar wala hissa dhak leti hai, isliye poora cap banane ka koi
  // fayda nahi -- balki usse sir ganja dikhta tha. Iske bajaye topi ke *neeche*
  // ka band: phi 0.24*PI (topi ke rim ke theek neeche) se 0.40*PI tak, jo
  // aankhon (0.44*PI) se thoda upar rukta hai.
  const hair = add(new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.045, 22, 14,
    0, Math.PI * 2, Math.PI * 0.24, Math.PI * 0.16), hairMat));
  hair.scale.set(1.02, 1.24, 1.02);
  hair.position.y = HEAD_Y;
  // kaan ke aage ke baal
  for (const side of [-1, 1]) {
    const burn = add(new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), hairMat));
    burn.position.set(side * HEAD_R * 0.93, HEAD_Y + 0.016, -0.012);
    burn.scale.set(0.40, 1.5, 1.0);
  }
  // pichhle sir ke baal -- theta-range ke bajaye alag gola, taaki kabhi
  // gaal pe na aaye (uska sabse aage ka bindu chehre se peeche rehta hai)
  const nape = add(new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), hairMat));
  nape.position.set(0, HEAD_Y - 0.022, 0.048);
  nape.scale.set(1.06, 1.02, 0.76);

  // gardan -- aage ki taraf halki jhuki, jaise asli hoti hai
  const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.058, 0.10, 12), skinMat));
  neck.position.set(0, 1.494, 0.004);
  neck.rotation.x = -0.06;

  // ------------------------------------------------------------ pahadi topi
  // Bushehri topi chapti hai -- ~6 cm oonchi, sapaat chhat, base pe velvet band
  // jo aage chauda hota hai. Khopdi ka sira y = 1.732 pe hai.
  const topiMat = TEX.standard(TEX.topi(0x59684a, 0x7e2b2b), { roughness: 0.95 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x7e2b2b, roughness: 0.68 });
  const topi = new THREE.Group();
  topi.position.y = HEAD_Y;
  topi.rotation.x = -0.06;
  g.add(topi);
  const onTopi = (m) => add(m, topi);
  const cap = onTopi(new THREE.Mesh(new THREE.CylinderGeometry(0.117, 0.125, 0.058, 24), topiMat));
  cap.position.y = 0.106;
  const rim = onTopi(new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.125, 0.017, 24), bandMat));
  rim.position.y = 0.0825;
  // CylinderGeometry mein theta 0 = +Z, aur kirdaar ka aage -Z hai
  const flap = onTopi(new THREE.Mesh(new THREE.CylinderGeometry(0.1275, 0.1295, 0.040, 20, 1, true,
    Math.PI - 0.80, 1.60), bandMat));
  flap.position.y = 0.093;

  // ================================================================= dhad
  // Profile oonchai ke saath badalta hai: kandhe chaude, seena bhara,
  // kamar patli. Ek jaisa capsule insaan jaisa nahi lagta.
  const torsoGeo = deform(new THREE.CapsuleGeometry(0.145, 0.30, 8, 20), (v) => {
    const t = THREE.MathUtils.clamp(v.y / 0.22, -1, 1);   // -1 kamar .. +1 kandha
    const w = 1.30 + 0.20 * Math.max(0, t) - 0.22 * Math.max(0, -t);
    const d = 0.70 + 0.06 * Math.max(0, t) - 0.10 * Math.max(0, -t);
    v.x *= w; v.z *= d;
  });
  add(new THREE.Mesh(torsoGeo, jacketMat)).position.y = 1.228;

  // jacket ka collar
  const collar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.085, 0.045, 14, 1, true), jacketMat));
  collar.position.y = 1.446;
  collar.scale.set(1.18, 1, 0.86);
  // zip -- saamne ki seedhi lakeer
  const zip = add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.30, 0.010),
    new THREE.MeshStandardMaterial({ color: 0x6d1f16, roughness: 0.6 })));
  zip.position.set(0, 1.265, -0.104);
  // kamar ka hem
  const hem = add(new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.148, 0.036, 18), jacketMat));
  hem.position.y = 1.083;
  hem.scale.set(1.30, 1, 0.72);

  const hips = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.128, 0.09, 6, 14), jeansMat));
  hips.scale.set(1.30, 1, 0.80);
  hips.position.y = 1.012;

  // ================================================================ baazu
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.228, 1.386, 0);
    g.add(shoulder);
    // deltoid -- iske bina kandhe pe gap dikhta hai
    const delt = add(new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), jacketMat), shoulder);
    delt.scale.set(0.95, 0.90, 0.95);
    // upper arm kandhe se kohni tak patla hota jaata hai
    const upper = add(new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.043, 0.235, 12), jacketMat), shoulder);
    upper.position.y = -0.128;
    const elbow = new THREE.Group();
    elbow.position.y = -0.252;
    shoulder.add(elbow);
    const fore = add(new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.033, 0.215, 12), jacketMat), elbow);
    fore.position.y = -0.104;
    // aasteen ka cuff
    const cuff = add(new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.035, 0.028, 12),
      new THREE.MeshStandardMaterial({ color: 0x8f2b1e, roughness: 0.9 })), elbow);
    cuff.position.y = -0.206;
    // haath -- chapta, thoda ungliyon ki taraf saankra
    const hand = add(new THREE.Mesh(new THREE.SphereGeometry(0.040, 10, 8), skinMat), elbow);
    hand.scale.set(0.82, 1.55, 0.52);
    hand.position.y = -0.256;
    arms.push({ shoulder, elbow });
  }

  // ============================================================== taangein
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.088, 0.955, 0);
    g.add(hip);
    // jaangh pindli se moti
    const thigh = add(new THREE.Mesh(new THREE.CylinderGeometry(0.083, 0.063, 0.335, 12), jeansMat), hip);
    thigh.position.y = -0.168;
    const knee = new THREE.Group();
    knee.position.y = -0.345;
    hip.add(knee);
    const shin = add(new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.041, 0.335, 12), jeansMat), knee);
    shin.position.y = -0.163;
    // joota: upper + alag sole
    const shoe = add(new THREE.Mesh(new THREE.BoxGeometry(0.093, 0.058, 0.215), shoeMat), knee);
    shoe.position.set(0, -0.352, -0.030);
    const sole = add(new THREE.Mesh(new THREE.BoxGeometry(0.099, 0.024, 0.228), soleMat), knee);
    sole.position.set(0, -0.389, -0.032);
    legs.push({ hip, knee });
  }

  g.userData.rig = { arms, legs, head };
  return g;
}
