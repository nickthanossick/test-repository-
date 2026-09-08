"""Overpass ka output -> data/roads.json.

OSM ke `highway` tags ko game ke road types pe map karta hai. Ek zaroori
Shimla-specific niyam: Mall Road `pedestrian` rehni chahiye, kyunki wanted-level
system usi tag pe chalta hai (gaadi Mall pe = jurm, jaisa asli mein hai).
"""

from __future__ import annotations

import json
from pathlib import Path

from shimla_common.geo import GeoReference

from .config import DATA

# OSM highway=* -> game road type
HIGHWAY_MAP = {
    "motorway": "arterial", "trunk": "arterial", "primary": "arterial",
    "secondary": "arterial", "tertiary": "street", "unclassified": "street",
    "residential": "street", "living_street": "lane", "service": "lane",
    "track": "track", "pedestrian": "pedestrian", "footway": "pedestrian",
    "path": "pedestrian", "steps": "pedestrian",
}

ROAD_TYPES = {
    # Chaudai asli Shimla se zyada hai, jaan-boojh kar. Asli sadak par gaadi
    # chalana aur camera ghumana dono tang lagte the -- Nikhil: "sadk ko bhout
    # khula krde... place ki kami ni". Ye `data/roads.json` ke road_types se
    # milti hui rehni chahiye, warna pipeline dobara chalne par khel wapas
    # sankra ho jaayega.
    "arterial":   {"width_m": 17.0, "speed_kmh": 55, "color": "#3a3a3e"},
    "street":     {"width_m": 13.0, "speed_kmh": 40, "color": "#45454a"},
    "lane":       {"width_m": 8.5, "speed_kmh": 25, "color": "#4e4e52"},
    "pedestrian": {"width_m": 9.0, "speed_kmh": 0,  "color": "#6b6355"},
    "track":      {"width_m": 6.0, "speed_kmh": 30, "color": "#5a4f3c"},
    "rail":       {"width_m": 2.6, "speed_kmh": 35, "color": "#4a4038"},
}

MIN_POINTS = 2
MIN_LENGTH_M = 25.0        # bahut chhoti service galiyan chhod do


def convert(osm_path: Path, geo: GeoReference) -> dict:
    payload = json.loads(osm_path.read_text(encoding="utf-8"))
    roads, seen = [], set()

    for el in payload.get("elements", []):
        if el.get("type") != "way" or "geometry" not in el:
            continue
        tags = el.get("tags", {})

        if "railway" in tags:
            rtype = "rail"
        elif "highway" in tags:
            rtype = HIGHWAY_MAP.get(tags["highway"])
            if rtype is None:
                continue
        else:
            continue

        pts = [[round(g["lat"], 6), round(g["lon"], 6)] for g in el["geometry"]]
        pts = [p for p in pts if geo.contains(p[0], p[1])]
        if len(pts) < MIN_POINTS:
            continue
        if _length_m(pts, geo) < MIN_LENGTH_M:
            continue

        name = tags.get("name") or tags.get("ref") or f"{rtype} {el['id']}"
        rid = _slug(name, el["id"], seen)
        roads.append({
            "id": rid,
            "name": name,
            "type": rtype,
            "oneway": tags.get("oneway") in ("yes", "true", "1"),
            "osm_id": el["id"],
            "points": pts,
        })

    _force_mall_road_pedestrian(roads)
    out = {
        "$comment": "OpenStreetMap se generate hua (ODbL -- attribution zaroori, "
                    "design/08-legal-and-attribution.md dekho). Haath se edit mat karo.",
        "road_types": ROAD_TYPES,
        "roads": roads,
    }
    (DATA / "roads.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n",
                                     encoding="utf-8")
    print(f"  roads.json: {len(roads)} ways, {sum(len(r['points']) for r in roads)} points")
    return out


def _force_mall_road_pedestrian(roads: list[dict]) -> None:
    """Mall Road ka pedestrian hona game ka niyam hai, OSM ki marzi nahi.

    OSM mein Mall ke kuch hisse `service` ya `residential` tagged hote hain
    (delivery access ki wajah se). Agar wo game mein drivable ho gaye to wanted
    system ka sabse pehchana niyam hi toot jaata hai.
    """
    n = 0
    for r in roads:
        if "mall" in r["name"].lower() and r["type"] != "rail":
            r["type"] = "pedestrian"
            n += 1
    if n:
        print(f"  Mall Road ke {n} hisse pedestrian force kiye")


def _length_m(pts: list[list[float]], geo: GeoReference) -> float:
    total = 0.0
    prev = None
    for lat, lon in pts:
        x, z = geo.to_world(lat, lon)
        if prev is not None:
            total += ((x - prev[0]) ** 2 + (z - prev[1]) ** 2) ** 0.5
        prev = (x, z)
    return total


def _slug(name: str, osm_id: int, seen: set) -> str:
    base = "".join(c if c.isalnum() else "_" for c in name.lower()).strip("_")[:40] or "way"
    rid = base
    if rid in seen:
        rid = f"{base}_{osm_id}"
    seen.add(rid)
    return rid
