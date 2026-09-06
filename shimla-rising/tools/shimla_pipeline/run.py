"""Poori pipeline chalao: asli DEM + asli OSM -> data/.

    export OPENTOPOGRAPHY_API_KEY=<free key>
    python -m shimla_pipeline.run --preset shimla_core

Iske baad web game aur Godot dono asli Shimla ka terrain aur asli sadkein
uthaa lete hain -- koi code badalna nahi padta, kyunki output format wahi hai
jo tools/terrain/build_heightmap.py deta hai.

Sirf ek hissa chalane ke liye --only use karo (jaise sirf OSM refresh karna ho).
"""

from __future__ import annotations

import argparse
import sys

from shimla_common.geo import GeoReference

from . import dem_to_heightmap, fetch_dem, fetch_osm, osm_to_footprints, osm_to_roads
from .config import PRESETS, load_preset, write_georeference

STEPS = ("dem", "roads", "footprints")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preset", default="shimla_core", choices=sorted(PRESETS))
    ap.add_argument("--only", nargs="+", choices=STEPS,
                    help="sirf ye steps chalao (default: sab)")
    ap.add_argument("--force", action="store_true", help="cache ignore karke dobara download")
    ap.add_argument("--list-presets", action="store_true")
    args = ap.parse_args(argv)

    if args.list_presets:
        for name, p in PRESETS.items():
            print(f"{name:18s} {p.world_size_m:>7.0f} m  {p.heightmap_px:>5d} px  {p.description}")
        return 0

    preset = load_preset(args.preset)
    steps = set(args.only or STEPS)
    print(f"preset: {preset.name} -- {preset.description}")

    geo = GeoReference.load()
    write_georeference(preset, geo)
    geo = GeoReference.load()          # size badla ho to dobara padho

    if "dem" in steps:
        print("\n[1/3] Copernicus GLO-30 DEM")
        dem = fetch_dem.fetch(preset, geo, force=args.force)
        dem_to_heightmap.build(dem, preset, geo)

    if steps & {"roads", "footprints"}:
        print("\n[2/3] OpenStreetMap")
        osm = fetch_osm.fetch(preset, geo, force=args.force)
        if "roads" in steps:
            osm_to_roads.convert(osm, geo)
        if "footprints" in steps:
            print("\n[3/3] building footprints")
            osm_to_footprints.convert(osm, geo)

    print("\nho gaya. Ab:")
    print("  python tools/sync_godot_data.py     # Godot ko naya data do")
    print("  node web/serve.mjs                  # web game refresh karo")
    print("\nOSM data ODbL hai -- attribution zaroori. design/08-legal-and-attribution.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
