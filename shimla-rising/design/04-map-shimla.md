# Naksha — Shimla

## World

| | |
|---|---|
| Size | 8192 m × 8192 m (**8.2 km²** playable, ~67 km²) |
| Origin | **The Ridge — 31.1048° N, 77.1734° E** |
| Elevation | ~1300 m (khad) → **2455 m (Jakhoo)** |
| Axes | x = east, y = up (samudra tal se), z = **south** |

North `-z` hai kyunki Three.js aur Godot dono ka forward `-Z` hai. Ye convention
`data/georeference.json` mein likhi hai aur teenon jagah (JS, GDScript, Python)
ek jaisi implement hai — `tools/tests/test_geo.py` isse verify karta hai.

Ye box mein poora Shimla sheher aata hai. **Bahar** hain: Kufri (+9.1 km east),
Mashobra, Naldehra, Tara Devi — wo `shimla_extended` preset (16.4 km) mein hain.

## Ilaake (14)

| District | Mizaaj | Police | Khaas |
|---|---|---|---|
| **The Mall & Ridge** | Colonial heart | 0.9 | **gaadi ban** |
| **Lakkar Bazaar** | Lakdi ka bazaar, sankri galiyan | 0.5 | Nafisa ka daftar |
| **Jakhoo Hill** | Deodar, mandir, bandar | 0.2 | sheher ka sabse ooncha |
| **Sanjauli** | Sabse ghana suburb | 0.4 | Vicky ka ghar |
| **Dhalli** | Poorvi darwaza, apple mandi | 0.3 | Bali ka yard |
| **Chhota Shimla** | Sarkari quarters | 0.5 | — |
| **Kasumpti & New Shimla** | Planned sector, chaudi sadkein | 0.3 | racing |
| **Chaura Maidan** | Vidhan Sabha, Secretariat | **1.0** | VIP convoy |
| **Railway Station** | Toy train terminus | 0.6 | goods shed |
| **Tutikandi ISBT** | HRTC ka adda | 0.4 | Guru ka dhaba |
| **Summer Hill** | HPU campus | 0.3 | — |
| **Viceregal Lodge** | 1888 Rashtrapati Niwas | 0.8 | sabse ameer |
| **Annandale** | Ek maatra samtal maidan | 0.7 | helipad |
| **Water Catchment** | Ghana deodar sanctuary | 0.15 | timber mafia |

## Asli landmarks aur unki elevation

`data/terrain_control.json` mein 45 control points hain — 25 asli landmarks aur
20 valley/ridge anchors. Heightmap inhi se banta hai.

| Jagah | Elevation |
|---|---|
| Jakhoo Temple | **2455 m** — 108-ft Hanuman murti |
| Water Catchment | 2400 m |
| The Ridge | 2205 m |
| Christ Church (1857) | 2202 m |
| Scandal Point | 2190 m |
| Gaiety Theatre (1887) | 2188 m |
| Sanjauli | 2100 m |
| Sanjauli Tunnel (1850s) | 2090 m |
| Viceregal Lodge (1888) | 2080 m |
| Railway Station | 2076 m |
| Summer Hill / HPU | 1983 m |
| Annandale | 1980 m |
| ISBT Tutikandi | 1900 m |
| New Shimla | 1850 m |

## Asli jagahein — apni imaarat ke saath

47 POI hain aur **45 ki apni pehchan wali imaarat** hai (pehle sirf 12 thi).
Har ek pe **naam ka board** bhi lagta hai — yahi ek jagah ko "random" se
"Sanjauli Chowk" banata hai.

| Jagah | Coordinates | Kya bana |
|---|---|---|
| **St. Bede's College**, Navbahar | 31.094, 77.187 ✅ | colonial campus — lamba block, arcade, chapel tower, lawn, gate |
| **Government College Sanjauli** | 31.1069, 77.1887 ✅ | institutional campus, 1969 |
| **Buddy's Food Joint**, Sanjauli | ~31.0958, 77.1880 ⚠️ | dukan — sheeshe ka front, awning, jagmagata board |
| **Sanjauli Chowk / Bazaar** | 31.1082, 77.1927 | dhalan pe sitti dukanon ki kataar, upar balcony wale ghar |
| **Sanjauli–Dhalli tunnel** | ~31.112, 77.1985 ⚠️ | naya double-lane portal (purana 1852 ka alag hai) |
| **Jakhu Mandir** | 31.0999, 77.1836 ✅ | aangan, shikhara, ghanti ka arch, 108-ft murti |
| **Mall Road** (Gaiety, Town Hall, Christ Church, Ridge) | | Victorian block, clock tower, arched khidkiyan |

`accuracy` field har POI pe hai: **verified** matlab coordinate source se confirm
hua, **approx** matlab jagah sahi hai par exact point nahi. `tools/shimla_pipeline`
chalane pe OSM se asli coords aa jaate hain.

## Sadak network

14 named roads, **26.3 km** total.

- **Cart Road** (4.2 km, arterial) — sheher ki lifeline, Mall ke neeche
- **The Mall** (0.7 km, **pedestrian**) — gaadi le gaye to wanted level
- **Circular Road** (3.3 km) — Jakhoo ke charon taraf
- **NH-5 / Hindustan-Tibet Road** (2.5 km) — Sanjauli → Dhalli → Kufri ki taraf
- **Kalka–Shimla Railway** (2.8 km, rail) — UNESCO narrow gauge, 762 mm

Baaki: Summer Hill Road, Annandale Road, Chhota Shimla–Kasumpti, New Shimla Loop,
Sanjauli Bazaar Lane, Jakhoo Road, Catchment Forest Track, Dhalli Depot Spur,
Chaura Maidan Link.

## Terrain kaise banta hai

`tools/terrain/build_heightmap.py`:

1. **IDW interpolation** — 45 control points se, Gaussian-tapered
 (`w = exp(-r²/2s²) / (r² + eps²)`). Control point pe value *exact* aati hai,
 aur output hamesha min/max ke andar rehta hai — koi ringing nahi.
2. **Ridged multifractal** detail — har octave alag se ridge hoti hai aur agli
 se multiply hoti hai. Yahi asli pahadon wali dendritic ridge-line deti hai.
3. **Khad carving** — nichli jagah gehri aur V-shaped.
4. **Residual correction** — detail ne landmarks ko hilaaya hoga, to error naap
 kar smooth correction wapas jodte hain.

**Landmark elevation error: mean 0.7 m** (worst: Christ Church +2.9 m).

Asli survey terrain ke liye `docs/PIPELINE.md` dekho — Copernicus GLO-30 DEM.
