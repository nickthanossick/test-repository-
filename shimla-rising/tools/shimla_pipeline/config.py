"""Pipeline presets aur bounding-box math."""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CACHE = ROOT / "tools" / ".cache"

sys.path.insert(0, str(ROOT / "tools"))
from shimla_common.geo import GeoReference  # noqa: E402


@dataclass(frozen=True)
class Preset:
    name: str
    world_size_m: float
    heightmap_px: int
    description: str


PRESETS = {
    # Default. Poora Shimla sheher: Summer Hill se Sanjauli/Dhalli tak,
    # Annandale se New Shimla tak, aur Jakhoo (2455 m) beech mein.
    "shimla_core": Preset(
        "shimla_core", 8192.0, 1024,
        "8.2 km x 8.2 km -- poora sheher. Web game aur Godot ka default.",
    ),
    # Bada map: isme Kufri (2720 m), Mashobra, Naldehra aur Tara Devi bhi aate hain.
    # Dhyan rahe: 30 m DEM ko 16 km pe phailane se terrain aur bhi mulayam lagega.
    "shimla_extended": Preset(
        "shimla_extended", 16384.0, 2048,
        "16.4 km x 16.4 km -- Kufri, Mashobra, Naldehra, Tara Devi sameta.",
    ),
}


def bbox(preset: Preset, geo: GeoReference) -> dict[str, float]:
    """Preset ka lat/lon bounding box, origin ke aas-paas.

    Overpass aur OpenTopography dono south/north/west/east maangte hain.
    """
    half = preset.world_size_m / 2.0
    dlat = half / geo.m_per_deg_lat
    dlon = half / geo.m_per_deg_lon
    return {
        "south": geo.origin_lat - dlat,
        "north": geo.origin_lat + dlat,
        "west": geo.origin_lon - dlon,
        "east": geo.origin_lon + dlon,
    }


def load_preset(name: str) -> Preset:
    if name not in PRESETS:
        raise SystemExit(f"unknown preset {name!r}. Options: {', '.join(PRESETS)}")
    return PRESETS[name]


def write_georeference(preset: Preset, geo: GeoReference) -> None:
    """world size badla ho to data/georeference.json update karo."""
    path = DATA / "georeference.json"
    d = json.loads(path.read_text(encoding="utf-8"))
    if float(d["world"]["size_m"]) == preset.world_size_m:
        return
    b = bbox(preset, geo)
    d["world"]["size_m"] = preset.world_size_m
    d["world"]["half_m"] = preset.world_size_m / 2.0
    d["world"]["bounds"] = {k: round(v, 5) for k, v in b.items()}
    path.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  georeference.json -> world {preset.world_size_m:.0f} m")
