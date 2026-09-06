"""Shimla ke props -- deodar, railing, streetlight, toy-train coach.

    blender --background --python tools/blender/gen_props.py -- --out assets/generated

Sab procedural hai: koi downloaded asset nahi, isliye repo self-contained rehta
hai aur licensing saaf. Output `props.glb` -- Three.js aur Godot dono ke liye.

Deodar (Cedrus deodara) Shimla ka signature ped hai -- jhuki hui shaakhon wala
conical silhouette. Wahi shape yahan layered cones se banaya hai.
"""

from __future__ import annotations

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
)

ROOT = Path(__file__).resolve().parents[2]


def parse_args() -> dict:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {"out": ROOT / "assets" / "generated", "seed": 770317}
    for i, a in enumerate(argv):
        if a == "--out":
            out["out"] = Path(argv[i + 1])
        elif a == "--seed":
            out["seed"] = int(argv[i + 1])
    return out


def cone(bm, cx, cy, cz, radius, height, segments=7):
    ring = []
    for i in range(segments):
        t = (i / segments) * math.tau
        ring.append(bm.verts.new((cx + math.cos(t) * radius, cy + math.sin(t) * radius, cz)))
    apex = bm.verts.new((cx, cy, cz + height))
    bm.verts.ensure_lookup_table()
    for i in range(segments):
        bm.faces.new([ring[i], ring[(i + 1) % segments], apex])
    bm.faces.new(list(reversed(ring)))


def cylinder(bm, cx, cy, cz, r_lo, r_hi, height, segments=6):
    lo, hi = [], []
    for i in range(segments):
        t = (i / segments) * math.tau
        lo.append(bm.verts.new((cx + math.cos(t) * r_lo, cy + math.sin(t) * r_lo, cz)))
        hi.append(bm.verts.new((cx + math.cos(t) * r_hi, cy + math.sin(t) * r_hi, cz + height)))
    bm.verts.ensure_lookup_table()
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new([lo[i], lo[j], hi[j], hi[i]])
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)


def box(bm, cx, cy, cz, sx, sy, sz):
    bmesh.ops.create_cube(bm, size=1.0, matrix=_mat(cx, cy, cz, sx, sy, sz))


def _mat(cx, cy, cz, sx, sy, sz):
    from mathutils import Matrix
    return Matrix.Translation((cx, cy, cz)) @ Matrix.Diagonal((sx, sy, sz, 1.0))


def make_deodar(bm, rng: random.Random) -> None:
    """Deodar: seedha tana, aur upar jaate hue chhote hote conical layers."""
    h = 12.0 + rng.random() * 8.0
    cylinder(bm, 0, 0, 0, 0.42, 0.26, h * 0.28)
    layers = 4
    for i in range(layers):
        t = i / layers
        cone(bm, 0, 0, h * (0.22 + t * 0.58),
             radius=(2.9 - t * 1.9) * (0.9 + rng.random() * 0.25),
             height=h * 0.30)


def make_railing(bm) -> None:
    """Mall Road ki lohe ki railing -- 4 m ka ek section."""
    for i in range(5):
        cylinder(bm, i * 1.0 - 2.0, 0, 0, 0.045, 0.045, 1.05, segments=5)
    box(bm, 0, 0, 1.05, 4.2, 0.07, 0.07)
    box(bm, 0, 0, 0.55, 4.2, 0.05, 0.05)


def make_streetlight(bm) -> None:
    cylinder(bm, 0, 0, 0, 0.13, 0.08, 4.4, segments=6)
    box(bm, 0.45, 0, 4.45, 1.0, 0.14, 0.14)
    box(bm, 0.9, 0, 4.34, 0.42, 0.3, 0.18)


def make_signboard(bm) -> None:
    """HP number-plate style board -- 'BANDARON SE SAAVDHAN'."""
    cylinder(bm, 0, 0, 0, 0.07, 0.07, 2.1, segments=5)
    box(bm, 0, 0, 2.35, 1.25, 0.06, 0.62)


def make_toy_train_coach(bm) -> None:
    """Kalka-Shimla narrow gauge coach. Gauge 762 mm, isliye ye asli mein
    bahut chhoti hoti hai -- lagbhag 2 m chaudi, 8 m lambi."""
    box(bm, 0, 0, 1.35, 8.2, 2.05, 2.1)
    box(bm, 0, 0, 2.52, 8.4, 2.25, 0.26)          # chhat
    box(bm, 0, 0, 0.26, 8.0, 1.85, 0.3)           # underframe
    for dx in (-2.7, 2.7):
        for dy in (-0.85, 0.85):
            cylinder(bm, dx, dy, 0.0, 0.34, 0.34, 0.12, segments=8)


PROPS = {
    "deodar_a": (make_deodar, (0.18, 0.34, 0.20)),
    "deodar_b": (make_deodar, (0.15, 0.30, 0.18)),
    "railing": (make_railing, (0.22, 0.24, 0.26)),
    "streetlight": (make_streetlight, (0.26, 0.27, 0.29)),
    "signboard": (make_signboard, (0.72, 0.68, 0.55)),
    "toy_train_coach": (make_toy_train_coach, (0.36, 0.16, 0.14)),
}


def main() -> None:
    args = parse_args()
    rng = random.Random(args["seed"])
    clear_scene()
    col = get_or_create_collection("ShimlaProps")
    objects = []

    for i, (name, (fn, colour)) in enumerate(PROPS.items()):
        obj = new_mesh_object(name, col)
        bm = bmesh.new()
        if fn is make_deodar:
            fn(bm, rng)
        else:
            fn(bm)
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.materials.append(flat_material(f"mat_{name}", colour))
        shade_flat(obj)
        obj.location = (i * 12.0, 0.0, 0.0)      # export mein alag-alag rakho
        objects.append(obj)
        print(f"  {name}: {len(obj.data.polygons)} faces")

    out_dir = Path(args["out"])
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "props.glb"
    export_glb(objects, str(path))
    print(f"[gen_props] {len(objects)} props -> {path}")


if __name__ == "__main__":
    main()
