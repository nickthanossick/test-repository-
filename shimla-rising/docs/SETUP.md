# Setup

## 1. Web game — abhi chalao

Sirf **Node 18+** chahiye. Aur kuch nahi.

```bash
git clone https://github.com/nickthanossick/shimla-rising
cd shimla-rising
node web/serve.mjs
```

Kholo `http://localhost:8080/web/`

`npm install` ki zaroorat nahi — three.js `web/vendor/` mein vendored hai.
Server bhi zero-dependency hai (sirf Node ke built-in modules).

**Kyun ek server chahiye, seedha `index.html` kyun nahi khulti?**
Game ES modules use karta hai aur `data/` ko `fetch` karta hai. Browsers
`file://` par dono ko block karte hain (CORS). Server 30 line ka hai.

### Controls

| | |
|---|---|
| `W A S D` / arrows | chalo / gaadi chalao |
| `Shift` | daudo |
| `Space` | kudo (paidal) / handbrake (gaadi) |
| `F` | gaadi mein baitho / utro |
| `E` | mission shuru karo (peele marker pe khade hokar) |
| Mouse | camera (click karke pointer-lock, ya drag) |
| `M` | minimap zoom |
| `1` | time of day |
| `2` | mausam |
| `P` | save |
| `H` | help bar chhupao |

---

## 2. Godot desktop build

### Godot lo

[godotengine.org/download](https://godotengine.org/download) → **Godot 4.7**
(standard build, GDScript ke liye .NET version ki zaroorat nahi). ~120 MB.

### Data sync karo

```bash
python tools/sync_godot_data.py
```

Ye `data/` ko `godot/data/` mein copy karta hai. **Zaroori hai** — Godot
`res://` ke bahar se shipped files nahi padh sakta, isliye shared data ki ek
copy project ke andar chahiye. `godot/data/` gitignored hai; sach hamesha
`data/` mein rehta hai.

### Kholo

Godot → **Import** → `godot/project.godot` → **F5**

Pehli baar terrain mesh build hone mein kuch second lagenge (1024×1024 heightmap
se 8×8 chunks + collision shape).

> **Note:** ye Godot project is repo ke authoring environment mein **kabhi
> chalaya nahi gaya** — Godot editor download nahi ho saka. Scripts Godot 4.7
> API ke against dhyan se likhe hain aur structural checks automated hain
> (`tools/tests/test_godot_project.py`), par pehla asli run aapka hoga. Agar
> kuch toote to wo expected hai — issue kholo.

---

## 3. Development tooling

```bash
pip install -r tools/requirements.txt

python -m pytest tools/tests -q        # 72 tests
python -m ruff check tools/            # lint
python tools/terrain/build_heightmap.py --size 1024   # terrain regenerate
```

### Web game ka smoke test

```bash
npm i -D playwright && npx playwright install chromium
node web/serve.mjs &
node tools/tests/smoke_web.mjs
```

Ye headless Chromium mein game boot karta hai aur check karta hai: zero console
errors, zero page errors, aur duniya sach mein bani (imaaratein, ped, sadkein,
gaadiyan, triangles).

---

## 4. Asli satellite terrain (optional)

Dekho [PIPELINE.md](PIPELINE.md).

---

## Troubleshooting

**Web game kaali screen dikhata hai** — browser console kholo. Game apne errors
loading screen pe bhi dikhata hai (`#err` block).

**`data/... 404`** — server repo root se chal raha hai na? `node web/serve.mjs`
repo ke andar se chalao, `web/` ke andar se nahi.

**Godot: "georeference.json nahi mila"** — `python tools/sync_godot_data.py` chalao.

**Godot: terrain flat hai** — `Image.load_from_file()` fail hua hoga. Check karo
ki `godot/data/heightmap.png` maujood hai.

**Web game bahut dheema** — `web/src/main.js` mein `terrain.buildMesh(8, 96)` ko
`(8, 48)` karo, aur `city.js` mein `TARGET` (trees) kam karo.
