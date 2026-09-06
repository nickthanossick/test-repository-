"""Shared geo-reference math for Shimla Rising.

Ye module `data/georeference.json` padhta hai aur lat/lon <-> world-metre
conversion deta hai. Web game (web/src/geo.js) aur Godot (godot/scripts/geo.gd)
bilkul yahi formula use karte hain -- teeno ko sync mein rakhna zaroori hai.

World axes:  x = east (m),  y = up (m, absolute elevation),  z = south (m).
North isliye negative z hai, jo Three.js aur Godot dono ke forward = -Z se match karta hai.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[2] / "data"


@dataclass(frozen=True)
class GeoReference:
    origin_lat: float
    origin_lon: float
    m_per_deg_lat: float
    m_per_deg_lon: float
    world_size_m: float
    elev_min_m: float
    elev_max_m: float

    @property
    def half_m(self) -> float:
        return self.world_size_m / 2.0

    @classmethod
    def load(cls, path: Path | None = None) -> GeoReference:
        path = path or DATA_DIR / "georeference.json"
        d = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            origin_lat=d["origin"]["lat"],
            origin_lon=d["origin"]["lon"],
            m_per_deg_lat=d["meters_per_degree_lat"],
            m_per_deg_lon=d["meters_per_degree_lon"],
            world_size_m=float(d["world"]["size_m"]),
            elev_min_m=float(d["elevation_range_m"]["min"]),
            elev_max_m=float(d["elevation_range_m"]["max"]),
        )

    def to_world(self, lat: float, lon: float) -> tuple[float, float]:
        """(lat, lon) -> (x east, z south) in metres."""
        x = (lon - self.origin_lon) * self.m_per_deg_lon
        z = -(lat - self.origin_lat) * self.m_per_deg_lat
        return x, z

    def to_latlon(self, x: float, z: float) -> tuple[float, float]:
        """(x east, z south) in metres -> (lat, lon)."""
        lon = self.origin_lon + x / self.m_per_deg_lon
        lat = self.origin_lat - z / self.m_per_deg_lat
        return lat, lon

    def contains(self, lat: float, lon: float) -> bool:
        x, z = self.to_world(lat, lon)
        return abs(x) <= self.half_m and abs(z) <= self.half_m
