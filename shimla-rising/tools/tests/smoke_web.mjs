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
// Naye khel par intro + m01 ke flashcards khud chalte hain, aur card khule
// hone par main loop ruka rehta hai. Test ko pehle unhe band karna padta hai.
await page.evaluate(() => window.__shimla.skipCards());
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

/*
 * Control ki disha.
 *
 * `player.js` mein camera-relative movement ka z (aur strafe ka x) ka chinh
 * ulta laga hua tha: W dabane par banda camera ke aage nahi, kahin aur chal
 * padta tha, aur camera ghumate hi disha badal jaati thi. Ye kabhi test nahi
 * hua tha kyunki control ko sirf khel kar hi dekha jaata tha.
 *
 * Headless mein frame rate ~1 fps hai, isliye `player.update()` haath se
 * chalate hain -- yahan hum simulation ki ganit jaanch rahe hain, rendering
 * nahi.
 */
const ctl = await page.evaluate(() => {
  const S = window.__shimla;
  const base = { forward: 0, strafe: 0, walk: 0, turn: 0, run: false, jump: false };
  const run = (c, n = 30) => { for (let i = 0; i < n; i++) S.player.update(0.05, c, S.chase.yaw); };

  S.chase.yaw = 0;                      // camera-aage = (0, -1)
  const p0 = S.player.pos.clone();
  run({ ...base, forward: 1 });
  const d = S.player.pos.clone().sub(p0);
  const dl = Math.hypot(d.x, d.z) || 1;

  const y0 = S.player.yaw;
  run({ ...base, turn: -1 }, 10);
  const turned = Math.abs(S.player.yaw - y0);

  // yaw ka matlab: aage = (-sin yaw, -cos yaw). yaw 0 -> aage -Z
  S.player.yaw = 0;
  const q0 = S.player.pos.clone();
  run({ ...base, walk: 1 });
  const e = S.player.pos.clone().sub(q0);
  const el = Math.hypot(e.x, e.z) || 1;

  return { wDot: (d.z / dl) * -1, wMoved: dl, turned, upDz: (e.z / el) * -1, upMoved: el };
});
// W camera ke aage jaaye (dot ~1), arrows se ghoome, aur up apne rukh mein jaaye
const ctlOk = ctl.wMoved > 1 && ctl.wDot > 0.9
  && ctl.turned > 0.5 && ctl.upMoved > 1 && ctl.upDz > 0.9;
console.log("control:", JSON.stringify({
  wDot: +ctl.wDot.toFixed(2), turned: +ctl.turned.toFixed(2), upDz: +ctl.upDz.toFixed(2),
}));

/*
 * Rukh -- chehra aage ya peeche?
 *
 * Nikhil: *"jis side face h wo tune back kr di h, jis side feet h wo age krdi
 * h"*. `human.js` mein kirdaar ka **aage `-Z`** hai (naak `-Z` par banti hai),
 * par rukh har jagah `Math.atan2(dx, dz)` se likha tha -- jisse model ka `-Z`
 * theek ulti taraf chala jaata tha. Ab `faceYaw()` ye sambhalta hai.
 *
 * Jaanch code padh kar nahi, **matrix se** hoti hai: khiladi ko ek disha mein
 * chalao, phir mesh ka apna `-Z` world mein nikaal kar chalne ki disha se dot
 * lo. Sahi hone par ~+1, ulta hone par ~-1.
 */
const facing = await page.evaluate(() => {
  const S = window.__shimla;
  const THREE = S.THREE;
  const base = { forward: 0, strafe: 0, walk: 0, turn: 0, run: false, jump: false };
  S.player.yaw = 0;                          // apna rukh +Z
  const p0 = S.player.pos.clone();
  for (let i = 0; i < 30; i++) S.player.update(0.05, { ...base, walk: 1 }, S.chase.yaw);
  const move = S.player.pos.clone().sub(p0);
  move.y = 0;
  if (move.length() < 0.5) return { moved: move.length(), dot: 0 };
  move.normalize();
  S.player.mesh.updateMatrixWorld(true);
  // model ka aage = local -Z, world mein
  const fwd = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(S.player.mesh.getWorldQuaternion(new THREE.Quaternion()));
  fwd.y = 0; fwd.normalize();
  return { moved: p0.distanceTo(S.player.pos), dot: fwd.dot(move) };
});
const facingOk = facing.moved > 1 && facing.dot > 0.9;
console.log("rukh:", JSON.stringify({ dot: +facing.dot.toFixed(2) }));

/*
 * Zameen -- sadak ke andar dhansa hua to nahi?
 *
 * Nikhil: *"banda sadk k andr e ghus gya... ye gravity physics k law k hisab s
 * rehna chchie"*. Sadak ka mesh terrain se 0.5 m upar bichta hai, par khiladi
 * aur gaadi dono `terrain.heightAt()` se zameen lete the -- yaani sadak ki
 * satah se aadha metre neeche. Ab sab `roads.groundAt()` se lete hain.
 *
 * Sadak ke beech khada karke satah aur pair ka farak naapte hain, aur wahi
 * gaadi ke liye bhi.
 */
const grounded = await page.evaluate(() => {
  const S = window.__shimla;
  // ek arterial sadak ka beech ka point
  const road = S.roads.roads.find((r) => r.type === "arterial") || S.roads.roads[0];
  const p = road.points[(road.points.length / 2) | 0];
  const surface = S.roads.groundAt(p.x, p.z);
  const lift = surface - S.terrain.heightAt(p.x, p.z);

  S.player.placeAt(p.x, p.z);
  for (let i = 0; i < 40; i++) {
    S.player.update(0.05, { forward: 0, strafe: 0, walk: 0, turn: 0, run: false, jump: false },
                    S.chase.yaw);
  }
  const foot = Math.abs(S.player.pos.y - S.roads.groundAt(S.player.pos.x, S.player.pos.z));

  // gaadi: pahiye ka nichla sira sadak ki satah par baithna chahiye
  const v = S.parked[0];
  v.placeAt(p.x, p.z, 0);
  v.syncMesh();
  const wheelBottom = v.mesh.position.y;      // buildBody ka origin = pahiye ke neeche
  const car = Math.abs(wheelBottom - S.roads.groundAt(v.pos.x, v.pos.z));

  // bus bhi -- yahi float kar rahi thi
  let bus = 0;
  const b = S.buses.buses[0];
  if (b) bus = Math.abs(b.mesh.position.y - S.roads.groundAt(b.mesh.position.x, b.mesh.position.z));
  return { lift, foot, car, bus };
});
const groundOk = grounded.lift > 0.3 && grounded.foot < 0.05
  && grounded.car < 0.05 && grounded.bus < 0.6;
console.log("zameen:", JSON.stringify({
  lift: +grounded.lift.toFixed(2), foot: +grounded.foot.toFixed(3),
  car: +grounded.car.toFixed(3), bus: +grounded.bus.toFixed(2),
}));

/*
 * Camera bande ke PEECHE hai ya SAAMNE?
 *
 * Yahi wo bug tha jise pichhla round pakad nahi paya. Model ka rukh sahi tha
 * (uska test tha aur pass ho raha tha), par `player.yaw` ka matlab gaadi ke
 * `yaw` se **ulta** tha: khiladi ka "aage" `(sin, cos)` tha, gaadi ka
 * `(-sin, -cos)`. Chase camera gaadi wale usool par bana hai -- `target +
 * (sin yaw, cos yaw) * dist` -- isliye arrows se ghoomte hi camera bande ke
 * **saamne** aa jaata tha. Nateeja: aage badho to Vicky camera ki taraf, mooh
 * saamne karke aata dikhta tha. Nikhil ki "body ulti chal rahi hai" -- do
 * round tak.
 *
 * Isliye ab rukh nahi, **rishta** naapte hain: camera chalne ki disha ke ulti
 * taraf hona chahiye, aur chehra camera se door.
 */
const cam = await page.evaluate(() => {
  const S = window.__shimla, T = S.THREE;
  const base = { forward: 0, strafe: 0, walk: 0, turn: 0, run: false, jump: false };
  S.player.yaw = 0; S.chase.yaw = 0; S.chase._init = false;
  const p0 = S.player.pos.clone();
  for (let i = 0; i < 30; i++) {
    S.player.update(0.05, { ...base, walk: 1 }, S.chase.yaw);
    S.chase.update(0.05, S.player.pos, "foot", S.player.yaw);
  }
  const mv = S.player.pos.clone().sub(p0); mv.y = 0;
  if (mv.length() < 0.5) return { moved: mv.length(), behind: 0, faceCam: 0 };
  mv.normalize();
  const toCam = S.camera.position.clone().sub(S.player.pos); toCam.y = 0; toCam.normalize();
  S.player.mesh.updateMatrixWorld(true);
  const face = new T.Vector3(0, 0, -1)
    .applyQuaternion(S.player.mesh.getWorldQuaternion(new T.Quaternion()));
  face.y = 0; face.normalize();
  return { moved: mv.length(), behind: toCam.dot(mv), faceCam: face.dot(toCam) };
});
// dono ~ -1 hone chahiye: camera peeche, chehra camera se door
const camOk = cam.behind < -0.8 && cam.faceCam < -0.8;
console.log("camera:", JSON.stringify({ behind: +cam.behind.toFixed(2), faceCam: +cam.faceCam.toFixed(2) }));

/*
 * Gaadi naak ke bal chal rahi hai ya bagal ko sarak rahi?
 *
 * `atan2(ux*dir, -(uz*dir))` mein `sin` ka chinh ulta tha, isliye gaadi ka
 * mooh sadak ke aar-paar mirror ho jaata tha -- chalti seedhi, dikhti tirchhi.
 * Nikhil: "gadiyan float hori rather than going in straight line".
 */
const nose = await page.evaluate(() => {
  const S = window.__shimla, T = S.THREE;
  const noseDot = (mesh, before) => {
    const d = mesh.position.clone().sub(before); d.y = 0;
    if (d.length() < 0.02) return null;
    d.normalize();
    mesh.updateMatrixWorld(true);
    const f = new T.Vector3(0, 0, -1).applyQuaternion(mesh.getWorldQuaternion(new T.Quaternion()));
    f.y = 0; f.normalize();
    return f.dot(d);
  };
  for (let i = 0; i < 40; i++) S.traffic.update(0.05, S.player.pos, S.camera.position);
  let worstCar = 1, nCar = 0, skipped = 0;
  for (const c of S.traffic.cars) {
    if (!c.lane) continue;
    const b = c.mesh.position.clone();
    const dir0 = c.dir, lane0 = c.lane;
    S.traffic.update(0.1, S.player.pos, S.camera.position);
    /*
     * Jis gaadi ne is kadam mein palti maari ya lane badla, uska naap bekaar
     * hai: wo do jagah ke beech ki seedhi rekha hai, chalne ki disha nahi.
     * Sadak ke sire par palatna aur door nikal kar recycle hona -- dono
     * bilkul theek bartav hain.
     */
    if (c.dir !== dir0 || c.lane !== lane0 || c.mesh.position.distanceTo(b) > 12) {
      skipped++;
      continue;
    }
    const dot = noseDot(c.mesh, b);
    if (dot !== null) { worstCar = Math.min(worstCar, dot); nCar++; }
  }
  let worstBus = 1, nBus = 0;
  for (const bus of S.buses.buses) {
    const b = bus.mesh.position.clone();
    S.buses.update(0.2);
    const dot = noseDot(bus.mesh, b);
    if (dot !== null) { worstBus = Math.min(worstBus, dot); nBus++; }
  }
  return { worstCar, nCar, worstBus, nBus, skipped };
});
const noseOk = nose.nCar > 0 && nose.worstCar > 0.9 && (nose.nBus === 0 || nose.worstBus > 0.9);
console.log("naak:", JSON.stringify({ car: +nose.worstCar.toFixed(2), bus: +nose.worstBus.toFixed(2) }));

/*
 * Koi hawa mein to nahi chal raha?
 *
 * Campus ke student `fixedY` par pin the (slab ki oonchai) par chaal chalti
 * rehti thi -- kuch second mein wo slab se bahar nikal kar 5 m hawa mein
 * chalte rehte the. Nikhil: "hwa me mat chla cheeje".
 *
 * `roads.groundAt()` landmark ke slab ko nahi jaanta, isliye sirf oonchai se
 * faisla nahi ho sakta. Pair ke thoda neeche collider hai ya nahi -- yahi
 * asli sawal hai, aur `colliders` mein har slab maujood hai.
 */
const air = await page.evaluate(() => {
  const S = window.__shimla;
  const bad = [];
  for (const w of [...S.crowd.walkers, ...S.crowd.keepers]) {
    if (!w.mesh.visible) continue;
    const P = w.mesh.position;
    const dy = P.y - S.roads.groundAt(P.x, P.z);
    if (Math.abs(dy) < 0.4) continue;                    // zameen par hai
    if (S.colliders.inside(P.x, P.y - 0.25, P.z, 0.3)) continue;  // slab par khada hai
    bad.push(+dy.toFixed(1));
  }
  return { bad, checked: S.crowd.walkers.length + S.crowd.keepers.length };
});
const airOk = air.bad.length === 0;
console.log("hawa:", JSON.stringify(air.bad));

/*
 * Chalti gaadi rok kar usme baithna.
 *
 * Nikhil: *"gadi rok k andr bethne ka option rkh, gadi wale ko bhar nikal k"*.
 * Jaanchne layak teen cheezein hain: gaadi asli `Vehicle` ban kar `parked`
 * mein aayi, driver bahar nikal kar bhaag raha hai, aur police ki heat lagi.
 */
const jack = await page.evaluate(() => {
  const S = window.__shimla;
  S.wanted.clear();
  // kisi chalti gaadi ke paas pahuncho
  for (let i = 0; i < 60; i++) S.traffic.update(0.05, S.player.pos, S.camera.position);
  const car = S.traffic.cars.find((c) => c.lane);
  if (!car) return { ok: false, why: "koi chalti gaadi nahi" };
  const p = car.mesh.position;
  S.player.placeAt(p.x + 1.5, p.z + 1.5);
  const before = { parked: S.parked.length, heat: S.wanted.heat, fleeing: S.traffic.fleeing.length };
  const mode = S.enterVehicle();
  return {
    ok: mode === "vehicle" && S.parked.length === before.parked + 1
        && S.traffic.fleeing.length === before.fleeing + 1 && S.wanted.heat > before.heat,
    mode, added: S.parked.length - before.parked,
    fleeing: S.traffic.fleeing.length, heat: Math.round(S.wanted.heat),
  };
});
console.log("gaadi kheenchi:", JSON.stringify(jack));

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
  ["control ki disha", ctlOk, JSON.stringify(ctl)],
  ["rukh saamne", facingOk, JSON.stringify(facing)],
  ["zameen par khada", groundOk, JSON.stringify(grounded)],
  ["sadak par traffic", s.trafficNear > 0, `${s.trafficNear} / ${s.traffic}`],
  ["camera peeche", camOk, JSON.stringify(cam)],
  ["gaadi naak ke bal", noseOk, JSON.stringify(nose)],
  ["hawa mein koi nahi", airOk, JSON.stringify(air.bad)],
  ["chalti gaadi kheenchna", jack.ok, JSON.stringify(jack)],
];

let failed = 0;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok ? "" : `  -> ${detail}`}`);
  if (!ok) failed++;
}
await browser.close();
process.exit(failed ? 1 : 0);
