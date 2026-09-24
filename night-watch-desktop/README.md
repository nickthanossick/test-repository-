# IGMC: Night Watch — Hardened Desktop Build

A protected, Ultra-PC Windows `.exe` packaging of the single-file WebGL horror
game, ready to publish on **itch.io**.

This project takes the original `src/game.src.html`, hardens the code, injects an
Ultra-PC graphics tier, and wraps it in a security-hardened Electron shell that
builds to a Windows executable.

---

## ⚠️ Read this first — what "unhackable" really means

**No client-side code is truly unhackable.** Anything that runs on a player's
PC — in a browser *or* inside an `.exe` — can, in principle, be extracted and
reverse-engineered, because the machine has to decode and run it. Even AAA games
with commercial DRM (Denuvo, etc.) eventually get cracked.

What this build **does** do is raise the bar so high that essentially everyone
except a determined, skilled reverse-engineer gives up. That covers casual
crackers, cheaters, asset-rippers, and "view source" copycats. The protection is
layered:

| Layer | What it stops | Where |
|-------|---------------|-------|
| **Obfuscation** — identifier mangling, encoded string array, self-defending, anti-debugger trap | Reading/understanding/editing the game logic; auto-freezes devtools | `build/protect.mjs` |
| **ASAR packaging** | Code is no longer a browsable `.html`; it's inside `app.asar` | electron-builder |
| **ASAR integrity + Electron fuses** | A **modified game refuses to launch**; Node injection, `--inspect`, `NODE_OPTIONS` all disabled | `package.json → build.electronFuses` |
| **Main-process lockdown** | DevTools off, menu removed, navigation/`window.open` blocked, node integration off | `electron/main.js` |
| **In-page guard** | F12 / Ctrl+Shift+I / Ctrl+U / right-click / drag-save blocked | `build/runtime-guard.js` |

It is **strong, honest protection** — not a magic "kisi ka baap bhi hack nahi kar
sakta" guarantee, because that guarantee cannot exist for any downloadable game.

---

## 🖥️ Ultra-PC graphics tier

On desktop the build unlocks graphics well beyond the mobile-safe defaults, by
mutating the numbers the game's **own** quality pipeline reads (so it can't break
the engine):

| Setting | Mobile-safe default | Ultra-PC |
|---------|--------------------|----------|
| Pixel ratio | capped ~0.9–2.0 | **native (up to 2×)** |
| Shadow map | 2048 | **4096** |
| Anisotropic filtering | 16 | **16 (max the GPU allows)** |
| Simultaneous room lights | 12 | **16** |
| Draw distance (`far`) | 42 | **60** |
| Antialiasing | on | on (MSAA) |

The Electron shell also forces the **high-performance GPU**, ignores the GPU
blocklist, lifts the frame-rate cap, and enables GPU rasterization / zero-copy —
so a strong PC actually gets used. Verified: the boost is applied at runtime
(`Quality.cfg.high` shows `shadowMap:4096, lights:16, far:60`).

---

## 🌐 One honest caveat: online extras

The original game lazy-loads a few things from the internet **at runtime**, each
wrapped in a graceful fallback:

- **Voice audio** (dialogue / narration / screams) from `fal.media`
- **Bloom** post-processing (`UnrealBloomPass`) from jsDelivr
- The **ghost's GLTF model + loader** from jsDelivr

The `.exe` **allows these hosts** (see `electron/main.js`), so when the player is
online they load normally. **Offline**, the game still runs — it just has no
bloom, no ghost GLTF animation, and silent voice lines.

If you want a **100% offline** `.exe`, all of those assets must be downloaded and
inlined/bundled. That's a separate, larger task — see *Fully-offline build* below.

---

## 🔧 Build the Windows `.exe`

### Prerequisites
- **Node.js 18+** and npm
- **To produce a Windows `.exe`:** run on **Windows**, or on Linux/macOS **with
  [Wine](https://wiki.winehq.org/Download) installed** (electron-builder uses it
  to cross-build Windows targets).

### Steps
```bash
cd night-watch-desktop
npm install                 # electron, electron-builder, obfuscator
npm run dist:win            # → protects the code, then builds the .exe
```

Output lands in `release/`:
- `IGMC-NightWatch-portable.exe` — single-file, no install (**best for itch.io**)
- `IGMC-NightWatch-Setup-6.2.0.exe` — NSIS installer

Other useful commands:
```bash
npm run protect             # just harden src → dist-web/index.html
npm run start               # protect + run locally in Electron
npm run start:dev           # readable code + devtools, for debugging
npm run dist:win:portable   # portable .exe only
```

> **Icon:** drop a `256×256`-capable `assets/icon.ico` in place (see
> `assets/README-icon.txt`) before building for a custom icon.

---

## 🎮 Publish to itch.io

1. Create your game page on itch.io (set it to **Windows**, kind **Downloadable**).
2. Install **[butler](https://itch.io/docs/butler/)** (`itch` CLI) and log in:
   ```bash
   butler login
   ```
3. Push the portable build (edit the target in `package.json` → `scripts.publish:itch`):
   ```bash
   butler push release/IGMC-NightWatch-portable.exe YOUR_ITCH_USER/night-watch:windows --userversion 6.2.0
   # or: npm run publish:itch   (after editing YOUR_ITCH_USER)
   ```
4. On itch.io, mark the uploaded file **"This file will be run in the browser"
   → OFF**, and set it as the **Windows executable**.

For big builds, prefer **butler** over the web uploader — it does resumable,
delta uploads and gives players auto-updates through the itch app.

---

## 📁 Layout

```
night-watch-desktop/
├─ src/game.src.html        # original game (build input — do not edit output here)
├─ build/
│  ├─ protect.mjs           # hardening build: obfuscate + inject guard
│  └─ runtime-guard.js      # Ultra-PC boost + anti-tamper (injected)
├─ electron/
│  ├─ main.js               # hardened main process + GPU flags
│  └─ preload.js            # flags the desktop shell to the page
├─ dist-web/index.html      # GENERATED protected game (what ships)
├─ assets/                  # put icon.ico here
└─ package.json             # scripts + electron-builder + fuses config
```

`dist-web/index.html` is regenerated by `npm run protect`; never hand-edit it.

---

## 🔩 Fully-offline build (optional, larger job)

To make the `.exe` fully self-contained (no runtime internet at all):
1. Download `three.module.js`, `GLTFLoader.js`, `UnrealBloomPass.js` (v0.180.0)
   and every `fal.media` mp3 the game references.
2. Bundle them locally (as files under `dist-web/` or inlined data URIs) and
   rewrite the three dynamic-import URLs + audio URLs in `src/game.src.html` to
   point at the local copies.
3. Then you can remove the CDN/media allow-list in `electron/main.js` and set a
   strict offline CSP.

This wasn't done automatically because it rewrites the game's asset loading and
significantly increases size — say the word and it can be added as a build step.
