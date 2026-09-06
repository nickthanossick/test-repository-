"""Asli Shimla ka bhugol laane wali pipeline.

Do source, dono free aur khule:

* **Copernicus GLO-30 DEM** (OpenTopography ke through) -- 30 m posting ka
  satellite terrain. Yahi `data/heightmap.png` banata hai.
* **OpenStreetMap** (Overpass API) -- asli sadkein, imaaraton ke footprint,
  Kalka-Shimla toy train ki line, aur POIs.

Ye pipeline `tools/terrain/build_heightmap.py` (jo sirf landmark elevations se
approximate terrain banata hai) ki jagah *asli* survey data daal deti hai --
output format bilkul wahi rehta hai, isliye web game aur Godot dono apne aap
upgrade ho jaate hain, koi code badalne ki zaroorat nahi.

    python -m shimla_pipeline.run --preset shimla_core

Attribution zaroori hai -- design/08-legal-and-attribution.md dekho.
"""

__all__ = ["config", "fetch_dem", "fetch_osm", "dem_to_heightmap",
           "osm_to_roads", "osm_to_footprints", "run"]
