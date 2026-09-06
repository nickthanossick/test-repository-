# Missions

24 missions: **14 story** + **10 side**.
Machine-readable: `data/missions.json`. Dialogue: `data/dialogue.json`.

## Objective types

Engine sirf ye chhe samajhta hai. Kam rakhna jaanboojh kar hai — har type
dono engines (`web/src/missions.js`, `godot/scripts/mission_manager.gd`) mein
implement hai, aur naya type add karne se pehle dono mein aana chahiye.

| type | matlab | fields |
|---|---|---|
| `goto` | POI tak pahuncho (paidal ya gaadi) | `poi`, `radius` |
| `drive_to` | POI tak pahuncho, **gaadi mein hona zaroori** | `poi`, `radius` |
| `collect` | POI ke aas-paas N pickups uthao | `poi`, `count`, `spread` |
| `evade` | wanted level 0 karo | — |
| `survive` | N second tak zinda/chhupe raho | `seconds` |
| `race` | checkpoints kram se, time limit mein | `checkpoints[]`, `time_s` |

## Story missions

| id | title | jagah | naya kya sikhata hai |
|---|---|---|---|
| `a1_m1` | Garage ki Subah | Sanjauli | chalna, gaadi, Cart Road |
| `a1_m2` | Lakkar Bazaar ki Reporter | Lakkar Bazaar → Dhalli | pickups, lambi drive |
| `a1_m3` | Cart Road Sprint | Cart Road | race, hairpin |
| `a1_m4` | Toy Train ka Maal | Railway Station | toy train, cargo |
| `a1_m5` | Chhotu ki Nazar | Jakhoo | **slope stamina**, chhupna |
| `a1_m6` | Garage Jal Gayi | Sanjauli | **pehla evade** — act climax |
| `a2_m1` | Rana Sahab ka Bulawa | Mall Road | Mall pedestrian-only hai |
| `a2_m2` | Tender Fix | Secretariat | high police density |
| `a2_m3` | Mall Road Mein Gaadi | The Mall | **jaanboojh kar wanted level** |
| `a2_m4` | Annandale ka Helipad | Annandale | survive + pickups |
| `a2_m5` | Viceregal Lodge | Viceregal | sabse bada heist |
| `a2_m6` | Bali ka Yard | Dhalli | act climax, kahani ka mod |
| `a3_m1` | Catchment ke Andar | Catchment | **barf — grip 0.55** |
| `a3_m2` | Jakhoo par Aakhri Raat | Jakhoo | finale, 5 objectives |

`a2_m3` **Mall Road Mein Gaadi** design ka centrepiece hai: mission tumse
jaanboojh kar wo jurm karwaata hai jo asli Shimla mein sabse pehchana hai.
Rana khud nahi jaata — wo tumhein bhejta hai. Kahani aur mechanic ek hi cheez hai.

## Side missions

| id | title | type |
|---|---|---|
| `s_taxi` | Taxi Rani | race (sawariyan) |
| `s_bus` | Guru ki Bus | race (HRTC route) |
| `s_race_ns` | New Shimla Loop | race |
| `s_race_cart` | Cart Road Time Trial | race |
| `s_monkey` | Jakhoo ke Bandar | collect |
| `s_courier` | Sanjauli Courier | collect + race |
| `s_photo` | Nafisa ke Photo | collect |
| `s_snow` | Barf Mein Phasi Gaadi | collect (winter) |
| `s_apple` | Apple Lorry | collect + race |
| `s_train` | Chhoti Gaadi ka Peecha | race |

Side missions `repeatable: true` hain — poore hone ke baad phir available ho
jaate hain. Paisa kamane ka main zariya yahi hai.

## Unlock chain

`a1_m1` se shuru. Har mission `unlocks[]` se agla kholta hai.
`test_every_story_mission_is_reachable` (tools/tests) ye check karta hai ki
koi story mission chain se toota hua na ho.
