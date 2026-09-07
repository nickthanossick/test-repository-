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

**Controls:** `↑↓←→` / `WASD` chalo · **`Ctrl` daudo** (toggle) · `Space` kudo /
handbrake · `F` gaadi mein baitho/utro · `E` mission · `G` danda · `R` pathar ·
`H` phone · Mouse camera · `M` naksha · `1` waqt +3h · `T` waqt rok · `2` mausam ·
`Q` quality · `P` save · **`,` / `.` awaaz kam/zyada** · **`N` mute** ·
**`V` bolne wali awaaz badlo** · `/` help

> `Ctrl` **toggle** hai, hold nahi — browser mein `Ctrl+W` tab band kar deta hai
> aur JavaScript use rok nahi sakta. Hold-to-run chahiye to `Shift` hai.

---

## Kya hai isme

| | |
|---|---|
| **Map** | 8.2 km × 8.2 km asli Shimla — Summer Hill se Sanjauli/Dhalli tak, Annandale se New Shimla tak, Jakhoo (2455 m) beech mein |
| **Terrain** | **Asli DEM** — AWS Terrain Tiles (SRTM/NED se bana, khula data, koi API key nahi). 2048 px, 4 m/px. Naye heightmap ka max 2457 m nikla; Jakhoo ki asli oonchai 2455 m hai. Sadak ke corridor mein cut-and-fill bhi hai, warna 30 m ka DEM sadak ko pahad ke upar oopar-neeche daudata hai |
| **Asli jagahein** | 47 POI, **45 ki apni imaarat aur naam ka board** — Sanjauli Chowk, St. Bede's College, Buddy's Food Joint, Government College Sanjauli, Jakhu Mandir, Mall Road, Sanjauli–Dhalli tunnel |
| **Din-raat** | Lagataar chalta hai — poora din **24 minute** mein. Raat ko street lamp, khidkiyan aur dukanon ke board jal jaate hain, taare nikalte hain |
| **Mausam** | Apne aap badalta hai, 18 second mein smooth transition. Mahine ke hisaab se — December mein barf, July mein monsoon |
| **Kahani** | 3 act, 14 story missions + 10 side missions, Hinglish dialogue |
| **Gaadiyan** | Alto (taxi bhi), Maruti 800, Baleno, Thar, scooter, HRTC bus, timber truck, HP Police Gypsy — har ek ka apna aakar |
| **Systems** | Wanted level (0–5), slope stamina, save/load, **quality tiers** (device dekh kar auto, `Q` se badlo) |
| **Traffic** | Sadak par chalti gaadiyan — aage wali se doori rakhti hain, raat ko headlight jalti hai, brake par taillight. Paas ki gaadi poori detail mein, door wali ek merged mesh (draw call bachane ke liye). **Chalti gaadi rok kar driver ko bahar nikala ja sakta hai** (`F`) — wo bhaag jaata hai, aur police ki heat lag jaati hai |
| **Awaaz** | Sab WebAudio se banti hai, koi file download nahi — pahadi nati, engine, horn, bheed ki bud-bud, aur Shimla ka mahaul (deodar mein hawa, chidiya, door mandir ki ghanti, raat ko kutte). Volume `,`/`.` se, mute `N` |
| **Bolna** | Browser ki apni Web Speech se. Line pehle **Devanagari** mein badalti hai (`web/src/translit.js`), warna Hindi voice roman Hinglish ko angrezi ki tarah padhti hai. Har kirdaar ka apna pitch/rate/gender `data/characters.json` mein — Vicky 19 saal ka ladka hai. Voice `V` se chuni ja sakti hai |
| **Bolchaal** | Vicky Sanjauli ki apni zubaan bolta hai — *bawa*, *macho*, *bedafu*, *benduga*, *bendiyaba*, *pataka* — aur beech mein aam mazak (RKMV wali, attendance, udhaar) |
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
data/ ← SHARED. Dono engines yahi padhte hain.
 georeference · heightmap · roads · districts · pois
 missions · dialogue · characters · vehicles
web/ Three.js browser game (no build step)
godot/ Godot 4.7 project (.tscn + .gd, sab text)
tools/
 terrain/ landmark elevations se heightmap generator
 shimla_pipeline/ asli Copernicus DEM + OpenStreetMap → data/
 blender/ procedural imaaratein aur props → .glb
 tests/ pytest (geo math, data integrity, Godot structure)
design/ vision, kahani, kirdaar, missions, naksha, art, audio, legal
docs/ SETUP · PIPELINE · ENGINE-CHOICE · ROADMAP
```

**Ek hi data layer** poore project ka core idea hai. Kahani `data/missions.json`
mein hai — usse badlo, aur web game aur Godot dono mein badal jaati hai. Koi
duplication nahi.

---

## Frame budget

Round 16 ka naap (low tier, wahi scene, pehle → baad):

| | pehle | baad |
|---|---|---|
| CPU prati frame | 1265 µs | **693 µs** |
| main-pass draw calls | 482 | 493 |
| main-pass triangles | 1.91 M | **1.42 M** |
| shadow-pass triangles | 1.49 M | **0.44 M** |
| material | 1,197 | **479** |
| `nearestNode()` | 15–18 µs | **2.4–2.9 µs** |
| ped | 3,500 | **9,000** |

Ped 2.6 guna hone ke **baad bhi** triangle kam hue — 240 m ke aage har ped
72 triangle se 12 par aa jaata hai.

Sabse bada structural sudhaar: merged batch ka bounding sphere 3,930 m ka tha,
yaani poora sheher kabhi frustum-cull hota hi nahi tha — na asli pass mein, na
shadow pass mein. `ChunkedBuilder` wahi merging 1 km ke khaanon mein karta hai.

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
python tools/sync_godot_data.py # data/ → godot/data/
# godotengine.org se Godot 4.7 download karo, godot/project.godot kholo, F5
```

---

## Testing

```bash
python -m pytest tools/tests -q # 89 tests: geo math, data integrity, Godot structure
python -m ruff check .
node tools/tests/translit.mjs                       # Devanagari transliteration
node web/serve.mjs & node tools/tests/smoke_web.mjs # headless browser smoke test
node tools/tests/perf.mjs                           # frame budget -- CPU, draw calls, material
node tools/tests/shots.mjs                          # screenshots -> build/shots/
node tools/build_artifact.mjs && node tools/tests/artifact_check.mjs   # single-file build
```

`perf.mjs` alag se zaroori hai. `smoke_web` batata hai duniya **bani** ya nahi;
ye batata hai wo **kitni mehngi** hai — aur wahi asli sawaal tha jab khel
atakne laga. Headless mein SwiftShader ~1 fps deta hai, isliye FPS naapna
bekaar hai; ye machine se azad cheezein naapta hai: har system ke `update()`
ka waqt, `nearestNode()` ka throughput, draw call ka **asli pass bनाम shadow
pass** batwara (jo `renderer.info` alag nahi karta), aur material/geometry ki
ginti.

Round 16 mein isi ne lag ki jad pakdi — `roads.js` ka `nearestNode()` 3,603
node par seedha loop tha aur `groundAt()` ke zariye har frame 30–50 baar chalta
tha, yaani **~1.5 lakh doori ka hisaab prati frame**, jo `renderer.info` mein
kabhi dikhta hi nahi.

Smoke test sirf "boot ho gaya" nahi dekhta — wo **simulation ki ganit** jaanchta
hai, kyunki headless mein frame rate ~1 fps hai aur aankh se kuch dikhta nahi:

| check | kya pakadta hai |
|---|---|
| `control ki disha` | W camera ke aage jaaye, arrows se ghoome |
| `rukh saamne` | mesh ka apna `-Z` chalne ki disha se dot ≈ +1 (chehra aage, pair peeche) |
| `zameen par khada` | khiladi/gaadi/bus sadak ki **satah** par — terrain par nahi (sadak 0.5 m upar bichti hai) |
| `sadak par traffic` | khiladi ke 120 m ke andar chalti gaadiyan > 0 |
| `camera peeche` | camera chalne ki disha ke **ulti** taraf, aur chehra camera se door — yahi wo check hai jiski kami se "body ulti" bug do round chala |
| `gaadi naak ke bal` | gaadi/bus ka mooh chalne ki disha mein (dot > 0.9), bagal ko sarakti hui nahi |
| `hawa mein koi nahi` | koi bhi paidal na zameen se upar ho na kisi slab ke bina latka ho |
| `chalti gaadi kheenchna` | gaadi `parked` mein aayi, driver bhaag raha hai, heat lagi |
| `gaadi ka rang` | paint texture ka asli pixel |
| `texture colour-space` | sRGB double-conversion |

---

## Kya verified hai aur kya nahi

Sach saaf rakhna behtar hai:

| | |
|---|---|
| ✅ **Web game** | Headless Chromium mein chala kar verify kiya — 0 console errors, 0 page errors, 2600+ imaaratein, 45 landmark, 43 naam ke board, 27 km sadkein. Screenshots liye gaye. |
| ✅ **Heightmap generator** | Chala kar output dekha gaya. Landmark elevation error: mean 0.7 m. |
| ✅ **Tests + lint** | 89 pytest pass, ruff clean, 17 smoke checks pass, transliteration test pass. |
| ⚠️ **Pahadi lehja** | **Nahi mil sakta.** Kisi bhi TTS engine mein Himachali accent hota hi nahi — Hindi voice mil jaati hai, lehja nahi. Jo ho sakta tha wo kiya hai: line Devanagari mein jaati hai (uchcharan theek), `hi-IN` voice pehle chunti hai, pitch thoda neeche, aur lehja *likhawat* mein hai (`bawa`, `bedafu`, `bendaga`). Isse zyada ka vaada nahi. |
| ⚠️ **Downloaded awaaz** | Is environment se har free-sound host (freesound, opengameart, pixabay) aur har TTS API `000` deta hai — proxy block. Isliye har awaaz WebAudio se **bani** hai, kahin se laayi nahi gayi. |
| ⚠️ **Godot project** | **Kabhi chalaya nahi gaya.** Godot editor is environment mein download nahi ho saka. Scripts Godot 4.7 API ke against dhyan se likhe hain, aur structural checks (res:// paths, scene bookkeeping, indentation) automated hain — par pehla asli run aapke PC pe hoga. |
| ✅ **Asli DEM** | **Chal gaya.** `tools/shimla_pipeline/build_real_terrain.py` ne AWS Terrain Tiles se 81 tile utha kar `data/heightmap.png` bana diya. Jaanch: naye heightmap ka max 2457 m, Jakhoo ki asli oonchai 2455 m. |
| ⚠️ **OSM sadkein aur footprints** | Abhi bhi nahi. Overpass, Nominatim, Geofabrik — sab blocked. Overture Maps ka S3 pahunchta hai (range request bhi chalti hai) par uski files 400–540 MB ki hain, isliye wo alag kaam hai. Sadkein filhaal haath se trace ki hui hain (24 sadak, 163 point). |
| ⚠️ **Blender scripts** | Blender install nahi hai. Syntax verified, execution nahi. |

---

## License

Code MIT. Kahani/design content reserved. OSM data ODbL (attribution zaroori).
Details: [LICENSE](LICENSE) aur [design/08-legal-and-attribution.md](design/08-legal-and-attribution.md)
