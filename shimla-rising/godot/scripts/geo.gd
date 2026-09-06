extends Node
## Lat/lon <-> world-metre conversion.
##
## Ye web game ke web/src/geo.js aur pipeline ke tools/shimla_common/geo.py ka
## exact mirror hai. Teenon `data/georeference.json` se ek hi origin padhte hain,
## isliye ek hi Shimla coordinate dono engines mein ek hi jagah aata hai.
##
## World axes: x = east (m), y = up (m, samudra tal se oonchai), z = south (m).
## North isliye -z hai, jo Godot ke forward = -Z se match karta hai.

var origin_lat: float = 31.1048
var origin_lon: float = 77.1734
var m_per_deg_lat: float = 110871.3
var m_per_deg_lon: float = 95360.8
var world_size_m: float = 8192.0
var elev_min_m: float = 1300.0
var elev_max_m: float = 2500.0


func _ready() -> void:
	var raw := FileAccess.get_file_as_string("res://data/georeference.json")
	if raw.is_empty():
		push_error("data/georeference.json nahi mila. `python tools/sync_godot_data.py` chalao.")
		return
	var d: Dictionary = JSON.parse_string(raw)
	origin_lat = d["origin"]["lat"]
	origin_lon = d["origin"]["lon"]
	m_per_deg_lat = d["meters_per_degree_lat"]
	m_per_deg_lon = d["meters_per_degree_lon"]
	world_size_m = float(d["world"]["size_m"])
	elev_min_m = float(d["elevation_range_m"]["min"])
	elev_max_m = float(d["elevation_range_m"]["max"])


func half() -> float:
	return world_size_m * 0.5


## (lat, lon) -> Vector2(x east, z south), metres.
func to_world(lat: float, lon: float) -> Vector2:
	return Vector2((lon - origin_lon) * m_per_deg_lon, -(lat - origin_lat) * m_per_deg_lat)


## Vector2(x, z) -> Vector2(lat, lon).
func to_latlon(x: float, z: float) -> Vector2:
	return Vector2(origin_lat - z / m_per_deg_lat, origin_lon + x / m_per_deg_lon)


## POI dictionary (jisme lat/lon ho) ko seedha Vector3 mein, y=0.
func poi_to_world(poi: Dictionary) -> Vector3:
	var v := to_world(poi["lat"], poi["lon"])
	return Vector3(v.x, 0.0, v.y)


func contains(x: float, z: float) -> bool:
	return absf(x) <= half() and absf(z) <= half()
