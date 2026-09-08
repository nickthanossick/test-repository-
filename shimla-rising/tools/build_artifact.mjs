#!/usr/bin/env node
/**
 * Web game ko ek self-contained HTML file mein bundle karta hai.
 *
 * Kyun zaroori hai: published Artifact ke paas koi server nahi hota -- na
 * relative fetch chalti hai, na relative ES module imports. Isliye sab kuch
 * ek file mein aana chahiye: three.js, game ke modules, saara data, aur
 * heightmap (base64 data URI).
 *
 *   node tools/build_artifact.mjs [out.html]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "web", "src");
const VENDOR = join(ROOT, "web", "vendor");
const DATA = join(ROOT, "data");

const read = (p) => readFileSync(p, "utf8");

// ---------------------------------------------------------------- three.js
/**
 * three.js do ESM files mein aati hai: core (444 named exports) aur module
 * (jo core se 197 import karke apne 441 export karta hai).
 *
 * Dono ko IIFE mein lapet kar `THREE` global banate hain. IIFE isliye, seedha
 * concat nahi: dono minified hain aur unke local naam (`e`, `t`, `J`...)
 * takraate hain -- ek hi scope mein daalne se redeclaration error aata.
 */
function bundleThree() {
  let core = read(join(VENDOR, "three.core.min.js"));
  let mod = read(join(VENDOR, "three.module.min.js"));

  /**
   * `export{...}` aur `export{...}from"..."` dono handle karta hai.
   *
   * Doosra wala **re-export** hai: three ka module 245 naam seedha core se
   * aage bhej deta hai. Un naamon ke module scope mein koi local binding nahi
   * hota, isliye unhe apne return object mein daalna galat hoga -- aur `from`
   * clause ko hataana bhool jao to `}=...;from"./core.js";` bach jaata hai,
   * jo ek dangling syntax error hai.
   */
  const takeExports = (src) => {
    const local = [];
    const reexported = [];
    const cleaned = src.replace(/export\{([^}]*)\}\s*(from\s*"[^"]*")?\s*;?/g,
      (_, body, from) => {
        for (const item of body.split(",")) {
          if (!item.trim()) continue;
          const [a, b] = item.includes(" as ")
            ? item.split(" as ").map((t) => t.trim())
            : [item.trim(), item.trim()];
          (from ? reexported : local).push([b, a]);   // [publicName, localName]
        }
        return "";
      });
    return { cleaned, exports: local, reexported };
  };

  const c = takeExports(core);
  const coreMap = new Map(c.exports);            // public name -> core local
  core = `${c.cleaned};return{${c.exports.map(([p, l]) => `${JSON.stringify(p)}:${l}`).join(",")}}`;

  // module ke import ko core ke exports se destructure karo
  mod = mod.replace(/import\{([^}]*)\}from"\.\/three\.core\.min\.js";?/, (_, body) => {
    const binds = body.split(",").map((item) => {
      const [pub, local] = item.includes(" as ")
        ? item.split(" as ").map((s2) => s2.trim())
        : [item.trim(), item.trim()];
      if (!coreMap.has(pub)) throw new Error(`three core mein '${pub}' export nahi hai`);
      return `${JSON.stringify(pub)}:${local}`;
    });
    return `const{${binds.join(",")}}=__three_core;`;
  });

  const m = takeExports(mod);
  // re-exported naam __three_core se aate hain; module ke apne locals se nahi.
  const reexp = m.reexported.map(([p]) => {
    if (!coreMap.has(p)) throw new Error(`re-export '${p}' core mein nahi hai`);
    return `${JSON.stringify(p)}:__three_core[${JSON.stringify(p)}]`;
  });
  const own = m.exports.map(([p, l]) => `${JSON.stringify(p)}:${l}`);
  mod = `${m.cleaned};return{${[...reexp, ...own].join(",")}}`;

  return `const __three_core=(function(){${core}})();\n`
       + `const THREE=(function(){${mod}})();\n`;
}

// ------------------------------------------------------------ game modules
// Dependency order. Har module ek IIFE ban jaata hai jo apne exports lautaata hai.
/*
 * three.js ke post-processing addons.
 *
 * Ye `web/vendor/addons/` mein vendored hain (r185, wahi version jo core ka
 * hai). Bundle mein inka key `addons/...` hai, aur inke aapasi import
 * (`./Pass.js`, `../shaders/CopyShader.js`) neeche usi key par map hote hain.
 *
 * Kram maayne rakhta hai -- jo pehle chahiye wo pehle.
 */
const ADDONS = [
  "postprocessing/Pass.js",
  "shaders/CopyShader.js",
  "shaders/OutputShader.js",
  "shaders/LuminosityHighPassShader.js",
  "shaders/FXAAShader.js",
  "postprocessing/ShaderPass.js",
  "postprocessing/MaskPass.js",
  "postprocessing/EffectComposer.js",
  "postprocessing/RenderPass.js",
  "postprocessing/OutputPass.js",
  "postprocessing/UnrealBloomPass.js",
];

const MODULES = [
  "util.js", "textures.js", "geo.js", "grid.js", "geometry.js", "terrain.js", "roads.js",
  "landmarks.js", "signs.js", "bazaar.js", "tunnel.js", "quality.js", "city.js", "sky.js", "weather.js",
  "daynight.js", "input.js",
  "vehicle.js", "human.js", "animals.js", "buses.js", "traffic.js", "crowd.js",
  "panga.js", "combat.js",
  "player.js",
  "chase-camera.js", "wanted.js", "missions.js", "flashcards.js", "dialogue.js", "hud.js",
  "translit.js", "audio.js", "save.js",
  "postfx.js",                    // addons ke baad, main.js se pehle
  "main.js",
];

function bundleModule(name, source) {
  const exported = [];
  let s = source;

  // `import * as THREE from "three"` -- THREE bundle mein pehle se global hai
  s = s.replace(/import\s+\*\s+as\s+THREE\s+from\s+["']three["'];?/g, "");
  /*
   * three ke addons `import { X } from 'three'` likhte hain (multi-line bhi).
   * THREE global hai, isliye use destructure kar lete hain.
   */
  s = s.replace(/import\s*\{([^}]*)\}\s*from\s*["']three["'];?/g,
    (_, names) => `const {${names.replace(/\s+/g, " ").trim()}} = THREE;`);
  /*
   * `web/src/*` se addons: `from "../vendor/addons/postprocessing/X.js"`
   * Bundle mein unka key `addons/postprocessing/X.js` hai.
   */
  s = s.replace(/import\s*\{([^}]*)\}\s*from\s*["']\.\.\/vendor\/addons\/([^"']+)["'];?/g,
    (_, names, file) => `const {${names.trim()}} = __m[${JSON.stringify("addons/" + file)}];`);
  /*
   * Addon ke aapasi import. `dir` us addon ka apna folder hai, taaki
   * `./Pass.js` aur `../shaders/CopyShader.js` dono theek se hal hon.
   *
   * Ye neeche wale saade `./x.js` niyam se **pehle** chalna chahiye. Pehle ye
   * baad mein tha, aur saada niyam `./Pass.js` ko `__m["Pass.js"]` bana deta
   * tha -- jabki bundle mein uski key `addons/postprocessing/Pass.js` hai.
   * Artifact chup-chaap `Cannot destructure property 'Pass' of '__m.Pass.js'`
   * par mar jaata tha.
   */
  if (name.startsWith("addons/")) {
    const dir = name.slice(0, name.lastIndexOf("/"));      // e.g. addons/postprocessing
    const resolve = (rel) => {
      const parts = (dir + "/" + rel).split("/");
      const out = [];
      for (const seg of parts) {
        if (seg === "." || seg === "") continue;
        if (seg === "..") out.pop();
        else out.push(seg);
      }
      return out.join("/");
    };
    s = s.replace(/import\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["'];?/g,
      (_, names, rel) => `const {${names.replace(/\s+/g, " ").trim()}} = __m[${JSON.stringify(resolve(rel))}];`);
  }

  // `import { a, b } from "./x.js"`
  s = s.replace(/import\s*\{([^}]*)\}\s*from\s*["']\.\/([^"']+)["'];?/g,
    (_, names, file) => `const {${names.trim()}} = __m[${JSON.stringify(file)}];`);
  // `import * as Ns from "./x.js"`
  s = s.replace(/import\s+\*\s+as\s+(\w+)\s+from\s*["']\.\/([^"']+)["'];?/g,
    (_, ns, file) => `const ${ns} = __m[${JSON.stringify(file)}];`);

  // exports collect karke keyword hatao
  s = s.replace(/^export\s+(async\s+)?(class|function|const|let|var)\s+(\w+)/gm,
    (_, asy, kind, id) => { exported.push(id); return `${asy || ""}${kind} ${id}`; });
  /*
   * `export { A, B };` -- three ke addons yahi shakl istemaal karte hain
   * (class pehle declare hoti hai, export aakhir mein).
   */
  s = s.replace(/^export\s*\{([^}]*)\}\s*;?\s*$/gm, (_, body) => {
    for (const item of body.split(",")) {
      const id = item.trim().split(/\s+as\s+/).pop().trim();
      if (id) exported.push(id);
    }
    return "";
  });

  return `__m[${JSON.stringify(name)}] = (function(){\n${s}\nreturn {${exported.join(",")}};\n})();`;
}

// ------------------------------------------------------------------- data
function inlineData() {
  const files = ["georeference", "terrain", "districts", "pois", "roads",
                 "missions", "characters", "vehicles", "dialogue", "shops", "sanjauli", "routes"];
  const blob = {};
  for (const f of files) blob[f] = JSON.parse(read(join(DATA, `${f}.json`)));
  /*
   * Artifact halka heightmap leta hai.
   *
   * `data/heightmap.png` 2048 px ka hai (4 m/px) -- 5.8 MB, aur yahan wo
   * base64 mein inline hota hai (+33%). Terrain ka mesh sabse ooncha tier par
   * bhi 8 m prati quad par sample karta hai, isliye us barikee ka faayda sirf
   * `heightAt()` ko hai, aankh ko nahi. Pipeline saath mein 1024 px ka
   * `heightmap_web.png` bhi likhta hai -- 1.6 MB. Wo na ho (purana data) to
   * poora wala hi chalega.
   */
  /*
   * Poora 2048 px ka heightmap.
   *
   * Pehle yahan halka `heightmap_web.png` (1024 px) jaata tha sirf file size
   * ke liye. Nikhil: *"output m html file dio chahe file ka size kitna b bda
   * krde"*. Poore naap par `heightAt()` ka sample chaar guna barik hai, aur
   * khiladi ke pair, gaadi ke pahiye aur camera ki oonchai -- teenon wahi se
   * aate hain. File ~3.7 MB se ~9 MB ho jaati hai; wo manzoor hai.
   */
  const full = join(DATA, "heightmap.png");
  const hmPath = existsSync(full) ? full : join(DATA, "heightmap_web.png");
  const png = readFileSync(hmPath).toString("base64");
  console.log(`  heightmap: ${basename(hmPath)} (${(png.length / 1.37e6).toFixed(1)} MB)`);
  return { blob, png };
}

/**
 * data/profile.json (build_heightmap.py se) ko SVG markup mein badalta hai.
 *
 * Ye Shimla ka asli poorv-pashchim elevation cross-section hai, Jakhoo ki
 * latitude par -- heightmap se seedha nikala hua, sajaavat nahi. Terrain badle
 * to ye bhi apne aap badal jaata hai.
 */
function buildProfileSvg() {
  const p = JSON.parse(read(join(DATA, "profile.json")));
  const [w, h] = p.viewbox;
  const peak = p.labels.reduce((a, b) => (b.elev > a.elev ? b : a), p.labels[0]);

  const pins = p.labels.map((l) => {
    const isPeak = l.name === peak.name;
    const anchor = l.x < 90 ? "start" : l.x > w - 90 ? "end" : "middle";
    return `<line class="pin" x1="${l.x}" y1="${l.y}" x2="${l.x}" y2="${h - 12}"></line>`
      + `<text x="${l.x}" y="${l.y - 7}" text-anchor="${anchor}"${isPeak ? ' class="peak"' : ""}>`
      + `${l.name} ${l.elev} m</text>`;
  }).join("");

  return `<svg viewBox="0 0 ${w} ${h}" role="img" `
    + `aria-label="Shimla ka poorv-pashchim elevation cross-section, Jakhoo ${peak.elev} m par sabse ooncha">`
    + `<path class="ridge" d="${p.fill}"></path>`
    + `<path class="crest" d="${p.line}"></path>`
    + pins
    + `<text x="0" y="${h - 2}" text-anchor="start">W 1300 m</text>`
    + `<text x="${w}" y="${h - 2}" text-anchor="end">E</text>`
    + `</svg>`;
}


// ------------------------------------------------------------------- build
function build(outPath, profileSvg) {
  const { blob, png } = inlineData();

  const addonBodies = ADDONS.map((n) =>
    bundleModule("addons/" + n, read(join(VENDOR, "addons", n))));
  const bodies = [...addonBodies, ...MODULES.map((n) => {
    const src = read(join(SRC, n));
    if (n === "data.js") throw new Error("data.js bundle mein include nahi hota");
    return bundleModule(n, src);
  })];

  // data.js ki jagah inlined loader
  const dataModule = `__m["data.js"] = (function(){
  const RAW = __SHIMLA_DATA__;
  async function loadAll(onProgress = () => {}) {
    onProgress(0.3, "data");
    const out = {
      geo: RAW.georeference, terrainMeta: RAW.terrain, districts: RAW.districts,
      pois: RAW.pois, roads: RAW.roads, missions: RAW.missions,
      characters: RAW.characters, vehicles: RAW.vehicles, dialogue: RAW.dialogue,
      shops: RAW.shops, sanjauliMap: RAW.sanjauli, routes: RAW.routes,
    };
    onProgress(0.6, "heightmap");
    out.heightmapImage = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("heightmap decode fail"));
      img.src = "data:image/png;base64," + __SHIMLA_HEIGHTMAP__;
    });
    onProgress(1, "ready");
    out.poiById = new Map(out.pois.pois.map((p) => [p.id, p]));
    out.districtById = new Map(out.districts.districts.map((d) => [d.id, d]));
    out.vehicleById = new Map(out.vehicles.vehicles.map((v) => [v.id, v]));
    out.characterById = new Map(out.characters.characters.map((c) => [c.id, c]));
    return out;
  }
  return { loadAll };
})();`;

  /*
   * `data.js` ko theek `main.js` se pehle daalna hai.
   *
   * Dhyan: `bodies` ke aage ab **addons** bhi hain, isliye MODULES ka index
   * seedha yahan nahi chalta. Pehle chalta tha, aur addons jodne ke baad
   * chupke se galat ho gaya: `bodies.slice(0, 34)` beech mein kat jaata tha
   * aur `main.js` samet aakhri barah module bundle se **gayab** ho jaate the.
   * Koi error nahi aata tha -- entry point hi na ho to page bas apne pehle
   * loading message par baitha rehta tha ("shuru ho raha hai…"), aur test
   * 300 second baad timeout deta tha.
   */
  const idx = addonBodies.length + MODULES.indexOf("main.js");
  if (bodies.length !== idx + 1) {
    throw new Error(`main.js bundle ka aakhri module hona chahiye (idx ${idx}, kul ${bodies.length})`);
  }
  const ordered = [...bodies.slice(0, idx), dataModule, bodies[idx]];

  const js = [
    bundleThree(),
    "const __m = {};",
    ...ordered,
  ].join("\n");

  const html = read(join(ROOT, "tools", "artifact-template.html"))
    .replace("/*__PROFILE__*/", profileSvg || "")
    .replace("/*__BUNDLE__*/", () => js)
    .replace("__SHIMLA_DATA__", () => JSON.stringify(blob))
    .replace("__SHIMLA_HEIGHTMAP__", () => JSON.stringify(png));

  writeFileSync(outPath, html);
  const mb = (Buffer.byteLength(html) / 1e6).toFixed(2);
  console.log(`wrote ${outPath}  (${mb} MB)`);
  if (Buffer.byteLength(html) > 16e6) console.error("!! 16 MB artifact limit se bada hai");
}

const out = process.argv[2] || join(ROOT, "build", "shimla-rising-artifact.html");
build(out, buildProfileSvg());
