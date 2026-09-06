"""OSM building footprints -> data/footprints.json (Blender ke liye).

tools/blender/gen_buildings.py isi file ko padh kar asli Shimla ki imaaraton ke
aakar mein mesh banata hai, box scatter ke bajaye.

Har footprint ke saath uski chaaron kone ki zameen ki oonchai bhi nikalti hai --
Shimla mein ghar dhalan pe *stepped* hote hain, aur Blender script us drop se
plinth banata hai.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from shimla_common.geo import GeoReference

from .config import DATA

DEFAULT_LEVELS = 3          # Shimla ka aam pahadi ghar
LEVEL_HEIGHT_M = 3.0
MIN_AREA_M2 = 18.0


def _load_heights():
    meta = json.loads((DATA / "terrain.json").read_text(encoding="utf-8"))
    img = np.array(Image.open(DATA / "heightmap.png").convert("RGB")).astype(np.uint32)
    u16 = (img[..., 0] << 8) | img[..., 1]
    lo, hi = meta["elevation_min_m"], meta["elevation_max_m"]
    return (lo + (u16 / 65535.0) * (hi - lo)), meta


def convert(osm_path: Path, geo: GeoReference) -> dict:
    heights, meta = _load_heights()
    n = meta["size_px"]
    half = meta["world_size_m"] / 2.0

    def ground(x: float, z: float) -> float:
        c = int(np.clip(round((x + half) / meta["world_size_m"] * (n - 1)), 0, n - 1))
        r = int(np.clip(round((z + half) / meta["world_size_m"] * (n - 1)), 0, n - 1))
        return float(heights[r, c])

    payload = json.loads(osm_path.read_text(encoding="utf-8"))
    out = []
    for el in payload.get("elements", []):
        if el.get("type") != "way" or "building" not in el.get("tags", {}):
            continue
        geom = el.get("geometry") or []
        ring = [geo.to_world(g["lat"], g["lon"]) for g in geom
                if geo.contains(g["lat"], g["lon"])]
        if len(ring) < 4:
            continue
        if _area(ring) < MIN_AREA_M2:
            continue

        tags = el["tags"]
        levels = _int(tags.get("building:levels"), DEFAULT_LEVELS)
        gs = [ground(x, z) for x, z in ring]
        out.append({
            "osm_id": el["id"],
            "kind": tags.get("building", "yes"),
            "name": tags.get("name"),
            "levels": levels,
            "height_m": _float(tags.get("height"), levels * LEVEL_HEIGHT_M),
            "ring": [[round(x, 2), round(z, 2)] for x, z in ring],
            # dhalan pe stepped plinth ke liye
            "ground_min_m": round(min(gs), 2),
            "ground_max_m": round(max(gs), 2),
        })

    blob = {
        "$comment": "OpenStreetMap se (ODbL). tools/blender/gen_buildings.py isse "
                    "asli Shimla ki imaaratein banata hai.",
        "count": len(out),
        "footprints": out,
    }
    (DATA / "footprints.json").write_text(json.dumps(blob, indent=1) + "\n", encoding="utf-8")
    print(f"  footprints.json: {len(out)} imaaratein")
    return blob


def _area(ring) -> float:
    """Shoelace. Ring metres mein hai, isliye seedha m^2."""
    a = 0.0
    for i in range(len(ring)):
        x1, z1 = ring[i]
        x2, z2 = ring[(i + 1) % len(ring)]
        a += x1 * z2 - x2 * z1
    return abs(a) * 0.5


def _int(v, default):
    try:
        return max(1, int(float(v)))
    except (TypeError, ValueError):
        return default


def _float(v, default):
    try:
        return float(str(v).replace("m", "").strip())
    except (TypeError, ValueError):
        return default
