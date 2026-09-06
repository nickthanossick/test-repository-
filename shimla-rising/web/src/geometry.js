import * as THREE from "three";

/**
 * Chhota non-indexed mesh builder, UV support ke saath.
 *
 * Saari buildings/props ek merged BufferGeometry mein jaate hain -- 2700 alag
 * Mesh objects ke bajaye teen-chaar draw calls. Non-indexed isliye ki har face
 * ka apna normal aur UV chahiye.
 *
 * UVs **world-size ke hisaab se** bante hain (tiles per metre), face ke local
 * 0..1 ke bajaye. Iska matlab ek 4 m ki deewar aur ek 12 m ki deewar pe eent
 * ka size ek jaisa dikhta hai -- warna bade faces pe texture khinch jaata hai.
 */
export class MeshBuilder {
  constructor(uvScale = 0.25) {
    this.pos = [];
    this.col = [];
    this.uv = [];
    this.uvScale = uvScale;          // tiles per metre
  }

  _push(p, c, u, v) {
    this.pos.push(p[0], p[1], p[2]);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, v);
  }

  /** Axis-aligned box, center (cx,cy,cz), size (sx,sy,sz), optional yaw. */
  box(cx, cy, cz, sx, sy, sz, color, yaw = 0) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const v = (x, y, z) => [cx + x * c - z * s, cy + y, cz + x * s + z * c];
    const p = [
      v(-hx, -hy, -hz), v(hx, -hy, -hz), v(hx, hy, -hz), v(-hx, hy, -hz),
      v(-hx, -hy, hz), v(hx, -hy, hz), v(hx, hy, hz), v(-hx, hy, hz),
    ];
    // faces: -z, +z, -x, +x, +y, -y  (CCW bahar se dekhne pe)
    const F = [[1,0,3,1,3,2],[4,5,6,4,6,7],[0,4,7,0,7,3],[5,1,2,5,2,6],[3,7,6,3,6,2],[0,1,5,0,5,4]];
    // har face ke liye (chaudai, oonchai) world metres mein -- UV isse aate hain
    const D = [[sx, sy], [sx, sy], [sz, sy], [sz, sy], [sx, sz], [sx, sz]];
    // face ke andar UV corners, F ki vertex order se match karte hue
    const UV = [
      [[1,0],[0,0],[0,1],[1,0],[0,1],[1,1]],
      [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]],
      [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]],
      [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]],
      [[0,0],[0,1],[1,1],[0,0],[1,1],[1,0]],
      [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]],
    ];
    // nakli AO -- har mukh ka apna tone, isse box flat nahi lagta
    const shade = [0.90, 0.90, 0.82, 0.98, 1.0, 0.74];
    const k = this.uvScale;
    for (let f = 0; f < 6; f++) {
      const sh = shade[f];
      const [uw, uh] = D[f];
      const tone = { r: color.r * sh, g: color.g * sh, b: color.b * sh };
      for (let i = 0; i < 6; i++) {
        const [uu, vv] = UV[f][i];
        this._push(p[F[f][i]], tone, uu * uw * k, vv * uh * k);
      }
    }
    return this;
  }

  /** Chaar-phalak pyramid -- chhat aur deodar ke liye. */
  pyramid(cx, cy, cz, base, height, color, yaw = 0) {
    const h = base / 2;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const v = (x, y, z) => [cx + x * c - z * s, cy + y, cz + x * s + z * c];
    const b = [v(-h, 0, -h), v(h, 0, -h), v(h, 0, h), v(-h, 0, h)];
    const apex = v(0, height, 0);
    const shade = [1.0, 0.86, 0.93, 0.78];
    const k = this.uvScale;
    const slant = Math.hypot(h, height);
    for (let i = 0; i < 4; i++) {
      const sh = shade[i];
      const tone = { r: color.r * sh, g: color.g * sh, b: color.b * sh };
      this._push(b[i], tone, 0, 0);
      this._push(b[(i + 1) % 4], tone, base * k, 0);
      this._push(apex, tone, base * k * 0.5, slant * k);
    }
    return this;
  }

  /** Do triangle ka quad. uw/uh world metres mein, UV tiling ke liye. */
  quad(a, b, c, d, color, uw = null, uh = null) {
    const k = this.uvScale;
    const U = uw ?? a.distanceTo(b);
    const V = uh ?? b.distanceTo(c);
    const uvs = [[0,0],[U*k,0],[U*k,V*k],[0,0],[U*k,V*k],[0,V*k]];
    const pts = [a, b, c, a, c, d];
    for (let i = 0; i < 6; i++) {
      this._push([pts[i].x, pts[i].y, pts[i].z], color, uvs[i][0], uvs[i][1]);
    }
    return this;
  }

  /**
   * Zameen-jaisa quad jiska normal hamesha upar ki taraf ho.
   *
   * Sadak ke ribbon ke liye winding ka sign road ki disha pe nirbhar karta hai,
   * to haath se likhne pe aadhi sadkein ulti ho jaati hain -- normal neeche,
   * back-face cull, aur sadak gayab.
   */
  quadUp(a, b, c, d, color, uw = null, uh = null) {
    const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    return ny > 0 ? this.quad(a, b, c, d, color, uw, uh)
                  : this.quad(a, d, c, b, color, uw, uh);
  }

  /**
   * Gable (do-dhalan) chhat, bahar nikle hue eaves ke saath.
   *
   * Shimla ki chhat pyramid nahi hoti -- ek ridge hoti hai aur do dhalanein,
   * aur eaves deewar se ~0.5 m bahar nikalte hain taaki barish/barf deewar pe
   * na gire. Yahi silhouette sheher ko pehchan deta hai.
   *
   * @param ridgeAlongX true = ridge X ke saath (gable ends +Z/-Z par)
   */
  gableRoof(cx, cy, cz, sx, sz, rise, eave, color, yaw = 0, ridgeAlongX = true) {
    const hx = sx / 2 + eave, hz = sz / 2 + eave;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const V = (x, y, z) => new THREE.Vector3(cx + x * c - z * s, cy + y, cz + x * s + z * c);

    if (ridgeAlongX) {
      const a = V(-hx, 0, -hz), b = V(hx, 0, -hz);
      const d = V(hx, 0, hz), e = V(-hx, 0, hz);
      const r1 = V(-hx, rise, 0), r2 = V(hx, rise, 0);
      this.quad(a, b, r2, r1, color, sx, Math.hypot(hz, rise));   // uttari dhalan
      this.quad(e, r1, r2, d, color, sx, Math.hypot(hz, rise));   // dakshini dhalan
      this._tri(a, r1, e, color);                                  // gable end
      this._tri(b, d, r2, color);
    } else {
      const a = V(-hx, 0, -hz), b = V(hx, 0, -hz);
      const d = V(hx, 0, hz), e = V(-hx, 0, hz);
      const r1 = V(0, rise, -hz), r2 = V(0, rise, hz);
      this.quad(a, r1, r2, e, color, sz, Math.hypot(hx, rise));
      this.quad(b, d, r2, r1, color, sz, Math.hypot(hx, rise));
      this._tri(a, e, r2, color);
      this._tri(b, r1, d, color);
    }
    return this;
  }

  /** Ek triangle, flat UV. gableRoof ke gable ends ke liye. */
  _tri(a, b, c, color) {
    const k = this.uvScale;
    const w = a.distanceTo(b) * k, h = a.distanceTo(c) * k;
    this._push([a.x, a.y, a.z], color, 0, 0);
    this._push([b.x, b.y, b.z], color, w, 0);
    this._push([c.x, c.y, c.z], color, w * 0.5, h);
    return this;
  }

  get count() { return this.pos.length / 3; }

  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}
