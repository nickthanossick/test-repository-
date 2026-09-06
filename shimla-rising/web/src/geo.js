// Lat/lon <-> world-metre conversion. Ye tools/shimla_common/geo.py aur
// godot/scripts/geo.gd ka exact mirror hai -- teeno ko sync mein rakhna.
//
// World axes: x = east (m), y = up (m, absolute elevation), z = south (m).
export class GeoReference {
  constructor(json) {
    this.originLat = json.origin.lat;
    this.originLon = json.origin.lon;
    this.mPerDegLat = json.meters_per_degree_lat;
    this.mPerDegLon = json.meters_per_degree_lon;
    this.worldSize = json.world.size_m;
    this.half = json.world.half_m;
    this.elevMin = json.elevation_range_m.min;
    this.elevMax = json.elevation_range_m.max;
  }

  toWorld(lat, lon) {
    return {
      x: (lon - this.originLon) * this.mPerDegLon,
      z: -(lat - this.originLat) * this.mPerDegLat,
    };
  }

  toLatLon(x, z) {
    return {
      lat: this.originLat - z / this.mPerDegLat,
      lon: this.originLon + x / this.mPerDegLon,
    };
  }

  contains(x, z) {
    return Math.abs(x) <= this.half && Math.abs(z) <= this.half;
  }
}
