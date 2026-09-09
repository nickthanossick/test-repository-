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
import { Traffic } from "./traffic.js";
import { Crowd } from "./crowd.js";
import { Panga } from "./panga.js";
import { Combat } from "./combat.js";
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
import { Flashcards } from "./flashcards.js";
import { Dialogue } from "./dialogue.js";
import { HUD } from "./hud.js";
import { Audio } from "./audio.js";
import { saveGame, loadGame } from "./save.js";
import { PostFX } from "./postfx.js";

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
const lpct = document.getElementById("lpct");
const setProgress = (f, msg) => {
  const pct = Math.max(0, Math.min(100, Math.round(f * 100)));
  lbar.style.width = pct + "%";
  if (lpct) lpct.textContent = pct + "%";
  if (msg) lmsg.textContent = msg;
};
/*
 * Browser ko ek frame paint karne do.
 *
 * Nikhil: *"game shuru me jb load ni hoti to percentage me dikhya kr"*. Sirf
 * number dikhana kaafi nahi tha: `setProgress(0.5)` ke baad poori duniya
 * (terrain, sadak, sheher, jungle, landmarks) **ek hi synchronous block**
 * mein banti thi, isliye browser beech mein paint karta hi nahi tha aur bar
 * 45% par jam kar seedha 100% par kood jaati thi -- yaani number hota bhi to
 * jhootha lagta.
 *
 * Do `requestAnimationFrame` isliye ki ek ke baad style laga to hoti hai par
 * hamesha paint nahi hoti; doosre tak wo screen par aa chuki hoti hai.
 */
const yieldFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

async function boot() {
  setProgress(0.02, "Shimla ka data aa raha hai…");
  const data = await loadAll((f, name) => setProgress(f * 0.45, name));

  const geo = new GeoReference(data.geo);
  setProgress(0.5, "terrain ban raha hai…");
  await yieldFrame();
  const terrain = new Terrain(geo, data.terrainMeta, data.heightmapImage);
  terrain.geo = geo;

  // ---------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });

  // Device dekh kar quality tier chuno. Wahi scene jo laptop pe 60 fps deta hai
  // phone pe 8 fps dega, isliye terrain density, ped, shadow map aur pixel ratio
  // sab tier se aate hain. `Q` se badla ja sakta hai.
  /*
   * Tier: URL se, phir save se, phir auto-detect.
   *
   * `?tier=high` isliye zaroori hai ki headless test hamesha SwiftShader par
   * chalta hai aur `detect()` use hamesha `low` deta hai -- yaani `medium`
   * aur `high` ka load naapa hi nahi ja sakta tha. Pichhle round ka poora
   * naap `low` ka tha, jabki khiladi `high` par tha. Ab `perf.mjs` teenon
   * tier maap sakta hai.
   */
  const urlTier = new URLSearchParams(location.search).get("tier");
  const savedTier = (loadGame() || {}).quality;
  let tier = Quality.TIERS.includes(urlTier) ? urlTier
    : Quality.TIERS.includes(savedTier) ? savedTier : Quality.detect(renderer);
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

  /*
   * Post-processing.
   *
   * Nikhil: *"ye realistic kyu ni lgre?"* -- iska sabse bada jawab yahi tha
   * ki post-processing thi hi nahi. Ab AO (aur `high` par halka bloom) hai.
   * `low` par band rehta hai; wahan seedha `renderer.render()` chalta hai.
   */
  const post = new PostFX(renderer, scene, camera, Q.post);
  console.info(`[Shimla] post-processing: ${post.enabled ? "on" : "off"}`);

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    post.setSize(s.x, s.y);
  });

  // ------------------------------------------------------------------- world
  /*
   * Kram badla (round 21): pehle sadak ka network banao, phir zameen ko sadak
   * tak grade karo (`carveToRoads`), tab terrain mesh banao. Warna dikhne wali
   * zameen sadak ke neeche apni dhalan par reh jaati thi aur beech ka gap oonchi
   * grey deewar dhakti thi. Road nodes apni `y` raw terrain se pehle hi cache
   * kar lete hain, isliye `groundAt()`/physics nahi badalte.
   */
  setProgress(0.62, "sadkein bichha rahe hain…");
  await yieldFrame();
  const roads = new RoadNetwork(geo, terrain, data.roads);

  setProgress(0.68, "pahad ko sadak tak tarash rahe hain…");
  await yieldFrame();
  terrain.carveToRoads(roads);
  scene.add(terrain.buildMesh(8, Q.terrainQuads, roads));

  const roadGroup = roads.buildMesh();
  scene.add(roadGroup);

  /*
   * Zameen ki asli oonchai -- sadak ki satah samet. Khiladi, gaadi aur bus
   * sab isse lete hain; sirf terrain lene par sadak par sab aadha dhansa
   * rehta tha (sadak ka mesh terrain se 0.5 m upar hai).
   *
   * `surfaceAt` pehle: chowk/tunnel par jahan sadkein cross karti hain, gaadi
   * bhi **sabse upar** wali par chale, niche wali ke andar nahi. Sadak ke bahar
   * `groundAt` terrain de deta hai.
   */
  const groundAt = (x, z) => roads.surfaceAt(x, z) ?? roads.groundAt(x, z);
  let forest = null;

  setProgress(0.80, "Shimla bas raha hai…");
  await yieldFrame();
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
  const bazaar = buildBazaar(terrain, roads, data.shops, data.sanjauliMap, data.pois, Q, colliders);
  scene.add(bazaar);

  const tunnels = buildTunnels(terrain, roads, data.pois, colliders);
  scene.add(tunnels);

  // R30: Nikhil ne poora generic Shimla map hatane ko kaha -- ab world sirf
  // Sanjauli Chowk -> Dhalli corridor hai. `scatter:false` generic ghar band
  // karta hai; `corridorLandmarks` sirf corridor ke landmark banata hai. Forest
  // (pahad ki hariyali) aur bazaar corridor waise hi rehte hain.
  const city = buildCity(terrain, roads, data.districts, data.pois, mulberry32(31104877), Q,
                         { keepClear: bazaar.userData.stalls, colliders,
                           scatter: false, corridorLandmarks: true });
  scene.add(city);
  forest = city.getObjectByName("forest");

  setProgress(0.90, "aasman aur mausam…");
  await yieldFrame();
  const sky = new Sky(scene, terrain, renderer);
  sky.shadowRadius = Q.shadowRadius;
  sky.sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
  const weather = new Weather(scene, terrain);
  const month = new Date().getMonth() + 1;
  weather.set(Weather.forMonth(month));
  const dayNight = new DayNight(scene, sky, weather, { hour: 8.5, month, dayMinutes: 24 });

  // ------------------------------------------------------------------ actors
  setProgress(0.95, "Vicky taiyaar ho raha hai…");
  await yieldFrame();
  /*
   * Khiladi ki zameen mein **campus ka farsh** bhi shaamil hai.
   *
   * `groundAt` sirf terrain + sadak deta hai. College ka campus ek ooncha
   * cut-and-fill slab hai; uspar khada karne se Vicky uske andar dab jaata
   * tha -- aur "college ke andar se shuru" isi wajah se mumkin nahi tha.
   *
   * Gaadi ko ye **nahi** milta (`groundAt` waisa hi rehta hai), warna cars
   * campus ke terrace par chadh jaayengi.
   */
  roads.setPlatforms(city.userData.platforms);
  const playerGround = (x, z) => {
    /*
     * Sadak par farsh nahi chalta, aur **sabse upar wali** sadak par khade ho.
     *
     * College road campus ki aayat ke beech se guzarti hai, aur wahan farsh
     * sadak se 2.7 m neeche baithta tha -- yaani sadak par chalte hi khiladi
     * usme dhas jaata tha. Sadak ki apni satah hamesha jeetegi.
     *
     * `surfaceAt` (groundAt nahi) isliye ki chowk/tunnel par jahan sadkein cross
     * karti hain, khiladi niche wali ke bajaye **upar** wali par baithe -- warna
     * upar wali sadak ka mesh sar ke upar aa jaata (Nikhil: "banda dhans gaya").
     */
    const rs = roads.surfaceAt(x, z);
    if (rs !== null) return rs;
    const p = roads.platformAt(x, z);
    /*
     * Farsh **hamesha** jeetta hai, `Math.max()` nahi.
     *
     * Pehli koshish mein maine `p > g ? p : g` likha tha -- ye maan kar ki
     * terrace hamesha zameen se ooncha hoga. Naapne par ulta nikla: spawn wale
     * bindu par plaza 2228.96 hai aur raw terrain 2231.54 -- yaani farsh
     * zameen se **2.6 m neeche**. Wajah saaf hai: terrace cut-**and**-fill se
     * banta hai; dhalan ke upri hisse ko *kaata* jaata hai aur neeche wale ko
     * bhara. `max()` lene se khiladi us kate hue pahad par khada ho jaata tha,
     * yaani slab ke andar.
     *
     * Kata hua hissa aankh ko dikhta bhi nahi (uske saamne retaining wall hai,
     * jo collider bhi hai), isliye farsh ke andar aakar terrain ka koi matlab
     * nahi rehta.
     */
    return p !== null ? p : roads.groundAt(x, z);
  };
  const player = new Player(terrain, colliders, playerGround);
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
    const v = new Vehicle(data.vehicleById.get(kind), terrain, { colliders, ground: groundAt, roads });
    v.placeAt(n.node.pos.x + (rng() - 0.5) * 6, n.node.pos.z + (rng() - 0.5) * 6, rng() * Math.PI * 2);
    scene.add(v.mesh);
    parked.push(v);
  }

  // ----------------------------------------------------------------- systems
  const input = new Input(renderer.domElement);
  const chase = new ChaseCamera(camera, terrain, colliders);
  const hud = new HUD(data, terrain);

  let startAt = null;    // naya khel kahan shuru hua -- smoke test isse padhta hai
  // R30: Nikhil ne missions hatane ko kaha -- abhi sirf free-roam world (Sanjauli
  // Chowk -> Dhalli). Koi intro, koi mission marker, koi mission HUD panel.
  const MISSIONS_ON = false;
  /** POI pe rakho, par imaarat ke andar nahi -- pehle khaali jagah dhoondo. */
  function safeSpot(poiId, fallbackOffset = 6) {
    const p = data.poiById.get(poiId);
    const w = geo.toWorld(p.lat, p.lon);
    const y = terrain.heightAt(w.x, w.z) + 1.0;
    return colliders.freeSpotNear(w.x + fallbackOffset, w.z + fallbackOffset, y, 2.5);
  }
  {
    /*
     * Nikhil: *"game shuru hmesha college k andr s hogi"*. Pehle spawn gate
     * par tha -- sadak par, campus ke bahar. Ab `landmarks.js` ka college
     * builder khud forecourt ka bindu deta hai (`spawns`), jo campus ke farsh
     * par hai. Wo farsh ab `playerGround` ko dikhta hai, isliye Vicky uspar
     * khada hota hai, andar nahi dhansta.
     */
    const camp = (city.userData.spawns || []).find((sp) => sp.id === "college");
    /*
     * Spawn wahan jahan campus ka farsh **hai aur sadak nahi**.
     *
     * Builder ka bindu forecourt par hai, par college road ab 13 m chaudi hai
     * aur us bindu ke upar se guzarti hai. Sadak ki satah farsh se jeetti hai
     * (upar `playerGround`), isliye khiladi terrace ke bajaye sadak par --
     * yaani farsh se 2.6 m upar -- aa jaata tha.
     *
     * Isliye jagah **dhoondhte** hain, maan kar nahi chalte: builder ke bindu
     * se bahar ki taraf ghere mein wo pehli jagah lo jahan platform mile aur
     * sadak na ho. Ye khud theek karta rehta hai -- sadak phir chaudi ho to
     * spawn apne aap aur andar khisak jaayega.
     */
    let campSpot = null;
    if (camp) {
      outer2:
      for (const r of [0, 4, 8, 12, 16, 20, 26]) {
        for (let a = 0; a < 12; a++) {
          const th = (a / 12) * Math.PI * 2;
          const x = camp.x + Math.cos(th) * r, z = camp.z + Math.sin(th) * r;
          if (roads.platformAt(x, z) === null) continue;
          if (roads.roadAt(x, z, 2.5)) continue;           // sadak se door raho
          if (colliders.inside(x, playerGround(x, z) + 1.0, z, 0.6)) continue;
          campSpot = { x, z };
          break outer2;
        }
      }
    }
    // R30: naya khel Sanjauli Chowk par shuru -- corridor ka dil, footbridge ke
    // neeche. (College campus ab corridor mein nahi, isliye camp null rehta hai.)
    const s0 = campSpot
      ? colliders.freeSpotNear(campSpot.x, campSpot.z, playerGround(campSpot.x, campSpot.z) + 1.0, 2.0)
      : safeSpot("sanjauli_chowk", 9);
    player.placeAt(s0.x, s0.z);
    // test ke liye: khel kahan shuru hua (spawn baad mein save se badal sakta hai)
    startAt = { x: player.pos.x, y: player.pos.y, z: player.pos.z };
    /*
     * Pehla rukh. Campus ke andar sadak ka rukh bekaar hai (sadak campus ke
     * bahar hai aur uske saath dekhne par pehla frame ek deewar ban jaata
     * hai), isliye wahan builder ka apna `yaw` chalta hai -- forecourt se
     * mukhya building ki taraf. Gate wale purane raaste par (fallback) wahi
     * sadak-align wala hisaab rehta hai.
     */
    if (camp && campSpot) {
      chase.yaw = camp.yaw;
      player.yaw = camp.yaw;
      chase.pitch = 0.24;
      chase._init = false;
    } else {
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
  }
  {
    // Vicky ki apni taxi, garage ke bahar. Khiladi ko dhoondhna na pade.
    const home = new Vehicle(data.vehicleById.get("taxi"), terrain, { colliders, ground: groundAt, roads });
    // sadak pe khadi karo, ghaas pe nahi
    const rn = roads.nearestNode(player.pos.x, player.pos.z, (r) => r.type !== "pedestrian" && r.type !== "rail");
    const base = rn ? rn.node.pos : { x: player.pos.x + 4, z: player.pos.z + 3 };
    const hs = colliders.freeSpotNear(base.x, base.z, terrain.heightAt(base.x, base.z) + 1, 3);
    home.placeAt(hs.x, hs.z, 0.6);
    scene.add(home.mesh);
    parked.push(home);
  }
  const buses = new BusSystem(scene, terrain, data.sanjauliMap, data.routes,
                              data.vehicleById, Q.buses ?? 5, groundAt);
  /*
   * Chalti hui traffic.
   *
   * Nikhil: *"road p koi car nahi h na kuch"*. Buses route par chalti thi aur
   * `parked` gaadiyan khadi -- beech ki aam traffic thi hi nahi. `traffic.js`
   * wahi polyline wala tareeka istemaal karta hai, aur door ki gaadi ek merged
   * mesh ban jaati hai taaki draw call na phate.
   */
  const traffic = new Traffic(scene, terrain, roads, data.vehicleById, {
    count: Q.traffic ?? 12, ground: groundAt, audio: null, rng: mulberry32(5150321),
  });
  // Bus system pehle se saare segment world-space mein resample kar chuka hai --
  // paidal log usi par chalte hain, taaki dono ek hi naksha follow karein.
  const crowd = new Crowd(scene, terrain, roads, bazaar.userData.stalls,
                          Q.crowd ?? { keepers: 42, walkers: 28, dogs: 3, cows: 2 },
                          // campus jaisi jagahein jo kisi sadak-segment par nahi hain --
                          // college ke andar students inhi par khade hote hain
                          buses.segs, city.userData.crowdSpots);

  const dialogue = new Dialogue(document.getElementById("subtitle"), data);
  const audio = new Audio();
  // traffic audio se pehle banti hai (usse roads chahiye), isliye horn ka
  // raasta yahan judta hai
  traffic.audio = audio;
  const wanted = new WantedSystem(scene, terrain, roads, data.vehicleById);
  const missions = new MissionSystem(scene, terrain, data);
  // R30: free-roam -- koi mission marker (3D + minimap) aur koi startable nahi.
  if (!MISSIONS_ON) { missions.markers.clear(); missions.available.clear(); }
  /*
   * Flashcards. Card ke peeche us jagah ka asli shot aata hai: camera wahin
   * `lookAt()` se jaata hai (wahi ray-march wala jo deewar ke peeche nahi
   * phasta) aur ek frame seedha render hota hai -- main loop us waqt ruka
   * hua hota hai, isliye render yahan se karana padta hai.
   */
  const flashcards = new Flashcards(document.getElementById("flash"), {
    poiExists: (id) => !!data.poiById.get(id),
    lookAt: (id, dist, elev) => {
      const p = data.poiById.get(id);
      const w = geo.toWorld(p.lat, p.lon);
      const y = terrain.heightAt(w.x, w.z);
      debugCam = true;
      window.__shimla?.lookAt?.(w.x, y + 2.2, w.z, dist, elev);
    },
    render: () => post.render(),
  });

  const state = { money: 2500, mode: "foot", get quality() { return tier; }, vehicle: null, player, missions, weather,
                  get startX() { return startAt?.x; }, get startY() { return startAt?.y; },
                  get startZ() { return startAt?.z; },
                  get hour() { return dayNight.hour; }, set hour(h) { dayNight.hour = h; } };

  // Awaaz state ke saath jaati hai, taaki `saveGame` use likh sake
  state.audio = audio;
  audio.onVolume = (v, m) => hud.setVolume(v, m);

  const saved = loadGame();
  if (saved) {
    // Awaaz abhi shuru nahi hui (browser pehle gesture maangta hai), isliye
    // seedha field bhar dete hain -- `start()` inhi se master gain lagata hai.
    if (typeof saved.volume === "number") audio.volume = Math.max(0, Math.min(1, saved.volume));
    if (typeof saved.muted === "boolean") audio.muted = saved.muted;
    if (saved.voice) audio.voiceName = saved.voice;
    state.money = saved.money ?? state.money;
    state.hour = saved.hour ?? state.hour;
    if (saved.completed) missions.completed = new Set(saved.completed);
    if (saved.available) missions.available = new Set(saved.available);
    if (saved.pos) {
      // `playerGround` se, `terrain.heightAt` se nahi -- warna sadak par save
      // karke load karne par khiladi uski satah se aadha metre neeche aata hai
      // (aur campus ke farsh par to poore teen metre).
      const sp = colliders.freeSpotNear(saved.pos.x, saved.pos.z,
                                        playerGround(saved.pos.x, saved.pos.z) + 1, 1.2);
      /*
       * Save ki position kisi deewar/imaarat ke andar to nahi?
       *
       * Nikhil ka gussa isi se tha: `file://` par Chrome saara localStorage ek
       * hi origin mein rakhta hai, isliye purani download ka save nayi build
       * mein load ho jaata tha -- aur jis jagah wo khada tha wahan ab (badli
       * hui geometry mein) deewar hai. Camera deewar ke andar, sab grey. v2 key
       * ne purane save maar diye, par aage bhi koi geometry badle to yahan
       * jaanch: agar bahaal ki hui jagah kisi collider ke andar ho, college ke
       * andar wapas bhej do.
       */
      if (colliders.inside(sp.x, playerGround(sp.x, sp.z) + 1.0, sp.z, 0.5)) {
        player.placeAt(startAt.x, startAt.z);
      } else {
        player.placeAt(sp.x, sp.z);
      }
    }
    if (saved.weather) weather.set(saved.weather);
    if (MISSIONS_ON) missions._refreshStartMarkers();
  }

  /*
   * Pehli baar khelne par intro deck -- Vicky ki back story.
   *
   * Sirf naye khel par: save maujood hai to khiladi ye pehle dekh chuka hai
   * aur har baar dobara dikhana chidhane wala hota.
   */
  /*
   * R30: missions hata diye -- naya khel seedha free-roam mein Sanjauli Chowk
   * par shuru hota hai. Na intro deck, na pehla mission. (MISSIONS_ON=true
   * karne par purana intro+mission flow wapas aa jaata hai.)
   */
  if (!saved && MISSIONS_ON) {
    const begin = () => {
      const first = missions.byId.get(data.missions.start_mission);
      if (first && !missions.active) requestAnimationFrame(() => missions.start(first));
    };
    if (data.missions.intro?.length) {
      requestAnimationFrame(() => flashcards.play(data.missions.intro, () => {
        debugCam = false;
        chase._init = false;
        begin();
      }));
    } else {
      requestAnimationFrame(begin);
    }
  }

  // NPC se takrane par jhagda. Ye missions se bilkul alag hai.
  const panga = new Panga(crowd, { dialogue, hud, audio, wanted, player });
  /*
   * Danda aur pathar. `panga` NPC -> khiladi hai, `combat` khiladi -> NPC.
   * Dono ek hi bheed par chalte hain aur ek hi `wanted` mein heat daalte hain.
   */
  const combat = new Combat({ crowd, wanted, hud, audio, dialogue, player,
                              scene, terrain, panga });

  /*
   * Pakde jaana.
   *
   * Nikhil: "jaise e marega waise arrest hoga". `wanted.js` ka constable 2.2 m
   * ke andar 1.2 second rahe to yahan aa jaata hai: wanted 0, saara pathar
   * saaf, chowki ke bahar, aur 30% paise jurmane mein.
   */
  wanted.onArrest = () => {
    const fine = Math.round(state.money * 0.30);
    state.money = Math.max(0, state.money - fine);
    hud.setMoney(state.money);
    wanted.clear();
    combat.clear();
    player.health = Math.max(35, player.health);
    const sp = safeSpot("sanjauli_police", 12);
    player.placeAt(sp.x, sp.z);
    if (state.mode === "vehicle") toggleVehicle();
    chase._init = false;
    hud.toast(`BUSTED — Sanjauli chowki. Jurmana ₹${fine.toLocaleString("en-IN")}`, 5);
    audio.blip(140, 0.5, 0.35);
    saveGame(state);
  };

  wanted.onStarsChanged = (n) => {
    hud.setStars(n);
    audio.siren(n > 0);
    if (n === 1) dialogue.play("generic:wanted");
  };
  dayNight.bindEmissive({
    windows: city.userData.windowMaterial,
    signs: [...(city.userData.glowingSigns || []), ...(bazaar.userData.glowingSigns || [])],
    shops: bazaar.userData.interiorMaterial ? [bazaar.userData.interiorMaterial] : [],
    lamps: roadGroup.userData.lampMaterial,
  });

  hud.setStars(0);
  hud.setMoney(state.money);
  if (weather.mode === "snow") dialogue.play("generic:snow");

  /*
   * Awaaz browser ki autoplay policy ke chalte pehle user gesture par hi shuru
   * ho sakti hai -- isliye har jagah `audio.start()` ki jagah yeh, jo music bhi
   * chalu kar deta hai.
   */
  function startAudio() {
    audio.start();
    audio.startMusic();
    audio.startAmbience();
    hud.setVolume(audio.volume, audio.muted);
  }
  addEventListener("keydown", startAudio, { once: true });
  addEventListener("pointerdown", startAudio, { once: true });

  /*
   * Jo line subtitle mein dikhti hai wahi boli bhi jaati hai.
   *
   * Nikhil ne gaaliyan sunai dene ko kaha tha. Sound file download nahi ho
   * sakti (saare free-sound host block hain), par browser ki apni Web Speech
   * API kaafi hai -- koi download nahi. Gaali thodi tez aur neeche ki awaaz
   * mein, taaki wo gaali lage.
   */
  dialogue.onLine = (line) => {
    /*
     * Har kirdaar ki apni awaaz.
     *
     * Nikhil: *"ladke ki awaj ho vicky ki"*. Pehle sab ek hi pitch/rate par
     * bolte the aur voice bhi bina lingg dekhe chuni jaati thi -- jis machine
     * par pehli Hindi voice aurat ki thi (aam baat hai) wahan Vicky bhi usi
     * mein bolta tha.
     *
     * Profile ab `data/characters.json` mein hai (`voice: {gender, pitch,
     * rate}`) taaki Godot bhi wahi padh sake. Vicky 19 saal ka hai -- pitch
     * 0.78, thodi tez chaal.
     */
    const ch = data.characterById.get(line.speaker);
    const vp = ch?.voice || {};
    const angry = /panga|gali|betiyachu|bedafu|bendaga|bedelo|benduga|bendiyaba/i.test(line.text)
      || line.speaker === "rahgeer";
    /*
     * Nikhil: *"uski awaj mard wali par funny"*.
     *
     * Vicky ka profile pehle pitch 0.78 par tha -- awaaz mard ki to thi par
     * dheemi aur bhaari, chacha jaisi. Wo ab 1.02 / rate 1.16 par hai: wahi
     * mard ki awaaz, par jawaan aur chalti hui. Aur jahan wo masti wali
     * pahadi bhasha bolta hai (bawa, pataka, macho, kat gya) wahan thodi aur
     * oonchi aur tez -- yahi use funny banata hai, awaaz badal kar nahi.
     */
    const masti = /\b(bawa|pataka|macho|kat\s*gya|kat\s*gaya|bhukkad|jhakaas|scene|mast)\b/i
      .test(line.text);
    audio.say(line.text, {
      gender: vp.gender || "male",
      pitch: (vp.pitch ?? 0.9) * (angry ? 0.94 : masti ? 1.08 : 1),
      rate: (vp.rate ?? 1.0) * (angry ? 1.14 : masti ? 1.10 : 1),
      volume: angry || masti ? 1.0 : 0.92,
    });
  };

  missions.onEvent = (type, payload) => {
    switch (type) {
      case "mission_start":
        // Raat wala mission (m05 baudi) apna waqt khud set karta hai
        if (payload.night) { dayNight.hour = 23.4; sky.setTime(23.4, true); }
        dialogue.play(`${payload.id}:start`);
        hud.toast("Mission shuru: " + payload.title, 3);
        audio.blip(880, 0.12);
        break;
      case "cards":
        // Objectives card band hone ke baad hi shuru hote hain. Card camera ko
        // debugCam par le jaata hai, isliye band hote hi chase camera wapas.
        flashcards.play(payload.cards, () => {
          debugCam = false;
          chase._init = false;
          payload.done();
        });
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
    startAudio();
    if (state.mode === "vehicle") {
      const v = state.vehicle;
      const f = v.forward(new THREE.Vector3());
      const side = new THREE.Vector3(-f.z, 0, f.x).multiplyScalar(2.2);
      player.placeAt(v.pos.x + side.x, v.pos.z + side.z, v.yaw);
      player.mesh.visible = true;
      state.mode = "foot"; state.vehicle = null;
      audio.setEngine(0, 1, false);
      audio.setInCar(false);
      hud.toast("Gaadi se utar gaye");
    } else {
      let v = nearestParked(player.pos);
      /*
       * Khadi gaadi na mile to **chalti gaadi roko**.
       *
       * Nikhil: *"gadi rok k andr bethne ka option rkh, gadi wale ko bhar
       * nikal k"*. Traffic ki gaadi apne aap chalti hai, uske paas `Vehicle`
       * ki physics nahi hoti -- isliye yahan use traffic se nikaal kar ek
       * asli `Vehicle` bana dete hain, aur wo aage se `parked` wali hi ho
       * jaati hai. Driver bahar aakar bhaagta hai.
       *
       * Ye chori hai, aur Sanjauli bhari sadak hai -- isliye heat lagti hai.
       */
      if (!v) {
        const t = traffic.carjack(player.pos, 7);
        if (t) {
          v = new Vehicle(data.vehicleById.get(t.spec.id) || t.spec, terrain,
                          { colliders, ground: groundAt, roads });
          v.placeAt(t.x, t.z, t.yaw);
          scene.add(v.mesh);
          parked.push(v);
          wanted.add(16);
          audio.horn(0.5, 0.14);
          dialogue.playOne("vicky:chori");
          hud.toast(`${t.spec.name} kheench li — bhaag ab!`, 3);
        }
      }
      if (!v) { hud.toast("Aas-paas koi gaadi nahi"); return; }
      state.mode = "vehicle"; state.vehicle = v;
      player.mesh.visible = false;
      chase.yaw = v.yaw;
      hud.toast(v.spec.name + " mein baith gaye");
    }
  }

  function tryStartMission() {
    if (!MISSIONS_ON) { hud.toast("Free-roam: Sanjauli ghoomo, Dhalli tunnel tak jao."); return; }
    const m = missions.startableAt(playerWorldPos());
    if (m) { missions.start(m); return; }
    if (!missions.active) hud.toast("Yahan koi mission nahi. Peela marker dhoondo.");
  }

  const _pp = new THREE.Vector3();
  function playerWorldPos() {
    return state.mode === "vehicle" ? _pp.copy(state.vehicle.pos) : _pp.copy(player.pos);
  }

  /**
   * Vicky is waqt kis baare mein bade-bade bolega.
   *
   * Sabse zaroori haal pehle: police, gaadi, thakan. Uske baad jagah aur
   * waqt. Ye kram maayne rakhta hai -- police peeche ho aur wo bazaar ke
   * rate ki baat kare to bewakoof lagta hai.
   */
  function idleKey(pos, district) {
    if (wanted.stars > 0) return "vicky:idle:police";
    if (state.mode === "vehicle") return "vicky:idle:gaadi";
    if (player.stamina < 22) return "vicky:idle:thaka";
    if (weather.mode === "snow" || weather.mode === "rain") return "vicky:idle:thanda";
    const h = dayNight.hour;
    if (h >= 20.5 || h < 5.5) return "vicky:idle:raat";
    const college = data.poiById.get("college_gate");
    if (college) {
      const w = geo.toWorld(college.lat, college.lon);
      if (Math.hypot(pos.x - w.x, pos.z - w.z) < 120) return "vicky:idle:college";
    }
    if (district && /bazaar|chowk|mall|market/i.test(district.name || "")) return "vicky:idle:bazaar";
    let keepersNear = 0;
    for (const k of crowd.keepers) {
      if (k.mesh.visible && k.mesh.position.distanceTo(pos) < 26) keepersNear++;
    }
    if (keepersNear >= 4) return "vicky:idle:bazaar";
    if (missions.active && Math.random() < 0.45) return "vicky:idle:kaam";
    return "vicky:idle:aam";
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
  let ambientTimer = 1.0;  // aas-paas ki awaaz ki ghadi
  let selfTalkTimer = 6;
  let gossipTimer = 4;    // aas-paas ke log aapas mein baat karte hain
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

    /*
     * Flashcard khula ho to duniya rukti hai.
     *
     * `last` upar hi update ho chuka hai, isliye card band hone par dt chhota
     * hi aayega -- ek bada dt khiladi ko deewar ke paar phenk deta. Camera
     * card khud rakhta hai aur render bhi khud karta hai, isliye yahan se
     * seedha lautna theek hai.
     */
    if (flashcards.active) return;

    // ------------------------------------------------------------ input
    chase.handleMouse(input.mouseDX, input.mouseDY);
    chase.handleWheel(input.wheelDY);
    if (input.pressed("KeyF")) toggleVehicle();
    // H -- phone jeb se nikalo / wapas rakho
    if (input.pressed("KeyH") && state.mode === "foot") {
      startAudio();
      hud.toast(player.togglePhone() ? "Phone pe baat" : "Phone jeb mein", 1.6);
    }
    if (input.pressed("KeyE") || input.pressed("Enter")) tryStartMission();
    if (input.pressed("KeyM")) hud.mapScale = hud.mapScale > 0.08 ? 0.055 : 0.13;
    if (input.pressed("ControlLeft") || input.pressed("ControlRight")) {
      runToggle = !runToggle;
      hud.toast(runToggle ? "Daud rahe ho" : "Chal rahe ho", 1.2);
    }
    // `H` phone le chuka hai (round 13), isliye help ab `/` par hai --
    // pehle dono ek hi key par the aur phone nikalte hi help gayab ho jaati thi
    if (input.pressed("Slash")) {
      helpOn = !helpOn;
      document.getElementById("help").style.display = helpOn ? "" : "none";
    }
    /*
     * Awaaz ka control.
     *
     * Nikhil: *"game ki sound b thodi jyda rkhni h ... wo option b de sound
     * badhane ka"*. `M` naksha le chuka hai, isliye mute `N` par hai.
     */
    if (input.pressed("Comma")) { startAudio(); hud.setVolume(audio.nudge(-0.06), audio.muted); }
    if (input.pressed("Period")) { startAudio(); hud.setVolume(audio.nudge(+0.06), audio.muted); }
    if (input.pressed("KeyN")) { startAudio(); hud.setVolume(audio.volume, audio.toggleMute()); }
    /*
     * `V` -- agli awaaz.
     *
     * Har machine par alag voice hoti hain, aur kaun si sabse achhi lagti hai
     * ye code se tay nahi ho sakta. Isliye list ghumti hai aur khiladi khud
     * chunta hai; chuni hui awaaz save mein rehti hai.
     */
    if (input.pressed("KeyV")) {
      const v = audio.cycleVoice();
      hud.toast(v ? `Awaaz: ${v.name} (${v.lang})` : "Is browser mein koi awaaz nahi", 3);
      if (v) { dialogue.playOne("vicky:idle:aam"); saveGame(state); }
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
      // raftaar bhi -- camera usi se aage dekhta hai (look-ahead)
      if (!debugCam) chase.update(dt, v.pos, "vehicle", v.yaw, v.speed);
      if (v.lastImpact) {
        // Deewar se takkar -- zor ke hisaab se awaaz aur nuksan
        audio.blip(90 + Math.min(120, v.lastImpact * 8), 0.18, 0.3);
        if (v.lastImpact > 7) player.health = Math.max(0, player.health - v.lastImpact * 0.8);
        v.lastImpact = 0;
      }
      audio.setEngine(v.kmh, v.spec.top_speed_kmh, true);
      audio.setInCar(true);
      hud.setSpeed(v.kmh, v.spec.name);
    } else {
      /*
       * WASD camera ke hisaab se, arrows bande ke apne rukh mein.
       *
       * Pehle dono ek hi axis par the, isliye arrows se ghoomne wali scheme
       * (jo Nikhil ne chuni thi) thi hi nahi -- aur camera-relative wala axis
       * bhi ulta laga tha.
       */
      player.update(dt, {
        forward: input.axis("KeyS", "KeyW"),
        strafe: input.axis("KeyA", "KeyD"),
        walk: input.axis("ArrowDown", "ArrowUp"),
        turn: input.axis("ArrowLeft", "ArrowRight"),
        run: runToggle || input.anyDown("ShiftLeft", "ShiftRight"),
        jump: input.down("Space"),
      }, chase.yaw);
      // Arrows se ghoome to camera peeche aa jaata hai (mouse se ghumaya ho to
      // wo hukum bhaari -- warna free-look har frame wapas khinch jaata)
      const turning = input.axis("ArrowLeft", "ArrowRight") !== 0;
      if (!debugCam) chase.update(dt, player.pos, "foot", turning ? player.yaw : null);
      /*
       * Paas se chalti gaadi guzre to speedo wali patti hi prompt ban jaati
       * hai -- ek aur toast HUD par chipkane se behtar.
       */
      const jackable = traffic.nearest(player.pos, 7);
      hud.setSpeed(0, jackable ? `F — ${jackable.spec.name} rok lo`
                               : player.running ? "daud rahe ho" : "paidal");
    }

    wanted.update(dt, pos, state.mode === "vehicle", weather.grip, district, onRoad);
    missions.update(dt, { playerPos: pos, inVehicle: state.mode === "vehicle", stars: wanted.stars });
    // Jungle ka LOD -- 240 m ke andar poora ped, aage ek cone.
    // Sirf 64 doori ka hisaab, aur badlav par hi visible toggle hota hai.
    forest?.userData.update?.(camera.position);
    // Khadi gaadiyan bhi -- 70 m ke aage ek merged mesh. 15 doori ka hisaab.
    for (const v of parked) v.setLod(camera.position);
    buses.update(dt);
    traffic.update(dt, pos, camera.position,
                   { night: dayNight.hour >= 18.4 || dayNight.hour <= 6.2 });
    crowd.update(dt, pos);
    panga.update(dt, state.mode === "vehicle"
      ? { pos: state.vehicle.pos, radius: 1.5, inVehicle: true }
      : { pos: player.pos, radius: 0.42, inVehicle: false });
    // Danda/pathar sirf paidal -- gaadi mein baith kar lathi nahi chalti
    combat.update(dt, {
      hit: state.mode === "foot" && input.pressed("KeyG"),
      throw: state.mode === "foot" && input.pressed("KeyR"),
    });
    /*
     * Aas-paas ki awaaz.
     *
     * Har frame ek naya WebAudio node banana mehnga hai, isliye ye ghadi se
     * chalta hai: jitne log paas utni ghani bud-bud, aur bazaar mein kabhi-kabhi
     * ek horn. Dono chhote, apne aap khatam hone wale node hain.
     */
    ambientTimer -= dt;
    if (ambientTimer <= 0) {
      let near = 0;
      for (const w of crowd.walkers) {
        if (w.mesh.visible && w.mesh.position.distanceTo(pos) < 22) near++;
      }
      for (const k of crowd.keepers) {
        if (k.mesh.visible && k.mesh.position.distanceTo(pos) < 22) near++;
      }
      if (near > 0) audio.murmur(near);
      // horn tabhi jab sadak paas ho -- pahad ke beech horn ajeeb lagta hai
      if (onRoad && Math.random() < 0.22) audio.horn(0.3 + Math.random() * 0.3, 0.10);
      ambientTimer = 0.7 + Math.random() * 1.4;
    }
    // Shimla ka apna mahaul -- hawa, chidiya, mandir ki ghanti, raat ko kutte
    audio.updateAmbience(dt, { hour: dayNight.hour, inCar: state.mode === "vehicle" });

    /*
     * Vicky khud se bolta hai.
     *
     * Nikhil: *"vicky khud se b bat krega har 5 second me"*. Theek 5 second par
     * bolna ghadi jaisa lagta hai, isliye 5 se 8 ke beech, aur tabhi jab koi
     * aur baat na chal rahi ho -- warna wo mission ke samvaad ke upar bolta
     * hai.
     *
     * Line jagah aur haal se chunti hai: police peeche ho to alag, gaadi mein
     * alag, thak gaya ho to alag. Isse ye script padhne jaisa nahi, sochne
     * jaisa lagta hai.
     */
    selfTalkTimer -= dt;
    if (selfTalkTimer <= 0) {
      selfTalkTimer = 5 + Math.random() * 3;
      if (!dialogue.busy && !flashcards.active) dialogue.playOne(idleKey(pos, district));
    }

    /*
     * Aas-paas ke **log aapas mein** baat karte hain.
     *
     * Nikhil: *"thode aur dialogues add kr, log aapas m bat kre"* -- aur uske
     * apne diye pahadi taane (tendua ghus gya, sabji mandi mein bendaga, kisko
     * vote). Jab do ya zyada log paas hon aur koi aur baat na chal rahi ho, to
     * ek chhota gappa (do kirdaar) chal jaata hai. Vicky ke khud-se-bolne se
     * alag ghadi, taaki dono ek dusre ke upar na aayein.
     */
    gossipTimer -= dt;
    if (gossipTimer <= 0) {
      gossipTimer = 8 + Math.random() * 6;
      if (!dialogue.busy && !flashcards.active && wanted.stars === 0) {
        let near = 0;
        for (const k of crowd.keepers) {
          if (k.mesh.visible && k.mesh.position.distanceTo(pos) < 30) near++;
        }
        if (near >= 2) dialogue.play(`crowd:gossip${1 + ((Math.random() * 12) | 0)}`);
      }
    }

    dayNight.update(dt, camera);   // waqt, sooraj, taare, raat ki roshni, mausam
    post.setNight(dayNight.nightness);   // Vice City glow -- raat ko poora neon
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
    /*
     * Mission ka display -- **hamesha**, chahe koi mission chal raha ho ya nahi.
     *
     * Nikhil: *"no mission k lie display, map m kitni dur h"*. Pehle mission
     * na hone par HUD ka poora panel chhup jaata tha, isliye save load karne
     * par khiladi ko kuch pata hi nahi chalta tha ki ab kya karna hai aur
     * kahan jaana hai.
     *
     * Ab teen haalat: chal raha mission (uske kaam ke aage doori), koi mission
     * shuru karne layak (uska naam + doori), ya sab poore.
     */
    if (!MISSIONS_ON) {
      hud.setMission(null);          // free-roam: mission panel chhupa rahe
    } else if (missions.active) {
      const target = missions.markers.children.find(
        (mk) => mk.userData?.markerKind === "active" || mk.userData?.markerKind === "objective");
      if (target) {
        const d = Math.hypot(target.position.x - pos.x, target.position.z - pos.z);
        extra = `${extra} ${d >= 1000 ? (d / 1000).toFixed(1) + " km" : Math.round(d) + " m"}`.trim();
      }
      hud.setMission(missions.active, missions.objIndex, extra);
    } else {
      let best = null, bd = Infinity;
      for (const id of missions.available) {
        const m = missions.byId.get(id);
        if (!m || (missions.completed.has(id) && !m.repeatable)) continue;
        const p = missions.poiPos(m.start_poi);
        if (!p) continue;
        const d = Math.hypot(p.x - pos.x, p.z - pos.z);
        if (d < bd) { bd = d; best = m; }
      }
      hud.setNextMission(best, bd);
    }
    hud.setDistrict(district ? district.name : "Shimla ke bahar");
    hud.setBars(player.health, player.stamina);
    hud.update(dt, pos, state.mode === "vehicle" ? state.vehicle.yaw : player.yaw, missions.markers.children);

    if (MISSIONS_ON && !missions.active && missions.startableAt(pos)) hud.toast("E dabao - mission shuru karo", 0.4);

    post.render();
    input.endFrame();
  }

  // debugging ke liye -- Playwright test yahi padhta hai
  window.__shimla = {
    ready: true, THREE, scene, camera, renderer, terrain, roads, city, player, missions, wanted, chase, sky, dayNight,
    bazaar, buses, traffic, crowd, panga, combat, colliders, parked, flashcards, audio, hud, post,
    playerGround,   // test: sadak par player sabse upar wali satah par khada ho

    weather, state, data, get fps() { return fps; },
    /*
     * Post ke addons bundle mein aaye ya nahi.
     *
     * `post.enabled` se ye nahi pata chalta -- `low` tier par composer
     * jaan-boojh kar band rehta hai, aur headless SwiftShader hamesha `low`
     * deta hai. Isliye seedha module ki maujoodgi poochhte hain; artifact ka
     * bundler ek baar addons ko chhod chuka hai aur wo chup-chaap toota tha.
     */
    hasPost: () => post.available,
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
      traffic: traffic.count,
      trafficNear: traffic.movingNear(player.pos),
      keepers: crowd.count.keepers,
      full: crowd.count.full,
      lite: crowd.count.lite,
      far: crowd.count.far,
      angry: panga.angryCount,
      walkers: crowd.count.walkers,
      shopSigns: bazaar.userData.signCount,
    }; },
    /*
     * Test ke liye: saare khule flashcards band karo.
     *
     * Naye khel par ab intro deck apne aap chalta hai aur uske turant baad m01
     * ka deck -- aur card khule hone par main loop poora ruka rehta hai
     * (`if (flashcards.active) return`). Isliye har headless test ko pehle ye
     * bulana padta hai, warna duniya jami hui rehti hai aur traffic/bheed hilti
     * hi nahi.
     */
    async skipCards(max = 8) {
      for (let i = 0; i < max; i++) {
        if (flashcards.active) flashcards.finish();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (!flashcards.active) break;
      }
      return !flashcards.active;
    },
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
      /*
       * Pehle **door** jao, phir **upar**.
       *
       * Pehle ye ulta tha (lift bahar, ring andar), isliye ghane Sanjauli
       * mein camera 17 m upar chadh jaata tha aur flashcard ek top-down
       * tasveer ban jaati thi -- chhatein hi chhatein, jagah pehchani hi nahi
       * jaati thi. Door se neeche wala shot hamesha behtar padhta hai:
       * silhouette dikhta hai, pahad dikhta hai, aur camera ka jhukav aam
       * aadmi ki nazar jaisa rehta hai.
       */
      for (let ring = 0; ring < 5; ring++) {
        const d = dist * (1 + ring * 0.6);
        for (let lift = 0; lift < 4; lift++) {
          const cy = ty + elev + lift * 2.6;
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
      // Kahin se saaf nahi dikha. Ab bhi seedha upar se nahi -- door se aur
      // thoda ooncha, taaki jagah phir bhi pehchani jaaye.
      const a = base + 0.6;
      camera.position.set(tx + Math.cos(a) * dist * 2.4, ty + elev + dist * 0.55,
                          tz + Math.sin(a) * dist * 2.4);
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
