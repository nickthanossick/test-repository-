/**
 * Quality tiers -- device dekh kar apne aap chunta hai.
 *
 * High-poly sab pe nahi chal sakta: wahi scene jo gaming laptop pe 60 fps deta
 * hai, phone pe 8 fps dega. Isliye teen preset hain aur game shuru mein khud
 * andaza lagata hai. `Q` se badla ja sakta hai, aur save mein yaad rehta hai.
 */

export const PRESETS = {
  low: {
    name: "Low",
    terrainQuads: 64,      // chunk mein quads (8x8 chunks)
    treeCount: 3500,
    windowFacades: 1,      // har ghar ki kitni deewaron pe khidkiyan
    shadowMap: 1024,
    shadowRadius: 120,
    pixelRatio: 1.0,
    detailScatter: 0,      // ghaas/chattan ka daayra, metres
    shadows: true,
  },
  medium: {
    name: "Medium",
    terrainQuads: 96,
    treeCount: 9000,
    windowFacades: 2,
    shadowMap: 2048,
    shadowRadius: 190,
    pixelRatio: 1.5,
    detailScatter: 120,
    shadows: true,
  },
  high: {
    name: "High",
    terrainQuads: 128,
    treeCount: 16000,
    windowFacades: 4,
    shadowMap: 4096,
    shadowRadius: 240,
    pixelRatio: 2.0,
    detailScatter: 200,
    shadows: true,
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

  const strong = /RTX|GTX (1[06-9]|[2-9])|Radeon RX|Apple M[1-9]|Arc A/i.test(gpu);
  if (strong && cores >= 8) return "high";
  return cores >= 8 ? "high" : "medium";
}

export function next(tier) {
  return TIERS[(TIERS.indexOf(tier) + 1) % TIERS.length];
}
