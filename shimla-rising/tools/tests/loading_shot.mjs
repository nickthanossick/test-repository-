/**
 * Loading screen ka shot -- percentage sach mein chalta hai ya nahi.
 *
 * Nikhil: *"game shuru me jb load ni hoti to percentage me dikhya kr"*. Sirf
 * number daal dena kaafi nahi tha: duniya ek hi synchronous block mein banti
 * thi, isliye browser paint hi nahi karta tha aur bar 45% par jam kar seedha
 * 100% par kood jaati thi. Ab har bhaari stage se pehle ek frame chhodte hain.
 *
 * Ye script boot ke dauraan kai baar `#lpct` padhti hai -- agar wo ek se
 * zyada alag value dikhaye to yeh sach mein chal raha hai.
 */
import fs from "node:fs";
import { chromium } from "playwright";
fs.mkdirSync("build/shots", { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
await page.goto(`http://localhost:8080/web/?tier=${process.env.TIER || "medium"}`,
  { waitUntil: "domcontentloaded", timeout: 60000 });

const seen = [];
let shot = false;
for (let i = 0; i < 90; i++) {
  const st = await page.evaluate(() => ({
    pct: document.getElementById("lpct")?.textContent,
    msg: document.getElementById("lmsg")?.textContent,
    ready: window.__shimla?.ready === true,
  })).catch(() => null);
  if (!st) break;
  if (st.pct && seen[seen.length - 1] !== st.pct) seen.push(st.pct);
  // beech mein ek tasveer -- jab number 100% na ho
  if (!shot && st.pct && st.pct !== "0%" && st.pct !== "100%") {
    await page.screenshot({ path: "build/shots/r18-loading.png" });
    shot = true;
  }
  if (st.ready) break;
  await page.waitForTimeout(400);
}
console.log("dikhe hue percentage:", seen.join(" -> "));
console.log(seen.length >= 4 ? "  ok   number sach mein chalta hai"
                             : "  FAIL number nahi badla (" + seen.length + " value)");
await browser.close();
process.exit(seen.length >= 4 ? 0 : 1);
