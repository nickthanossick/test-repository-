"""Shimla ki imaaratein banata hai -- Blender, headless.

    blender --background --python tools/blender/gen_buildings.py -- --out assets/generated

Do mode:

* `data/footprints.json` maujood ho (pipeline chala ho) -> **asli OSM footprints**
  se imaaratein banti hain, asli aakar mein.
* Warna -> `data/districts.json` aur `data/roads.json` se procedural scatter,
  wahi tarika jo web game runtime pe use karta hai.

Shimla ki khaas baat jo yahan model ki hai: ghar dhalan pe **stepped** hote hain.
Neeche ki taraf ek plinth nikalta hai jo dhalan ko pakadta hai, aur upar 2-4
manzil. Isliye har footprint ke saath uske neeche ki zameen ka min/max bhi
aata hai, aur us drop se plinth ki gehrai nikalti hai.

Output: `assets/generated/buildings_*.glb` -- Three.js aur Godot dono seedha
load kar lete hain.
"""

from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.mesh_utils import (  # noqa: E402
    clear_scene,
    export_glb,
    flat_material,
    get_or_create_collection,
    new_mesh_object,
    shade_flat,
    uv_smart_project,
)

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

ROOF_COLORS = [(0.55, 0.23, 0.18), (0.18, 0.36, 0.54), (0.25, 0.42, 0.28),
               (0.42, 0.42, 0.44), (0.61, 0.35, 0.17)]
WALL_COLORS = [(0.85, 0.80, 0.72), (0.79, 0.74, 0.65), (0.75, 0.68, 0.58),
               (0.82, 0.77, 0.68), (0.66, 0.60, 0.54)]
LEVEL_H = 3.0
BATCH = 400            # itni imaaratein ek .glb mein -- alag files draw calls ke liye behtar


def parse_args() -> dict:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {"out": ROOT / "assets" / "generated", "limit": 0, "seed": 31104877}
    i = 0
    while i < len(argv):
        if argv[i] == "--out":
            out["out"] = Path(argv[i + 1])
            i += 2
        elif argv[i] == "--limit":
            out["limit"] = int(argv[i + 1])
            i += 2
        elif argv[i] == "--seed":
            out["seed"] = int(argv[i + 1])
            i += 2
        else:
            i += 1
    return out


def load_footprints() -> list[dict]:
    path = DATA / "footprints.json"
    if not path.exists():
        print(f"[gen_buildings] {path.name} nahi mila.")
        print("  Asli OSM imaaraton ke liye pehle chalao:")
        print("    python -m shimla_pipeline.run --preset shimla_core")
        return []
    blob = json.loads(path.read_text(encoding="utf-8"))
    return blob.get("footprints", [])


def build_one(bm: bmesh.types.BMesh, fp: dict, rng: random.Random) -> None:
    ring = [(x, z) for x, z in fp["ring"]]
    if len(ring) < 3:
        return
    # closing vertex hata do -- bmesh face khud band karta hai
    if ring[0] == ring[-1]:
        ring = ring[:-1]
    if len(ring) < 3:
        return

    g_lo = float(fp["ground_min_m"])
    g_hi = float(fp["ground_max_m"])
    drop = min(g_hi - g_lo, 9.0)
    body_h = float(fp.get("height_m") or fp.get("levels", 3) * LEVEL_H)

    # dhalan pakadne wala plinth
    if drop > 0.8:
        from lib.mesh_utils import extrude_polygon
        extrude_polygon(bm, ring, g_hi - drop - 0.6, drop + 0.6)

    from lib.mesh_utils import extrude_polygon
    extrude_polygon(bm, ring, g_hi, body_h)

    # tin ki chhat -- thoda bahar nikli hui, Shimla ki pehchaan
    eaves = [_scale_point(p, ring, 1.12) for p in ring]
    extrude_polygon(bm, eaves, g_hi + body_h, 0.55)


def _scale_point(p, ring, k):
    cx = sum(q[0] for q in ring) / len(ring)
    cz = sum(q[1] for q in ring) / len(ring)
    return (cx + (p[0] - cx) * k, cz + (p[1] - cz) * k)


def main() -> None:
    args = parse_args()
    rng = random.Random(args["seed"])
    footprints = load_footprints()
    if not footprints:
        print("[gen_buildings] kuch banane ko nahi. Bahar nikal rahe hain.")
        return
    if args["limit"]:
        footprints = footprints[: args["limit"]]

    clear_scene()
    col = get_or_create_collection("ShimlaBuildings")
    out_dir = Path(args["out"])
    out_dir.mkdir(parents=True, exist_ok=True)

    written = []
    for start in range(0, len(footprints), BATCH):
        chunk = footprints[start: start + BATCH]
        idx = start // BATCH
        obj = new_mesh_object(f"buildings_{idx:03d}", col)
        bm = bmesh.new()
        for fp in chunk:
            build_one(bm, fp, rng)
        bm.to_mesh(obj.data)
        bm.free()

        obj.data.materials.append(
            flat_material(f"wall_{idx}", WALL_COLORS[idx % len(WALL_COLORS)]))
        shade_flat(obj)
        try:
            uv_smart_project(obj)
        except RuntimeError as e:          # headless mein kabhi-kabhi context nahi milta
            print(f"  UV skip ({e})")

        path = out_dir / f"buildings_{idx:03d}.glb"
        export_glb([obj], str(path))
        written.append(path.name)
        print(f"  {path.name}: {len(chunk)} imaaratein, "
              f"{len(obj.data.polygons)} faces")
        bpy.data.objects.remove(obj, do_unlink=True)

    print(f"[gen_buildings] {len(footprints)} imaaratein -> {len(written)} glb files "
          f"in {out_dir}")


if __name__ == "__main__":
    main()
