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

    /*
     * Dhalan ko **dabao** -- 70% samtal, 30% halki pahadi.
     *
     * Nikhil (do baar): *"itna uphill mat rkh... 70% plain 30% thoda sa hill,
     * jyda ni"*. Aur ek screenshot jisme banda khadi hari dhalan ke andar ghus
     * gaya tha -- kyunki asli Shimla DEM bahut khada hai (1150 m ka farak
     * 8 km mein), aur itni dhalan par chase camera bhi pahad ke andar chala
     * jaata hai.
     *
     * Isliye har oonchai ko **naksha ke beech (town) ki oonchai** ki taraf
     * kheench lete hain, sirf `FLATTEN` hissa deviation rakhte hue. Center ki
     * oonchai wahin rehti hai (spawn/sky/fog waise ke waise), par pahad 30%
     * reh jaate hain -- khelne layak, GTA-jaisa samtal sheher, halki dhalanein.
     *
     * Ye sab kuch ke naapne se **pehle** hota hai: roads, campus, carve, mesh
     * sab isi dabi hui zameen se banti hain, isliye poori tarah consistent.
     */
    const FLATTEN = 0.30;
    const midCol = (this.size - 1) >> 1, midRow = (this.size - 1) >> 1;
    const base = this.heights[midRow * this.size + midCol];
    for (let i = 0; i < n; i++) {
      this.heights[i] = base + (this.heights[i] - base) * FLATTEN;
    }
    // `elevMin/elevMax` asli hi rehte hain: rang/banding asli oonchai se aata
    // hai (colorAt/_chunk y ko wapas khol lete hain), geometry dabi hui.
    this._flatten = FLATTEN;
    this._flattenBase = base;
  }

  /** Dabi hui oonchai ko asli oonchai mein wapas kholo (rang/banding ke liye). */
  _unflatten(y) {
    return this._flatten ? this._flattenBase + (y - this._flattenBase) / this._flatten : y;
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
   * Zameen ko **sadak tak le aao** -- cut aur fill, jaise asli pahadi sadak.
   *
   * Round 20 mein sadak ko chaudai bhar samtal kiya (theek tha -- warna dhalan
   * par tirchha plane banta). Par phir sadak ke samtal kinare aur uske neeche
   * ki apni-dhalan wali zameen ke beech 5-10 m ka gap reh jaata tha, jise
   * pathar ki oonchi deewar dhakti thi. Nikhil ne wahi "bade grey plane"
   * dekhe: *"ye sadkein itni height me kyu ki? thodi si uper rkh."*
   *
   * Asli sadak zameen ko hi kaat/bhar kar apne barabar laati hai. Yahan wahi:
   * har road segment ke corridor ke andar ke heightmap texel ko us segment ki
   * **centreline oonchai** (wahi jo `roads.groundAt()` deta hai, bas 0.5 m lift
   * ke bina) ki taraf khainch lete hain, aur ~9 m tak feather karke asli
   * terrain mein milaate hain. Nateeja: sadak par samtal bench, kinare se aage
   * narm dhalan, aur deewar sirf ek chhoti curb.
   *
   * **Kram zaroori hai** (`main.js`): ye `RoadNetwork` banne ke baad par
   * `buildMesh()` se pehle chalta hai. Road nodes apni `y` raw terrain se pehle
   * hi cache kar chuke hote hain, isliye `groundAt()`/physics bilkul nahi
   * badalte -- sirf **dikhne wali zameen** sadak se aakar milti hai.
   */
  carveToRoads(roads) {
    const S = this.size, N = S * S;
    const world = this.worldSize, half = this.half;
    const toCol = (x) => ((x + half) / world) * (S - 1);
    const colToX = (c) => (c / (S - 1)) * world - half;
    const FEATHER = 9;              // metre -- corridor se aage narm milaav
    const SHOULDER = 1.5;          // sadak ke kinare se itna aur poora samtal

    /*
     * Har texel par **sabse paas ki** sadak jeetti hai -- unke targets ka
     * ausat nahi.
     *
     * Pehli koshish mein weighted-average liya tha, aur wo toota: mod par ya do
     * sadak ke paas ek door (aur pahad par oonchi) segment feather-zone mein
     * apni oonchai jod deta tha, jisse target local sadak se **upar** chala
     * jaata. Nateeja: zameen sadak ke upar ubhar aati, khiladi usme dhas jaata,
     * camera andar -- bilkul wahi grey box jo theek karna tha. Isliye ab sabse
     * bhaari (nearest) segment ka target hi lete hain.
     */
    const bestW = new Float32Array(N);      // ab tak ka sabse bada bhaar
    const bestT = new Float32Array(N);      // us segment ka target (centreline y)

    for (const road of roads.roads) {
      const halfW = road.spec.width_m / 2 + SHOULDER;
      const reach = halfW + FEATHER;
      const pts = road.points;
      for (let s = 0; s < pts.length - 1; s++) {
        const a = pts[s], b = pts[s + 1];
        const ex = b.x - a.x, ez = b.z - a.z;
        const segLen2 = ex * ex + ez * ez || 1;
        const minX = Math.min(a.x, b.x) - reach, maxX = Math.max(a.x, b.x) + reach;
        const minZ = Math.min(a.z, b.z) - reach, maxZ = Math.max(a.z, b.z) + reach;
        let c0 = Math.floor(toCol(minX)), c1 = Math.ceil(toCol(maxX));
        let r0 = Math.floor(toCol(minZ)), r1 = Math.ceil(toCol(maxZ));
        c0 = c0 < 0 ? 0 : c0; r0 = r0 < 0 ? 0 : r0;
        c1 = c1 >= S ? S - 1 : c1; r1 = r1 >= S ? S - 1 : r1;
        for (let r = r0; r <= r1; r++) {
          const z = colToX(r);
          for (let c = c0; c <= c1; c++) {
            const x = colToX(c);
            let t = ((x - a.x) * ex + (z - a.z) * ez) / segLen2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const px = a.x + ex * t, pz = a.z + ez * t;
            const d = Math.hypot(x - px, z - pz);
            if (d >= reach) continue;
            const w = d <= halfW ? 1 : 1 - (d - halfW) / FEATHER;
            const ww = w * w * (3 - 2 * w);          // smoothstep
            const idx = r * S + c;
            if (ww > bestW[idx]) {
              bestW[idx] = ww;
              bestT[idx] = a.y + (b.y - a.y) * t;    // centreline oonchai (raw)
            }
          }
        }
      }
    }

    for (let i = 0; i < N; i++) {
      const k = bestW[i];
      if (k <= 0) continue;
      /*
       * mix(raw, target, k): k=1 (corridor) par poora sadak par, feather mein
       * narm. Kyunki target = centreline (road mesh se 0.5 m neeche), aur mix
       * kabhi target se upar nahi jaata, zameen sadak ke upar nahi ubharti --
       * bas 0.5 m ka curb dikhta hai.
       */
      this.heights[i] = this.heights[i] * (1 - k) + bestT[i] * k;
    }
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
        const dry = THREE.MathUtils.smoothstep(this._unflatten(y), 2330, 2480) * 0.75;
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
    /*
     * Rang ke liye oonchai **wapas khol lo** (un-flatten). Geometry to dabi hui
     * hai (gentle hills), par color banding asli oonchai par tikni chahiye --
     * warna sab ek hi deodar-hare band mein gir jaata aur pahad ek-rang lagta.
     * Slope wali chattan geometry ki asli (gentle) dhalan se aati hai -- wo
     * theek hai, dabi duniya mein kam chattan hi banti hai.
     */
    y = this._unflatten(y);
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
