import * as THREE from "three";
import * as TEX from "./textures.js";

/**
 * Shimla ka terrain.
 *
 * Heightmap ek RGB8 PNG hai jisme 16-bit elevation do channels mein packed hai
 * (R = high byte, G = low byte). Browser ka <canvas> sirf 8-bit deta hai, isliye
 * seedha 16-bit grayscale padhna possible nahi -- yahi packing ka kaaran hai.
 * `tools/terrain/build_heightmap.py` dono formats likhta hai.
 */
export class Terrain {
  constructor(geo, meta, image) {
    this.geo = geo;
    this.size = meta.size_px;
    this.worldSize = meta.world_size_m;
    this.half = this.worldSize / 2;
    this.elevMin = meta.elevation_min_m;
    this.elevMax = meta.elevation_max_m;
    this.mPerPx = this.worldSize / (this.size - 1);

    const cv = document.createElement("canvas");
    cv.width = cv.height = this.size;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const px = ctx.getImageData(0, 0, this.size, this.size).data;

    const n = this.size * this.size;
    this.heights = new Float32Array(n);
    const range = this.elevMax - this.elevMin;
    for (let i = 0; i < n; i++) {
      const u16 = (px[i * 4] << 8) | px[i * 4 + 1];
      this.heights[i] = this.elevMin + (u16 / 65535) * range;
    }
  }

  /** Grid index se raw height. Edges pe clamp. */
  _at(col, row) {
    const c = col < 0 ? 0 : col >= this.size ? this.size - 1 : col;
    const r = row < 0 ? 0 : row >= this.size ? this.size - 1 : row;
    return this.heights[r * this.size + c];
  }

  /** World (x east, z south) pe bilinear-interpolated elevation, metres. */
  heightAt(x, z) {
    const fx = ((x + this.half) / this.worldSize) * (this.size - 1);
    const fz = ((z + this.half) / this.worldSize) * (this.size - 1);
    const c0 = Math.floor(fx), r0 = Math.floor(fz);
    const tx = fx - c0, tz = fz - r0;
    const h00 = this._at(c0, r0), h10 = this._at(c0 + 1, r0);
    const h01 = this._at(c0, r0 + 1), h11 = this._at(c0 + 1, r0 + 1);
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  /** Surface normal, central differences se. */
  normalAt(x, z, out = new THREE.Vector3()) {
    const d = this.mPerPx;
    const hl = this.heightAt(x - d, z), hr = this.heightAt(x + d, z);
    const hd = this.heightAt(x, z - d), hu = this.heightAt(x, z + d);
    return out.set(hl - hr, 2 * d, hd - hu).normalize();
  }

  /** 0 = samtal, 1 = bahut khadi dhalan. */
  slopeAt(x, z) {
    const n = this.normalAt(x, z, _tmpN);
    return Math.min(1, Math.acos(Math.max(-1, Math.min(1, n.y))) / (Math.PI / 3));
  }

  /**
   * Chunked terrain mesh, smooth-shaded aur normal-mapped.
   *
   * Pehle ye flat-shaded tha, jisse 10 m ke quads saaf dikhte the aur poora
   * pahad origami jaisa lagta tha. Ab vertex normals smooth hain aur detail
   * normal map surface ko kareeb se bhi tootne nahi deta -- geometry utni hi
   * hai, par dikhta modern hai.
   */
  buildMesh(chunks = 8, quads = 96) {
    const group = new THREE.Group();
    group.name = "terrain";
    const chunkSize = this.worldSize / chunks;
    const mat = this._groundMaterial();

    for (let cz = 0; cz < chunks; cz++) {
      for (let cx = 0; cx < chunks; cx++) {
        const x0 = -this.half + cx * chunkSize;
        const z0 = -this.half + cz * chunkSize;
        group.add(this._chunk(x0, z0, chunkSize, quads, mat));
      }
    }
    return group;
  }

  /**
   * Zameen ka material -- teen satah, dhalan aur oonchai se ghuli hui.
   *
   * Pehle yahan **ek** texture thi aur rang sirf vertex colour se aata tha.
   * Nateeja screenshot mein saaf tha: poora pahad ek chapta hara rang, na
   * ghaas ka daana, na chattan, na mitti -- golf course jaisa, Himalaya jaisa
   * nahi.
   *
   * Ab teen satah hain -- ghaas, chattan, sookhi mitti -- aur unka anupaat
   * **per-vertex** aata hai (`aSplat`), dhalan aur oonchai se: khadi dhalan
   * par chattan (wahan ghaas ugti hi nahi), ridge ke upar sookhi ghaas,
   * baaki jagah hari.
   *
   * Do paimane par UV bhi hai: ek motha (~11 m) jo door se dhabbe deta hai,
   * ek mahin (~2.2 m) jo paas aane par daana deta hai. Sirf ek scale rakhne
   * par ya to door se dohraav dikhta hai ya paas se plastic.
   *
   * Ye sab `MeshStandardMaterial` ke andar `onBeforeCompile` se hota hai --
   * yaani shadow, fog, tone mapping aur image-based lighting sab pehle jaise
   * chalte rehte hain, aur **draw call ek bhi nahi badhta**.
   */
  _groundMaterial() {
    const grass = TEX.setRepeat(TEX.terrainDetail(), 1);
    const rock = TEX.setRepeat(TEX.groundRock(), 1);
    const soil = TEX.setRepeat(TEX.groundSoil(), 1);

    const mat = TEX.standard(grass, { vertexColors: true, roughness: 1.0 });
    mat.defines = { ...(mat.defines || {}), SHIMLA_SPLAT: "" };
    mat.userData.rockMap = { value: rock.map };
    mat.userData.soilMap = { value: soil.map };
    mat.userData.rockNormal = { value: rock.normalMap };
    mat.userData.soilNormal = { value: soil.normalMap };

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.rockMap = mat.userData.rockMap;
      shader.uniforms.soilMap = mat.userData.soilMap;
      shader.uniforms.rockNormal = mat.userData.rockNormal;
      shader.uniforms.soilNormal = mat.userData.soilNormal;

      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>
          attribute vec2 aSplat;      // x = chattan, y = sookhi mitti
          varying vec2 vSplat;
          varying vec2 vFineUv;`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          vSplat = aSplat;
          // mahin paimana -- world XZ se, taaki chunk ke jod par seam na ho
          vFineUv = vec2(position.x, position.z) * 0.45;`);

      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
          uniform sampler2D rockMap;
          uniform sampler2D soilMap;
          uniform sampler2D rockNormal;
          uniform sampler2D soilNormal;
          varying vec2 vSplat;
          varying vec2 vFineUv;`)
        // albedo: teen satah ka mishran, motha + mahin dono paimane par
        .replace("#include <map_fragment>", `
          vec4 gMacro = texture2D(map, vMapUv);
          vec4 rMacro = texture2D(rockMap, vMapUv);
          vec4 sMacro = texture2D(soilMap, vMapUv);
          vec4 gFine  = texture2D(map, vFineUv);
          vec4 rFine  = texture2D(rockMap, vFineUv);
          vec4 sFine  = texture2D(soilMap, vFineUv);
          float wRock = clamp(vSplat.x, 0.0, 1.0);
          float wSoil = clamp(vSplat.y, 0.0, 1.0) * (1.0 - wRock);
          float wGrass = max(0.0, 1.0 - wRock - wSoil);
          vec4 macro = gMacro * wGrass + rMacro * wRock + sMacro * wSoil;
          vec4 fine  = gFine  * wGrass + rFine  * wRock + sFine  * wSoil;
          /*
           * Mahin parat ka contrast.
           *
           * Generator ka output 0.86..1.0 ke sankre daayre mein hai (wo
           * jaan-boojh kar neutral hai, taaki vertex colour rang de). Use
           * seedha guna karne se paas ki zameen ab bhi chapti dikhti thi.
           * Isliye pehle usko 0..1 par phailate hain, phir tone todte hain --
           * rang nahi, warna dohraav saaf dikhne lagta hai.
           */
          float f = clamp((fine.r - 0.80) * 4.2, 0.0, 1.0);
          /*
           * Bada paimana: ~110 m ke dhabbe.
           *
           * Bina iske poori dhalan ek hi rang ki chaadar lagti hai, chahe
           * mahin daana kitna bhi ho -- kyunki aankh door se sirf bade dhabbe
           * padhti hai. Ye soil map ko bahut dheere tile karke aata hai,
           * yaani koi nayi texture nahi.
           */
          float blotch = texture2D(soilMap, vMapUv * 0.085).r;
          vec3 tone = vec3(0.74 + 0.46 * f) * (0.90 + 0.20 * blotch);
          vec4 sampledDiffuseColor = vec4(macro.rgb * tone, macro.a);
          diffuseColor *= sampledDiffuseColor;`)
        // normal: chattan par ubhaar zyada, ghaas par kam
        .replace("#include <normal_fragment_maps>", `
          vec3 nG = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          vec3 nR = texture2D(rockNormal, vNormalMapUv).xyz * 2.0 - 1.0;
          vec3 nS = texture2D(soilNormal, vNormalMapUv).xyz * 2.0 - 1.0;
          float bRock = clamp(vSplat.x, 0.0, 1.0);
          float bSoil = clamp(vSplat.y, 0.0, 1.0) * (1.0 - bRock);
          float bGrass = max(0.0, 1.0 - bRock - bSoil);
          vec3 mapN = normalize(nG * bGrass + nR * bRock + nS * bSoil);
          mapN.xy *= normalScale * (1.0 + bRock * 0.9);
          normal = normalize(tbn * mapN);`);
    };
    // shader alag hai to three.js ko program dobara compile karna padta hai
    mat.customProgramCacheKey = () => "shimla-ground";
    return mat;
  }

  _chunk(x0, z0, size, quads, mat) {
    const vn = quads + 1;
    const pos = new Float32Array(vn * vn * 3);
    const col = new Float32Array(vn * vn * 3);
    const uvs = new Float32Array(vn * vn * 2);
    const splat = new Float32Array(vn * vn * 2);      // x = chattan, y = sookhi mitti
    const idx = new Uint32Array(quads * quads * 6);
    const step = size / quads;
    const c = new THREE.Color();

    let p = 0, t = 0;
    const UV_SCALE = 0.09;          // ~11 m per texture tile
    for (let r = 0; r < vn; r++) {
      for (let q = 0; q < vn; q++) {
        const x = x0 + q * step, z = z0 + r * step;
        const y = this.heightAt(x, z);
        pos[p] = x; pos[p + 1] = y; pos[p + 2] = z;
        this.colorAt(x, z, y, c);
        col[p] = c.r; col[p + 1] = c.g; col[p + 2] = c.b;
        // world-space UV -- chunk seams pe texture continue rehta hai
        uvs[t] = x * UV_SCALE; uvs[t + 1] = z * UV_SCALE;
        /*
         * Splat: kaunsi satah kitni.
         *
         * Chattan dhalan se aati hai -- 0.45 se shuru, 0.85 par poori. Yahi
         * asli niyam hai: itni khadi dhalan par mitti tikti hi nahi, isliye
         * wahan ghaas ugti nahi.
         *
         * Sookhi mitti/ghaas oonchai se -- ridge ke upar ped ki rekha khatm
         * ho jaati hai. Neeche ki ghaati hari rehti hai.
         */
        const sl = this.slopeAt(x, z);
        const rockW = THREE.MathUtils.smoothstep(sl, 0.45, 0.85);
        /*
         * Sookhi ghaas sirf sabse upar.
         *
         * Pehle 2180 m se shuru thi -- par asli DEM par Shimla ka poora basa
         * hua ridge hi 2100-2200 m par hai, isliye aadha sheher sookhi peeli
         * dhalan par baith gaya tha. Shimla ki ridge deodar se dhaki hai;
         * khulapan Jakhoo (2455 m) ke aas-paas hi shuru hota hai.
         */
        const dry = THREE.MathUtils.smoothstep(y, 2330, 2480) * 0.75;
        splat[t] = rockW;
        splat[t + 1] = dry * (1 - rockW);
        p += 3; t += 2;
      }
    }
    let i = 0;
    for (let r = 0; r < quads; r++) {
      for (let q = 0; q < quads; q++) {
        const a = r * vn + q, b = a + 1, d = a + vn, e = d + 1;
        idx[i++] = a; idx[i++] = d; idx[i++] = b;
        idx[i++] = b; idx[i++] = d; idx[i++] = e;
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    g.setAttribute("aSplat", new THREE.BufferAttribute(splat, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.name = "terrain-chunk";
    m.receiveShadow = true;
    m.castShadow = false;          // terrain khud pe shadow daalna mehnga hai
    return m;
  }

  /**
   * Elevation + slope se ground colour.
   * Shimla ka asli banding: neeche chir pine, upar deodar, ridge pe ghaas/chattan,
   * aur 2350 m ke upar sardiyon mein barf.
   */
  colorAt(x, z, y, out) {
    const t = (y - this.elevMin) / (this.elevMax - this.elevMin);
    const slope = this.slopeAt(x, z);

    /*
     * Band ab **metre** se hain, normalised `t` se nahi.
     *
     * `t` poore elevation range par phailta hai, aur asli DEM ke saath wo
     * range 1350-2500 ho gayi -- yaani purane bhinn (0.30, 0.52...) ab bilkul
     * doosri oonchai par gir rahe the. Asli metre likhne se ye kabhi galat
     * nahi hoga, chahe DEM dobara bane.
     */
    if (y < 1700) out.setRGB(0.075, 0.155, 0.072);        // khad -- ghana chir pine
    else if (y < 1950) out.setRGB(0.095, 0.185, 0.085);   // dhalan -- mila jungle
    else if (y < 2280) out.setRGB(0.118, 0.200, 0.096);   // deodar belt -- yahin sheher hai
    else if (y < 2430) out.setRGB(0.165, 0.208, 0.112);   // ridge ke upar, patla jungle
    else out.setRGB(0.235, 0.235, 0.185);                 // choti -- khuli ghaas

    if (slope > 0.55) {                                 // khadi chattan nangi hoti hai
      const k = Math.min(1, (slope - 0.55) / 0.45);
      out.lerp(_rock, k * 0.8);
    }
    /*
     * Barf ki rekha -- Shimla mein **hai hi nahi**.
     *
     * Ye pehle 2330 m par thi, jab terrain synthetic tha aur uska upar ka
     * hissa alag baithta tha. Asli DEM aane par ye galat sabit hui: Shimla ka
     * basa hua ridge hi 2100-2200 m par hai aur Jakhoo 2455 m -- yaani poora
     * upar ka sheher saal bhar barf se dhaka dikhne laga. Screenshot mein
     * Jakhoo ki choti safed ho gayi thi, jabki wo asal mein temple tak deodar
     * se dhaki hai.
     *
     * Is naksha par kahin bhi sthayi barf nahi hoti. Sardi ka safed
     * `weather.js` sambhalta hai (barf ke particle aur fog ka tint), vertex
     * colour nahi -- kyunki vertex colour build par ek baar bakta hai aur
     * mausam ke saath badal nahi sakta.
     */
    if (y > 2560) {
      out.lerp(_snow, Math.min(1, (y - 2560) / 140) * 0.85);
    }
    return out;
  }
}

const _rock = new THREE.Color(0.29, 0.25, 0.21);
const _snow = new THREE.Color(0.93, 0.95, 0.97);
const _tmpN = new THREE.Vector3();
