"""Geo aur terrain math ke tests.

Ye teeno jagah ki consistency pakadte hain: Python pipeline, web game (geo.js)
aur Godot (geo.gd) -- teenon ek hi formula use karte hain, aur agar koi ek badle
to yahan pakda jaaye.
"""
import json
import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
from shimla_common.geo import GeoReference  # noqa: E402

DATA = ROOT / "data"


@pytest.fixture(scope="module")
def geo():
    return GeoReference.load()


def test_origin_is_the_ridge(geo):
    """Origin Shimla ke Ridge pe hona chahiye -- teeno engines ka common zero."""
    assert geo.origin_lat == pytest.approx(31.1048, abs=1e-4)
    assert geo.origin_lon == pytest.approx(77.1734, abs=1e-4)
    x, z = geo.to_world(geo.origin_lat, geo.origin_lon)
    assert x == pytest.approx(0, abs=1e-6)
    assert z == pytest.approx(0, abs=1e-6)


@pytest.mark.parametrize("lat,lon", [
    (31.0999, 77.1836),   # Jakhoo
    (31.1105, 77.1568),   # Annandale
    (31.0830, 77.1790),   # New Shimla
    (31.1150, 77.2050),   # Dhalli
])
def test_roundtrip(geo, lat, lon):
    x, z = geo.to_world(lat, lon)
    la, lo = geo.to_latlon(x, z)
    assert la == pytest.approx(lat, abs=1e-9)
    assert lo == pytest.approx(lon, abs=1e-9)


def test_north_is_negative_z(geo):
    """z = south. Three.js aur Godot dono ka forward -Z hai, isliye ye convention."""
    _, z_north = geo.to_world(geo.origin_lat + 0.01, geo.origin_lon)
    assert z_north < 0


def test_east_is_positive_x(geo):
    x_east, _ = geo.to_world(geo.origin_lat, geo.origin_lon + 0.01)
    assert x_east > 0


def test_scale_is_physically_sane(geo):
    """1 degree ~111 km lat pe; lon 31.1N pe cos se chhota."""
    assert 110_000 < geo.m_per_deg_lat < 112_000
    expected_lon = geo.m_per_deg_lat * math.cos(math.radians(geo.origin_lat))
    assert geo.m_per_deg_lon == pytest.approx(expected_lon, rel=0.02)


def test_all_data_points_inside_world(geo):
    """Har POI aur control point 8.2 km ke box mein hona chahiye."""
    outside = []
    for name in ("pois.json", "terrain_control.json"):
        blob = json.loads((DATA / name).read_text(encoding="utf-8"))
        for p in blob.get("pois") or blob.get("points"):
            if not geo.contains(p["lat"], p["lon"]):
                outside.append(f"{name}:{p['id']}")
    assert outside == []


def test_jakhoo_is_the_highest_control_point():
    pts = json.loads((DATA / "terrain_control.json").read_text(encoding="utf-8"))["points"]
    top = max(pts, key=lambda p: p["elev"])
    assert top["id"] == "jakhoo"
    assert top["elev"] == 2455


def test_terrain_metadata_matches_georeference(geo):
    meta = json.loads((DATA / "terrain.json").read_text(encoding="utf-8"))
    assert meta["world_size_m"] == geo.world_size_m
    assert meta["elevation_min_m"] == geo.elev_min_m
    assert meta["elevation_max_m"] == geo.elev_max_m
    assert meta["metres_per_pixel"] == pytest.approx(
        geo.world_size_m / (meta["size_px"] - 1), rel=1e-3)
