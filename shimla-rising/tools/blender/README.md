# Blender scripts

Procedural Shimla assets. Headless Blender 4.x.

## Chalao

```bash
# imaaratein (pehle pipeline chalao -- OSM footprints chahiye)
blender --background --python tools/blender/gen_buildings.py -- --out assets/generated

# props -- deodar, railing, streetlight, signboard, toy-train coach
blender --background --python tools/blender/gen_props.py -- --out assets/generated

# test karne ke liye pehle thoda sa
blender --background --python tools/blender/gen_buildings.py -- --limit 50
```

Output `.glb` (glTF binary). **Three.js aur Godot dono ise natively load karte
hain** — yahi ek format teeno tools ko jodta hai. (FBX dono mein utna seedha
nahi hai.)

## gen_buildings.py

`data/footprints.json` se asli OSM building footprints padh kar mesh banata hai.
Wo file `python -m shimla_pipeline.run` se aati hai — bina uske script bata kar
exit ho jaata hai.

Har imaarat teen hisson se banti hai:

1. **Plinth** — dhalan pakadne wala base. Gehrai footprint ke chaaron kone ki
   zameen ke farak se (max 9 m). Shimla mein ghar dhalan pe stepped hote hain.
2. **Body** — `building:levels` × 3 m, ya OSM ka `height` tag.
3. **Tin ki chhat** — 12% bahar nikli hui.

400 imaaraton ke batch mein export hota hai (`buildings_000.glb`, `_001`, …) —
alag files draw calls aur streaming ke liye behtar hain.

## gen_props.py

Sab procedural, koi downloaded asset nahi:

| prop | note |
|---|---|
| `deodar_a` / `deodar_b` | Cedrus deodara — seedha tana, upar jaate hue chhote hote conical layers |
| `railing` | Mall Road ki lohe ki railing, 4 m section |
| `streetlight` | |
| `signboard` | HP-plate style board |
| `toy_train_coach` | Kalka–Shimla narrow gauge — 762 mm gauge, isliye asli mein sirf ~2 m chaudi |

## Notes

**Blender ki apni Python hoti hai.** `tools/requirements.txt` ke packages yahan
available nahi hote — ye scripts sirf `bpy`, `bmesh`, `mathutils` aur stdlib
use karte hain.

**Axis conversion.** Blender Z-up hai, game Y-up. `export_glb()` mein
`export_yup=True` hai, isliye export ke waqt convert ho jaata hai. Script ke
andar (x, z) game coords → (X, Y) Blender coords map hote hain aur oonchai Z par.

⚠️ **Ye scripts is repo ke authoring environment mein chalaye nahi gaye** —
Blender install nahi tha. Syntax verified hai, execution nahi. Pehla run
`--limit 50` se karna.
