/**
 * Vicky ka portrait -- teen kone se close-up.
 *
 * Khel ke chaudi tasveeron mein kirdaar 40-50 pixel ka hota hai, aur ussey
 * ye pata hi nahi chalta ki model par kya theek hai aur kya nahi. Round 17
 * mein isi script se **teen asli keede** pakde gaye jo har purane screenshot
 * mein maujood the par dikhte nahi the:
 *
 *   1. har kirdaar 20 cm hawa mein khada tha (talwa origin se upar tha)
 *   2. sneaker ke do dher ek saath bante the -- platform heel jaisa eent
 *   3. danda ke lohe ke chhalle lathi se 30 cm door tairte the
 *
 * Sheher aur bazaar jaan-boojh kar chhupaye jaate hain: Sanjauli Chowk par
 * har kona kisi dukan ke andar padta hai. Zameen, roshni, chhaya aur post
 * waise ke waise rehte hain.
 *
 *   node web/serve.mjs &   TIER=medium node tools/tests/vicky_shots.mjs
 */
import fs from "node:fs";
import { chromium } from "playwright";
const TIER = process.env.TIER || "medium";
const TAG = process.env.TAG || "hero";
const URL = `http://localhost:8080/web/?tier=${TIER}`;
fs.mkdirSync("build/shots", { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader","--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
page.on("pageerror", e => console.log("pageerror:", e.message));
page.setDefaultTimeout(200000);
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__shimla?.ready === true, null, { timeout: 300000 });
await page.evaluate(() => window.__shimla.skipCards());
await page.waitForTimeout(1500);

const meta = await page.evaluate(() => {
  const S = window.__shimla, T = S.THREE;
  S.teleport("sanjauli_chowk");
  // ek kadam chalao taaki taangein/baazu mude hue rahein (joint yahin dikhta hai)
  const base = { forward: 0, strafe: 0, walk: 0, turn: 0, run: false, jump: false };
  S.chase._init = false;
  for (let i = 0; i < 24; i++) {
    S.player.update(0.05, { ...base, walk: 1 }, S.chase.yaw);
    S.chase.update(0.05, S.player.pos, "foot", S.player.yaw);
  }
  // pose freeze: loop player.update() ko call karta rehta hai, isse chaal
  // agle frame par idle par laut jaati hai. Method ko no-op kar dete hain.
  S.player.update = () => {};
  S.viewPOI("sanjauli_chowk", 4, 2, 0);      // debugCam on -- chase camera hataane ke liye
  let meshes = 0, tris = 0;
  S.player.mesh.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const p = o.geometry.getAttribute("position");
    tris += (o.geometry.index ? o.geometry.index.count : p.count) / 3;
  });
  /*
   * Pair zameen par hain ya nahi.
   *
   * Model ka origin `player.pos` par baithta hai (`mesh.position.copy(pos)`),
   * aur `pos.y` zameen ki oonchai hai. Isliye mesh ke bounding box ka sabse
   * neecha bindu bhi lagbhag wahi hona chahiye. Farak = kirdaar hawa mein.
   */
  S.player.mesh.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(S.player.mesh);
  const footGap = +(box.min.y - S.player.pos.y).toFixed(3);
  return { meshes, tris: Math.round(tris), footGap };
});
console.log("vicky:", JSON.stringify(meta));

// HUD hata do -- ye Vicky ka portrait hai, khel ka screenshot nahi
await page.evaluate(() => {
  for (const id of ["hud", "subtitle", "minimap", "mission", "toast", "help", "topleft", "speedo", "flash"]) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }
  /*
   * Sheher aur bazaar chhupa do.
   *
   * Sanjauli Chowk par Vicky ek dukan ke saamne khada hota hai aur 2.4 m ka
   * har kona kisi na kisi deewar ke andar padta hai -- portrait mein deewar
   * hi aati thi. Zameen, aasman, roshni aur AO waise ke waise rehte hain,
   * isliye jo dikh raha hai wo asli khel ka hi look hai.
   */
  const S = window.__shimla;
  S.city.visible = false;
  S.bazaar.visible = false;
  S.viewPOI("sanjauli_chowk", 40, 16, 1);      // debugCam on
});

const views = [
  ["saamne", 0.0, 2.3, 1.10],       // az (kirdaar ke saamne se), doori, oonchai
  ["teen-chauthai", 0.95, 2.3, 1.10],
  ["chehra", 0.30, 0.95, 1.56],
];
for (const [name, az, d, hy] of views) {
  await page.evaluate(([az, d, hy]) => {
    const S = window.__shimla;
    const p = S.player.pos;
    // Kirdaar ka aage -Z hai: yaw ke baad forward = (-sin y, -cos y).
    const y = S.player.yaw + az;
    S.camera.position.set(p.x - Math.sin(y) * d, p.y + hy, p.z - Math.cos(y) * d);
    S.camera.lookAt(p.x, p.y + (hy > 1.4 ? 1.58 : 1.02), p.z);
  }, [az, d, hy]);
  // SwiftShader ~1 fps deta hai; kam intezaar par pichhla frame hi save hota
  // hai -- pehli baar yahi hua tha
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `build/shots/${TAG}-${name}.png` });
  console.log("  ", name);
}
await browser.close();
