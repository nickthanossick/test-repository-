"""OpenStreetMap se Shimla ki sadkein, imaaratein aur POIs (Overpass API).

OSM data **ODbL** license mein hai -- attribution dena zaroori hai.
design/08-legal-and-attribution.md dekho.

Overpass ek free public service hai. Tameez se use karo: response cache ho
jaata hai, aur dobara chalane pe network hit nahi hoti.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import requests
from shimla_common.geo import GeoReference

from .config import CACHE, Preset, bbox

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",   # mirror, agar pehla busy ho
]

QUERY = """
[out:json][timeout:180];
(
  way["highway"]({bbox});
  way["railway"~"rail|narrow_gauge"]({bbox});
  way["building"]({bbox});
  node["amenity"]({bbox});
  node["tourism"]({bbox});
  node["historic"]({bbox});
  node["place"]({bbox});
);
out body geom;
"""


def fetch(preset: Preset, geo: GeoReference, force: bool = False) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    out = CACHE / f"osm_{preset.name}.json"
    if out.exists() and not force:
        print(f"  OSM cache se: {out.name} ({out.stat().st_size / 1e6:.1f} MB)")
        return out

    b = bbox(preset, geo)
    bbox_str = f"{b['south']:.6f},{b['west']:.6f},{b['north']:.6f},{b['east']:.6f}"
    q = QUERY.format(bbox=bbox_str)

    last_err: Exception | None = None
    for i, url in enumerate(ENDPOINTS):
        try:
            print(f"  Overpass query -> {url}")
            r = requests.post(url, data={"data": q}, timeout=240)
            if r.status_code in (429, 504):
                print(f"    server busy ({r.status_code}), thoda ruk kar mirror try karte hain")
                time.sleep(5 * (i + 1))
                continue
            r.raise_for_status()
            payload = r.json()
            out.write_text(json.dumps(payload), encoding="utf-8")
            print(f"  saved {out.name}: {len(payload.get('elements', []))} elements")
            return out
        except Exception as e:            # noqa: BLE001 -- agla mirror try karna hai
            last_err = e
            print(f"    fail: {e}")
    raise SystemExit(f"Overpass se data nahi mila. Aakhri error: {last_err}")
