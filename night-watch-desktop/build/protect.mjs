/* ═══════════════════════════════════════════════════════════════════════
   protect.mjs — code-hardening build step for IGMC: Night Watch.

   What it does:
     1. Reads src/game.src.html.
     2. Isolates the single <script type="module"> game block.
     3. Keeps the giant `import * as THREE from "data:…"` line VERBATIM
        (it is the inlined three.js library — public, ~1.8 MB, and obfuscating
        it would only destroy performance).
     4. Obfuscates ONLY the game-logic body with a performance-safe but strong
        profile (identifier mangling + encoded string array + self-defending +
        anti-debugger). Control-flow flattening and dead-code injection are
        deliberately OFF — they wreck a 60 fps render loop.
     5. Injects the desktop runtime guard (Ultra-PC graphics + anti-tamper).
     6. Writes dist-web/index.html.

   Usage:
     node build/protect.mjs                # full protection (default)
     node build/protect.mjs --no-obfuscate # skip obfuscation (fast dev loop)
   ═══════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src', 'game.src.html');
const OUT = join(ROOT, 'dist-web', 'index.html');
const GUARD = join(__dirname, 'runtime-guard.js');

const NO_OBF = process.argv.includes('--no-obfuscate');

function log(...a) { console.log('[protect]', ...a); }

log('reading', SRC);
let html = readFileSync(SRC, 'utf8');
const origBytes = Buffer.byteLength(html);

/* ── 1. locate the module block ────────────────────────────────────────── */
const OPEN = '<script type="module">';
const openIdx = html.indexOf(OPEN);
if (openIdx < 0) throw new Error('Could not find <script type="module"> in source.');
const bodyStart = openIdx + OPEN.length;
const closeIdx = html.indexOf('</script>', bodyStart);
if (closeIdx < 0) throw new Error('Could not find closing </script> for the module.');

const moduleContent = html.slice(bodyStart, closeIdx);

/* ── 2. split off the three.js import line (keep verbatim) ─────────────── */
const importStart = moduleContent.indexOf('import * as THREE');
if (importStart < 0) throw new Error('Could not find the THREE import line.');
const importEnd = moduleContent.indexOf('\n', importStart); // one physical line
if (importEnd < 0) throw new Error('THREE import line has no line terminator.');

const header = moduleContent.slice(0, importEnd);   // leading ws + `import … THREE …;`
let gameBody = moduleContent.slice(importEnd);       // the game logic (starts with \n)

log('game-logic body:', Buffer.byteLength(gameBody).toLocaleString(), 'bytes');
log('three.js import kept verbatim:', Buffer.byteLength(header).toLocaleString(), 'bytes');

/* ── 3. obfuscate the game body ────────────────────────────────────────── */
// Performance-safe but strong. Tuned for a real-time WebGL game.
const OBF_OPTS = {
  compact: true,
  target: 'browser',
  sourceType: 'script',            // the body itself has no import/export
  // --- structure (kept light so the render loop stays fast) ---
  controlFlowFlattening: false,    // catastrophic for hot loops if enabled
  deadCodeInjection: false,        // size/perf cost; not worth it for a game
  simplify: true,
  numbersToExpressions: false,
  // --- identifiers ---
  renameGlobals: false,            // MUST stay false: preserves `THREE` + `window.IGMC`
  identifierNamesGenerator: 'hexadecimal',
  transformObjectKeys: false,      // game uses object literals as data tables
  // --- strings ---
  stringArray: true,
  stringArrayEncoding: ['base64'], // cheap at runtime; rc4 would be heavier
  stringArrayThreshold: 0.8,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayIndexShift: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersType: 'variable',
  splitStrings: false,             // avoid touching long GLSL shader strings
  unicodeEscapeSequence: false,
  // --- anti-tamper ---
  selfDefending: true,             // breaks if the code is reformatted/beautified
  debugProtection: true,           // traps devtools in a debugger loop
  debugProtectionInterval: 2000,
  disableConsoleOutput: true,
  // never obfuscate these names
  reservedNames: ['^THREE$', '^IGMC$'],
  reservedStrings: ['three', 'THREE'],
  log: false
};

if (NO_OBF) {
  log('!! --no-obfuscate: shipping readable game body (DEV ONLY)');
} else {
  log('obfuscating game body … (this can take a minute on a 16k-line file)');
  const t0 = Date.now();
  const res = JavaScriptObfuscator.obfuscate(gameBody, OBF_OPTS);
  gameBody = res.getObfuscatedCode();
  log('obfuscated in', ((Date.now() - t0) / 1000).toFixed(1) + 's →',
      Buffer.byteLength(gameBody).toLocaleString(), 'bytes');
}

/* ── 4. reassemble the module ──────────────────────────────────────────── */
const newModule = header + '\n' + gameBody + '\n';
html = html.slice(0, bodyStart) + newModule + html.slice(closeIdx);

/* ── 5. inject the runtime guard before </body> ────────────────────────── */
let guardSrc = readFileSync(GUARD, 'utf8');
if (!NO_OBF) {
  // lightly obfuscate the guard too, so it is not a readable "how to bypass" note
  guardSrc = JavaScriptObfuscator.obfuscate(guardSrc, {
    compact: true, target: 'browser', sourceType: 'script',
    controlFlowFlattening: false, deadCodeInjection: false,
    renameGlobals: false, identifierNamesGenerator: 'hexadecimal',
    stringArray: true, stringArrayEncoding: ['base64'], stringArrayThreshold: 1,
    selfDefending: true, disableConsoleOutput: true, log: false,
    reservedNames: ['^IGMC$']
  }).getObfuscatedCode();
}
const guardTag = '\n<script>\n' + guardSrc + '\n</script>\n';
const bodyClose = html.lastIndexOf('</body>');
if (bodyClose < 0) {
  html = html.replace('</html>', guardTag + '</html>');
} else {
  html = html.slice(0, bodyClose) + guardTag + html.slice(bodyClose);
}

/* ── 6. write ──────────────────────────────────────────────────────────── */
writeFileSync(OUT, html, 'utf8');
const outBytes = Buffer.byteLength(html);
log('wrote', OUT);
log('size:', origBytes.toLocaleString(), 'bytes →', outBytes.toLocaleString(), 'bytes');
log('done.');
