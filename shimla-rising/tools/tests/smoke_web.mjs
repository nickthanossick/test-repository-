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
await page.waitForTimeout(2000);

const s = await page.evaluate(() => window.__shimla.stats);
console.log("stats:", JSON.stringify(s));

const checks = [
  ["console errors", errors.length === 0, errors.slice(0, 3).join(" | ")],
  ["page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | ")],
  ["buildings built", s.buildings > 500, s.buildings],
  ["trees built", s.trees > 3000, s.trees],
  ["roads built", s.roadKm > 20, s.roadKm],
  ["vehicles spawned", s.vehicles >= 10, s.vehicles],
  ["geometry rendered", s.triangles > 100000, s.triangles],
];

let failed = 0;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok ? "" : `  -> ${detail}`}`);
  if (!ok) failed++;
}
await browser.close();
process.exit(failed ? 1 : 0);
