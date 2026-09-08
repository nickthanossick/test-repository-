/**
 * Gaadi chalate waqt ka shot -- **asli chase camera se**.
 *
 * Nikhil: *"gaadi chalte hue kuch dikh ni ra dhng s"*. Ye wahi jaanchta hai:
 * gaadi mein baitho, kuch second seedha chalao, aur jo camera dikhata hai
 * wahi save karo. Camera haath se nahi rakha jaata -- warna wo sawal hi nahi
 * pooch rahe jo Nikhil ne poocha.
 *
 * Saath mein ek number bhi chhapta hai: screen ka kitna hissa gaadi khud le
 * rahi hai. Purani setting mein camera deewar takraane par gaadi se ~2.5 m
 * par aa jaata tha aur screen bhar dickey hi hoti thi.
 *
 *   node web/serve.mjs &   TIER=medium node tools/tests/drive_shots.mjs
 */
import fs from "node:fs";
import { chromium } from "playwright";

const TIER = process.env.TIER || "medium";
const TAG = process.env.TAG || "r18";
fs.mkdirSync("build/shots", { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.setDefaultTimeout(200000);
await page.goto(`http://localhost:8080/web/?tier=${TIER}`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__shimla?.ready === true, null, { timeout: 300000 });
await page.evaluate(() => window.__shimla.skipCards());
await page.waitForTimeout(1500);

const drive = await page.evaluate(() => {
  const S = window.__shimla;
  /*
   * **Wahi gaadi chalao jise khel follow kar raha hai.**
   *
   * Pehli koshish mein maine `S.parked[0]` ko haath se chalaya tha, jabki
   * `enterVehicle()` khiladi ko sabse paas wali doosri gaadi mein bithata hai
   * -- aur khel ka apna loop us doosri (khadi) gaadi par camera rakhta rehta
   * hai. Nateeja: shot mein na gaadi thi, na chaal. `state.vehicle` hi sahi
   * reference hai.
   */
  /*
   * Gaadi pehle **paas laani** padti hai. `enterVehicle()` sirf tab chalta
   * hai jab koi gaadi range mein ho -- chowk par teleport karke seedha
   * bulane par wo `"foot"` lauta deta tha aur shot khaali aata tha.
   */
  S.teleport("sanjauli_chowk");
  const road = S.roads.roads.find((r) => r.type === "arterial") || S.roads.roads[0];
  const rp = road.points[(road.points.length / 2) | 0];
  const spot = S.colliders.freeSpotNear(rp.x, rp.z, S.roads.groundAt(rp.x, rp.z) + 1, 3);
  S.parked[0].placeAt(spot.x, spot.z, 0);
  S.player.placeAt(spot.x + 1.6, spot.z + 1.6);
  const mode = S.enterVehicle();
  const car = S.state.vehicle;
  if (!car) return { mode, err: "gaadi nahi mili" };
  // sadak ke saath rukh -- gaadi ka aage (-sin yaw, -cos yaw)
  const n = S.roads.nearestNode(car.pos.x, car.pos.z,
    (r) => r.type !== "pedestrian" && r.type !== "rail");
  if (n) {
    const tx = -n.node.nz, tz = n.node.nx;              // sadak ki disha
    car.yaw = Math.atan2(-tx, -tz);
  }
  S.chase._init = false;
  // kyun nahi chal rahi -- naap kar batao, andaza nahi
  const trace = [];
  const p0 = car.pos.clone();
  let hits = 0;
  /*
   * **40 kadam, 120 nahi.**
   *
   * Pehle 120 kadam (6 s) chalaya tha aur akhir mein tasveer li thi. Naapne
   * par pata chala: gaadi 14 -> 53 km/h tak jaati hai aur phir 40 m baad ruk
   * jaati hai -- kyunki `steer: 0` par wo seedhi chalti rehti hai aur Shimla
   * ki sadak mud jaati hai, to wo retaining wall se ja takraati hai. Ye khel
   * ki galti nahi thi, meri thi. Tasveer chalti hui gaadi ki chahiye, isliye
   * ab beech mein hi rok kar lete hain.
   */
  for (let i = 0; i < 40; i++) {
    const before = car.pos.clone();
    car.update(0.05, { throttle: 1, steer: 0, handbrake: false }, 1);
    if (car.pos.distanceTo(before) < 0.002 && car.speed > 0.5) hits++;
    if (i === 9 || i === 24 || i === 39) trace.push(Math.round(car.kmh));
    S.chase.update(0.05, car.pos, "vehicle", car.yaw, car.speed);
  }
  /*
   * Ab gaadi ko **rok do** -- par uski raftaar aur jagah wahi rehne do.
   *
   * SwiftShader par khel ka apna loop ~1 fps chalta hai, yaani har frame ka
   * `dt` lagbhag 1 second. Screenshot se pehle ke 9 second mein gaadi 100 m
   * se zyada chali jaati thi aur kahin takra kar ruk jaati thi -- yaani jo
   * tasveer aati thi wo us halat ki thi hi nahi jo maine naapi thi. Method
   * ko no-op karne se pos/yaw/speed jame rehte hain aur `chase.update()`
   * wahi asli driving-camera pose banata rehta hai.
   */
  car.update = () => {};
  const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
  const gHere = S.roads.groundAt(car.pos.x, car.pos.z);
  const gAhead = S.roads.groundAt(car.pos.x + fx * 3, car.pos.z + fz * 3);
  return {
    trace, hits, moved: +p0.distanceTo(car.pos).toFixed(1),
    grade: +((gAhead - gHere) / 3).toFixed(3), accel: car.spec.accel,
    onRoad: !!S.roads.roadAt(car.pos.x, car.pos.z, 2),
    mode, kmh: Math.round(car.kmh),
    camDist: +S.camera.position.distanceTo(car.pos).toFixed(1),
    camLift: +(S.camera.position.y - car.pos.y).toFixed(1),
    road: n?.node.road.type, width: n?.node.road.spec.width_m,
  };
});
console.log("drive:", JSON.stringify(drive));
if (!(drive.kmh > 18)) console.error("  CHETAVNI: gaadi chali hi nahi -- shot bekaar hai");
await page.waitForTimeout(9000);
await page.screenshot({ path: `build/shots/${TAG}-gaadi.png` });
console.log("   gaadi shot");

// paidal, chaudi sadak par
await page.evaluate(() => {
  const S = window.__shimla;
  S.exitVehicle?.();
  S.teleport("sanjauli_chowk");
  S.viewPOI("sanjauli_chowk", 52, 22, 2.2);
});
await page.waitForTimeout(9000);
await page.screenshot({ path: `build/shots/${TAG}-chowk.png` });
console.log("   chowk shot");
await browser.close();
