"""Asli DEM se `data/heightmap.png` -- sadak ki cutting samet.

    python -m shimla_pipeline.build_real_terrain            # (PYTHONPATH=tools)

Do kaam karta hai:

1. **Asli oonchai** `fetch_terrain_aws` se (AWS Terrain Tiles). Purana
   heightmap `terrain_control.json` ke 45 landmark points ka IDW + fractal
   shor tha -- plausible tha, asli nahi. Naapa gaya farak: kahin 140 m tak.

2. **Sadak ki cutting.** Asli pahadi sadak zameen par nahi *bichti*, wo pahad
   mein **kaati** jaati hai -- chadhai wali taraf deewar, khaai wali taraf
   parapet. 30 m ke DEM mein ye cutting hai hi nahi (ek pixel poori sadak se
   chauda hai), isliye seedha DEM par sadak daalne se wo pahad ke upar
   roller-coaster ki tarah oopar-neeche daudti hai.

   Isliye har sadak ke saath ek **mulayam profile** banate hain (chalne layak
   dhalan tak seemit), aur uske corridor mein terrain ko us profile ki taraf
   kheenchte hain -- kinare par dheere-dheere ghulte hue. Yahi asli cut-and-
   fill ka sasta roop hai, aur isse sadak padhne layak ho jaati hai.

Output format bilkul wahi hai jo pehle tha (`data/terrain.json` ka contract),
isliye web game, Godot aur Blender teenon bina badle chalte hain.
"""

from __future__ import annotations

import json

import numpy as np
from PIL import Image
from shimla_common.geo import GeoReference

from .config import DATA, Preset, load_preset
from .fetch_terrain_aws import ATTRIBUTION, fetch

# Sadak ki cutting ke liye
CORRIDOR_M = 26.0        # itni chaudai tak terrain sadak ke profile ki taraf
FEATHER_M = 46.0         # itni door tak dheere-dheere asli terrain mein ghul jaata hai
MAX_GRADE = 0.11         # 11% -- Shimla ki sabse teekhi chalne layak chadhai
SMOOTH_PASSES = 6        # profile par chalne wale moving-average ke chakkar
MAX_CUT_M = 8.0          # sadak zameen se itni hi kaat/bhar sakti hai


def _road_profile(pts_xz, h_at, spacing_m):
    """Polyline ke saath ek mulayam, chalne layak elevation profile.

    Pehle terrain se oonchai uthate hain, phir moving average, phir gradient
    ko `MAX_GRADE` par kaat dete hain -- dono taraf se, taaki ek teekha tukda
    poore raaste ko na bigade.
    """
    base = np.array([h_at(x, z) for x, z in pts_xz], dtype=np.float64)
    h = base.copy()
    if len(h) < 3:
        return h

    for _ in range(SMOOTH_PASSES):
        h[1:-1] = (h[:-2] + 2.0 * h[1:-1] + h[2:]) / 4.0

    limit = MAX_GRADE * spacing_m
    for _ in range(2):
        for i in range(1, len(h)):                       # aage se
            h[i] = np.clip(h[i], h[i - 1] - limit, h[i - 1] + limit)
        for i in range(len(h) - 2, -1, -1):              # phir peeche se
            h[i] = np.clip(h[i], h[i + 1] - limit, h[i + 1] + limit)

    # Asli sadak pahad ko chand metre kaatti hai, use dobara nahi banati.
    #
    # Bina is band ke pehla run 35 m ka aausat badlaav de raha tha -- kyunki
    # hamari sadkein abhi haath se trace ki hui hain aur kahin-kahin seedhi
    # ghaati ke aar-paar chali jaati hain. Wahan profile ek pul jaisa ramp ban
    # jaata tha aur terrain uske peeche kheench jaata. Ab profile zameen ke
    # +-MAX_CUT_M ke andar hi reh sakta hai: jahan trace galat hai wahan pahad
    # jeetta hai, aur sadak uspar chadhti-utarti dikhti hai -- jo jhooth se
    # behtar hai.
    return np.clip(h, base - MAX_CUT_M, base + MAX_CUT_M)


def carve_roads(grid: np.ndarray, preset: Preset, geo: GeoReference, roads_json: dict):
    """Sadak ke corridor mein terrain ko uske profile ki taraf kheencho."""
    n = grid.shape[0]
    half = preset.world_size_m / 2.0
    mpp = preset.world_size_m / (n - 1)

    def to_px(x, z):
        return (x + half) / mpp, (z + half) / mpp

    def h_at(x, z):
        cx, cz = to_px(x, z)
        return float(grid[int(np.clip(cz, 0, n - 1)), int(np.clip(cx, 0, n - 1))])

    # Har pixel ke liye: sabse paas ki sadak ka target, aur uski doori
    target = np.full(grid.shape, np.nan, dtype=np.float32)
    dist = np.full(grid.shape, np.inf, dtype=np.float32)
    carved = 0

    for r in roads_json["roads"]:
        pts = [geo.to_world(lat, lon) for lat, lon in r["points"]]
        # 10 m par resample -- wahi spacing jo khel ka roads.js istemaal karta hai
        dense = []
        for i in range(len(pts) - 1):
            ax, az = pts[i]
            bx, bz = pts[i + 1]
            seg = float(np.hypot(bx - ax, bz - az))
            steps = max(1, int(seg / 10.0))
            for s in range(steps):
                t = s / steps
                dense.append((ax + (bx - ax) * t, az + (bz - az) * t))
        dense.append(pts[-1])
        if len(dense) < 3:
            continue

        prof = _road_profile(dense, h_at, 10.0)
        carved += 1

        # corridor: har sample ke aas-paas ka chhota box
        rad_px = int(np.ceil(FEATHER_M / mpp)) + 1
        for (x, z), hy in zip(dense, prof):
            cx, cz = to_px(x, z)
            i0, i1 = int(max(0, cz - rad_px)), int(min(n, cz + rad_px + 1))
            j0, j1 = int(max(0, cx - rad_px)), int(min(n, cx + rad_px + 1))
            if i0 >= i1 or j0 >= j1:
                continue
            ii = np.arange(i0, i1)[:, None]
            jj = np.arange(j0, j1)[None, :]
            d = np.hypot((jj - cx) * mpp, (ii - cz) * mpp).astype(np.float32)
            sub = dist[i0:i1, j0:j1]
            better = d < sub
            if better.any():
                sub[better] = d[better]
                target[i0:i1, j0:j1][better] = hy

    # blend: corridor ke andar poora, feather tak dheere-dheere khatam
    have = np.isfinite(target)
    w = np.zeros(grid.shape, dtype=np.float32)
    inner = have & (dist <= CORRIDOR_M)
    outer = have & (dist > CORRIDOR_M) & (dist <= FEATHER_M)
    w[inner] = 1.0
    t = (dist[outer] - CORRIDOR_M) / (FEATHER_M - CORRIDOR_M)
    w[outer] = 1.0 - (t * t * (3 - 2 * t))            # smoothstep
    out = grid.copy()
    out[have] = grid[have] * (1 - w[have]) + target[have] * w[have]
    moved = float(np.abs(out - grid)[have].mean()) if have.any() else 0.0
    print(f"  {carved} sadak kaati -- corridor mein aausat {moved:.1f} m ka badlaav")
    return out


def write_heightmap(h: np.ndarray, preset: Preset, source: str, extra: dict) -> dict:
    """Wahi encoding jo pehle thi -- RGB8 + 16-bit, aur terrain.json."""
    n = h.shape[0]
    lo = float(np.floor(h.min() / 50) * 50)
    hi = float(np.ceil(h.max() / 50) * 50)
    norm = np.clip((h - lo) / (hi - lo), 0, 1)
    u16 = np.round(norm * 65535).astype(np.uint16)

    Image.fromarray(u16).save(DATA / "heightmap_16.png", optimize=True)
    rgb = np.zeros((n, n, 3), dtype=np.uint8)
    rgb[..., 0] = (u16 >> 8).astype(np.uint8)
    rgb[..., 1] = (u16 & 0xFF).astype(np.uint8)
    Image.fromarray(rgb, mode="RGB").save(DATA / "heightmap.png", optimize=True)

    # Halka roop -- single-file artifact ke liye.
    #
    # 2048 px ka PNG 5.8 MB ka hai, aur artifact use base64 mein inline karta
    # hai (+33%). Terrain ka mesh sabse ooncha tier par bhi 8 m prati quad par
    # hi sample karta hai, yaani 4 m/px ki poori barikee dikhti nahi -- wo sirf
    # `heightAt()`/`slopeAt()` ki sateekta ke liye hai. Isliye artifact 1024 px
    # (8 m/px) leta hai: 5.8 MB se 1.6 MB, aur aankh ko farak nahi.
    #
    # Seedha RGB resize galat hota: R high byte hai aur G low byte, dono ko
    # alag-alag interpolate karne se value toot jaati hai. Isliye pehle 16-bit
    # value banao, phir resize, phir dobara encode.
    if n > 1024:
        small = np.asarray(
            Image.fromarray(u16).resize((1024, 1024), Image.LANCZOS), dtype=np.uint32)
        srgb = np.zeros((1024, 1024, 3), dtype=np.uint8)
        srgb[..., 0] = (small >> 8).astype(np.uint8)
        srgb[..., 1] = (small & 0xFF).astype(np.uint8)
        Image.fromarray(srgb, mode="RGB").save(DATA / "heightmap_web.png", optimize=True)

    meta = {
        "$comment": "shimla_pipeline/build_real_terrain.py se generate hua "
                    "(asli DEM). Haath se edit mat karo.",
        "size_px": n,
        "world_size_m": preset.world_size_m,
        "metres_per_pixel": round(preset.world_size_m / (n - 1), 4),
        "elevation_min_m": lo,
        "elevation_max_m": hi,
        "source": source,
        "attribution": ATTRIBUTION,
        "files": {
            "heightmap.png": "RGB8. elevation = min + ((R*256 + G) / 65535) * (max - min). Web game.",
            "heightmap_16.png": "16-bit grayscale, same normalisation. Godot / Blender / GIS.",
            "heightmap_web.png": "Wahi, par 1024 px -- single-file artifact ke liye "
                                 "(base64 inline hota hai, isliye size maayne rakhta hai).",
        },
        "orientation": "row 0 = north edge (z = -half), col 0 = west edge (x = -half)",
        "godot_import": {"height_scale_m": hi - lo, "height_offset_m": lo},
        **extra,
    }
    (DATA / "terrain.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    gpath = DATA / "georeference.json"
    g = json.loads(gpath.read_text(encoding="utf-8"))
    g["elevation_range_m"] = {"min": lo, "max": hi}
    gpath.write_text(json.dumps(g, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  heightmap {n}x{n} px, {lo:.0f}..{hi:.0f} m")
    return meta


def main(preset_name: str = "shimla_core", zoom: int = 15, px: int = 2048) -> None:
    geo = GeoReference.load()
    preset = load_preset(preset_name)
    print(f"asli terrain: {preset.name}")
    grid, info = fetch(preset, geo, zoom=zoom, px=px)

    roads_json = json.loads((DATA / "roads.json").read_text(encoding="utf-8"))
    grid = carve_roads(grid, preset, geo, roads_json)

    write_heightmap(grid, preset, info["source"], {
        "road_carving": {
            "corridor_m": CORRIDOR_M, "feather_m": FEATHER_M, "max_grade": MAX_GRADE,
            "$comment": "Sadak ke corridor mein terrain uske mulayam profile ki taraf "
                        "kheencha gaya hai -- asli cut-and-fill ka sasta roop. Bina "
                        "iske 30 m ka DEM sadak ko pahad ke upar oopar-neeche daudata hai.",
        },
    })


if __name__ == "__main__":
    main()
