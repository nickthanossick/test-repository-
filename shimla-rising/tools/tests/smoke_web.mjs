// Web game ka smoke test: boot karo, zero console/page errors assert karo,
// aur ye check karo ki duniya sach mein bani (imaaratein, ped, sadkein).
//
// CI mein chalta hai. Locally:  node web/serve.mjs & node tools/tests/smoke_web.mjs
import { chromium } from "playwright";

const URL = process.env.GAME_URL || "http://localhost:8080/web/";
const errors = [];
const pageErrors = [];

const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => pageErrors.push(e.message));

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
// waitForFunction(fn, arg, options) -- teesra argument hi options hai.
// Dusre pe dene se timeout chup-chaap default 30 s reh jaata tha, jo
// software rendering (SwiftShader) pe boot ke liye kaafi nahi hai.
await page.waitForFunction(() => window.__shimla?.ready === true, null, { timeout: 300000 });
await page.waitForTimeout(2000);

const s = await page.evaluate(() => window.__shimla.stats);
console.log("stats:", JSON.stringify(s));

/*
 * Texture ka colour-space check.
 *
 * `new THREE.Color(hex)` ColorManagement ke saath hex ko sRGB se linear convert
 * karta hai. Wo value canvas pe likh kar canvas ko sRGB tag karne se conversion
 * do baar ho jaata tha aur poori duniya lagbhag aadhi brightness pe render hoti
 * thi (skin 192,138,94 asal mein 110,52,23 likhta tha). Yahan asli generated
 * texture ka pixel padh kar dekhte hain ki wo intended hex ke aas-paas hai.
 */
const SKIN_HEX = 0xc08a5e;
const skin = await page.evaluate(() => {
  const img = window.__shimla.player.mesh.children
    .map((c) => c.material?.map?.image)
    .find((m) => m && m.width === 512 && m.height === 256);
  if (!img) return null;
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext("2d");
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(24, 24, 1, 1).data;   // gaal se door, saada twacha
  return [d[0], d[1], d[2]];
});
const want = [(SKIN_HEX >> 16) & 255, (SKIN_HEX >> 8) & 255, SKIN_HEX & 255];
// generator har pixel pe +-8% ka daana daalta hai, isliye 22 ki chhoot
const skinOk = skin !== null && skin.every((v, i) => Math.abs(v - want[i]) <= 22);
console.log("skin pixel:", JSON.stringify(skin), "chaha:", JSON.stringify(want));

/*
 * Gaadi ka rang.
 *
 * `data/vehicles.json` rang string mein deta hai ("#1e6f4a"), aur `carPaint()`
 * seedha bitwise karta tha -- `"#1e6f4a" >> 16` = 0. Nateeja: game ki har
 * gaadi aur har bus kaali. Yahan asli paint texture ka pixel padh kar dekhte
 * hain ki HRTC bus wakai hari hai.
 */
const paint = await page.evaluate(() => {
  const S = window.__shimla;
  const spec = S.data.vehicleById.get("hrtc_bus");
  const bus = S.buses.buses.find((b) => b.spec.id === "hrtc_bus");
  const src = bus || S.parked.find((v) => v.spec?.id === "hrtc_bus");
  let img = null;
  (src?.mesh || S.parked[0]?.mesh)?.traverse((o) => {
    const m = o.material?.map?.image;
    if (!img && m && m.width === 128 && m.height === 128) img = m;
  });
  if (!img) return null;
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  cv.getContext("2d").drawImage(img, 0, 0);
  const d = cv.getContext("2d").getImageData(40, 40, 1, 1).data;
  return { px: [d[0], d[1], d[2]], want: spec.color };
});
let paintOk = false;
if (paint) {
  const h = parseInt(paint.want.replace("#", ""), 16);
  const w = [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  paintOk = paint.px.every((v, i) => Math.abs(v - w[i]) <= 22);
  console.log("paint pixel:", JSON.stringify(paint.px), "chaha:", JSON.stringify(w));
}

const checks = [
  ["console errors", errors.length === 0, errors.slice(0, 3).join(" | ")],
  ["page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | ")],
  ["buildings built", s.buildings > 500, s.buildings],
  ["trees built", s.trees > 3000, s.trees],
  ["roads built", s.roadKm > 20, s.roadKm],
  ["vehicles spawned", s.vehicles >= 10, s.vehicles],
  ["geometry rendered", s.triangles > 100000, s.triangles],
  ["texture colour-space", skinOk, `${JSON.stringify(skin)} != ${JSON.stringify(want)}`],
  ["gaadi ka rang", paintOk, JSON.stringify(paint)],
];

let failed = 0;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok ? "" : `  -> ${detail}`}`);
  if (!ok) failed++;
}
await browser.close();
process.exit(failed ? 1 : 0);
