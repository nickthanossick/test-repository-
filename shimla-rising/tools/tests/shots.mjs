/**
 * Round ke screenshots.
 *
 * Headless mein SwiftShader ~1 fps deta hai, isliye har cheez haath se chalayi
 * jaati hai: simulation ko step karo, camera khud rakho, phir do-teen frame
 * ruk kar tasveer lo. Loop ka intezaar karne se sab jama hua dikhta hai.
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
// SwiftShader par ek raat ka frame 30 s se zyada le sakta hai
page.setDefaultTimeout(150000);
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__shimla?.ready === true, null, { timeout: 300000 });

const shot = async (name, waitMs = 2600) => {
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("  ", name);
};

// ---- 1. pehla frame: college + intro card (khel jaisa shuru hota hai) ----
await shot("r14-shuruaat");

// baaki shots ke liye card hata do -- warna duniya ruki rehti hai
await page.evaluate(() => window.__shimla.skipCards());
await page.waitForTimeout(1500);

// ---- 2. college gate: khel yahin se shuru hota hai ----
await page.evaluate(() => {
  const S = window.__shimla;
  S.teleport("college_gate");
  S.viewPOI("college_gate", 46, 20, 1.1);
});
await shot("r14-college");

// ---- 3. peeche se chalta Vicky -- chehra aage hona chahiye ----
const facing = await page.evaluate(() => {
  const S = window.__shimla;
  const base = { forward: 0, strafe: 0, walk: 0, turn: 0, run: false, jump: false };
  S.player.yaw = 0;
  for (let i = 0; i < 40; i++) S.player.update(0.05, { ...base, walk: 1 }, S.chase.yaw);
  const p = S.player.pos;
  S.player.mesh.updateMatrixWorld(true);
  const f = new S.THREE.Vector3(0, 0, -1)
    .applyQuaternion(S.player.mesh.getWorldQuaternion(new S.THREE.Quaternion()));
  // camera peeche: chalne ki disha ke ulat
  S.lookAt(p.x, p.y + 1.05, p.z, 4.2, 0.35, Math.atan2(-f.x, -f.z));
  return { fx: +f.x.toFixed(2), fz: +f.z.toFixed(2) };
});
console.log("   forward:", JSON.stringify(facing));
await shot("r14-vicky-peeche");

// ---- 4. sadak par gaadiyan ----
const near = await page.evaluate(() => {
  const S = window.__shimla;
  // pehle traffic ko thoda chalao, phir sabse paas ki gaadi par camera
  for (let i = 0; i < 60; i++) S.traffic.update(0.05, S.player.pos);
  let best = null, bd = Infinity;
  for (const c of S.traffic.cars) {
    if (!c.lane) continue;
    const d = c.mesh.position.distanceTo(S.player.pos);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return null;
  const p = best.mesh.position;
  S.lookAt(p.x, p.y + 1.2, p.z, 16, 0.35);
  return { spec: best.spec.id, dist: +bd.toFixed(1), speed: +best.speed.toFixed(1) };
});
console.log("   traffic:", JSON.stringify(near));
await shot("r14-traffic");

// ---- 5. zameen: pair sadak ki satah par, gaadi ke pahiye bhi ----
const gnd = await page.evaluate(() => {
  const S = window.__shimla;
  /*
   * Aisi sadak chuno jiske dono taraf khula ho -- warna camera kisi deewar ke
   * andar chala jaata hai aur tasveer se kuch pata hi nahi chalta.
   */
  let best = null, bestScore = -1;
  for (const r of S.roads.roads) {
    if (r.type === "rail" || r.type === "pedestrian") continue;
    for (let i = 4; i < r.points.length - 4; i += 3) {
      const q = r.points[i];
      let open = 0;
      for (let a = 0; a < 8; a++) {
        const th = (a / 8) * Math.PI * 2;
        const cx = q.x + Math.cos(th) * 9, cz = q.z + Math.sin(th) * 9;
        if (!S.colliders.inside(cx, S.roads.groundAt(cx, cz) + 2, cz, 0.5)) open++;
      }
      if (open > bestScore) { bestScore = open; best = q; }
    }
  }
  const q = best;
  const bus = S.buses.buses[0];
  S.player.placeAt(q.x, q.z);
  const v = S.parked[0];
  const off = S.colliders.freeSpotNear(q.x + 5, q.z, S.roads.groundAt(q.x + 5, q.z) + 1, 2.5);
  v.placeAt(off.x, off.z, 1.2); v.syncMesh();
  S.lookAt(q.x + 2.4, S.roads.groundAt(q.x, q.z) + 0.75, q.z, 9, 0.05);
  return {
    surface: +S.roads.groundAt(q.x, q.z).toFixed(2),
    pair: +S.player.pos.y.toFixed(2),
    pahiya: +v.mesh.position.y.toFixed(2),
    bus: bus ? +(bus.mesh.position.y - S.roads.groundAt(bus.mesh.position.x, bus.mesh.position.z)).toFixed(2) : null,
  };
});
console.log("   zameen:", JSON.stringify(gnd));
await shot("r14-zameen");

// ---- 6. Sanjauli bazaar -- bheed, dukanein, traffic sab ek frame mein ----
await page.evaluate(() => {
  const S = window.__shimla;
  S.teleport("sanjauli_chowk");
  for (let i = 0; i < 40; i++) S.traffic.update(0.05, S.player.pos);
  S.viewPOI("sanjauli_chowk", 52, 24, 2.2);
});
await shot("r14-sanjauli");

// ---- 7. raat: traffic ki headlight ----
await page.evaluate(() => {
  const S = window.__shimla;
  S.dayNight.hour = 20.6;
  S.sky.setTime(20.6, true);
  S.teleport("sanjauli_chowk");
  for (let i = 0; i < 80; i++) {
    S.traffic.update(0.05, S.player.pos, S.camera.position, { night: true });
  }
  let best = null, bd = Infinity;
  for (const c of S.traffic.cars) {
    if (!c.lane) continue;
    const d = c.mesh.position.distanceTo(S.player.pos);
    if (d < bd) { bd = d; best = c; }
  }
  const p = best ? best.mesh.position : S.player.pos;
  S.lookAt(p.x, p.y + 1.1, p.z, 13, 0.3);
});
await shot("r14-raat");

await browser.close();
