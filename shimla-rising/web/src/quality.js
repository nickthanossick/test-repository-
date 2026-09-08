/**
 * Quality tiers -- device dekh kar apne aap chunta hai.
 *
 * High-poly sab pe nahi chal sakta: wahi scene jo gaming laptop pe 60 fps deta
 * hai, phone pe 8 fps dega. Isliye teen preset hain aur game shuru mein khud
 * andaza lagata hai. `Q` se badla ja sakta hai, aur save mein yaad rehta hai.
 */

/*
 * `treeCount` round 16 mein teen guna hua.
 *
 * Pehle har ped har doori par poora 72-triangle ka tha, isliye ginti hi
 * budget thi. Ab 240 m ke aage wo ek 12-triangle ka cone ban jaata hai
 * (`city.js` ka forest LOD), yaani door ke hazaron ped utne hi mehnge hain
 * jitne pehle saikdon. Shimla ki dhalan ghane deodar se dhaki hai -- 3,500
 * ped us 8 km ke naksha par gine-chune dikhte the.
 */
export const PRESETS = {
  low: {
    name: "Low",
    terrainQuads: 64,      // chunk mein quads (8x8 chunks)
    treeCount: 9000,
    windowFacades: 1,      // har ghar ki kitni deewaron pe khidkiyan
    shadowMap: 1024,
    shadowRadius: 120,
    pixelRatio: 1.0,
    detailScatter: 0,      // ghaas/chattan ka daayra, metres
    shadows: true,
    post: null,            // koi post-processing nahi -- sabse halka
    crowd: { keepers: 20, walkers: 14, dogs: 2, cows: 1, monkeys: 1 },
    buses: 3,
    traffic: 8,            // sadak par chalti gaadiyan
  },
  medium: {
    name: "Medium",
    terrainQuads: 96,
    treeCount: 20000,
    windowFacades: 2,
    shadowMap: 2048,
    shadowRadius: 190,
    /*
     * pixelRatio 1.5 se 1.25.
     *
     * Ye seedha fill-rate hai: 1.5 matlab 2.25 guna pixel, 2.0 matlab chaar
     * guna. Integrated GPU par yahi sabse pehle ghutta hai, aur 1.25 aur 1.5
     * ka farak aankh ko mushkil se dikhta hai -- FPS ko saaf dikhta hai.
     */
    pixelRatio: 1.25,
    detailScatter: 120,
    shadows: true,
    post: { ao: true, aoScale: 0.5, bloom: false, samples: 4 },
    crowd: { keepers: 42, walkers: 28, dogs: 3, cows: 2, monkeys: 2 },
    buses: 5,
    traffic: 12,
  },
  high: {
    name: "High",
    terrainQuads: 128,
    treeCount: 34000,
    windowFacades: 4,
    shadowMap: 4096,
    shadowRadius: 240,
    pixelRatio: 1.5,
    detailScatter: 200,
    shadows: true,
    post: { ao: true, aoScale: 0.5, bloom: true, samples: 4 },
    crowd: { keepers: 72, walkers: 48, dogs: 4, cows: 3, monkeys: 4 },
    buses: 8,
    traffic: 16,
  },
};

export const TIERS = ["low", "medium", "high"];

/**
 * GPU, core count aur device type dekh kar tier chuno.
 *
 * WEBGL_debug_renderer_info har browser nahi deta (privacy), isliye ye ek
 * andaza hai, guarantee nahi -- khiladi `Q` se hamesha badal sakta hai.
 */
export function detect(renderer) {
  const ua = navigator.userAgent || "";
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;

  let gpu = "";
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "");
  } catch { /* browser ne mana kar diya -- koi baat nahi */ }

  // software renderer: har haal mein sabse halka
  if (/SwiftShader|llvmpipe|Software|Microsoft Basic/i.test(gpu)) return "low";
  if (mobile) return cores >= 8 && mem >= 6 ? "medium" : "low";
  if (cores <= 4 || mem <= 4) return "low";

  /*
   * GPU dekho -- core count nahi.
   *
   * Yahan pehle bas `cores >= 8 ? "high" : "medium"` tha, yaani **GPU ka naam
   * padha hi nahi jaata tha**. Aaj ke aam i5/i7 laptop mein 8-12 logical core
   * hote hain aur GPU Intel Iris Xe. Nateeja: aise har laptop ko `high` mil
   * raha tha -- pixelRatio 2.0 (HiDPI screen par chaar guna pixel), 4096 ka
   * shadow map, 34,000 ped, aur terrain akela 2.1 M triangle. Integrated
   * graphics par ye bahut zyada hai.
   *
   * Nikhil isi par khelta hai, aur "abhi it lags" ki shikayat ki asli wajah
   * shayad yahi thi. (Mera apna naap `low` par hota hai, kyunki headless
   * SwiftShader upar wali line se hamesha `low` deta hai -- isliye ye load
   * maine kabhi dekha hi nahi tha.)
   */
  const integrated = /Intel|UHD|HD Graphics|Iris|Radeon(?!.*\bRX\b).*Graphics|Vega|Adreno|Mali|PowerVR|llvmpipe/i
    .test(gpu);
  const discrete = /RTX|GTX (1[06-9]|[2-9])|Radeon RX|Apple M[1-9]|Arc A|Quadro|Titan/i.test(gpu);

  if (discrete && cores >= 8) return "high";
  if (integrated) return "medium";        // chahe 16 core hon -- GPU hi seema hai
  /*
   * GPU ka naam mila hi nahi (browser privacy ke chalte aksar nahi milta).
   *
   * Aise mein `high` maan lena khatarnaak hai: galat hue to khel atakta hai
   * aur khiladi ko pata bhi nahi chalta ki kyun. `medium` galat hua to sirf
   * thoda kam sundar dikhta hai, aur `Q` se badla ja sakta hai. Isliye shak
   * ka faayda hamesha halke tier ko.
   */
  return "medium";
}

export function next(tier) {
  return TIERS[(TIERS.indexOf(tier) + 1) % TIERS.length];
}
