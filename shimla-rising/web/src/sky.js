import * as THREE from "three";

/**
 * Aasman, sooraj aur doori ka dhundhlapan.
 *
 * Gradient ek bade inverted sphere pe vertex colours se hai (shader ke bajaye) --
 * kam risk, aur low-poly art style ke saath match karta hai. Shimla mein doori ki
 * dhund asli hai: 8 km ke paar ki ridge hamesha halki neeli-safed dikhti hai.
 */
export class Sky {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;

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
    this.hemi = new THREE.HemisphereLight(0xbcd4ee, 0xb0a892, 1.0);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.5);
    scene.add(this.sun, this.sun.target);

    scene.fog = new THREE.Fog(0xa8c0d4, 900, 5200);
    this.setTime(9.0);
  }

  /** hour 0..24 */
  setTime(hour) {
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
    this.sun.intensity = 0.20 + day * 0.95;
    this.sun.color.setRGB(1, 0.94 - dusk * 0.20, 0.86 - dusk * 0.34);
    this.hemi.intensity = 0.42 + day * 0.62;

    // top -> horizon gradient
    this.top = new THREE.Color().setRGB(0.06 + day * 0.10, 0.13 + day * 0.24, 0.28 + day * 0.44);
    this.horizon = new THREE.Color().setRGB(0.24 + day * 0.44 + dusk * 0.34,
                                            0.32 + day * 0.40 + dusk * 0.08,
                                            0.42 + day * 0.38 - dusk * 0.10);
    this._paint();
    this.scene.fog.color.copy(this.horizon).lerp(new THREE.Color(0.72, 0.79, 0.86), 0.35);
    this.fogBase = this.scene.fog.color.clone();
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

  update(camera) {
    this.dome.position.copy(camera.position);
    // sooraj ko camera ke saath rakho -- warna 8 km ke world mein shadow-less
    // directional light ki disha door jaakar galat lagti hai
    this.sun.target.position.copy(camera.position);
    this.sun.target.updateMatrixWorld();
    this.sun.position.copy(camera.position).addScaledVector(this.sunDir, this.sunDist);
  }
}
