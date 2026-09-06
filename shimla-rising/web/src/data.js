// Saara shared data load karta hai -- wahi `data/` folder jo Godot project
// bhi padhta hai. Ek jagah story badlo, dono games mein badal jaati hai.
const BASE = "../data/";

async function json(name) {
  const r = await fetch(BASE + name, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json();
}

function image(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`image load failed: ${src}`));
    img.src = src;
  });
}

export async function loadAll(onProgress = () => {}) {
  const steps = [
    ["georeference.json", "geo"], ["terrain.json", "terrainMeta"],
    ["districts.json", "districts"], ["pois.json", "pois"], ["roads.json", "roads"],
    ["missions.json", "missions"], ["characters.json", "characters"],
    ["vehicles.json", "vehicles"], ["dialogue.json", "dialogue"],
    ["shops.json", "shops"], ["sanjauli.json", "sanjauliMap"], ["routes.json", "routes"],
  ];
  const out = {};
  for (let i = 0; i < steps.length; i++) {
    const [file, key] = steps[i];
    onProgress(i / (steps.length + 1), file);
    out[key] = await json(file);
  }
  onProgress(steps.length / (steps.length + 1), "heightmap.png");
  out.heightmapImage = await image(BASE + "heightmap.png");
  onProgress(1, "ready");

  // convenience lookups
  out.poiById = new Map(out.pois.pois.map((p) => [p.id, p]));
  out.districtById = new Map(out.districts.districts.map((d) => [d.id, d]));
  out.vehicleById = new Map(out.vehicles.vehicles.map((v) => [v.id, v]));
  out.characterById = new Map(out.characters.characters.map((c) => [c.id, c]));
  return out;
}
