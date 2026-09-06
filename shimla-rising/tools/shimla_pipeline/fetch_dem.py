"""Copernicus GLO-30 DEM download karta hai (OpenTopography ke through).

API key free hai: https://portal.opentopography.org/ pe account banao,
"My Account" mein key milegi, phir:

    export OPENTOPOGRAPHY_API_KEY=xxxxxxxx

GeoTIFF cache ho jaati hai tools/.cache/ mein, isliye dobara download nahi hoti.
"""

from __future__ import annotations

import os
from pathlib import Path

import requests
from shimla_common.geo import GeoReference

from .config import CACHE, Preset, bbox

ENDPOINT = "https://portal.opentopography.org/API/globaldem"
DEM_TYPE = "COP30"          # Copernicus GLO-30. COP90 halka hai, NASADEM ek vikalp.


def fetch(preset: Preset, geo: GeoReference, force: bool = False) -> Path:
    key = os.environ.get("OPENTOPOGRAPHY_API_KEY", "").strip()
    if not key:
        raise SystemExit(
            "OPENTOPOGRAPHY_API_KEY set nahi hai.\n"
            "  1. https://portal.opentopography.org/ pe free account banao\n"
            "  2. My Account -> API key copy karo\n"
            "  3. export OPENTOPOGRAPHY_API_KEY=<key>\n"
        )

    CACHE.mkdir(parents=True, exist_ok=True)
    out = CACHE / f"dem_{preset.name}_{DEM_TYPE}.tif"
    if out.exists() and not force:
        print(f"  DEM cache se: {out.name} ({out.stat().st_size / 1e6:.1f} MB)")
        return out

    b = bbox(preset, geo)
    params = {"demtype": DEM_TYPE, "outputFormat": "GTiff", "API_Key": key, **b}
    print(f"  {DEM_TYPE} download: {b['south']:.4f},{b['west']:.4f} -> "
          f"{b['north']:.4f},{b['east']:.4f}")

    r = requests.get(ENDPOINT, params=params, timeout=180, stream=True)
    if r.status_code == 401:
        raise SystemExit("OpenTopography: API key galat hai (401).")
    if r.status_code == 400:
        raise SystemExit(f"OpenTopography: galat request (400) -- {r.text[:200]}")
    r.raise_for_status()

    tmp = out.with_suffix(".part")
    with tmp.open("wb") as f:
        for chunk in r.iter_content(1 << 16):
            f.write(chunk)
    tmp.replace(out)
    print(f"  saved {out.name} ({out.stat().st_size / 1e6:.1f} MB)")
    return out
