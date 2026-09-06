# Engine choice — Unreal ki jagah Godot kyun

Ye project shuru mein Unreal Engine 5 ke liye plan hua tha. Wo badla gaya.
Yahan wajah likhi hai, taaki baad mein koi ye sawaal dobara na uthaaye.

## Unreal Engine 5.8

**Kyun socha tha:** AAA-level graphics (Nanite, Lumen), Chaos Vehicles, World
Partition — sab kuch ek open-world game ke liye banaya hua.

**Kyun nahi hua:**

1. **Install hi nahi ho saka.** UE 5.8 ka install ~120 GB hai. Jis machine par
   ye project banna tha, wahan itni jagah nahi thi.
2. **Assets binary hain.** UE ka har asset `.uasset`/`.umap` hai — ek
   proprietary binary format jo sirf UE editor bana sakta hai. Iska matlab:
   engine ke bina koi level, material, Blueprint ya mesh bana hi nahi sakta.
   C++ likha ja sakta hai, par wo bina content ke chalta nahi.
3. **Git ke saath jhagda.** Binary assets diff nahi hote, merge nahi hote.
   Har team ko Git LFS + file locking ka intezaam karna padta hai.

## Godot 4.7

| | Unreal 5.8 | **Godot 4.7** |
|---|---|---|
| Download | ~120 GB | **~120 MB** |
| License | Royalty (5% > $1M) | **MIT — poori tarah free** |
| Scene format | `.umap` (binary) | **`.tscn` (text)** |
| Script | C++ / Blueprint (binary) | **GDScript (text)** |
| Physics | Chaos | Jolt (4.6+ default) |
| Web export | nahi | **haan (WASM)** |
| Blender workflow | FBX plugin | **glTF native** |
| Chalne ke liye | discrete GPU | integrated GPU bhi theek |

**Faisla ki wajah — scene files text hain.**

Godot ka `.tscn` ek INI-jaisi text file hai:

```
[node name="Terrain" type="MeshInstance3D" parent="."]
script = ExtResource("2_terrain")
chunks = 8
```

Isliye poora Godot project — scenes, scripts, project config — likha,
review kiya, diff kiya aur git mein rakha ja sakta hai, bina editor kholay.
UE mein ye possible hi nahi hai.

Iska ek aur faayda: is repo ke `tools/tests/test_godot_project.py` mein Godot
project ke structural checks automated hain (res:// paths resolve hote hain,
scene resource bookkeeping sahi hai, GDScript indentation consistent hai) — bina
engine install kiye. Binary format ke saath ye nahi ho sakta tha.

## Kya khoya

Imaandaari se: kuch cheezein khoyi hain.

- **Nanite/Lumen jaisi fidelity** — Godot ke paas virtualised geometry nahi hai.
  Is project ke stylized low-poly look ke liye ye koi nuksan nahi, par photoreal
  chahiye to UE aage hai.
- **Chaos Vehicles** — Godot ka `VehicleBody3D` utna refined nahi. (Waise bhi
  is project ne arcade model chuna, dekho `godot/scripts/vehicle.gd` mein wajah.)
- **Tooling ka ecosystem** — UE ka marketplace aur documentation bada hai.

## Doosre vikalp jo dekhe gaye

**O3DE** (Amazon, Apache 2.0) — graphics ke maamle mein UE ke sabse kareeb open
source engine. Par ~50 GB, setup complex, aur assets binary — yaani wahi
problem jo UE ke saath thi.

**Flax Engine** — source-available, par fully open source nahi.

**Bevy** (Rust, MIT) — code-only, koi editor nahi. Ek data-driven open-world
ke liye theek hai par is project ke scope ke liye zyada kaam.

**Sirf web (Three.js)** — ye already hai, aur primary deliverable hai. Godot
uske upar desktop build, behtar physics, aur ek asli editor deta hai.

## Dono kyun rakhe

Web build turant khelne ke liye hai — link kholo aur chalu. Godot build wahan ke
liye hai jahan desktop performance, editor tooling aur asli asset pipeline
chahiye.

Dono **ek hi `data/` folder** padhte hain, isliye ye do alag games nahi hain —
ek hi game ke do renderer hain.
