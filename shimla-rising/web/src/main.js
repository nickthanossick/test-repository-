import * as THREE from "three";
import { loadAll } from "./data.js";
import { GeoReference } from "./geo.js";
import { Terrain } from "./terrain.js";
import { RoadNetwork } from "./roads.js";
import { buildCity } from "./city.js";
import { Colliders } from "./grid.js";
import { buildBazaar } from "./bazaar.js";
import { buildTunnels } from "./tunnel.js";
import { BusSystem } from "./buses.js";
import { Crowd } from "./crowd.js";
import { Panga } from "./panga.js";
import { Sky } from "./sky.js";
import { Weather } from "./weather.js";
import { DayNight } from "./daynight.js";
import * as Quality from "./quality.js";
import { Input } from "./input.js";
import { Player } from "./player.js";
import { buildHuman } from "./human.js";
import { buildDog, buildCow, animateQuadruped } from "./animals.js";
import { Vehicle } from "./vehicle.js";
import { ChaseCamera } from "./chase-camera.js";
import { WantedSystem } from "./wanted.js";
import { MissionSystem } from "./missions.js";
import { Dialogue } from "./dialogue.js";
import { HUD } from "./hud.js";
import { Audio } from "./audio.js";
import { saveGame, loadGame } from "./save.js";

/** Ghanta -> '14:30' */
function fmtHour(h) {
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Seeded PRNG -- sheher har baar bilkul ek jaisa banta hai. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lbar = document.querySelector("#lbar > i");
const lmsg = document.getElementById("lmsg");
const setProgress = (f, msg) => {
  lbar.style.width = Math.round(f * 100) + "%";
  if (msg) lmsg.textContent = msg;
};

async function boot() {
  setProgress(0.02, "Shimla ka data aa raha hai…");
  const data = await loadAll((f, name) => setProgress(f * 0.45, name));

  const geo = new GeoReference(data.geo);
  setProgress(0.5, "terrain ban raha hai…");
  const terrain = new Terrain(geo, data.terrainMeta, data.heightmapImage);
  terrain.geo = geo;

  // ---------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });

  // Device dekh kar quality tier chuno. Wahi scene jo laptop pe 60 fps deta hai
  // phone pe 8 fps dega, isliye terrain density, ped, shadow map aur pixel ratio
  // sab tier se aate hain. `Q` se badla ja sakta hai.
  const savedTier = (loadGame() || {}).quality;
  let tier = Quality.TIERS.includes(savedTier) ? savedTier : Quality.detect(renderer);
  let Q = Quality.PRESETS[tier];
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // ACES wapas. Round 1 mein ise band kiya tha kyunki bina texture ke shadow-side
  // bilkul kaala ho jaata tha -- ab har surface pe albedo/normal/roughness map
  // hai aur sky se image-based lighting aati hai, to ACES ka roll-off sahi lagta hai.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  console.info(`[Shimla] quality tier: ${Q.name}`);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 12000);

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ------------------------------------------------------------------- world
  setProgress(0.58, "pahad tarash rahe hain…");
  scene.add(terrain.buildMesh(8, Q.terrainQuads));

  setProgress(0.70, "sadkein bichha rahe hain…");
  const roads = new RoadNetwork(geo, terrain, data.roads);
  const roadGroup = roads.buildMesh();
  scene.add(roadGroup);

  setProgress(0.80, "Shimla bas raha hai…");
  // Sanjauli ka bazaar: Chowk se Dhalli tak dono taraf lagatar dukanein.
  // Ye city ke generic scatter se *pehle* banta hai taaki `buildCity` ko pata ho
  // ki corridor mein ghar nahi rakhne -- warna dukanein aur ghar aapas mein
  // ghus jaate hain.
  // Dukanein ab `data/sanjauli.json` ke **slots** par lagti hain -- har jagah ka
  // apna naam hai (chowk_dhalli_L_012), taaki baad mein asli dukan asli jagah
  // par lagayi ja sake.
  // Ek hi Colliders sab ke liye. Pehle ye city.js ke andar banta tha, isliye
  // bazaar -- jo city se pehle banta hai -- usme kuch daal hi nahi sakta tha,
  // aur uski 672 dukanein poori duniya ke liye ghost thi.
  const colliders = new Colliders(24);
  const bazaar = buildBazaar(terrain, roads, data.shops, data.sanjauliMap, Q, colliders);
  scene.add(bazaar);

  const tunnels = buildTunnels(terrain, roads, data.pois, colliders);
  scene.add(tunnels);

  const city = buildCity(terrain, roads, data.districts, data.pois, mulberry32(31104877), Q,
                         { keepClear: bazaar.userData.stalls, colliders });
  scene.add(city);

  setProgress(0.90, "aasman aur mausam…");
  const sky = new Sky(scene, terrain, renderer);
  sky.shadowRadius = Q.shadowRadius;
  sky.sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
  const weather = new Weather(scene, terrain);
  const month = new Date().getMonth() + 1;
  weather.set(Weather.forMonth(month));
  const dayNight = new DayNight(scene, sky, weather, { hour: 8.5, month, dayMinutes: 24 });

  // ------------------------------------------------------------------ actors
  setProgress(0.95, "Vicky taiyaar ho raha hai…");
  const player = new Player(terrain, colliders);
  scene.add(player.mesh);

  // aas-paas kuch gaadiyan khadi kar do
  const parked = [];
  const rng = mulberry32(770317);
  const spots = ["vicky_garage", "sanjauli_chowk", "isbt", "railway_station", "lakkar_bazaar",
    "chhota_shimla", "kasumpti_market", "new_shimla_loop", "guru_dhaba", "bali_yard",
    "annandale_ground", "hpu", "dhalli", "timber_depot"];
  const kinds = ["alto", "maruti800", "baleno", "thar", "scooter", "taxi"];
  for (const id of spots) {
    const p = data.poiById.get(id);
    if (!p) continue;
    const w = geo.toWorld(p.lat, p.lon);
    const n = roads.nearestNode(w.x, w.z, (r) => r.type !== "pedestrian" && r.type !== "rail");
    if (!n) continue;
    const kind = id === "isbt" ? "hrtc_bus" : id === "timber_depot" ? "timber_truck"
      : kinds[(rng() * kinds.length) | 0];
    const v = new Vehicle(data.vehicleById.get(kind), terrain, { colliders });
    v.placeAt(n.node.pos.x + (rng() - 0.5) * 6, n.node.pos.z + (rng() - 0.5) * 6, rng() * Math.PI * 2);
    scene.add(v.mesh);
    parked.push(v);
  }

  // ----------------------------------------------------------------- systems
  const input = new Input(renderer.domElement);
  const chase = new ChaseCamera(camera, terrain, colliders);
  const hud = new HUD(data, terrain);

  /** POI pe rakho, par imaarat ke andar nahi -- pehle khaali jagah dhoondo. */
  function safeSpot(poiId, fallbackOffset = 6) {
    const p = data.poiById.get(poiId);
    const w = geo.toWorld(p.lat, p.lon);
    const y = terrain.heightAt(w.x, w.z) + 1.0;
    return colliders.freeSpotNear(w.x + fallbackOffset, w.z + fallbackOffset, y, 2.5);
  }
  {
    // Spawn: garage ke paas sadak pe, aur camera sadak ke saath align.
    // Pehle camera default yaw=0 pe hota tha, jo Sanjauli ki dhalan mein
    // seedha pahad ke andar dekhta tha -- pehla frame ek hari deewar tha.
    const s0 = safeSpot("vicky_garage");
    player.placeAt(s0.x, s0.z);
    const rn = roads.nearestNode(s0.x, s0.z, (r) => r.type !== "rail");
    if (rn) {
      // sadak ke saath dekho, dhalan se neeche ki taraf (jahan zyada door tak dikhta hai)
      const t = new THREE.Vector3(-rn.node.nz, 0, rn.node.nx);
      const ahead = terrain.heightAt(s0.x + t.x * 40, s0.z + t.z * 40);
      const behind = terrain.heightAt(s0.x - t.x * 40, s0.z - t.z * 40);
      const dir = ahead < behind ? t : t.negate();
      chase.yaw = Math.atan2(-dir.x, -dir.z);
      player.yaw = chase.yaw;
      chase.pitch = 0.30;
      chase._init = false;
    }
  }
  {
    // Vicky ki apni taxi, garage ke bahar. Khiladi ko dhoondhna na pade.
    const home = new Vehicle(data.vehicleById.get("taxi"), terrain, { colliders });
    // sadak pe khadi karo, ghaas pe nahi
    const rn = roads.nearestNode(player.pos.x, player.pos.z, (r) => r.type !== "pedestrian" && r.type !== "rail");
    const base = rn ? rn.node.pos : { x: player.pos.x + 4, z: player.pos.z + 3 };
    const hs = colliders.freeSpotNear(base.x, base.z, terrain.heightAt(base.x, base.z) + 1, 3);
    home.placeAt(hs.x, hs.z, 0.6);
    scene.add(home.mesh);
    parked.push(home);
  }
  const buses = new BusSystem(scene, terrain, data.sanjauliMap, data.routes,
                              data.vehicleById, Q.buses ?? 5);
  const crowd = new Crowd(scene, terrain, roads, bazaar.userData.stalls,
                          Q.crowd ?? { keepers: 18, walkers: 10, dogs: 2, cows: 1 });

  const dialogue = new Dialogue(document.getElementById("subtitle"), data);
  const audio = new Audio();
  const wanted = new WantedSystem(scene, terrain, roads, data.vehicleById);
  const missions = new MissionSystem(scene, terrain, data);

  const state = { money: 2500, mode: "foot", get quality() { return tier; }, vehicle: null, player, missions, weather,
                  get hour() { return dayNight.hour; }, set hour(h) { dayNight.hour = h; } };

  const saved = loadGame();
  if (saved) {
    state.money = saved.money ?? state.money;
    state.hour = saved.hour ?? state.hour;
    if (saved.completed) missions.completed = new Set(saved.completed);
    if (saved.available) missions.available = new Set(saved.available);
    if (saved.pos) {
      const sp = colliders.freeSpotNear(saved.pos.x, saved.pos.z,
                                        terrain.heightAt(saved.pos.x, saved.pos.z) + 1, 1.2);
      player.placeAt(sp.x, sp.z);
    }
    if (saved.weather) weather.set(saved.weather);
    missions._refreshStartMarkers();
  }

  // NPC se takrane par jhagda. Ye missions se bilkul alag hai.
  const panga = new Panga(crowd, { dialogue, hud, audio, wanted, player });

  wanted.onStarsChanged = (n) => {
    hud.setStars(n);
    audio.siren(n > 0);
    if (n === 1) dialogue.play("generic:wanted");
  };
  dayNight.bindEmissive({
    windows: city.userData.windowMaterial,
    signs: [...(city.userData.glowingSigns || []), ...(bazaar.userData.glowingSigns || [])],
    lamps: roadGroup.userData.lampMaterial,
  });

  hud.setStars(0);
  hud.setMoney(state.money);
  if (weather.mode === "snow") dialogue.play("generic:snow");

  missions.onEvent = (type, payload) => {
    switch (type) {
      case "mission_start":
        dialogue.play(`${payload.id}:start`);
        hud.toast("Mission shuru: " + payload.title, 3);
        audio.blip(880, 0.12);
        break;
      case "mission_complete":
        state.money += payload.reward || 0;
        hud.setMoney(state.money);
        dialogue.play(`${payload.id}:end`);
        hud.toast(`${payload.title} poora! +₹${(payload.reward || 0).toLocaleString("en-IN")}`, 4);
        audio.blip(1180, 0.2);
        saveGame(state);
        break;
      case "mission_failed":
        hud.toast("Mission fail: " + (payload.reason || ""), 3.5);
        audio.blip(220, 0.3);
        break;
      case "pickup":
        audio.blip(1320, 0.07, 0.18);
        hud.toast(payload.left ? `${payload.left} aur baaki` : "sab mil gaya", 1.4);
        break;
      case "checkpoint":
        audio.blip(990, 0.09, 0.2);
        break;
    }
  };

  // ------------------------------------------------------------ interactions
  function nearestParked(pos, max = 6.5) {
    let best = null, bd = max;
    for (const v of parked) {
      const d = v.pos.distanceTo(pos);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  function toggleVehicle() {
    audio.start();
    if (state.mode === "vehicle") {
      const v = state.vehicle;
      const f = v.forward(new THREE.Vector3());
      const side = new THREE.Vector3(-f.z, 0, f.x).multiplyScalar(2.2);
      player.placeAt(v.pos.x + side.x, v.pos.z + side.z, v.yaw);
      player.mesh.visible = true;
      state.mode = "foot"; state.vehicle = null;
      audio.setEngine(0, 1, false);
      hud.toast("Gaadi se utar gaye");
    } else {
      const v = nearestParked(player.pos);
      if (!v) { hud.toast("Aas-paas koi gaadi nahi"); return; }
      state.mode = "vehicle"; state.vehicle = v;
      player.mesh.visible = false;
      chase.yaw = v.yaw;
      hud.toast(v.spec.name + " mein baith gaye");
    }
  }

  function tryStartMission() {
    const m = missions.startableAt(playerWorldPos());
    if (m) { missions.start(m); return; }
    if (!missions.active) hud.toast("Yahan koi mission nahi. Peela marker dhoondo.");
  }

  const _pp = new THREE.Vector3();
  function playerWorldPos() {
    return state.mode === "vehicle" ? _pp.copy(state.vehicle.pos) : _pp.copy(player.pos);
  }

  function districtAt(pos) {
    let best = null, bd = Infinity;
    for (const d of data.districts.districts) {
      const w = geo.toWorld(d.lat, d.lon);
      const dist = Math.hypot(w.x - pos.x, w.z - pos.z);
      if (dist < d.radius_m && dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  // ---------------------------------------------------------------- game loop
  setProgress(1, "chalo!");
  document.getElementById("loading").style.display = "none";

  let last = performance.now();
  let acc = 0, frames = 0, fps = 0;
  let helpOn = true;
  let debugCam = false;    // sirf testing ke liye -- viewPOI() isse on karta hai
  // Ctrl se bhaagna: **toggle**, hold nahi. Browser mein Ctrl+W tab band kar
  // deta hai aur JavaScript use rok nahi sakta (preventDefault ka koi asar
  // nahi). Ctrl dabaye rakh kar W se aage chalte to game beech mein band ho
  // jaata. Shift hold-to-run ke liye rehta hai.
  let runToggle = false;
  let showcaseGroup = null;

  function frame(now) {
    requestAnimationFrame(frame);
    // dt ko 0 pe clamp karna zaroori hai: pehle frame pe requestAnimationFrame ka
    // timestamp `last` (performance.now()) se *pehle* ka ho sakta hai, kyunki wo
    // frame ke shuru hone ka waqt deta hai. Negative dt har cheez ulti chala deta
    // hai -- decay heat badha deta tha, jisse load hote hi faltu wanted star aa jaata.
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    acc += dt; frames++;
    if (acc >= 0.5) { fps = frames / acc; acc = 0; frames = 0; }

    // ------------------------------------------------------------ input
    chase.handleMouse(input.mouseDX, input.mouseDY);
    if (input.pressed("KeyF")) toggleVehicle();
    if (input.pressed("KeyE") || input.pressed("Enter")) tryStartMission();
    if (input.pressed("KeyM")) hud.mapScale = hud.mapScale > 0.08 ? 0.055 : 0.13;
    if (input.pressed("ControlLeft") || input.pressed("ControlRight")) {
      runToggle = !runToggle;
      hud.toast(runToggle ? "Daud rahe ho" : "Chal rahe ho", 1.2);
    }
    if (input.pressed("KeyH")) {
      helpOn = !helpOn;
      document.getElementById("help").style.display = helpOn ? "" : "none";
    }
    if (input.pressed("KeyP")) { saveGame(state); hud.toast("Save ho gaya"); }
    if (input.pressed("Digit1")) { dayNight.skip(3); hud.toast(`Waqt: ${fmtHour(dayNight.hour)}`); }
    if (input.pressed("KeyT")) { dayNight.paused = !dayNight.paused; hud.toast(dayNight.paused ? "Waqt ruka" : "Waqt chalu"); }
    if (input.pressed("KeyQ")) {
      tier = Quality.next(tier);
      Q = Quality.PRESETS[tier];
      renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio));
      sky.shadowRadius = Q.shadowRadius;
      sky.sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
      sky.sun.shadow.map?.dispose();
      sky.sun.shadow.map = null;
      hud.toast(`Quality: ${Q.name} — terrain/ped ki density agle load pe`, 3.5);
      saveGame(state);
    }
    if (input.pressed("Digit2")) {
      const order = ["clear", "fog", "monsoon", "snow"];
      weather.set(order[(order.indexOf(weather.mode) + 1) % order.length]);
      hud.toast("Mausam: " + weather.mode);
    }

    const pos = playerWorldPos();
    const district = districtAt(pos);
    const onRoad = roads.roadAt(pos.x, pos.z);

    // ----------------------------------------------------------- simulate
    if (state.mode === "vehicle") {
      const v = state.vehicle;
      v.update(dt, {
        throttle: input.axis("KeyS", "KeyW") || input.axis("ArrowDown", "ArrowUp"),
        steer: input.axis("KeyD", "KeyA") || input.axis("ArrowRight", "ArrowLeft"),
        handbrake: input.down("Space"),
      }, weather.grip);
      player.pos.copy(v.pos);
      if (!debugCam) chase.update(dt, v.pos, "vehicle", v.yaw);
      if (v.lastImpact) {
        // Deewar se takkar -- zor ke hisaab se awaaz aur nuksan
        audio.blip(90 + Math.min(120, v.lastImpact * 8), 0.18, 0.3);
        if (v.lastImpact > 7) player.health = Math.max(0, player.health - v.lastImpact * 0.8);
        v.lastImpact = 0;
      }
      audio.setEngine(v.kmh, v.spec.top_speed_kmh, true);
      hud.setSpeed(v.kmh, v.spec.name);
    } else {
      player.update(dt, {
        forward: input.axis("KeyS", "KeyW") || input.axis("ArrowDown", "ArrowUp"),
        strafe: input.axis("KeyA", "KeyD") || input.axis("ArrowLeft", "ArrowRight"),
        run: runToggle || input.anyDown("ShiftLeft", "ShiftRight"),
        jump: input.down("Space"),
      }, chase.yaw);
      if (!debugCam) chase.update(dt, player.pos, "foot");
      hud.setSpeed(0, player.running ? "daud rahe ho" : "paidal");
    }

    wanted.update(dt, pos, state.mode === "vehicle", weather.grip, district, onRoad);
    missions.update(dt, { playerPos: pos, inVehicle: state.mode === "vehicle", stars: wanted.stars });
    buses.update(dt);
    crowd.update(dt, pos);
    panga.update(dt, state.mode === "vehicle"
      ? { pos: state.vehicle.pos, radius: 1.5, inVehicle: true }
      : { pos: player.pos, radius: 0.42, inVehicle: false });
    dayNight.update(dt, camera);   // waqt, sooraj, taare, raat ki roshni, mausam
    sky.update(camera);
    sky.fitShadow(pos);            // shadow camera khiladi ke saath chalta hai
    dialogue.update(dt);
    if (showcaseGroup) {
      const ts = performance.now() / 1000;
      for (const m of showcaseGroup.children) {
        if (m.userData.rig?.kind) animateQuadruped(m, ts, false);
      }
    }

    // -------------------------------------------------------------- hud
    let extra = "";
    const o = missions.currentObjective;
    if (o?.type === "survive") extra = `(${Math.ceil(missions.timer)}s)`;
    else if (o?.type === "race") extra = `(${Math.ceil(missions.timer)}s · ${o.checkpoints.length - missions.raceIndex} baaki)`;
    else if (o?.type === "collect") extra = `(${missions.pickups.filter((p) => !p.taken).length} baaki)`;
    hud.setMission(missions.active, missions.objIndex, extra);
    hud.setDistrict(district ? district.name : "Shimla ke bahar");
    hud.setBars(player.health, player.stamina);
    hud.update(dt, pos, state.mode === "vehicle" ? state.vehicle.yaw : player.yaw, missions.markers.children);

    if (!missions.active && missions.startableAt(pos)) hud.toast("E dabao - mission shuru karo", 0.4);

    renderer.render(scene, camera);
    input.endFrame();
  }

  // debugging ke liye -- Playwright test yahi padhta hai
  window.__shimla = {
    ready: true, scene, camera, renderer, terrain, roads, city, player, missions, wanted, chase, sky, dayNight,
    bazaar, buses, crowd, panga, colliders, parked,
    weather, state, data, get fps() { return fps; },
    get stats() { return {
      triangles: renderer.info.render.triangles,
      drawCalls: renderer.info.render.calls,
      stars: wanted.stars, heat: Math.round(wanted.heat),
      buildings: city.userData.buildingCount,
      trees: city.getObjectByName("forest")?.userData.treeCount,
      roadKm: roads.roads.reduce((a, r) => a + r.points.length * 10, 0) / 1000,
      vehicles: parked.length,
      colliders: colliders.count,
      landmarks: city.userData.landmarkCount,
      signs: city.userData.signCount,
      shops: bazaar.userData.shopCount,
      tunnels: tunnels.userData.tunnelCount,
      buses: buses.count,
      keepers: crowd.count.keepers,
      angry: panga.angryCount,
      walkers: crowd.count.walkers,
      shopSigns: bazaar.userData.signCount,
    }; },
    teleport(poiId) {
      if (!data.poiById.get(poiId)) return false;
      const s0 = safeSpot(poiId, 10);
      if (state.mode === "vehicle") state.vehicle.placeAt(s0.x, s0.z);
      else player.placeAt(s0.x, s0.z);
      chase._init = false;          // camera ko naye sthaan pe turant le jaao
      return true;
    },
    enterVehicle: () => { if (state.mode === "foot") toggleVehicle(); return state.mode; },
    /**
     * Testing ke liye free camera -- POI ko ek nishchit kone se dekho.
     * Chase camera khiladi ke peeche rehta hai aur ghane sheher mein aksar
     * kisi deewar ke andar aa jaata hai, jisse screenshot kaale aate hain.
     */
    viewPOI(poiId, dist = 40, height = 16, azimuth = 0.9) {
      const p = data.poiById.get(poiId);
      if (!p) return false;
      const w = geo.toWorld(p.lat, p.lon);
      const gy = terrain.heightAt(w.x, w.z);
      debugCam = true;
      camera.position.set(w.x + Math.sin(azimuth) * dist, gy + height,
                          w.z + Math.cos(azimuth) * dist);
      camera.lookAt(w.x, gy + Math.min(height * 0.45, 8), w.z);
      return true;
    },
    freeCamOff() { debugCam = false; chase._init = false; },
    /**
     * Kisi bindu ko dekho, par camera kisi imaarat ke andar na ho.
     *
     * Ghane bazaar mein haath se camera rakhna kaam nahi karta -- har jagah
     * koi dukan hai. Ab colliders maujood hain, to kai koney aazma kar pehla
     * khaali chun lete hain. Screenshot ke liye yahi bharosemand tareeka hai.
     */
    /**
     * Kisi bindu ko dekho -- camera na to kisi imaarat ke andar ho, na uske
     * peeche.
     *
     * Pehle wala version sirf khaali kona dhoondta tha. Ghane bazaar mein wo
     * kaafi nahi: kona khaali ho sakta hai par beech mein poori dukan khadi ho.
     * Isliye ab **line of sight** bhi jaanchte hain -- camera se target tak
     * ray-march, wahi tareeka jo chase-camera.js pehle se occlusion ke liye
     * istemaal karta hai. Agar kisi bhi kone se target nahi dikhta to camera
     * upar uthaate jaate hain; ooncha uthne par gali ki deewarein hat jaati hain.
     */
    lookAt(tx, ty, tz, dist = 6, elev = 1.2, preferAz = null) {
      debugCam = true;
      const AZ = 24;
      const base = preferAz ?? 0;
      const why = { inside: 0, under: 0, blocked: 0, tried: 0 };
      const clear = (cx, cy, cz) => {
        why.tried++;
        if (colliders.inside(cx, cy, cz, 0.5)) { why.inside++; return false; }
        if (cy < terrain.heightAt(cx, cz) + 0.4) { why.under++; return false; }
        // camera se target tak koi deewar to nahi
        const dx = tx - cx, dy = ty - cy, dz = tz - cz;
        const steps = Math.max(6, Math.ceil(Math.hypot(dx, dy, dz) / 1.2));
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          if (colliders.inside(cx + dx * t, cy + dy * t, cz + dz * t, 0.25)) {
            why.blocked++; return false;
          }
        }
        return true;
      };
      for (let lift = 0; lift < 6; lift++) {
        const cy = ty + elev + lift * 3.5;
        for (let ring = 0; ring < 3; ring++) {
          const d = dist * (1 + ring * 0.45);
          for (let i = 0; i < AZ; i++) {
            // pasandeeda disha se shuru, phir dono taraf badhte hue
            const off = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
            const a = base + (off / AZ) * Math.PI * 2;
            const cx = tx + Math.cos(a) * d, cz = tz + Math.sin(a) * d;
            if (!clear(cx, cy, cz)) continue;
            camera.position.set(cx, cy, cz);
            camera.lookAt(tx, ty, tz);
            return { x: cx, y: cy, z: cz, dist: d, azimuth: a, lift, why };
          }
        }
      }
      // kahin se nahi dikha -- seedha upar se
      camera.position.set(tx, ty + dist * 2.2, tz + dist * 0.4);
      camera.lookAt(tx, ty, tz);
      return { overhead: true, why };
    },

    /**
     * Naam se seedha sahi shot. Har round ka screenshot script isse chhota aur
     * bharosemand rehta hai -- jagah aur disha yahi nikaalta hai.
     */
    photo(what, o = {}) {
      const T = (x, y, z, d, e, az) => ({ hit: this.lookAt(x, y, z, d, e, az),
                                          target: [x, y, z] });
      const stalls = bazaar.userData.stalls;
      const idx = o.index ?? 0;

      if (what === "shop" || what === "board") {
        const st = stalls[idx % stalls.length];
        const fx = Math.sin(st.yaw), fz = -Math.cos(st.yaw);   // dukan ka mukh
        // board shutter aur awning ke beech, 3.02 m par
        const y = what === "board" ? st.y + 3.02 : st.y + 2.2;
        const bx = st.x + fx * 3.28, bz = st.z + fz * 3.28;
        return { name: st.name, ...T(bx, y, bz, o.dist ?? 7, o.elev ?? 0.4,
                                     Math.atan2(fz, fx)) };
      }
      if (what === "keeper") {
        const k = crowd.keepers.find((x) => x.mesh.visible);
        if (!k) return null;
        const p = k.mesh.position;
        const fx = Math.sin(k.stall.s.yaw), fz = -Math.cos(k.stall.s.yaw);
        return T(p.x, p.y + 1.1, p.z, o.dist ?? 4.5, o.elev ?? 0.5, Math.atan2(fz, fx));
      }
      if (what === "bus") {
        const b = buses.buses[0];
        if (!b) return null;
        const p = b.mesh.position;
        return T(p.x, p.y + 1.4, p.z, o.dist ?? 12, o.elev ?? 3.0);
      }
      if (what === "tunnel") {
        const poi = data.poiById.get(o.id || "dhalli_tunnel");
        const w = geo.toWorld(poi.lat, poi.lon);
        const y = terrain.heightAt(w.x, w.z);
        return T(w.x, y + 3.0, w.z, o.dist ?? 22, o.elev ?? 2.0);
      }
      if (what === "poi") {
        const poi = data.poiById.get(o.id);
        if (!poi) return null;
        const w = geo.toWorld(poi.lat, poi.lon);
        const y = terrain.heightAt(w.x, w.z);
        return T(w.x, y + (o.up ?? 4), w.z, o.dist ?? 30, o.elev ?? 8);
      }
      return null;
    },

    /** Ek dukan ke theek saamne khade ho jao -- bazaar ki jaanch ke liye. */
    viewShop(i = 0, dist = 9, height = 3.2, skew = 0) {
      const st = bazaar.userData.stalls[i % bazaar.userData.stalls.length];
      if (!st) return null;
      const a = st.yaw + skew;
      const fx = Math.sin(a), fz = -Math.cos(a);             // dukan ka mukh
      debugCam = true;
      camera.position.set(st.x + fx * dist, st.y + height, st.z + fz * dist);
      camera.lookAt(st.x, st.y + 3.4, st.z);
      return { i, x: st.x, y: st.y, z: st.z, yaw: st.yaw, kind: st.kind };
    },
    /**
     * Kirdaaron ki line-up -- sirf screenshot/review ke liye. Sadak pe chalne
     * wali bheed abhi nahi hai; ye sirf models dikhata hai.
     */
    showcase(spacing = 1.5) {
      // Khuli jagah dhoondo -- warna line-up kisi deewar ke andar khadi hoti hai
      const p0 = { x: player.pos.x, z: player.pos.z };
      outer:
      for (let r = 0; r <= 14; r++) {
        for (let a = 0; a < 16; a++) {
          const th = (a / 16) * Math.PI * 2;
          const cx = player.pos.x + Math.cos(th) * r * 6;
          const cz = player.pos.z + Math.sin(th) * r * 6;
          let clear = true;
          for (let i = -4; i <= 4 && clear; i++) {
            const tx = cx + i * spacing, tz = cz - 4.5;
            const ty = terrain.heightAt(tx, tz);
            if (colliders.inside(tx, ty + 1, tz, 2.2)) clear = false;
            if (Math.abs(terrain.heightAt(tx, tz) - ty) > 1.5) clear = false;
          }
          if (clear) { p0.x = cx; p0.z = cz; break outer; }
        }
      }
      const grp = new THREE.Group();
      grp.name = "showcase";
      const row = [
        buildHuman({ build: "male", top: 0x2f5d8a, bottom: 0x3b3b42, topi: true }),
        buildHuman({ build: "male", skin: 0xa9744a, top: 0xbb3a2a, bottom: 0x35425e, topi: true }),
        buildHuman({ build: "female", skin: 0xc9946a, top: 0xa8324f, bottom: 0x2f3b52,
                     dupatta: 0xd8b23f, topi: false }),
        buildHuman({ build: "female", skin: 0xb98255, top: 0x2f7d63, bottom: 0x453a52,
                     dupatta: 0xe08a3c, topi: false }),
        buildHuman({ build: "elder", skin: 0xb07a52, top: 0x6f6a5c, bottom: 0x4a4438,
                     shawl: 0x8a8574, topi: true }),
        buildDog({ coat: 0xa97f56 }),
        buildDog({ coat: 0x6f5a44 }),
        buildCow({ hide: 0xb59a76 }),
      ];
      row.forEach((m, i) => {
        const x = p0.x + (i - (row.length - 1) / 2) * spacing;
        const z = p0.z - 4.5;
        m.position.set(x, terrain.heightAt(x, z), z);
        m.rotation.y = Math.PI;      // camera ki taraf mooh
        grp.add(m);
      });
      scene.add(grp);
      showcaseGroup = grp;
      return { count: row.length, x: p0.x, z: p0.z, y: terrain.heightAt(p0.x, p0.z) };
    },
    press: (code) => { input.keys.add(code); },
    release: (code) => { input.keys.delete(code); },
  };

  requestAnimationFrame(frame);
  addEventListener("beforeunload", () => saveGame(state));
}

boot().catch((e) => {
  lmsg.textContent = "Boot fail: " + (e?.message || e);
  const err = document.getElementById("err");
  err.style.display = "block";
  err.textContent = (e?.stack || String(e));
  console.error(e);
});
