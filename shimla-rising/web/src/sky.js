import * as THREE from "three";

/**
 * Aasman, sooraj aur doori ka dhundhlapan.
 *
 * Gradient ek bade inverted sphere pe vertex colours se hai (shader ke bajaye) --
 * kam risk, aur low-poly art style ke saath match karta hai. Shimla mein doori ki
 * dhund asli hai: 8 km ke paar ki ridge hamesha halki neeli-safed dikhti hai.
 */
export class Sky {
  shadowRadius = 190;   // metres -- itne mein khiladi ke aas-paas ka sab aa jaata hai

  constructor(scene, terrain, renderer = null) {
    this.scene = scene;
    this.terrain = terrain;
    this.renderer = renderer;

    const geo = new THREE.SphereGeometry(terrain.worldSize * 0.95, 24, 16);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.skyGeo = geo;
    this.dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.dome.renderOrder = -1;
    scene.add(this.dome);

    // ground colour jaan-boojh kar halka hai -- yahi imaaraton ke shadow-side ko
    // kaala hone se bachata hai (koi shadow map nahi hai is game mein).
    // MeshStandardMaterial ke saath ab zyada kaam image-based lighting karti hai,
    // isliye direct lights pehle se kaafi kam intensity pe hain.
    this.hemi = new THREE.HemisphereLight(0xc8dcf2, 0xa89c86, 0.55);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.35;
    // Shadow camera khiladi ke aas-paas ek chhote box pe fit hota hai (update() mein).
    // Poore 8 km world pe fit karne se ek texel ~4 m ka ho jaata aur shadow bekaar dikhti.
    const cam = this.sun.shadow.camera;
    cam.near = 1; cam.far = 900;
    cam.left = cam.bottom = -this.shadowRadius;
    cam.right = cam.top = this.shadowRadius;
    scene.add(this.sun, this.sun.target);

    scene.fog = new THREE.Fog(0xa8c0d4, 900, 5200);
    this._pmrem = null;
    this._envRT = null;
    this.setTime(9.0);
  }

  /**
   * Waqt set karo.
   *
   * @param regenerateEnv PMREM se environment map dobara banao ya nahi.
   *   Ye **bahut mehnga** hai -- poora sky dome ek cube mein render hota hai
   *   aur uske mip levels convolve hote hain. Rang aur light har frame update
   *   ho sakte hain, par env map nahi: daynight.js ise sirf har ~15 game-minute
   *   mein true karta hai. (Pehle ye flag tha hi nahi, isliye PMREM har frame
   *   chal raha tha aur game rukne jaisa dheema ho gaya tha.)
   */
  setTime(hour, regenerateEnv = true) {
    this.hour = hour;
    const t = ((hour - 6) / 12) * Math.PI;         // 6am se 6pm
    const el = Math.sin(t);
    const day = THREE.MathUtils.clamp(el, 0, 1);
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(el) * 3, 0, 1);

    // Sooraj ki *disha* rakho, position nahi -- update() har frame use camera ke
    // aas-paas dobara rakhta hai, warna 8 km ke world mein light angle bigad jaata hai.
    this.sunDir = new THREE.Vector3(Math.cos(t), Math.max(0.06, el) * 0.8, -0.35).normalize();
    this.sunDist = this.terrain.worldSize * 0.6;
    this.sun.position.copy(this.sunDir).multiplyScalar(this.sunDist);
    this.sun.intensity = 0.30 + day * 1.85;
    this.sun.color.setRGB(1, 0.94 - dusk * 0.20, 0.86 - dusk * 0.34);
    this.hemi.intensity = 0.30 + day * 0.40;

    // top -> horizon gradient
    // Ye rang sirf dikhne ke liye nahi hain -- PMREM inhi se image-based lighting
    // banata hai, isliye ye poore scene ka ambient bhi hain.
    //
    // Pehle inka floor bahut ooncha tha (day=0 pe bhi sky neela rehta tha),
    // taaki chhaya kaali na ho. Nateeja: raat kabhi aati hi nahi thi -- rat ke
    // 9 baje bhi aasman din jaisa neela. Ab din ke rang aur raat ke rang ke
    // beech lerp hota hai, aur raat ka ambient chaand + environmentIntensity
    // se sambhala jaata hai.
    const NIGHT_TOP = [0.016, 0.028, 0.072];
    const NIGHT_HZ = [0.055, 0.070, 0.115];
    const DAY_TOP = [0.16, 0.30, 0.52];
    const DAY_HZ = [0.52, 0.60, 0.68];
    const mix = (a, b, k) => a + (b - a) * k;
    this.top = new THREE.Color().setRGB(
      mix(NIGHT_TOP[0], DAY_TOP[0] + day * 0.20, day),
      mix(NIGHT_TOP[1], DAY_TOP[1] + day * 0.34, day),
      mix(NIGHT_TOP[2], DAY_TOP[2] + day * 0.40, day));
    this.horizon = new THREE.Color().setRGB(
      mix(NIGHT_HZ[0], DAY_HZ[0] + day * 0.36 + dusk * 0.30, day),
      mix(NIGHT_HZ[1], DAY_HZ[1] + day * 0.32 + dusk * 0.06, day),
      mix(NIGHT_HZ[2], DAY_HZ[2] + day * 0.28 - dusk * 0.12, day));
    this._paint();
    // Raat mein sky khud gehra hai, to env se aane wali roshni bhi kam ho jaati
    // hai -- par bilkul kaala nahi chahiye, warna kuch dikhta hi nahi.
    this.scene.environmentIntensity = 0.42 + day * 0.62;
    this.scene.fog.color.copy(this.horizon).lerp(new THREE.Color(0.72, 0.79, 0.86), 0.35 * (0.3 + day * 0.7));
    this.fogBase = this.scene.fog.color.clone();
    if (regenerateEnv) this._updateEnvironment();
  }

  _paint() {
    const pos = this.skyGeo.attributes.position;
    const col = this.skyGeo.attributes.color;
    const R = this.skyGeo.parameters.radius;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp(pos.getY(i) / R, -1, 1) * 0.5 + 0.5;
      c.copy(this.horizon).lerp(this.top, Math.pow(t, 0.65));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  /**
   * Sky dome se image-based lighting ka env map banata hai.
   *
   * Yahi sabse bada single visual change hai: iske bina MeshStandardMaterial
   * ke metal (tin ki chhat, gaadi ke rim) aur glass ke paas reflect karne ko
   * kuch hota hi nahi, aur wo flat kaale dikhte hain.
   *
   * Sirf setTime() par chalta hai, har frame nahi -- PMREM mehnga hai.
   */
  _updateEnvironment() {
    if (!this.renderer) return;
    if (!this._pmrem) this._pmrem = new THREE.PMREMGenerator(this.renderer);
    const prev = this._envRT;
    // dome camera ke saath chalta hai, isliye env bake ke liye use origin pe rakho
    const keep = this.dome.position.clone();
    this.dome.position.set(0, 0, 0);
    const sceneForEnv = new THREE.Scene();
    sceneForEnv.add(this.dome);
    // far-plane zaroori hai: fromScene ka default far = 100 hai, par sky dome ki
    // radius ~7800 m hai. Default ke saath dome poora clip ho jaata tha aur env
    // map bilkul kaala aata -- yaani har chhaya wala hissa kaala.
    this._envRT = this._pmrem.fromScene(sceneForEnv, 0.04, 0.1, 20000);
    this.scene.add(this.dome);
    this.dome.position.copy(keep);
    this.scene.environment = this._envRT.texture;
    // chhaya wale hisse sirf isi se roshan hote hain -- koi fill light nahi hai
    this.scene.environmentIntensity = 1.0;
    prev?.dispose();
  }

  /** Shadow camera ko khiladi ke aas-paas fit karo. */
  fitShadow(target) {
    const r = this.shadowRadius;
    const cam = this.sun.shadow.camera;
    if (cam.right !== r) {
      cam.left = cam.bottom = -r;
      cam.right = cam.top = r;
      cam.updateProjectionMatrix();
    }
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
    this.sun.position.copy(target).addScaledVector(this.sunDir, 320);
    this.sun.updateMatrixWorld();
  }

  update(camera) {
    this.dome.position.copy(camera.position);
  }
}
