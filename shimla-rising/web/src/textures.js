import * as THREE from "three";

/**
 * Procedural PBR textures, canvas se runtime pe generate.
 *
 * Koi texture file download nahi hoti -- repo self-contained rehta hai aur
 * licensing saaf. Par flat vertex colours ki jagah ab har surface ka apna
 * albedo, normal aur roughness map hai, jisse material asli lagte hain.
 *
 * Har generator ek {map, normalMap, roughnessMap} lautaata hai, tiling ke saath.
 */

const cache = new Map();

function canvas(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function texture(cv, repeat = 1, srgb = false) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Seeded value-noise, tileable (wrap-around sampling). */
function noise2D(size, cells, seed) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(size * size);
  const sc = cells / size;
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    const fy = y * sc, y0 = Math.floor(fy), ty = sm(fy - y0);
    for (let x = 0; x < size; x++) {
      const fx = x * sc, x0 = Math.floor(fx), tx = sm(fx - x0);
      const a = g[(y0 % cells) * cells + (x0 % cells)];
      const b = g[(y0 % cells) * cells + ((x0 + 1) % cells)];
      const c = g[((y0 + 1) % cells) * cells + (x0 % cells)];
      const d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
      out[y * size + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}

/** Multi-octave fbm, tileable. */
function fbm(size, cells, octaves, seed, gain = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1, norm = 0, c = cells;
  for (let o = 0; o < octaves; o++) {
    const n = noise2D(size, c, seed + o * 7919);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    norm += amp; amp *= gain; c *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

/** Height field -> tangent-space normal map (Sobel). */
function normalMapFrom(height, size, strength = 2.2) {
  const cv = canvas(size);
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Float field -> greyscale canvas (roughness/AO ke liye). */
function grey(field, size, lo = 0, hi = 1) {
  const cv = canvas(size);
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < field.length; i++) {
    const v = Math.max(0, Math.min(255, (lo + field[i] * (hi - lo)) * 255)) | 0;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// --------------------------------------------------------------- generators

/** Deewar ka plaster -- Shimla ke ghar zyadatar rangi hui plaster ke hote hain. */
export function plaster(hex = 0xd8cdb8, seed = 11) {
  return cached(`plaster${hex}${seed}`, () => {
    const S = 256;
    const grain = fbm(S, 6, 5, seed);
    const stain = fbm(S, 2, 3, seed + 31);
    const cv = canvas(S);
    const ctx = cv.getContext("2d");
    const base = new THREE.Color(hex);
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      // barish ke daag: neeche ki taraf halka gehra
      const y = (i / S) | 0;
      const weather = 1 - Math.pow(y / S, 3) * 0.22 * (0.5 + stain[i]);
      const k = (0.86 + grain[i] * 0.28) * weather;
      img.data[i * 4] = base.r * 255 * k;
      img.data[i * 4 + 1] = base.g * 255 * k;
      img.data[i * 4 + 2] = base.b * 255 * k;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: texture(cv, 1, true),
      normalMap: texture(normalMapFrom(grain, S, 1.1)),
      roughnessMap: texture(grey(grain, S, 0.72, 0.96)),
    };
  });
}

/**
 * Naali-daar tin ki chhat.
 *
 * Shimla ki pehchaan yahi hai -- pahad pe har chhat corrugated tin ki hai,
 * laal/neeli/hari. Naaliyan normal map mein hain, isliye dhoop unpe sach
 * mein chamakti hai aur chhat flat plane nahi lagti.
 */
export function corrugatedTin(hex = 0x8c3b2e, seed = 5) {
  return cached(`tin${hex}${seed}`, () => {
    const S = 256, RIDGES = 22;
    const rust = fbm(S, 5, 4, seed);
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const wave = 0.5 + 0.5 * Math.sin((x / S) * Math.PI * 2 * RIDGES);
        h[y * S + x] = wave * 0.85 + rust[y * S + x] * 0.15;
      }
    }
    const cv = canvas(S);
    const ctx = cv.getContext("2d");
    const base = new THREE.Color(hex);
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const k = 0.72 + h[i] * 0.42;
      const r = rust[i];
      // zang -- naaliyon ke beech ki ghati mein zyada
      const rustK = Math.max(0, r - 0.62) * 1.6 * (1 - h[i]);
      img.data[i * 4] = (base.r * k + rustK * 0.32) * 255;
      img.data[i * 4 + 1] = (base.g * k + rustK * 0.14) * 255;
      img.data[i * 4 + 2] = (base.b * k + rustK * 0.05) * 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: texture(cv, 1, true),
      normalMap: texture(normalMapFrom(h, S, 3.4)),
      roughnessMap: texture(grey(rust, S, 0.34, 0.72)),
      metalness: 0.45,
    };
  });
}

/** Sadak ka asphalt -- daana, daraarein, aur ghisi hui patti. */
export function asphalt(seed = 3) {
  return cached("asphalt", () => {
    const S = 256;
    const grain = fbm(S, 96, 4, seed);
    const patch = fbm(S, 3, 3, seed + 17);
    const cv = canvas(S);
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const k = 0.46 + grain[i] * 0.10 + patch[i] * 0.06;
      img.data[i * 4] = k * 255 * 1.02;
      img.data[i * 4 + 1] = k * 255;
      img.data[i * 4 + 2] = k * 255 * 0.98;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: texture(cv, 1, true),
      normalMap: texture(normalMapFrom(grain, S, 0.22)),
      roughnessMap: texture(grey(grain, S, 0.70, 0.90)),
    };
  });
}

/** Terrain ka detail -- ghaas/mitti ka daana. Vertex colour ke upar multiply hota hai. */
export function terrainDetail(seed = 91) {
  return cached("terrainDetail", () => {
    const S = 256;
    const fine = fbm(S, 22, 5, seed);
    const clump = fbm(S, 5, 3, seed + 41);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) h[i] = fine[i] * 0.7 + clump[i] * 0.3;
    const cv = canvas(S);
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const k = 0.86 + h[i] * 0.24;               // neutral -- vertex colour rang deta hai
      img.data[i * 4] = k * 255;
      img.data[i * 4 + 1] = k * 255;
      img.data[i * 4 + 2] = k * 255 * 0.97;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: texture(cv, 1, true),
      normalMap: texture(normalMapFrom(h, S, 2.0)),
      roughnessMap: texture(grey(h, S, 0.78, 0.99)),
    };
  });
}

/** Insaani twacha -- halka subsurface-jaisa gulaabi, mahin roomiyan. */
export function skin(hex = 0xb07d55, seed = 7) {
  return cached(`skin${hex}`, () => {
    const S = 128;
    const pores = fbm(S, 34, 3, seed);
    const blotch = fbm(S, 6, 3, seed + 13);
    const cv = canvas(S);
    const ctx = cv.getContext("2d");
    const base = new THREE.Color(hex);
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const k = 0.92 + pores[i] * 0.14;
      const warm = (blotch[i] - 0.5) * 0.07;
      img.data[i * 4] = Math.min(255, (base.r + warm) * 255 * k);
      img.data[i * 4 + 1] = Math.min(255, (base.g + warm * 0.4) * 255 * k);
      img.data[i * 4 + 2] = Math.min(255, (base.b + warm * 0.2) * 255 * k);
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: texture(cv, 1, true),
      normalMap: texture(normalMapFrom(pores, S, 0.5)),
      roughnessMap: texture(grey(pores, S, 0.52, 0.74)),
    };
  });
}

/** Kapda -- twill weave (jacket, jeans). */
export function fabric(hex = 0xc8442e, seed = 23, weave = 46) {
  return cached(`fabric${hex}${seed}`, () => {
    const S = 128;
    const fuzz = fbm(S, 26, 3, seed);
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const t = Math.sin((x / S) * Math.PI * weave) * Math.sin((y / S) * Math.PI * weave);
        h[y * S + x] = 0.5 + t * 0.32 + (fuzz[y * S + x] - 0.5) * 0.36;
      }
    }
    const cv = canvas(S);
    const ctx = cv.getContext("2d");
    const base = new THREE.Color(hex);
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const k = 0.80 + h[i] * 0.34;
      img.data[i * 4] = base.r * 255 * k;
      img.data[i * 4 + 1] = base.g * 255 * k;
      img.data[i * 4 + 2] = base.b * 255 * k;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: texture(cv, 1, true),
      normalMap: texture(normalMapFrom(h, S, 1.5)),
      roughnessMap: texture(grey(h, S, 0.80, 0.98)),
    };
  });
}

/** Gaadi ka paint -- clear-coat jaisa chikna, halki orange-peel. */
export function carPaint(hex = 0xe8c33a, seed = 61) {
  return cached(`paint${hex}`, () => {
    const S = 128;
    const peel = fbm(S, 14, 3, seed);
    const cv = canvas(S);
    const ctx = cv.getContext("2d");
    const base = new THREE.Color(hex);
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const k = 0.97 + peel[i] * 0.06;
      img.data[i * 4] = Math.min(255, base.r * 255 * k);
      img.data[i * 4 + 1] = Math.min(255, base.g * 255 * k);
      img.data[i * 4 + 2] = Math.min(255, base.b * 255 * k);
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: texture(cv, 1, true),
      normalMap: texture(normalMapFrom(peel, S, 0.35)),
      roughness: 0.28,
      metalness: 0.55,
    };
  });
}

/** Deodar ki chhaal -- lambvat daraarein. */
export function bark(seed = 47) {
  return cached("bark", () => {
    const S = 128;
    const n = fbm(S, 8, 4, seed);
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const v = Math.sin((x / S) * Math.PI * 2 * 9 + n[y * S + x] * 5);
        h[y * S + x] = 0.5 + v * 0.3 + (n[y * S + x] - 0.5) * 0.4;
      }
    }
    const cv = canvas(S);
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const k = 0.42 + h[i] * 0.5;
      img.data[i * 4] = 0.36 * 255 * k;
      img.data[i * 4 + 1] = 0.27 * 255 * k;
      img.data[i * 4 + 2] = 0.20 * 255 * k;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: texture(cv, 1, true),
      normalMap: texture(normalMapFrom(h, S, 3.0)),
      roughnessMap: texture(grey(h, S, 0.82, 1.0)),
    };
  });
}

/** Deodar ki sui-daar patti -- clustered, thoda transparency ke saath. */
export function needles(seed = 83) {
  return cached("needles", () => {
    const S = 128;
    const n = fbm(S, 30, 4, seed);
    const cv = canvas(S);
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const k = 0.55 + n[i] * 0.85;
      img.data[i * 4] = 0.20 * 255 * k;
      img.data[i * 4 + 1] = 0.34 * 255 * k;
      img.data[i * 4 + 2] = 0.22 * 255 * k;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: texture(cv, 1, true),
      normalMap: texture(normalMapFrom(n, S, 2.4)),
      roughnessMap: texture(grey(n, S, 0.86, 1.0)),
    };
  });
}

/**
 * Chehre wala sir ka texture -- twacha + aankh, bhauhein, naak ki chhaya,
 * hont aur halki daadhi.
 *
 * Chehra u = 0.75 par banaya gaya hai. three ki SphereGeometry mein u = 0.75
 * theek -Z disha par aata hai, aur -Z hi character ka forward hai -- isliye
 * bina kisi rotation ke chehra saamne aa jaata hai.
 */
export function face(hex = 0xb07d55, seed = 19) {
  return cached(`face${hex}`, () => {
    const W = 512, H = 256;
    const cv = canvas(W);
    cv.height = H;
    const ctx = cv.getContext("2d");
    const base = new THREE.Color(hex);
    const rgb = (k = 1, a = 1) =>
      `rgba(${(base.r * 255 * k) | 0},${(base.g * 255 * k) | 0},${(base.b * 255 * k) | 0},${a})`;

    // twacha ka base + roomiyan
    ctx.fillStyle = rgb(1); ctx.fillRect(0, 0, W, H);
    const pores = fbm(128, 34, 3, seed);
    const img = ctx.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = 0.94 + pores[(y % 128) * 128 + (x % 128)] * 0.12;
        const i = (y * W + x) * 4;
        img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k;
      }
    }
    ctx.putImageData(img, 0, 0);

    const cx = W * 0.75;            // chehre ka केंद्र -- -Z disha
    const eyeY = H * 0.44, dx = W * 0.045;

    // aankh ka gaddha (halki chhaya)
    ctx.fillStyle = rgb(0.82, 0.5);
    for (const s2 of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s2 * dx, eyeY + 4, W * 0.036, H * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // aankh ki safedi
    ctx.fillStyle = "#efeae4";
    for (const s2 of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s2 * dx, eyeY, W * 0.028, H * 0.026, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // putli
    for (const s2 of [-1, 1]) {
      ctx.fillStyle = "#4a3521";
      ctx.beginPath(); ctx.arc(cx + s2 * dx, eyeY, H * 0.021, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#140f0a";
      ctx.beginPath(); ctx.arc(cx + s2 * dx, eyeY, H * 0.010, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.beginPath(); ctx.arc(cx + s2 * dx - 3, eyeY - 3, 2, 0, Math.PI * 2); ctx.fill();
    }
    // bhauhein
    ctx.strokeStyle = "#2a1d12"; ctx.lineWidth = H * 0.022; ctx.lineCap = "round";
    for (const s2 of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s2 * (dx - W * 0.026), eyeY - H * 0.062);
      ctx.quadraticCurveTo(cx + s2 * dx, eyeY - H * 0.085,
                           cx + s2 * (dx + W * 0.026), eyeY - H * 0.058);
      ctx.stroke();
    }
    // naak ki chhaya
    ctx.strokeStyle = rgb(0.80, 0.55); ctx.lineWidth = H * 0.012;
    ctx.beginPath();
    ctx.moveTo(cx - 2, eyeY + H * 0.02);
    ctx.lineTo(cx - 5, eyeY + H * 0.14);
    ctx.stroke();
    ctx.fillStyle = rgb(0.62, 0.45);
    for (const s2 of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s2 * W * 0.011, eyeY + H * 0.155, 2.6, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // hont
    ctx.fillStyle = "rgba(122,62,52,.72)";
    ctx.beginPath();
    ctx.ellipse(cx, eyeY + H * 0.245, W * 0.036, H * 0.026, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(70,34,28,.6)"; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.034, eyeY + H * 0.245);
    ctx.quadraticCurveTo(cx, eyeY + H * 0.258, cx + W * 0.034, eyeY + H * 0.245);
    ctx.stroke();
    // halki daadhi
    ctx.fillStyle = "rgba(38,26,17,.20)";
    ctx.beginPath();
    ctx.ellipse(cx, eyeY + H * 0.26, W * 0.075, H * 0.115, 0, 0, Math.PI * 2);
    ctx.fill();

    return {
      map: texture(cv, 1, true),
      normalMap: texture(normalMapFrom(pores, 128, 0.45)),
      roughness: 0.62,
    };
  });
}


function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

/** Texture set -> MeshStandardMaterial. */
export function standard(set, extra = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.roughnessMap,
    roughness: set.roughness ?? 1.0,
    metalness: set.metalness ?? 0.0,
    ...extra,
  });
  if (set.normalMap) m.normalScale = new THREE.Vector2(1, 1);
  return m;
}

export function setRepeat(set, r) {
  for (const k of ["map", "normalMap", "roughnessMap"]) {
    if (set[k]) set[k].repeat.set(r, r);
  }
  return set;
}
