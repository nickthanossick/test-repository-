/**
 * Frame budget ka naap.
 *
 * `smoke_web.mjs` batata hai ki duniya bani ya nahi. Ye batata hai ki wo
 * **kitni mehngi** hai -- aur wahi Nikhil ki shikayat hai (*"abhi it lags"*).
 *
 * Headless mein SwiftShader ~1 fps deta hai, isliye FPS naapna bekaar hai --
 * wo GPU ka software emulation naap raha hoga, asli machine ka nahi. Jo yahan
 * naapa jaata hai wo **machine se azad** hai:
 *
 *   1. CPU: har system ka `update()` kitne microsecond leta hai
 *   2. `nearestNode()` ka throughput -- yahi round 16 ka sabse bada hot spot tha
 *   3. Draw call ka batwara: asli render pass bनाम shadow pass
 *   4. Scene graph ka size, material/texture/geometry ki ginti
 *
 * Chalane ke liye:  node web/serve.mjs &  node tools/tests/perf.mjs
 */
import { chromium } from "playwright";

/*
 * `--tier=medium` se us tier ka naap.
 *
 * Headless hamesha SwiftShader par chalta hai aur `Quality.detect()` use
 * hamesha `low` deta hai -- yaani ab tak sirf sabse halke load ka naap hota
 * tha, jabki asli khiladi `medium`/`high` par hota hai. Ab teenon naape ja
 * sakte hain.
 */
const TIER = (process.argv.find((a) => a.startsWith("--tier=")) || "").split("=")[1] || "";
const BASE = process.env.GAME_URL || "http://localhost:8080/web/";
const URL = TIER ? `${BASE}?tier=${TIER}` : BASE;

const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(150000);
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__shimla?.ready === true, null, { timeout: 300000 });
await page.evaluate(() => window.__shimla.skipCards());
await page.waitForTimeout(1500);

/*
 * Naapne se pehle ek **nishchit jagah aur camera**.
 *
 * Bina iske draw call har run par badalta hai: khiladi jahan spawn hua, jidhar
 * camera ka rukh tha, traffic kahan pahunchi -- sab frustum badal dete hain.
 * Ek baar `low` ka aankda 493 se 632 par chala gaya tha sirf isi wajah se, aur
 * main lagbhag ise regression samajh baitha. Ab har naap Sanjauli Chowk se,
 * ek hi kone se.
 */
await page.evaluate(() => {
  const S = window.__shimla;
  S.teleport("sanjauli_chowk");
  S.viewPOI("sanjauli_chowk", 70, 26, 2.2);
  for (let i = 0; i < 40; i++) S.traffic.update(0.05, S.player.pos, S.camera.position);
  S.crowd.update(0.05, S.player.pos);
});
await page.waitForTimeout(800);

const r = await page.evaluate(() => {
  const S = window.__shimla;
  const out = {};

  // ---------------------------------------------------------- 1. nearestNode
  /*
   * Yahi wo jagah hai jahan lag chhupa tha: 3,603 nodes par seedha loop, aur
   * `groundAt()` ke zariye har frame 30-50 baar. Naap sadak ke aas-paas se
   * lete hain, kyunki khel mein sawaal wahin se aate hain.
   */
  const pts = [];
  for (let i = 0; i < 2000; i++) {
    const n = S.roads.nodes[(Math.random() * S.roads.nodes.length) | 0];
    pts.push([n.pos.x + (Math.random() - 0.5) * 80, n.pos.z + (Math.random() - 0.5) * 80]);
  }
  let t0 = performance.now();
  for (const [x, z] of pts) S.roads.nearestNode(x, z);
  const gridMs = performance.now() - t0;

  t0 = performance.now();
  for (const [x, z] of pts) S.roads._nearestLinear(x, z, null);
  const linearMs = performance.now() - t0;

  // Tez hona kaafi nahi -- jawab wahi hona chahiye. Grid ring-by-ring chalta
  // hai, aur ring ka break galat hone par jawab chup-chaap badal jaata.
  let mismatch = 0, worst = 0;
  for (const [x, z] of pts) {
    const a = S.roads.nearestNode(x, z);
    const b = S.roads._nearestLinear(x, z, null);
    if (!a || !b) { if (a !== b) mismatch++; continue; }
    const d = Math.abs(a.dist - b.dist);
    if (d > 1e-6) { mismatch++; worst = Math.max(worst, d); }
  }
  out.nearestNode = {
    n: pts.length,
    gridUs: +(gridMs * 1000 / pts.length).toFixed(2),
    linearUs: +(linearMs * 1000 / pts.length).toFixed(2),
    speedup: +(linearMs / Math.max(1e-9, gridMs)).toFixed(1),
    mismatch, worstErrorM: +worst.toFixed(4),
    nodes: S.roads.nodes.length,
  };

  // ------------------------------------------------- 2. har system ka update
  const pos = S.player.pos;
  const time = (fn, n = 60) => {
    fn(); // warm-up, taaki pehli baar ka JIT naap mein na aaye
    const t = performance.now();
    for (let i = 0; i < n; i++) fn();
    return +(((performance.now() - t) / n) * 1000).toFixed(1);   // microseconds
  };
  const base = { forward: 0, strafe: 0, walk: 1, turn: 0, run: false, jump: false };
  out.updateUs = {
    player: time(() => S.player.update(0.016, base, S.chase.yaw)),
    crowd: time(() => S.crowd.update(0.016, pos)),
    traffic: time(() => S.traffic.update(0.016, pos, S.camera.position)),
    buses: time(() => S.buses.update(0.016)),
    wanted: time(() => S.wanted.update(0.016, pos, false, 1, null, null)),
    missions: time(() => S.missions.update(0.016, { playerPos: pos, inVehicle: false, stars: 0 })),
    chase: time(() => S.chase.update(0.016, pos, "foot", null)),
    hud: time(() => S.hud.update(0.016, pos, S.player.yaw, S.missions.markers.children)),
    dayNight: time(() => S.dayNight.update(0.016, S.camera), 20),
    weather: time(() => S.weather.update(0.016, S.camera)),
  };
  out.updateUs.total = +Object.values(out.updateUs).reduce((a, b) => a + b, 0).toFixed(1);

  // --------------------------------------------- 3. draw call ka batwara
  /*
   * `renderer.info` shadow pass ke baad reset nahi hota, isliye "833 draw
   * calls" mein wahi geometry do baar gini jaati hai. Shadow band karke ek
   * frame render karne se asli batwara mil jaata hai.
   */
  const R = S.renderer;
  R.render(S.scene, S.camera);
  const both = { calls: R.info.render.calls, tris: R.info.render.triangles };
  const wasEnabled = R.shadowMap.enabled;
  R.shadowMap.enabled = false;
  R.render(S.scene, S.camera);
  const noShadow = { calls: R.info.render.calls, tris: R.info.render.triangles };
  R.shadowMap.enabled = wasEnabled;
  out.draw = {
    total: both, mainPass: noShadow,
    shadowPass: { calls: both.calls - noShadow.calls, tris: both.tris - noShadow.tris },
  };

  // -------------------------------------------------- 4. scene graph + memory
  let objects = 0, meshes = 0, visible = 0;
  const mats = new Set(), geos = new Set(), texs = new Set();
  S.scene.traverse((o) => {
    objects++;
    if (o.isMesh || o.isInstancedMesh || o.isPoints || o.isLine) {
      meshes++;
      if (o.visible) visible++;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m) continue;
        mats.add(m);
        for (const k of ["map", "normalMap", "roughnessMap", "emissiveMap", "alphaMap"]) {
          if (m[k]) texs.add(m[k]);
        }
      }
      if (o.geometry) geos.add(o.geometry);
    }
  });
  out.scene = { objects, meshes, visible, materials: mats.size,
                geometries: geos.size, textures: texs.size };
  out.gpu = { geometries: R.info.memory.geometries, textures: R.info.memory.textures };
  out.tier = S.state.quality;
  return out;
});

const N = r.nearestNode;
console.log(`tier: ${r.tier}   road nodes: ${N.nodes}`);
console.log("");
console.log("nearestNode()  grid %s us   linear %s us   -> %sx tez", N.gridUs, N.linearUs, N.speedup);
console.log("               jawab %s (mismatch %d, worst %s m)",
  N.mismatch === 0 ? "bilkul same" : "ALAG", N.mismatch, N.worstErrorM);
console.log("");
console.log("update() microseconds:");
for (const [k, v] of Object.entries(r.updateUs)) {
  if (k === "total") continue;
  console.log(`  ${k.padEnd(10)} ${String(v).padStart(8)}`);
}
console.log(`  ${"TOTAL".padEnd(10)} ${String(r.updateUs.total).padStart(8)} us/frame`);
console.log("");
console.log("draw calls:  main %d (%s tris)   shadow %d (%s tris)   total %d",
  r.draw.mainPass.calls, r.draw.mainPass.tris.toLocaleString(),
  r.draw.shadowPass.calls, r.draw.shadowPass.tris.toLocaleString(), r.draw.total.calls);
console.log("scene:       %d objects, %d meshes (%d visible), %d materials, %d geometries, %d textures",
  r.scene.objects, r.scene.meshes, r.scene.visible, r.scene.materials,
  r.scene.geometries, r.scene.textures);
console.log("gpu memory:  %d geometries, %d textures", r.gpu.geometries, r.gpu.textures);

/*
 * Budget. Ye i3 + integrated graphics ko dhyan mein rakh kar hai, jo Nikhil ki
 * spec ka baseline hai. CPU ka budget sabse ahem hai: 16 ms ke frame mein
 * simulation 4 ms se zyada le to renderer ke liye kuch bachta hi nahi.
 */
/*
 * Budget har tier ka apna.
 *
 * Pehle ek hi budget tha jo `low` ke hisaab se bana tha -- aur headless
 * hamesha `low` par chalta hai, isliye `medium`/`high` kabhi jaanche hi nahi
 * gaye. Naapne par pata chala ki `high` 3.49 M triangle aur 872 draw call ka
 * hai; khiladi wahi chala raha tha.
 *
 * Ye aankde Intel integrated (Iris Xe) ko dhyan mein rakh kar hain -- wahi
 * Nikhil ki machine hai.
 */
const BUDGETS = {
  low:    { cpuUs: 4000, mainCalls: 550, mainTris: 1_700_000, materials: 550 },
  medium: { cpuUs: 4500, mainCalls: 700, mainTris: 2_500_000, materials: 800 },
  high:   { cpuUs: 5500, mainCalls: 900, mainTris: 3_800_000, materials: 1200 },
};
const BUDGET = BUDGETS[r.tier] || BUDGETS.low;
const checks = [
  ["nearestNode sahi jawab", N.mismatch === 0, `${N.mismatch} mismatch`],
  /*
   * Speedup ka dhaaga dheela hai, aur jaan-boojh kar.
   *
   * SwiftShader par timing bahut shor bhari hai -- ek hi build par 3.2x se
   * 6.3x tak aata hai. Asli guarantee upar wala **jawab bilkul same** check
   * hai; ye sirf ye pakadta hai ki index kahin poori tarah toot to nahi gaya
   * (tab wo 1x par aa jaayega).
   */
  ["nearestNode tez", N.speedup >= 2.5, `${N.speedup}x`],
  ["CPU budget", r.updateUs.total <= BUDGET.cpuUs, `${r.updateUs.total} > ${BUDGET.cpuUs} us`],
  ["main-pass draw calls", r.draw.mainPass.calls <= BUDGET.mainCalls,
    `${r.draw.mainPass.calls} > ${BUDGET.mainCalls}`],
  ["main-pass triangles", r.draw.mainPass.tris <= BUDGET.mainTris,
    `${r.draw.mainPass.tris} > ${BUDGET.mainTris}`],
  ["material count", r.scene.materials <= BUDGET.materials,
    `${r.scene.materials} > ${BUDGET.materials}`],
];
console.log("");
let failed = 0;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok ? "" : `  -> ${detail}`}`);
  if (!ok) failed++;
}
await browser.close();
process.exit(failed ? 1 : 0);
