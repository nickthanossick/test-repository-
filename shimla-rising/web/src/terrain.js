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
    const det = TEX.setRepeat(TEX.terrainDetail(), 1);
    const mat = TEX.standard(det, { vertexColors: true, roughness: 1.0 });

    for (let cz = 0; cz < chunks; cz++) {
      for (let cx = 0; cx < chunks; cx++) {
        const x0 = -this.half + cx * chunkSize;
        const z0 = -this.half + cz * chunkSize;
        group.add(this._chunk(x0, z0, chunkSize, quads, mat));
      }
    }
    return group;
  }

  _chunk(x0, z0, size, quads, mat) {
    const vn = quads + 1;
    const pos = new Float32Array(vn * vn * 3);
    const col = new Float32Array(vn * vn * 3);
    const uvs = new Float32Array(vn * vn * 2);
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

    if (t < 0.30) out.setRGB(0.075, 0.155, 0.072);        // khad -- ghana chir pine
    else if (t < 0.52) out.setRGB(0.095, 0.185, 0.085);   // dhalan -- mila jungle
    else if (t < 0.72) out.setRGB(0.125, 0.205, 0.098);   // deodar belt
    else if (t < 0.86) out.setRGB(0.205, 0.225, 0.125);   // ridge -- sookhi ghaas
    else out.setRGB(0.30, 0.295, 0.27);                 // uncha -- chattan

    if (slope > 0.55) {                                 // khadi chattan nangi hoti hai
      const k = Math.min(1, (slope - 0.55) / 0.45);
      out.lerp(_rock, k * 0.8);
    }
    if (y > 2330) {                                     // barf ki rekha
      out.lerp(_snow, Math.min(1, (y - 2330) / 110) * 0.85);
    }
    return out;
  }
}

const _rock = new THREE.Color(0.29, 0.25, 0.21);
const _snow = new THREE.Color(0.93, 0.95, 0.97);
const _tmpN = new THREE.Vector3();
