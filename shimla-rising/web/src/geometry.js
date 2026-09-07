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

    // Winding ka dhyan: chhat ke dono dhalan aur dono gable end alag-alag
    // disha mein mukh karte hain. Pehle ye ulte the -- normal neeche/andar ki
    // taraf, isliye slope back-face cull ho jaati thi aur deewar ka upar wala
    // mukh dikhta tha (chhat gayab lagti thi). Har face ka order yahan
    // haath se nikala gaya hai taaki normal bahar ki taraf ho.
    if (ridgeAlongX) {
      const a = V(-hx, 0, -hz), b = V(hx, 0, -hz);
      const d = V(hx, 0, hz), e = V(-hx, 0, hz);
      const r1 = V(-hx, rise, 0), r2 = V(hx, rise, 0);
      const slant = Math.hypot(hz, rise);
      this.quad(a, r1, r2, b, color, sx, slant);     // uttari dhalan
      this.quad(e, d, r2, r1, color, sx, slant);     // dakshini dhalan
      this._tri(a, e, r1, color);                    // pashchimi gable end
      this._tri(b, r2, d, color);                    // poorvi gable end
    } else {
      const a = V(-hx, 0, -hz), b = V(hx, 0, -hz);
      const d = V(hx, 0, hz), e = V(-hx, 0, hz);
      const r1 = V(0, rise, -hz), r2 = V(0, rise, hz);
      const slant = Math.hypot(hx, rise);
      this.quad(a, r1, r2, e, color, sz, slant);     // pashchimi dhalan
      this.quad(b, d, r2, r1, color, sz, slant);     // poorvi dhalan
      this._tri(a, r1, b, color);                    // uttari gable end
      this._tri(e, d, r2, color);                    // dakshini gable end
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

/**
 * Wahi `MeshBuilder`, par **jagah ke hisaab se tukdon mein**.
 *
 * Merging ne draw call to bacha liye the -- poora sheher paanch mesh mein --
 * par ek nayi museebat khadi kar di: us ek mesh ka bounding sphere **poori
 * duniya jitna bada** ho jaata hai (naapa gaya: 3,930 m). Uska matlab:
 *
 *   - wo kabhi frustum-cull nahi hoti; khiladi jidhar bhi dekhe, saare 3,594
 *     ghar draw hote hain
 *   - aur wahi geometry **shadow pass mein dobara** jaati hai, chahe shadow
 *     camera sirf 120-240 m ka box ho
 *
 * Naapa gaya nateeja: `city/trim` 394k triangle, `city/windows` 264k,
 * `roads/road-railings` 208k -- sab har frame, dono pass mein, hamesha.
 *
 * Iska hal ye hai: geometry usi tarah merged rahe, par ek nahi **kai** mesh
 * banein -- har ek apne 1 km ke khaane ka. Tab three.js ka apna frustum cull
 * kaam karne lagta hai aur shadow map sirf paas ke khaane deta hai. Draw call
 * thode badhte hain, triangle bahut kam ho jaate hain -- aur integrated GPU
 * par yahi sauda faayde ka hai.
 *
 * API bilkul `MeshBuilder` jaisi hai, isliye call site badalne ki zaroorat
 * nahi -- sirf `new MeshBuilder(u)` ki jagah `new ChunkedBuilder(u)`.
 */
export class ChunkedBuilder {
  constructor(uvScale = 0.25, cell = 1024) {
    this.uvScale = uvScale;
    this.cell = cell;
    this.chunks = new Map();
    this._count = 0;
  }

  /** Us jagah ka builder -- na ho to bana do. */
  _at(x, z) {
    const k = ((x / this.cell) | 0) * 100003 + ((z / this.cell) | 0);
    let b = this.chunks.get(k);
    if (!b) this.chunks.set(k, (b = new MeshBuilder(this.uvScale)));
    return b;
  }

  box(cx, cy, cz, sx, sy, sz, color, yaw = 0) {
    this._count++;
    this._at(cx, cz).box(cx, cy, cz, sx, sy, sz, color, yaw);
    return this;
  }

  pyramid(cx, cy, cz, base, height, color, yaw = 0) {
    this._count++;
    this._at(cx, cz).pyramid(cx, cy, cz, base, height, color, yaw);
    return this;
  }

  gableRoof(cx, cy, cz, sx, sz, rise, eave, color, yaw = 0, ridgeAlongX = true) {
    this._count++;
    this._at(cx, cz).gableRoof(cx, cy, cz, sx, sz, rise, eave, color, yaw, ridgeAlongX);
    return this;
  }

  quad(a, b, c, d, color, uw = null, uh = null) {
    this._count++;
    this._at(a.x, a.z).quad(a, b, c, d, color, uw, uh);
    return this;
  }

  quadUp(a, b, c, d, color, uw = null, uh = null) {
    this._count++;
    this._at(a.x, a.z).quadUp(a, b, c, d, color, uw, uh);
    return this;
  }

  get count() {
    let n = 0;
    for (const b of this.chunks.values()) n += b.count;
    return n;
  }

  /** Ek Group -- har khaane ka apna mesh, sab ek hi material par. */
  build(material) {
    const g = new THREE.Group();
    for (const b of this.chunks.values()) {
      if (!b.count) continue;
      g.add(b.build(material));
    }
    return g;
  }
}
