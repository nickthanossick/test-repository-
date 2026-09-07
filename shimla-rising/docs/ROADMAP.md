# Roadmap

## Round 14 mein kya aaya

Nikhil ne chaar bug pakde — chaaron asli nikle, aur chaaron ki jad code mein mil gayi:

| bug | jad | hal |
|---|---|---|
| "body hi ulti — jis side face hai wo back kar di" | kirdaar ka aage `-Z` hai (naak `-Z` par banti hai) par rukh har jagah `Math.atan2(dx, dz)` se likha tha — jisse model ka `-Z` theek ulti taraf jaata tha | `human.js` ka saanjha `faceYaw()`, saat jagah lagaya. Smoke test ab mesh ke matrix se dot naapta hai |
| "banda sadak ke andar ghus gaya" | sadak ka mesh terrain se **0.5 m upar** bichta hai, par khiladi/gaadi/bheed sab `terrain.heightAt()` se zameen lete the | `roads.groundAt()` — sab isi se |
| "bus float kar rahi" | `syncMesh()` mein `body[1] * 0.5 - 0.35` ka purana offset, jab dhad ek box tha jiska center origin par hota tha. Ab `buildBody()` ka origin pahiye ke neeche hai | offset hata diya. Bus 1.18 m upar thi |
| "road pe koi car nahi" | traffic system tha hi nahi — sirf khadi gaadiyan aur route ki buses | naya `web/src/traffic.js` |

Iske alawa: khel ab **Sanjauli College se shuru** hota hai (intro cards → seedha
pehla mission), Vicky har ~5 second khud se bolta hai, awaaz tez (0.16 → 0.34)
aur `,`/`.`/`N` se control mein, Shimla ka mahaul (hawa, chidiya, mandir ki
ghanti, raat ko kutte), aur bolne se pehle line Devanagari mein badalti hai.

## Round 3 mein kya aaya

- ✅ **Asli jagahein** — 47 POI, **45 ki apni imaarat**, **43 naam ke board**.
  St. Bede's College (Navbahar), Government College Sanjauli, Buddy's Food Joint,
  Sanjauli Chowk aur bazaar, Sanjauli–Dhalli tunnel, Mall Road ka stretch,
  Chhota Shimla/Kasumpti — sab apne asli sthaan pe
- ✅ **Din-raat chalta rehta hai** — poora din 24 minute mein; raat ko street lamp,
  khidkiyan aur dukanon ke board jal jaate hain, taare nikalte hain
- ✅ **Mausam apne aap badalta hai** — 18 second mein smooth transition
- ✅ **Quality tiers** — device dekh kar auto (`Q` se badlo)
- ✅ **Asli gaadiyan** — Alto, Maruti 800, Baleno, Thar, har ek ka apna aakar
- ✅ **Pahadi topi** har kirdaar pe
- ✅ **Controls** — arrow keys + `Ctrl` se daudna (toggle)
- ✅ Sadkein 14 → **19** (Navbahar Road, Sanjauli Bazaar Road, Lower Bazaar…)

## Abhi kya kaam karta hai

- ✅ 8.2 km² Shimla terrain, 45 asli landmark elevations se (error: mean 0.7 m)
- ✅ 26 km sadak network, 14 named roads
- ✅ Web game: 2707 imaaratein, 9000 deodar, 14 gaadiyan, 0 console errors
- ✅ Wanted system, slope stamina, mausam, missions, save/load
- ✅ 24 missions + 57 dialogue lines, Hinglish
- ✅ Godot 4.7 project (likha hua, run pending)
- ✅ DEM/OSM pipeline (likha hua, network run pending)
- ✅ Blender scripts (likhe hue, run pending)
- ✅ 72 tests, ruff clean, CI workflow

## Next — pehla asli run

Ye teen cheezein authoring environment mein test nahi ho saki. Sabse pehla kaam
inhe ek baar chalana hai:

1. **Godot project kholo aur F5 dabao.** Kuch API mismatch nikal sakte hain.
2. **Pipeline chalao** OpenTopography key ke saath — asli DEM aur OSM.
3. **Blender scripts chalao** — `--limit 50` se shuru karo.

## Agla round — sabse pehle

- ~~**Dialogue ki awaaz**~~ — **ho gaya.** Web Speech API, aur line pehle
  Devanagari mein badalti hai (`web/src/translit.js`) warna Hindi voice roman
  Hinglish ko angrezi ki tarah padhti hai. Ab bacha hai: har kirdaar ka apna
  pitch/rate profile `data/characters.json` mein, taaki Godot bhi padh sake
- ~~**Traffic**~~ — **ho gaya** (`web/src/traffic.js`), par sirf polyline par.
  Ab bacha hai: **junction ka logic** — signal, right of way, chowk par mudna.
  Abhi gaadiyan chowk par ek doosre ke aar-paar nikal jaati hain
- **Traffic ki gaadi mein baithna** — abhi sirf `parked` gaadi mein baith sakte
  hain; chalti gaadi rokna GTA ka aadha maza hai
- **Sadkein 19 → ~40** — Middle Bazaar, Ram Bazaar, Jakhoo ke teen rastey,
  Summer Hill ki hairpin, Tutikandi bypass
- **District circles → polygons** — abhi har ilaaka ek circle hai, isliye
  imaaratein kabhi-kabhi galat jagah phail jaati hain

## Phase 2 — content

- **Asli OSM imaaratein.** Abhi imaaratein sadak ke kinare procedurally scatter
  hoti hain. Pipeline chalne ke baad `data/footprints.json` se asli aakar aa
  jaayenge, aur Blender script unse `.glb` banayega.
- **Interiors** — Rana ka hotel, Nafisa ka daftar, Vicky ki garage. Abhi sab
  bahar se hi hote hain.
- ~~**NPC traffic**~~ — ho gaya (spline-following, `traffic.js`). Paidal log
  pehle se hain (`crowd.js`). Bacha hai: dono ka aapas mein rishta — zebra
  crossing, gaadi ke aage se hatna.
- **Toy train jo sach mein chale.** Track already map mein hai (2.8 km,
  `kalka_shimla_rail`). Ek moving train jispe chadha ja sake — Act 1 ka
  `a1_m4` isse bahut behtar ho jaayega.

## Phase 3 — map extension

`shimla_extended` preset (16.4 km) already pipeline mein hai. Usme aate hain:

- **Kufri** (2720 m) — skiing, Himalayan Nature Park. Act 3 ka ek alternate finale.
- **Mashobra**, **Naldehra** (India ka sabse purana 9-hole golf course, Lord Curzon)
- **Tara Devi** (1851 m) — mandir, aur sheher ka dakshini darwaza

Dhyan rahe: 30 m DEM ko 16 km pe phailane se terrain aur mulayam lagega
([PIPELINE.md](PIPELINE.md) mein detail).

## Phase 4 — polish

- **Audio** — Himachali nati soundtrack, ambience, Hinglish voice-over.
  Plan: [design/07-audio.md](../design/07-audio.md)
- **Shadows** web build mein (abhi sirf hemisphere + directional, koi shadow map nahi)
- **LOD** — abhi terrain ek hi resolution pe hai. Distance-based chunk LOD se
  bada map possible hoga.
- **Mobile touch controls** — web build phone pe chalti hai par controls nahi hain.

## Jo scope mein nahi hai

- **Multiplayer.** Ye ek single-player kahani hai.
- **Unreal Engine port.** Wajah: [ENGINE-CHOICE.md](ENGINE-CHOICE.md).
- **Photorealism.** Art direction jaanboojh kar stylized low-poly hai
  ([design/06-art-direction.md](../design/06-art-direction.md)).
