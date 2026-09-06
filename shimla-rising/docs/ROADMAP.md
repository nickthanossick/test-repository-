# Roadmap

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

## Phase 2 — content

- **Asli OSM imaaratein.** Abhi imaaratein sadak ke kinare procedurally scatter
  hoti hain. Pipeline chalne ke baad `data/footprints.json` se asli aakar aa
  jaayenge, aur Blender script unse `.glb` banayega.
- **Interiors** — Rana ka hotel, Nafisa ka daftar, Vicky ki garage. Abhi sab
  bahar se hi hote hain.
- **NPC traffic aur paidal log.** Abhi sadkein khaali hain. Ek simple
  spline-following traffic system road network par aaram se chal jaayega.
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
