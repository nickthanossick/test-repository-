/**
 * Round ke screenshots.
 *
 * Headless mein SwiftShader ~1 fps deta hai, isliye har cheez haath se chalayi
 * jaati hai: simulation ko step karo, camera ko settle hone do, phir tasveer
 * lo. Loop ka intezaar karne se sab jama hua dikhta hai.
 *
 * **Chalne wala shot asli chase camera se hi liya jaata hai** -- haath se
 * camera rakh kar nahi. Pichhle round ki galti yahi thi: camera khud rakha
 * tha, isliye tasveer sahi lagi jabki khel mein camera bande ke saamne tha.
 *
 *   node web/serve.mjs &   node tools/tests/shots.mjs
 */
import fs from "node:fs";
import { chromium } from "playwright";

const URL = process.env.GAME_URL || "http://localhost:8080/web/";
const OUT = "build/shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.setDefaultTimeout(150000);   // SwiftShader par ek frame 30 s se zyada le sakta hai
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__shimla?.ready === true, null, { timeout: 300000 });

const shot = async (name, waitMs = 3000) => {
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("  ", name);
};

// ---- 1. pehla frame: intro card ----
await shot("r15-shuruaat");
await page.evaluate(() => window.__shimla.skipCards());
await page.waitForTimeout(1500);

/*
 * ---- 2. chalta hua Vicky, ASLI chase camera se ----
 * Agar rukh ya camera ulta hoga to yahan chehra dikhega, peeth nahi.
 */
const walk = await page.evaluate(() => {
  const S = window.__shimla, T = S.THREE;
  S.teleport("sanjauli_chowk");
  const base = { forward: 0, strafe: 0, walk: 0, turn: 0, run: false, jump: false };
  S.chase._init = false;
  for (let i = 0; i < 60; i++) {
    S.player.update(0.05, { ...base, walk: 1 }, S.chase.yaw);
    S.chase.update(0.05, S.player.pos, "foot", S.player.yaw);
  }
  const toCam = S.camera.position.clone().sub(S.player.pos); toCam.y = 0; toCam.normalize();
  S.player.mesh.updateMatrixWorld(true);
  const face = new T.Vector3(0, 0, -1)
    .applyQuaternion(S.player.mesh.getWorldQuaternion(new T.Quaternion()));
  face.y = 0; face.normalize();
  return { faceDotCam: +face.dot(toCam).toFixed(2) };   // -1 = peeth camera ki taraf (sahi)
});
console.log("   chehra-camera dot:", walk.faceDotCam, "(-1 = peeth dikhni chahiye)");
await shot("r15-chalte-hue");

// ---- 3. sadak par traffic -- naak ke bal, seedhi ----
const tr = await page.evaluate(() => {
  const S = window.__shimla;
  for (let i = 0; i < 80; i++) S.traffic.update(0.05, S.player.pos, S.camera.position);
  let best = null, bd = Infinity;
  for (const c of S.traffic.cars) {
    if (!c.lane) continue;
    const d = c.mesh.position.distanceTo(S.player.pos);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return null;
  const p = best.mesh.position;
  S.lookAt(p.x, p.y + 1.3, p.z, 13, 0.3);
  for (let i = 0; i < 4; i++) S.traffic.update(0.05, S.player.pos, S.camera.position);
  return { spec: best.spec.id, dist: +bd.toFixed(1), full: best.full.visible };
});
console.log("   traffic:", JSON.stringify(tr));
await shot("r15-traffic");

/*
 * ---- 4. gaadi kheencho: driver bahar, bhaagta hua ----
 * Camera gaadi aur bhaagte driver dono ko pakadta hai.
 */
const jack = await page.evaluate(() => {
  const S = window.__shimla;
  S.freeCamOff();
  for (let i = 0; i < 40; i++) S.traffic.update(0.05, S.player.pos, S.camera.position);
  const car = S.traffic.cars.find((c) => c.lane);
  const p = car.mesh.position.clone();
  S.player.placeAt(p.x + 1.6, p.z + 1.6);
  const mode = S.enterVehicle();
  // driver ko do second bhaagne do
  for (let i = 0; i < 40; i++) S.traffic.update(0.05, S.player.pos, S.camera.position);
  const f = S.traffic.fleeing[S.traffic.fleeing.length - 1];
  const look = f ? f.mesh.position : p;
  S.lookAt((look.x + p.x) / 2, p.y + 1.4, (look.z + p.z) / 2, 11, 0.45);
  return { mode, fleeing: S.traffic.fleeing.length, stars: S.wanted.stars,
           heat: Math.round(S.wanted.heat) };
});
console.log("   gaadi kheenchi:", JSON.stringify(jack));
await shot("r15-gaadi-cheen");

// ---- 5. campus: student slab par, hawa mein nahi ----
const campus = await page.evaluate(() => {
  const S = window.__shimla;
  S.freeCamOff();
  S.teleport("college_gate");
  for (let i = 0; i < 200; i++) S.crowd.update(0.05, S.player.pos);
  let air = 0, on = 0;
  for (const w of S.crowd.walkers) {
    if (!w.mesh.visible || !w.home) continue;
    on++;
    const P = w.mesh.position;
    if (Math.abs(P.y - S.roads.groundAt(P.x, P.z)) > 0.4
        && !S.colliders.inside(P.x, P.y - 0.25, P.z, 0.3)) air++;
  }
  S.viewPOI("college_gate", 44, 17, 1.15);
  return { campusWalkers: on, air };
});
console.log("   campus:", JSON.stringify(campus));
await shot("r15-campus");

await browser.close();
