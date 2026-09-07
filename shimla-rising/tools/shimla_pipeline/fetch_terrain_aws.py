"""Asli DEM -- AWS Terrain Tiles (Mapzen "terrarium") se.

`fetch_dem.py` OpenTopography se Copernicus GLO-30 laata hai, par uske liye
API key chahiye aur wo host is machine se block hai. **Ye module us jagah
kaam karta hai jahan wo nahi karta.**

AWS Open Data ka `elevation-tiles-prod` bucket bina key ke khula hai aur usmein
SRTM/NED/GMTED se bana global DEM hai, XYZ tile ki shakl mein::

    https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png

Terrarium encoding: har pixel RGB mein ek elevation hai ::

    metres = (R * 256 + G + B / 256) - 32768

Licence: SRTM/NED public domain hai; bucket "Terrain Tiles on AWS Open Data
Registry" ke tehat khula hai. Attribution `data/terrain.json` mein likhi
jaati hai.

Zoom 15 tak maujood hai. Shimla ke akshansh par z15 ka ek pixel ~4.1 m ka
padta hai -- purane synthetic heightmap ke 8.0 m/px se do guna behtar.

    python -m tools.shimla_pipeline.fetch_terrain_aws
"""

from __future__ import annotations

import io
import math
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image
from shimla_common.geo import GeoReference

from .config import CACHE, Preset, bbox

BASE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium"
ATTRIBUTION = (
    "AWS Terrain Tiles (terrarium) -- SRTM/NED/GMTED se bana, "
    "AWS Open Data Registry par khula. Koi API key nahi."
)


def _tile_xy(lat: float, lon: float, z: int) -> tuple[float, float]:
    """Slippy-map tile coordinates -- bhinn (fractional), taaki pixel nikal sakein."""
    n = 2.0**z
    x = (lon + 180.0) / 360.0 * n
    la = math.radians(lat)
    y = (1.0 - math.log(math.tan(la) + 1.0 / math.cos(la)) / math.pi) / 2.0 * n
    return x, y


def _fetch_tile(z: int, x: int, y: int, retries: int = 3) -> Image.Image:
    """Ek tile. Cache par pehle, phir network."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"terrarium_{z}_{x}_{y}.png"
    if path.exists():
        return Image.open(path).convert("RGB")

    url = f"{BASE}/{z}/{x}/{y}.png"
    last = None
    for _ in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=40) as r:
                blob = r.read()
            path.write_bytes(blob)
            return Image.open(io.BytesIO(blob)).convert("RGB")
        except (urllib.error.URLError, OSError) as e:  # noqa: PERF203
            last = e
    raise SystemExit(f"tile {z}/{x}/{y} nahi mili: {last}")


def elevation_grid(preset: Preset, geo: GeoReference, zoom: int = 15, px: int | None = None):
    """Preset ke poore bbox ka elevation grid, `px x px` ka numpy array.

    Row 0 = uttari kinara, col 0 = pashchimi kinara -- wahi kram jo
    `data/terrain.json` ka `orientation` batata hai, taaki heightmap PNG
    seedha isi se bane.
    """
    import numpy as np

    px = px or preset.heightmap_px
    b = bbox(preset, geo)

    # Kaun-kaun si tile chahiye
    x0f, y0f = _tile_xy(b["north"], b["west"], zoom)
    x1f, y1f = _tile_xy(b["south"], b["east"], zoom)
    tx0, ty0 = int(math.floor(x0f)), int(math.floor(y0f))
    tx1, ty1 = int(math.floor(x1f)), int(math.floor(y1f))
    tiles = [(x, y) for y in range(ty0, ty1 + 1) for x in range(tx0, tx1 + 1)]
    print(f"  zoom {zoom}: {len(tiles)} tile ({tx1 - tx0 + 1} x {ty1 - ty0 + 1})")

    # Saari tile ek bade mosaic mein. 8 dhaage -- S3 se yahi theek chalta hai.
    W, H = (tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256
    mosaic = np.zeros((H, W), dtype=np.float32)
    with ThreadPoolExecutor(max_workers=8) as pool:
        imgs = list(pool.map(lambda t: _fetch_tile(zoom, t[0], t[1]), tiles))
    for (tx, ty), im in zip(tiles, imgs):
        a = np.asarray(im, dtype=np.float32)
        # terrarium: metres = R*256 + G + B/256 - 32768
        e = a[:, :, 0] * 256.0 + a[:, :, 1] + a[:, :, 2] / 256.0 - 32768.0
        r0, c0 = (ty - ty0) * 256, (tx - tx0) * 256
        mosaic[r0:r0 + 256, c0:c0 + 256] = e

    # --- world grid -> lat/lon -> tile pixel ------------------------------
    #
    # Seedha bbox ke kone ke beech linear resample karna galat hai: tile ka
    # y-axis Mercator hai, jo latitude ke saath linear nahi. Isliye wahi
    # raasta jo `dem_to_heightmap.build()` leta hai -- pehle world metres,
    # phir lat/lon, phir tile pixel. Isse dono raaste ek jaisa nateeja dete
    # hain aur `georeference.json` hi ekmatra sach rehta hai.
    half = preset.world_size_m / 2.0
    axis = np.linspace(-half, half, px)
    gx, gz = np.meshgrid(axis, axis)              # row 0 = north, col 0 = west
    lat = geo.origin_lat - gz / geo.m_per_deg_lat
    lon = geo.origin_lon + gx / geo.m_per_deg_lon

    n = 2.0**zoom
    tx_f = (lon + 180.0) / 360.0 * n
    la = np.radians(lat)
    ty_f = (1.0 - np.log(np.tan(la) + 1.0 / np.cos(la)) / np.pi) / 2.0 * n

    x_idx = np.clip((tx_f - tx0) * 256.0, 0, W - 1.001)
    y_idx = np.clip((ty_f - ty0) * 256.0, 0, H - 1.001)

    # bilinear -- nearest lene se dhalan par seedhiyan ban jaati hain
    x0i = x_idx.astype(np.int32)
    y0i = y_idx.astype(np.int32)
    fx = x_idx - x0i
    fy = y_idx - y0i
    a00 = mosaic[y0i, x0i]
    a10 = mosaic[y0i, x0i + 1]
    a01 = mosaic[y0i + 1, x0i]
    a11 = mosaic[y0i + 1, x0i + 1]
    grid = (a00 * (1 - fx) * (1 - fy) + a10 * fx * (1 - fy)
            + a01 * (1 - fx) * fy + a11 * fx * fy)
    return grid.astype(np.float32)


def fetch(preset: Preset, geo: GeoReference, zoom: int = 15, px: int | None = None):
    """Grid + uske baare mein metadata."""
    grid = elevation_grid(preset, geo, zoom=zoom, px=px)
    lo, hi = float(grid.min()), float(grid.max())
    print(f"  elevation: {lo:.0f} m se {hi:.0f} m")
    return grid, {
        "source": f"AWS Terrain Tiles (terrarium) z{zoom}",
        "attribution": ATTRIBUTION,
        "zoom": zoom,
        "elevation_min_m": lo,
        "elevation_max_m": hi,
    }
