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

/**
 * Hex ke sRGB components, 0..1 mein.
 *
 * Yahan three ka Color istemaal **nahi** kar sakte. ColorManagement on hai,
 * isliye wo hex ko sRGB se *linear* convert kar deta hai.
 * Uske .r/.g/.b ko canvas pe likhne aur phir canvas ko sRGB tag karne se rang do
 * baar convert ho jaata tha -- skin 176,125,85 asal mein 110,52,23 ban ke likhta
 * tha, topi ka hara 74,93,58 se 17,27,10. Poori duniya lagbhag aadhi brightness
 * pe render ho rahi thi. Canvas khud sRGB hai, use seedhe hex ke bytes chahiye.
 *
 * Dhyan rahe: vertex colours par yeh laagu **nahi** hota. `col.setHex()` ka
 * result `color` buffer attribute mein jaata hai, aur usse three linear hi
 * expect karta hai -- wahan conversion sahi hai.
 */
function srgb(hex) {
  return { r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
}

function texture(cv, repeat = 1, isSrgb = false) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (isSrgb) t.colorSpace = THREE.SRGBColorSpace;
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
    const base = srgb(hex);
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
    const base = srgb(hex);
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
    const base = srgb(hex);
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
    const base = srgb(hex);
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
    const base = srgb(hex);
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
export function face(hex = 0xc08a5e, seed = 19) {
  return cached(`face${hex}`, () => {
    const W = 512, H = 256;
    const cv = canvas(W);
    cv.height = H;
    const ctx = cv.getContext("2d");
    const base = srgb(hex);
    const rgb = (k = 1, a = 1) =>
      `rgba(${Math.min(255, base.r * 255 * k) | 0},${Math.min(255, base.g * 255 * k) | 0},${Math.min(255, base.b * 255 * k) | 0},${a})`;

    // twacha ka base + roomiyan
    ctx.fillStyle = rgb(1); ctx.fillRect(0, 0, W, H);
    const pores = fbm(128, 40, 3, seed);
    const img = ctx.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = 0.95 + pores[(y % 128) * 128 + (x % 128)] * 0.10;
        const i = (y * W + x) * 4;
        img.data[i] *= k; img.data[i + 1] *= k * 0.995; img.data[i + 2] *= k * 0.985;
      }
    }
    ctx.putImageData(img, 0, 0);

    const cx = W * 0.75;            // chehre ka kendra -- -Z disha
    const eyeY = H * 0.44;
    // Khopdi ki geometry y mein 1.22 guna khinchi hui hai, isliye texture bhi
    // utna khinchta hai. Vertical doori pehle hi utni kam rakhte hain warna
    // aankh-naak-honth ka faasla lamba lagta hai.
    const VY = 0.82;
    const dy = (u) => eyeY + u * H * VY;
    const ex = W * 0.0445;          // aankhon ke beech aadhi doori

    // --- chehre ki shading: gaal, kanpati, jabda -------------------------
    // SA ke chehre zyadatar painted hain -- yahi unhe 3D feel deta hai.
    const shade = (x, y, rx, ry, k, a) => {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      gr.addColorStop(0, rgb(k, a)); gr.addColorStop(1, rgb(k, 0));
      ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / Math.max(rx, ry));
      ctx.fillStyle = gr; ctx.beginPath();
      ctx.arc(0, 0, Math.max(rx, ry), 0, Math.PI * 2); ctx.fill(); ctx.restore();
    };
    for (const s2 of [-1, 1]) {
      shade(cx + s2 * W * 0.092, dy(0.060), W * 0.055, H * 0.115, 0.84, 0.38); // kanpati
      shade(cx + s2 * W * 0.058, dy(0.100), W * 0.045, H * 0.070, 1.10, 0.26); // gaal ki haddi
    }
    shade(cx, dy(-0.175), W * 0.062, H * 0.080, 1.09, 0.30);                   // maatha
    // naak ki haddi pe ujaala -- isse naak saamne se bhi ubhri lagti hai
    shade(cx, dy(0.070), W * 0.012, H * 0.075, 1.13, 0.42);

    // --- aankhein: chhoti, badaam jaisi ----------------------------------
    for (const s2 of [-1, 1]) {
      const x = cx + s2 * ex, y = dy(0);
      // gaddha
      shade(x, y + 2, W * 0.033, H * 0.045, 0.76, 0.60);
      // safedi -- sirf utni jitni asli aankh mein dikhti hai
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x, y, W * 0.0225, H * 0.0175, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#d8d0c6"; ctx.fillRect(x - 20, y - 20, 40, 40);
      // putli
      ctx.fillStyle = "#4b3520";                 // bhoori putli
      ctx.beginPath(); ctx.arc(x, y + 1, H * 0.0165, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#100c07";
      ctx.beginPath(); ctx.arc(x, y + 1, H * 0.0072, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.beginPath(); ctx.arc(x - 2.5, y - 2.5, 1.7, 0, Math.PI * 2); ctx.fill();
      // upar ki palak ki chhaya
      ctx.fillStyle = "rgba(58,38,22,.55)";
      ctx.fillRect(x - 20, y - 20, 40, 20 - H * 0.006);
      ctx.restore();
      // palak ki rekha
      ctx.strokeStyle = "rgba(34,22,13,.85)"; ctx.lineWidth = 2.0; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - W * 0.0235, y - H * 0.001);
      ctx.quadraticCurveTo(x, y - H * 0.021, x + W * 0.0235, y - H * 0.002);
      ctx.stroke();
      // nichli palak
      ctx.strokeStyle = rgb(0.78, 0.5); ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x - W * 0.020, y + H * 0.016);
      ctx.quadraticCurveTo(x, y + H * 0.024, x + W * 0.020, y + H * 0.015);
      ctx.stroke();
    }

    // --- bhauhein: moti, koney pe neeche ----------------------------------
    for (const s2 of [-1, 1]) {
      ctx.fillStyle = "#241a10";
      ctx.beginPath();
      const bx = cx + s2 * ex, by = dy(-0.052);
      ctx.moveTo(bx - s2 * W * 0.030, by + H * 0.012);
      ctx.quadraticCurveTo(bx, by - H * 0.014, bx + s2 * W * 0.026, by + H * 0.002);
      ctx.quadraticCurveTo(bx, by + H * 0.002, bx - s2 * W * 0.030, by + H * 0.020);
      ctx.fill();
    }

    // --- naak: dono taraf chhaya, neeche nathune --------------------------
    for (const s2 of [-1, 1]) {
      ctx.strokeStyle = rgb(0.74, 0.42); ctx.lineWidth = H * 0.014; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx + s2 * W * 0.014, dy(0.030));
      ctx.quadraticCurveTo(cx + s2 * W * 0.021, dy(0.120), cx + s2 * W * 0.016, dy(0.160));
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(48,30,18,.62)";
    for (const s2 of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s2 * W * 0.0135, dy(0.168), 2.9, 1.9, s2 * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    shade(cx, dy(0.185), W * 0.030, H * 0.020, 0.80, 0.45);      // naak ke neeche

    // --- moochh: SA ke ped ki sabse badi pehchan -------------------------
    // Patli aur chaudi, honth ko chhue bina. Pehle ye moti kaali thi aur
    // 3D mein khule mooh jaisi dikhti thi.
    ctx.fillStyle = "#33241a";
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.046, dy(0.208));
    ctx.quadraticCurveTo(cx, dy(0.194), cx + W * 0.046, dy(0.208));
    ctx.quadraticCurveTo(cx + W * 0.028, dy(0.228), cx, dy(0.220));
    ctx.quadraticCurveTo(cx - W * 0.028, dy(0.228), cx - W * 0.046, dy(0.208));
    ctx.fill();

    // --- hont: halke, sirf rekha aur thoda rang --------------------------
    ctx.fillStyle = "rgba(146,90,74,.34)";
    ctx.beginPath();
    ctx.ellipse(cx, dy(0.278), W * 0.032, H * 0.016, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(70,40,28,.62)"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.031, dy(0.276));
    ctx.quadraticCurveTo(cx, dy(0.286), cx + W * 0.031, dy(0.276));
    ctx.stroke();

    // Jabde pe daadhi ka patch jaan-boojh kar nahi hai: ellipse chehre ke
    // curve pe daag jaisa dikhta tha. Halki chhaya hi kaafi hai.
    shade(cx, dy(0.330), W * 0.055, H * 0.045, 0.88, 0.30);

    return {
      map: texture(cv, 1, true),
      normalMap: texture(normalMapFrom(pores, 128, 0.35)),
      roughness: 0.60,
    };
  });
}

/**
 * Naam ka board -- canvas pe text draw karke.
 *
 * Yahi wo cheez hai jo ek jagah ko *pehchana* banati hai. Bina board ke
 * "Sanjauli Chowk" aur "Kasumpti Market" bilkul ek jaise dikhte hain; board
 * lagte hi khiladi ko pata chalta hai wo kahan khada hai.
 *
 * kind: "shop"  -- dukan ka rangeen board (raat ko halka jagmagata hai)
 *       "stone" -- sansthaan ki utkirn pathar wali plate
 *       "road"  -- HP ka hara sadak board
 */
export function signboard(text, sub = "", kind = "shop", seed = 0) {
  return cached(`sign:${kind}:${text}:${sub}`, () => {
    const W = 1024, H = 256;
    const cv = canvas(W);
    cv.height = H;
    const ctx = cv.getContext("2d");

    const PALETTE = {
      shop:  { bg: "#1d3f5c", fg: "#f4e9cf", accent: "#e8c33a", border: "#e8c33a" },
      stone: { bg: "#9a938a", fg: "#2c2721", accent: "#4a4239", border: "#7b746b" },
      road:  { bg: "#14663d", fg: "#ffffff", accent: "#ffffff", border: "#ffffff" },
    };
    const pal = PALETTE[kind] || PALETTE.shop;

    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    // halka daana taaki board flat na lage
    const n = fbm(64, 12, 3, seed + 5);
    const img = ctx.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = 0.93 + n[(y % 64) * 64 + (x % 64)] * 0.14;
        const i = (y * W + x) * 4;
        img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k;
      }
    }
    ctx.putImageData(img, 0, 0);

    ctx.strokeStyle = pal.border;
    ctx.lineWidth = kind === "road" ? 8 : 6;
    ctx.strokeRect(14, 14, W - 28, H - 28);

    // Font stack fallback ke saath: agar webfont load na hua ho to bhi kuch
    // padhne layak bane. main.js sign textures document.fonts.ready ke baad
    // banata hai, isliye aam taur pe Plex hi milta hai.
    const family = '"IBM Plex Sans Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = pal.fg;

    // text ko board mein fit karo
    let size = sub ? 92 : 108;
    do {
      ctx.font = `700 ${size}px ${family}`;
      if (ctx.measureText(text).width <= W - 90) break;
      size -= 4;
    } while (size > 30);
    ctx.fillText(text, W / 2, sub ? H * 0.40 : H * 0.5);

    if (sub) {
      ctx.fillStyle = pal.accent;
      let ss = 44;
      do {
        ctx.font = `500 ${ss}px ${family}`;
        if (ctx.measureText(sub).width <= W - 120) break;
        ss -= 2;
      } while (ss > 16);
      ctx.fillText(sub, W / 2, H * 0.70);
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W * 0.33, H * 0.555);
      ctx.lineTo(W * 0.67, H * 0.555);
      ctx.stroke();
    }

    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return {
      map: t,
      roughness: kind === "stone" ? 0.92 : 0.42,
      metalness: kind === "stone" ? 0.0 : 0.15,
      emissiveMap: kind === "shop" ? t : null,   // raat ko jagmagane ke liye
    };
  });
}

/**
 * Himachali topi ka kapda -- gehre rang ki oon, aur aage alag rang ka velvet band.
 * Ye ek hi cheez poore sheher ko turant Himachal jaisa bana deti hai.
 */
export function topi(bodyHex = 0x4a5d3a, bandHex = 0x8c2f2f, seed = 29) {
  return cached(`topi${bodyHex}${bandHex}`, () => {
    const S = 128;
    const wool = fbm(S, 30, 3, seed);
    const cv = canvas(S);
    const ctx = cv.getContext("2d");
    const body = srgb(bodyHex);
    const band = srgb(bandHex);
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        // neeche ka ~32% velvet band hai (topi ke aage wala patta), baaki oon.
        // Cylinder ki uv.y neeche 0 se upar 1 jaati hai aur texture flipY hai,
        // isliye canvas ki aakhri rows topi ke *nichle* kinare pe aati hain.
        const c = y > S * 0.68 ? band : body;
        const k = 0.86 + wool[i] * 0.26;
        img.data[i * 4] = c.r * 255 * k;
        img.data[i * 4 + 1] = c.g * 255 * k;
        img.data[i * 4 + 2] = c.b * 255 * k;
        img.data[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: texture(cv, 1, true),
      normalMap: texture(normalMapFrom(wool, S, 1.2)),
      roughnessMap: texture(grey(wool, S, 0.86, 0.99)),
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
