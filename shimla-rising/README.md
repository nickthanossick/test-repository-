# Shimla Rising

**Shimla par based open-world action game.** Asli bhugol, apni kahani, aur do
engines — ek browser game jo abhi chalti hai, aur ek Godot project jo full
desktop build deta hai. Dono ek hi `data/` folder padhte hain.

> Ye GTA *type* game hai — GTA ka koi asset, code ya IP isme nahi hai.
> Kahani, kirdaar, missions sab original hain.

---

## Abhi khelo (kuch install kiye bina)

```bash
git clone https://github.com/nickthanossick/shimla-rising
cd shimla-rising
node web/serve.mjs
# kholo: http://localhost:8080/web/
```

Bas Node chahiye. Koi `npm install` nahi — three.js repo mein vendored hai.

**Controls:** `WASD` chalo · `Shift` daudo · `Space` kudo / handbrake ·
`F` gaadi mein baitho/utro · `E` mission shuru karo · Mouse camera ·
`M` naksha zoom · `2` mausam · `P` save

---

## Kya hai isme

| | |
|---|---|
| **Map** | 8.2 km × 8.2 km asli Shimla — Summer Hill se Sanjauli/Dhalli tak, Annandale se New Shimla tak, Jakhoo (2455 m) beech mein |
| **Kahani** | 3 act, 14 story missions + 10 side missions, Hinglish dialogue |
| **Gaadiyan** | Shimla taxi, HRTC bus, Bolero, scooter, timber truck, HP Police Gypsy |
| **Systems** | Wanted level (0–5), mausam (barf/monsoon/kohra), slope stamina, save/load |
| **Engines** | Three.js (browser) + Godot 4.7 (desktop/web export) — ek hi data layer |

### Shimla-specific gameplay

Ye sirf ek reskin nahi hai — mechanics Shimla ke asli haalat se aaye hain:

- **Mall Road pe gaadi le jaana jurm hai.** Asli Shimla mein Mall pedestrian-only
  hai. Game mein wahan gaadi ghusaate hi wanted level chadhta hai.
- **Chadhai pe stamina teen guna tez khatam hoti hai.** Ridge (2205 m) se Jakhoo
  (2455 m) tak 1.1 km mein 250 m ki chadhai hai. Mission `a1_m5` isi pe bana hai.
- **Barf pe grip 0.55 rah jaati hai.** Act 3 ("Barfeela Toofan") December mein
  hota hai, aur mausam khud ek dushman hai.
- **Toy train** — Kalka–Shimla narrow gauge (UNESCO, 102 tunnel, 864 pul) map
  mein hai, aur missions mein bhi.

---

## Repo ka structure

```
data/          ← SHARED. Dono engines yahi padhte hain.
               georeference · heightmap · roads · districts · pois
               missions · dialogue · characters · vehicles
web/           Three.js browser game (no build step)
godot/         Godot 4.7 project (.tscn + .gd, sab text)
tools/
  terrain/     landmark elevations se heightmap generator
  shimla_pipeline/  asli Copernicus DEM + OpenStreetMap → data/
  blender/     procedural imaaratein aur props → .glb
  tests/       pytest (geo math, data integrity, Godot structure)
design/        vision, kahani, kirdaar, missions, naksha, art, audio, legal
docs/          SETUP · PIPELINE · ENGINE-CHOICE · ROADMAP
```

**Ek hi data layer** poore project ka core idea hai. Kahani `data/missions.json`
mein hai — usse badlo, aur web game aur Godot dono mein badal jaati hai. Koi
duplication nahi.

---

## Asli satellite terrain aur asli OSM sadkein

Repo mein jo terrain aata hai wo **landmark-accurate approximation** hai: 45 asli
Shimla landmarks ki elevation (Jakhoo 2455 m, Ridge 2205 m, Annandale 1980 m…)
ko interpolate karke banaya gaya. Survey-grade nahi, par Shimla ka aakar sahi hai.

Asli data chahiye to:

```bash
pip install -r tools/requirements.txt
export OPENTOPOGRAPHY_API_KEY=<free key from opentopography.org>
python -m shimla_pipeline.run --preset shimla_core
```

Ye Copernicus GLO-30 satellite DEM aur OpenStreetMap se asli sadkein/imaaratein
laata hai, **usi format mein** likhta hai — isliye dono games apne aap upgrade ho
jaate hain, koi code badalne ki zaroorat nahi. Details: [docs/PIPELINE.md](docs/PIPELINE.md)

---

## Godot desktop build

Unreal Engine ki jagah Godot hai. Wajah: MIT license, download sirf ~120 MB
(UE 120 GB), aur scene files plain text — isliye poora project git mein review ho
sakta hai. Poori tulna: [docs/ENGINE-CHOICE.md](docs/ENGINE-CHOICE.md)

```bash
python tools/sync_godot_data.py     # data/ → godot/data/
# godotengine.org se Godot 4.7 download karo, godot/project.godot kholo, F5
```

---

## Testing

```bash
python -m pytest tools/tests -q     # 72 tests: geo math, data integrity, Godot structure
python -m ruff check tools/
node web/serve.mjs & node tools/tests/smoke_web.mjs   # headless browser smoke test
```

---

## Kya verified hai aur kya nahi

Sach saaf rakhna behtar hai:

| | |
|---|---|
| ✅ **Web game** | Headless Chromium mein chala kar verify kiya — 0 console errors, 0 page errors, ~0.8s load, 2707 imaaratein, 9000 ped, 27 km sadkein. Screenshots liye gaye. |
| ✅ **Heightmap generator** | Chala kar output dekha gaya. Landmark elevation error: mean 0.7 m. |
| ✅ **Tests + lint** | 72 pytest pass, ruff clean. |
| ⚠️ **Godot project** | **Kabhi chalaya nahi gaya.** Godot editor is environment mein download nahi ho saka. Scripts Godot 4.7 API ke against dhyan se likhe hain, aur structural checks (res:// paths, scene bookkeeping, indentation) automated hain — par pehla asli run aapke PC pe hoga. |
| ⚠️ **DEM/OSM pipeline** | Network se asli fetch test nahi hua (APIs is environment se blocked hain). Code aur error handling likhi hai; pehla asli run aapke PC pe. |
| ⚠️ **Blender scripts** | Blender install nahi hai. Syntax verified, execution nahi. |

---

## License

Code MIT. Kahani/design content reserved. OSM data ODbL (attribution zaroori).
Details: [LICENSE](LICENSE) aur [design/08-legal-and-attribution.md](design/08-legal-and-attribution.md)
