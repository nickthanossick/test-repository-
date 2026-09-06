# Gameplay systems

## Controls

| Key | Kaam |
|---|---|
| **↑ ↓ ← →** / W A S D | chalo / gaadi chalao |
| **Ctrl** | **daudo** — dabao to on, dobara dabao to off |
| Shift | daudo (dabaye rakho) |
| **Space** | kudo (paidal) · handbrake (gaadi) |
| F · E | gaadi mein baitho/utro · mission shuru karo |
| M · 1 · T · 2 · Q · P | naksha · waqt +3h · waqt rok · mausam · quality · save |

**Ctrl toggle kyun hai, hold kyun nahi:** browser mein **Ctrl+W tab band kar
deta hai**, aur JavaScript use rok nahi sakta — `preventDefault()` ka us par koi
asar nahi hota. Agar Ctrl ko dabaye rakh kar W se aage chalte, to game beech
khel mein band ho jaata. Isliye Ctrl ek baar dabane pe run on/off hota hai, aur
hold-to-run chahiye to **Shift** hai.

## Din-raat aur mausam

Waqt **lagataar chalta hai**: 1 asli second = 1 game minute, yaani poora din
**24 minute** mein. Khelte-khelte subah, dopahar, shaam aur raat sab aa jaate hain.

Raat ko: taare nikalte hain, chaand ki dheemi neeli light aati hai, **street
lamp jal jaate hain**, **imaaraton ki khidkiyan roshan ho jaati hain**, aur
dukanon ke board jagmagate hain.

**Ek performance baat:** `sky.setTime()` PMREM se environment map dobara banata
hai, jo mehnga hai. Isliye rang aur light har frame update hote hain par env map
sirf har ~15 game-minute mein — warna frame rate gir jaata.

Mausam apne aap badalta rehta hai, har 3–8 game-ghante mein, aur badlav **18
second mein smooth** hota hai (grip, fog, particles sab lerp hote hain). Mahine
ke hisaab se probability: December mein barf zyada, July mein monsoon.

## Quality tiers

Game device dekh kar khud tier chunta hai (GPU string, core count, mobile UA).
`Q` se badla ja sakta hai; render settings turant lagti hain, terrain/ped ki
density agle load pe.

| | low | medium | high |
|---|---|---|---|
| terrain quads/chunk | 64 | 96 | 128 |
| ped | 3 500 | 9 000 | 16 000 |
| khidkiyan (deewarein) | 1 | 2 | 4 |
| shadow map | 1024 | 2048 | 4096 |

Har system dono engines mein implement hai. Jab bhi kuch badle, dono mein badalna
chahiye — `web/src/` aur `godot/scripts/` ke files jaanboojh kar aamne-saamne
mirror hain.

---

## Wanted level — Himachal Police

0–5 sitare. `heat` (0–100) se nikalte hain:

```
stars = heat < 8 ? 0 : min(5, 1 + floor((heat - 8) / 18))
```

Pehla sitara 8 heat pe shuru hota hai — warna zaraa si heat bhi poora sitara
dikha deti thi.

**Heat kaise badhti hai:**

| Kaam | heat/sec |
|---|---|
| **Mall Road pe gaadi** | +26 |
| Kisi bhi vehicle-restricted district mein gaadi | +14 |

**Thandi kaise hoti hai:** −4.5/sec (4+ sitaron pe −2.2/sec), **par sirf tab jab
koi chaser 85 m ke andar na ho.** Isliye peecha chhudana padta hai, chhupna kaafi
nahi.

Chasers: sitaron ke barabar (max 5). 130–220 m door sadak pe spawn hote hain,
khiladi ki taraf steer karte hain. 520 m se zyada door nikal gaye to sadak pe
wapas teleport ho jaate hain — warna peecha khatam sa lagta hai.

`web/src/wanted.js` · `godot/scripts/wanted_system.gd`

---

## Slope stamina

Shimla ka signature system.

```
running: stamina -= dt * (9 + max(0, grade) * 46)
idle/walk: stamina += dt * (13 / 5.5)
speed *= clamp(1 - grade * 0.85, 0.42, 1.28)
```

`grade` = aage 1.5 m mein elevation ka farak / 1.5.

Matlab: samtal pe daudte hue stamina ~11 sec chalti hai. Jakhoo ki chadhai
(grade ~0.22) pe ~3.5 sec. Utraai pe 28% tez chalte ho.

Ye mission `a1_m5` ("Chhotu ki Nazar") ka core hai — Ridge se Jakhoo tak 1.1 km
mein 250 m chadhai. Daud kar nahi ja sakte, chalna padta hai.

`web/src/player.js` · `godot/scripts/player_controller.gd`

---

## Gaadi — arcade model

**Rigid-body simulation jaanboojh kar nahi.** Shimla ki sadak matlab lagataar
hairpin, 15% grade aur 6 m chaudi gali. Ek proper raycast-suspension sim wahan
aksar ulat jaata ya atak jaata hai.

Iske bajaye: heading + speed integrate karte hain, gaadi ko terrain pe chipka
dete hain, aur dhalan ko seedha throttle mein feed karte hain:

```
a = accel * throttle
a -= 9.81 * grade * 0.85 // gravity -- chadhai pe dheemi
a -= speed * 0.30 + sign(speed) * 0.55 // drag + rolling
cap = top_speed * (grade > 0.06 ? 0.72 : 1)
```

Steering speed ke saath badhta hai phir ghatta hai (bahut tez pe kam turn).
Lateral slip `(1 - grip)` ke barabar — barf pe gaadi baahar khisakti hai.

6 gaadiyan `data/vehicles.json` mein: Shimla Taxi, HRTC Bus, Bolero Pickup,
Scooter, Timber Truck, HP Police Gypsy.

`web/src/vehicle.js` · `godot/scripts/vehicle.gd`

---

## Mausam

| Mode | grip | Kab |
|---|---|---|
| `clear` | 1.00 | Apr–Jun, Oct |
| `fog` | 0.94 | Mar, Nov |
| `monsoon` | 0.80 | Jul–Sep |
| `snow` | **0.55** | Dec–Feb |

Game system ki asli date se mausam chunta hai (`Weather.forMonth`), aur `2`
dabakar cycle bhi kar sakte ho. Act 3 December mein set hai — barf sirf dikhne
ke liye nahi hai, grip aadhi ho jaati hai.

`web/src/weather.js` · `godot/scripts/weather.gd`

---

## Missions

Data-driven state machine. `data/missions.json` padhta hai, objectives kram se
chalata hai. Types: `goto`, `drive_to`, `collect`, `evade`, `survive`, `race`.
Details: [03-missions.md](03-missions.md).

`web/src/missions.js` · `godot/scripts/mission_manager.gd`

---

## Save

Web: `localStorage`. Godot: `user://shimla-rising.save.json`.

Save hota hai: paisa, poore hue missions, unlocked missions, position, ghanta,
mausam. Mission poora hone pe apne aap, ya `P` dabakar.
