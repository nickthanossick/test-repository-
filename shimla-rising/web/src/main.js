import * as THREE from "three";
import { loadAll } from "./data.js";
import { GeoReference } from "./geo.js";
import { Terrain } from "./terrain.js";
import { RoadNetwork } from "./roads.js";
import { buildCity } from "./city.js";
import { Sky } from "./sky.js";
import { Weather } from "./weather.js";
import { Input } from "./input.js";
import { Player } from "./player.js";
import { Vehicle } from "./vehicle.js";
import { ChaseCamera } from "./chase-camera.js";
import { WantedSystem } from "./wanted.js";
import { MissionSystem } from "./missions.js";
import { Dialogue } from "./dialogue.js";
import { HUD } from "./hud.js";
import { Audio } from "./audio.js";
import { saveGame, loadGame } from "./save.js";

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
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // ACES film ke liye achha hai par shadow-side ko itna crush karta hai ki
  // imaaraton ke bina-dhoop wale mukh bilkul kaale ho jaate the. Stylized
  // low-poly look mein rang jaisa authored hai waisa hi chahiye, isliye
  // tone mapping band -- intensity neeche se hi control ki hai.
  renderer.toneMapping = THREE.NoToneMapping;
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
  scene.add(terrain.buildMesh(8, 96));

  setProgress(0.70, "sadkein bichha rahe hain…");
  const roads = new RoadNetwork(geo, terrain, data.roads);
  scene.add(roads.buildMesh());

  setProgress(0.80, "Shimla bas raha hai…");
  const city = buildCity(terrain, roads, data.districts, data.pois, mulberry32(31104877));
  scene.add(city);

  setProgress(0.90, "aasman aur mausam…");
  const sky = new Sky(scene, terrain);
  const weather = new Weather(scene, terrain);
  const month = new Date().getMonth() + 1;
  weather.set(Weather.forMonth(month));

  // ------------------------------------------------------------------ actors
  setProgress(0.95, "Vicky taiyaar ho raha hai…");
  const player = new Player(terrain);
  scene.add(player.mesh);

  // aas-paas kuch gaadiyan khadi kar do
  const parked = [];
  const rng = mulberry32(770317);
  const spots = ["vicky_garage", "sanjauli_chowk", "isbt", "railway_station", "lakkar_bazaar",
    "chhota_shimla", "kasumpti_market", "new_shimla_loop", "guru_dhaba", "bali_yard",
    "annandale_ground", "hpu", "dhalli", "timber_depot"];
  const kinds = ["taxi", "scooter", "bolero", "hrtc_bus", "timber_truck"];
  for (const id of spots) {
    const p = data.poiById.get(id);
    if (!p) continue;
    const w = geo.toWorld(p.lat, p.lon);
    const n = roads.nearestNode(w.x, w.z, (r) => r.type !== "pedestrian" && r.type !== "rail");
    if (!n) continue;
    const kind = id === "isbt" ? "hrtc_bus" : id === "timber_depot" ? "timber_truck"
      : kinds[(rng() * kinds.length) | 0];
    const v = new Vehicle(data.vehicleById.get(kind), terrain);
    v.placeAt(n.node.pos.x + (rng() - 0.5) * 6, n.node.pos.z + (rng() - 0.5) * 6, rng() * Math.PI * 2);
    scene.add(v.mesh);
    parked.push(v);
  }

  // ----------------------------------------------------------------- systems
  const input = new Input(renderer.domElement);
  const colliders = city.userData.colliders;
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
    const home = new Vehicle(data.vehicleById.get("taxi"), terrain);
    // sadak pe khadi karo, ghaas pe nahi
    const rn = roads.nearestNode(player.pos.x, player.pos.z, (r) => r.type !== "pedestrian" && r.type !== "rail");
    const base = rn ? rn.node.pos : { x: player.pos.x + 4, z: player.pos.z + 3 };
    const hs = colliders.freeSpotNear(base.x, base.z, terrain.heightAt(base.x, base.z) + 1, 3);
    home.placeAt(hs.x, hs.z, 0.6);
    scene.add(home.mesh);
    parked.push(home);
  }
  const dialogue = new Dialogue(document.getElementById("subtitle"), data);
  const audio = new Audio();
  const wanted = new WantedSystem(scene, terrain, roads, data.vehicleById);
  const missions = new MissionSystem(scene, terrain, data);

  const state = { money: 2500, hour: 9.5, mode: "foot", vehicle: null, player, missions, weather };

  const saved = loadGame();
  if (saved) {
    state.money = saved.money ?? state.money;
    state.hour = saved.hour ?? state.hour;
    if (saved.completed) missions.completed = new Set(saved.completed);
    if (saved.available) missions.available = new Set(saved.available);
    if (saved.pos) player.placeAt(saved.pos.x, saved.pos.z);
    if (saved.weather) weather.set(saved.weather);
    missions._refreshStartMarkers();
  }

  wanted.onStarsChanged = (n) => {
    hud.setStars(n);
    audio.siren(n > 0);
    if (n === 1) dialogue.play("generic:wanted");
  };
  hud.setStars(0);
  hud.setMoney(state.money);
  sky.setTime(state.hour);
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
    if (input.pressed("KeyH")) {
      helpOn = !helpOn;
      document.getElementById("help").style.display = helpOn ? "" : "none";
    }
    if (input.pressed("KeyP")) { saveGame(state); hud.toast("Save ho gaya"); }
    if (input.pressed("Digit1")) { state.hour = (state.hour + 3) % 24; sky.setTime(state.hour); weather.set(weather.mode); }
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
      chase.update(dt, v.pos, "vehicle", v.yaw);
      audio.setEngine(v.kmh, v.spec.top_speed_kmh, true);
      hud.setSpeed(v.kmh, v.spec.name);
    } else {
      player.update(dt, {
        forward: input.axis("KeyS", "KeyW") || input.axis("ArrowDown", "ArrowUp"),
        strafe: input.axis("KeyA", "KeyD") || input.axis("ArrowLeft", "ArrowRight"),
        run: input.down("ShiftLeft") || input.down("ShiftRight"),
        jump: input.down("Space"),
      }, chase.yaw);
      chase.update(dt, player.pos, "foot");
      hud.setSpeed(0, player.running ? "daud rahe ho" : "paidal");
    }

    wanted.update(dt, pos, state.mode === "vehicle", weather.grip, district, onRoad);
    missions.update(dt, { playerPos: pos, inVehicle: state.mode === "vehicle", stars: wanted.stars });
    weather.update(dt, camera);
    sky.update(camera);
    dialogue.update(dt);

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
    ready: true, scene, camera, renderer, terrain, roads, city, player, missions, wanted,
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
