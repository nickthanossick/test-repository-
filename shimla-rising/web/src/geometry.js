import * as THREE from "three";

/**
 * Chhota non-indexed mesh builder.
 *
 * Saari buildings/props ek hi merged BufferGeometry mein daal dete hain --
 * 2000 alag Mesh objects ke bajaye 2-3 draw calls. Non-indexed isliye ki
 * flat shading ko har face ke apne vertices chahiye, aur game ka art style
 * flat-shaded low-poly hai.
 */
export class MeshBuilder {
  constructor() { this.pos = []; this.col = []; }

  /** Axis-aligned box, center (cx,cy,cz) aur size (sx,sy,sz), optional yaw. */
  box(cx, cy, cz, sx, sy, sz, color, yaw = 0) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const v = (x, y, z) => [cx + x * c - z * s, cy + y, cz + x * s + z * c];
    const p = [
      v(-hx, -hy, -hz), v(hx, -hy, -hz), v(hx, hy, -hz), v(-hx, hy, -hz),
      v(-hx, -hy, hz), v(hx, -hy, hz), v(hx, hy, hz), v(-hx, hy, hz),
    ];
    // faces: -z, +z, -x, +x, +y, -y   (CCW dekhne pe bahar se)
    const F = [[1,0,3,1,3,2],[4,5,6,4,6,7],[0,4,7,0,7,3],[5,1,2,5,2,6],[3,7,6,3,6,2],[0,1,5,0,5,4]];
    const shade = [0.88, 0.88, 0.78, 0.97, 1.0, 0.70];   // fake AO -- har face ka apna tone
    for (let f = 0; f < 6; f++) {
      const k = shade[f];
      for (const i of F[f]) {
        this.pos.push(p[i][0], p[i][1], p[i][2]);
        this.col.push(color.r * k, color.g * k, color.b * k);
      }
    }
    return this;
  }

  /** Chaar-phalak wala pyramid -- chhat aur deodar ke liye. */
  pyramid(cx, cy, cz, base, height, color, yaw = 0) {
    const h = base / 2;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const v = (x, y, z) => [cx + x * c - z * s, cy + y, cz + x * s + z * c];
    const b = [v(-h, 0, -h), v(h, 0, -h), v(h, 0, h), v(-h, 0, h)];
    const apex = v(0, height, 0);
    const shade = [1.0, 0.82, 0.9, 0.72];
    for (let i = 0; i < 4; i++) {
      const p0 = b[i], p1 = b[(i + 1) % 4], k = shade[i];
      for (const q of [p0, p1, apex]) {
        this.pos.push(q[0], q[1], q[2]);
        this.col.push(color.r * k, color.g * k, color.b * k);
      }
    }
    return this;
  }

  /** Do triangle ka quad, koi bhi 4 corners. */
  quad(a, b, c, d, color) {
    for (const q of [a, b, c, a, c, d]) {
      this.pos.push(q.x, q.y, q.z);
      this.col.push(color.r, color.g, color.b);
    }
    return this;
  }

  /**
   * Zameen-jaisa quad jiska normal hamesha upar ki taraf ho.
   *
   * Sadak ke ribbon ke liye winding ka sign road ki disha pe nirbhar karta hai,
   * to haath se likhne pe aadhi sadkein ulti ho jaati hain -- normal neeche,
   * back-face cull, aur sadak gayab. Yahan normal ka Y check karke zaroorat pade
   * to order palat dete hain.
   */
  quadUp(a, b, c, d, color) {
    const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    return ny > 0 ? this.quad(a, b, c, d, color) : this.quad(a, d, c, b, color);
  }

  get count() { return this.pos.length / 3; }

  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}
