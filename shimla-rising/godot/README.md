# Godot 4.7 project

Unreal Engine ki jagah. Wajah: [../docs/ENGINE-CHOICE.md](../docs/ENGINE-CHOICE.md)

## Chalao

```bash
python tools/sync_godot_data.py     # ZAROORI: data/ -> godot/data/
```

Phir Godot 4.7 mein `godot/project.godot` import karo aur **F5**.

`sync_godot_data.py` isliye chahiye kyunki Godot `res://` ke bahar se shipped
files nahi padh sakta. `godot/data/` gitignored hai — sach hamesha repo root ke
`data/` mein rehta hai.

## Structure

```
project.godot          autoloads: InputSetup, GameData, Geo, MissionManager, SaveGame
scenes/
  Main.tscn            terrain + world + player + camera + wanted + weather + HUD
  Player.tscn          CharacterBody3D
  Vehicle.tscn         CharacterBody3D (arcade -- neeche wajah)
  HUD.tscn             CanvasLayer
scripts/
  geo.gd               lat/lon <-> world  (web/src/geo.js ka mirror)
  game_data.gd         data/*.json loader
  terrain_builder.gd   @tool -- heightmap -> ArrayMesh + HeightMapShape3D
  world_builder.gd     sadkein, imaaratein, deodar ka jungle
  player_controller.gd slope stamina
  vehicle.gd           arcade physics
  mission_manager.gd   mission state machine
  wanted_system.gd     Himachal Police heat
  weather.gd           barf / monsoon / kohra
  chase_camera.gd      GTA-style follow cam
  hud.gd               HUD bindings
  save_game.gd         user:// save
```

## Do design decisions

**1. `VehicleBody3D` use nahi kiya.**
Shimla ki sadak matlab lagataar hairpin, 15% grade aur 6 m chaudi gali. Ek
rigid-body suspension sim wahan aksar ulat jaata ya atak jaata hai. Iske bajaye
wahi arcade model hai jo web build chalata hai — dono engines mein gaadi ka feel
identical rehta hai. Poora simulation chahiye to `vehicle.gd` ko `VehicleBody3D`
+ `VehicleWheel3D` se badla ja sakta hai; `data/vehicles.json` ke stats waise ke
waise chalenge.

**2. Input actions runtime pe bante hain, `project.godot` mein nahi.**
Godot input actions ko ek lambe `Object(InputEventKey, ...)` serialisation mein
likhta hai jisme har property honi chahiye. Use haath se likhna bhangur hai aur
version ke saath badalta hai. `scripts/input_setup.gd` `InputMap` API se banata
hai — saaf, aur har Godot 4.x pe chalta hai.

## Status

⚠️ **Ye project abhi tak kabhi chalaya nahi gaya.** Godot editor is repo ke
authoring environment mein download nahi ho saka (network policy). Scripts Godot
4.7 API ke against dhyan se likhe hain, aur `tools/tests/test_godot_project.py`
structural checks karta hai:

- har `res://` path repo mein maujood hai
- scene `load_steps` sahi hai, koi undefined resource reference nahi
- GDScript tabs use karta hai (space-indent chupa hua parse error deta hai)
- autoloads asli scripts pe point karte hain
- `godot/data/` shared `data/` ke saath sync mein hai

Ye common breakage pakadte hain, par asli run ka substitute nahi hain. Pehla
`F5` aapka hoga — kuch toota to issue kholo.
