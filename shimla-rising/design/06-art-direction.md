# Art direction

## Stylized low-poly, flat-shaded

Ye ek constraint se shuru hua aur ab jaanboojh kar chuni hui shaili hai: koi
downloaded texture ya model nahi. Sab kuch procedural aur vertex-coloured.

Faayde:
- Repo self-contained hai — koi asset licensing ka jhanjhat nahi
- Browser mein turant load hota hai (~0.8 s)
- Ek hi look dono engines mein exactly reproduce ho jaata hai
- Shimla ke pahad faceted shading mein achhe lagte hain — 10 m ke quads
  chattan jaise dikhte hain, blurry blob ke bajaye

## Zameen ka rang — elevation banding

Shimla ka asli vanaspati banding:

| Elevation | Rang | Kya |
|---|---|---|
| < 1660 m | `#1a3819` | khad — ghana chir pine |
| 1660–1920 m | `#224513` | dhalan — mila jungle |
| 1920–2160 m | `#2b4d24` | **deodar belt** |
| 2160–2330 m | `#47521f` | ridge — sookhi ghaas |
| > 2330 m | `#666660` | chattan |
| > 2330 m | barf blend | winter snowline |

Khadi dhalan (slope > 0.55) pe rock colour blend hota hai — asli mein bhi
khadi jagah nangi hoti hai.

## Imaaratein

Shimla ka ghar dhalan pe **stepped** hota hai:

1. **Plinth** — neeche ki taraf nikla hua base jo dhalan pakadta hai. Gehrai
   footprint ke chaaron kone ki zameen ke farak se nikalti hai (max 9 m).
2. **Body** — 2–4 manzil, har ek 3 m. Wealth zyada to zyada manzil.
3. **Tin ki chhat** — thodi bahar nikli hui. Rang: laal `#8c3b2e`, neela
   `#2f5d8a`, hara `#3f6b47`, grey `#6b6b70`, bhoora `#9c5a2b`.

Har box face ka apna shade multiplier hai (0.70–1.00) — ek nakli AO jo bina
shadow map ke bhi form dikhata hai.

## Deodar

Cedrus deodara Shimla ki pehchaan hai. Web game mein cone + cylinder
(InstancedMesh, 9000). Blender script (`tools/blender/gen_props.py`) mein zyada
detail: seedha tana aur upar jaate hue chhote hote conical layers — asli deodar
ki jhuki hui shaakhon wali silhouette.

Treeline 2380 m pe — us se upar sirf barf aur chattan.

## Lighting

**Tone mapping band hai.** ACES film ke liye achha hai par shadow-side ko itna
crush karta hai ki imaaraton ke bina-dhoop wale mukh bilkul kaale ho jaate the.
Stylized look mein rang jaisa authored hai waisa hi chahiye.

- Hemisphere light: sky `#bcd4ee`, **ground `#b0a892`** — ground colour jaanboojh
  kar halka hai, yahi shadow-side ko kaala hone se bachata hai (koi shadow map nahi)
- Directional sun: `0.20 + day * 0.95`
- Distance fog: 900–5200 m. Shimla mein doori ki dhund asli hai — 8 km ke paar
  ki ridge hamesha halki neeli-safed dikhti hai.

## Aasman

Gradient ek bade inverted sphere pe vertex colours se (shader ke bajaye — kam
risk, aur low-poly style ke saath match). Time of day `1` dabakar badalta hai;
dusk pe horizon narangi ho jaata hai.

## Palette reference

```
taxi      #e8c33a    HUD accent  #e8c33a
HRTC bus  #1e6f4a    police      #2b3f63
scooter   #3b6fb5    Vicky       #c8442e
```
