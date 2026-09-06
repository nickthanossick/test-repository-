"""GeoTIFF DEM -> data/heightmap.png (+ 16-bit aur preview).

Output format bilkul wahi hai jo tools/terrain/build_heightmap.py deta hai,
isliye web game aur Godot dono bina kisi badlaav ke asli terrain uthaa lete hain.

GeoTIFF khud padhte hain (rasterio/GDAL ke bina). Copernicus GLO-30 ek seedhi
single-band float32 ya int16 strip/tiled GeoTIFF hoti hai -- utna hi handle
karte hain jitna zaroori hai. Isse pipeline ki dependencies numpy + Pillow tak
seemit rehti hain, aur GDAL wheels ka jhanjhat nahi hota.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from shimla_common.geo import GeoReference

from .config import DATA, Preset

Image.MAX_IMAGE_PIXELS = None      # DEM tiles Pillow ki default limit se bade hote hain


def read_geotiff(path: Path) -> tuple[np.ndarray, dict]:
    """DEM ko float32 array + geo-transform ke roop mein padho."""
    img = Image.open(path)
    arr = np.array(img).astype(np.float64)

    # GeoTIFF tags: ModelTiepoint (33922) aur ModelPixelScale (33550)
    tags = getattr(img, "tag_v2", {}) or {}
    tie = tags.get(33922)
    scale = tags.get(33550)
    if not tie or not scale:
        raise SystemExit(f"{path.name} mein GeoTIFF tags nahi hain -- kya ye asli DEM hai?")

    info = {
        "origin_lon": float(tie[3]),
        "origin_lat": float(tie[4]),
        "px_lon": float(scale[0]),
        "px_lat": float(scale[1]),      # positive; row badhne pe lat ghatti hai
        "width": arr.shape[1],
        "height": arr.shape[0],
    }
    return arr, info


def sample_bilinear(dem: np.ndarray, cols: np.ndarray, rows: np.ndarray) -> np.ndarray:
    h, w = dem.shape
    c0 = np.clip(np.floor(cols).astype(int), 0, w - 1)
    r0 = np.clip(np.floor(rows).astype(int), 0, h - 1)
    c1 = np.clip(c0 + 1, 0, w - 1)
    r1 = np.clip(r0 + 1, 0, h - 1)
    tc = np.clip(cols - c0, 0, 1)
    tr = np.clip(rows - r0, 0, 1)
    top = dem[r0, c0] * (1 - tc) + dem[r0, c1] * tc
    bot = dem[r1, c0] * (1 - tc) + dem[r1, c1] * tc
    return top * (1 - tr) + bot * tr


def build(dem_path: Path, preset: Preset, geo: GeoReference) -> dict:
    dem, info = read_geotiff(dem_path)

    # samudra/void values -- Copernicus -32767 use karta hai
    dem = np.where(dem < -1000, np.nan, dem)
    if np.isnan(dem).any():
        med = float(np.nanmedian(dem))
        dem = np.nan_to_num(dem, nan=med)

    n = preset.heightmap_px
    half = preset.world_size_m / 2.0
    axis = np.linspace(-half, half, n)
    gx, gz = np.meshgrid(axis, axis)              # row 0 = north, col 0 = west

    # world metres -> lat/lon -> DEM pixel
    lat = geo.origin_lat - gz / geo.m_per_deg_lat
    lon = geo.origin_lon + gx / geo.m_per_deg_lon
    cols = (lon - info["origin_lon"]) / info["px_lon"]
    rows = (info["origin_lat"] - lat) / info["px_lat"]

    h = sample_bilinear(dem, cols, rows)

    lo = float(np.floor(h.min() / 50) * 50)
    hi = float(np.ceil(h.max() / 50) * 50)
    print(f"  asli elevation: {h.min():.0f} .. {h.max():.0f} m "
          f"(encoding range {lo:.0f}..{hi:.0f})")

    norm = np.clip((h - lo) / (hi - lo), 0, 1)
    u16 = np.round(norm * 65535).astype(np.uint16)

    Image.fromarray(u16).save(DATA / "heightmap_16.png", optimize=True)
    rgb = np.zeros((n, n, 3), dtype=np.uint8)
    rgb[..., 0] = (u16 >> 8).astype(np.uint8)
    rgb[..., 1] = (u16 & 0xFF).astype(np.uint8)
    Image.fromarray(rgb, mode="RGB").save(DATA / "heightmap.png", optimize=True)

    meta = {
        "$comment": "shimla_pipeline se generate hua (asli Copernicus GLO-30 DEM). "
                    "Haath se edit mat karo.",
        "size_px": n,
        "world_size_m": preset.world_size_m,
        "metres_per_pixel": round(preset.world_size_m / (n - 1), 4),
        "elevation_min_m": lo,
        "elevation_max_m": hi,
        "source": f"Copernicus GLO-30 DEM via OpenTopography ({dem_path.name})",
        "files": {
            "heightmap.png": "RGB8. elevation = min + ((R*256 + G) / 65535) * (max - min). Web game.",
            "heightmap_16.png": "16-bit grayscale, same normalisation. Godot / Blender / GIS.",
        },
        "orientation": "row 0 = north edge (z = -half), col 0 = west edge (x = -half)",
        "godot_import": {"height_scale_m": hi - lo, "height_offset_m": lo},
    }
    (DATA / "terrain.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    # geo bounds ko naye range ke saath sync rakho
    gpath = DATA / "georeference.json"
    g = json.loads(gpath.read_text(encoding="utf-8"))
    g["elevation_range_m"] = {"min": lo, "max": hi}
    gpath.write_text(json.dumps(g, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    return meta
