/**
 * Devanagari transliteration ka test.
 *
 * Ye khel ki awaaz ka aadha hissa hai: `audio.say()` line ko pehle Devanagari
 * mein badalta hai, warna Hindi voice roman Hinglish ko angrezi ki tarah
 * padhti hai (yahi "voices ajeeb lag rahi" ki asli wajah thi). Isliye har
 * bolne wali line ka nateeja yahan jaancha jaata hai.
 *
 * Chalane ke liye:  node tools/tests/translit.mjs
 */
import fs from "node:fs";
import { toDevanagari, dictSize } from "../../web/src/translit.js";

const fails = [];
const eq = (name, got, want) => {
  if (got !== want) fails.push(`${name}: "${got}" != "${want}"`);
};

// --- niyam ---------------------------------------------------------------
eq("halant sirf sanyukt par", toDevanagari("sakte"), "सकते");
eq("dohra vyanjan", toDevanagari("pakka"), "पक्का");
eq("kya", toDevanagari("kya"), "क्या");
eq("ant ka a lamba", toDevanagari("karta"), "करता");
eq("beech ka akela a chup", toDevanagari("road"), "रोड");
eq("Devanagari jaise ka waisa", toDevanagari("पहले से हिंदी"), "पहले से हिंदी");
eq("viraam chinh bache", toDevanagari("Chal, ab!"), "चल, अब!");

// --- kosh ----------------------------------------------------------------
eq("retroflex kosh se", toDevanagari("gaadi"), "गाड़ी");
eq("nukta kosh se", toDevanagari("bazaar"), "बाज़ार");
eq("gaali", toDevanagari("bedelo"), "बेदेलो");

/*
 * Har bolne wali line poori Devanagari mein badalni chahiye.
 *
 * Ek bhi roman akshar bach gaya to Hindi voice us shabd par atak jaati hai --
 * isliye ye poore `dialogue.json` par chalta hai, kisi namoone par nahi.
 */
const dlg = JSON.parse(fs.readFileSync(new URL("../../data/dialogue.json", import.meta.url)));
let lines = 0;
const leftovers = new Set();
for (const key of Object.keys(dlg.lines)) {
  for (const beat of dlg.lines[key]) {
    lines++;
    const out = toDevanagari(beat.text);
    for (const w of out.match(/[A-Za-z]+/g) || []) leftovers.add(`${key}: ${w}`);
  }
}
if (leftovers.size) fails.push(`roman bacha hua: ${[...leftovers].slice(0, 8).join(", ")}`);

// Vicky ke apne-aap bolne wale beats maujood hain (main.js inhi keys ko maangta hai)
for (const k of ["aam", "bazaar", "college", "raat", "thanda", "police", "thaka",
                 "gaadi", "kaam"]) {
  const key = `vicky:idle:${k}`;
  if (!dlg.lines[key] || dlg.lines[key].length < 3) fails.push(`kam lines: ${key}`);
}

console.log(`kosh: ${dictSize} shabd · dialogue: ${lines} lines`);
for (const f of fails) console.log("  FAIL", f);
console.log(fails.length ? `${fails.length} fail` : "  ok   sab theek");
process.exit(fails.length ? 1 : 0);
