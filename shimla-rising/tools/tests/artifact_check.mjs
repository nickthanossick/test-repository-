/**
 * Single-file artifact ka check.
 *
 * `tools/build_artifact.mjs` poore khel ko ek HTML file mein baandh deta hai --
 * koi server nahi, koi module loader nahi. Ye alag tareeke se toot sakta hai
 * (module list se koi file chhoot jaana, template mein koi `id` na hona), aur
 * ek baar toot bhi chuka hai. Isliye ise `file://` se khol kar hi jaancha
 * jaata hai, `http://` se nahi.
 *
 *   node tools/build_artifact.mjs && node tools/tests/artifact_check.mjs
 *
 * Note: is sandbox mein Google Fonts ka stylesheet block hai, isliye ek
 * `ERR_CONNECTION_RESET` aata hai -- wo khel ka error nahi hai aur ignore
 * hota hai (font stack ka fallback pehle se hai).
 */
import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader","--no-sandbox","--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [], perr = [];
// fonts.googleapis.com file:// se nahi aata -- wo khel ki galti nahi
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (/fonts\.googleapis|ERR_CONNECTION_RESET/.test(m.text())) return;
  errs.push(m.text());
});
/*
 * Boot ka error turant chahiye.
 *
 * Pehle sirf `waitForFunction` tha, aur bundle toot-ne par wo **300 second**
 * tak baith kar "Timeout exceeded" bolta tha -- error khud kabhi chhapta hi
 * nahi. (Aisa hua bhi: `__m["Pass.js"]` wali galti isi tarah chhupi rahi.)
 * Ab pehla pageerror wait ko turant tod deta hai.
 */
let bootErr = null, onBootErr = null;
page.on("pageerror", (e) => {
  perr.push(e.message);
  if (!bootErr) { bootErr = e; onBootErr?.(e); }
});
const FILE = new URL("../../build/shimla-rising-artifact.html", import.meta.url).href;
await page.goto(FILE, { waitUntil: "domcontentloaded", timeout: 60000 });
const ready = page.waitForFunction(() => window.__shimla?.ready === true, null, { timeout: 300000 });
ready.catch(() => {});                       // race haarne par unhandled na ho
await Promise.race([
  ready,
  new Promise((_, rej) => {
    if (bootErr) rej(bootErr);
    else onBootErr = rej;
  }),
]);
await page.evaluate(() => window.__shimla.skipCards());
await page.waitForTimeout(2500);
const s = await page.evaluate(() => window.__shimla.stats);
console.log("stats:", JSON.stringify(s));
/*
 * Post-processing addons bundle mein aane chahiye.
 *
 * `low` tier (SwiftShader yahi deta hai) par composer jaan-boojh kar band hai,
 * isliye `stats.post` dekhna kaafi nahi -- wahan wo hamesha false hoga. Iske
 * bajaye seedha poochte hain ki module bundle mein maujood hai ya nahi.
 */
const hasPost = await page.evaluate(() => typeof window.__shimla?.hasPost === "function"
  ? window.__shimla.hasPost() : null);
console.log("post bundled:", hasPost);
if (hasPost === false) { console.error("FAIL: post-processing addons bundle mein nahi hain"); perr.push("post missing"); }
console.log("console errors:", errs.slice(0,3));
console.log("page errors:", perr.slice(0,3));
await page.screenshot({ path: "build/shots/r14-artifact.png" });
await browser.close();
process.exit(errs.length || perr.length ? 1 : 0);
