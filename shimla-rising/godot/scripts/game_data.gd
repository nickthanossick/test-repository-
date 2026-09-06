extends Node
## Shared data layer loader.
##
## Wahi `data/` folder jo web game padhta hai -- missions, dialogue, Shimla ka
## naksha, sab. Story ek jagah badlo, dono games mein badal jaati hai.

var geo_json: Dictionary
var terrain_meta: Dictionary
var districts: Array
var pois: Array
var roads: Dictionary
var missions: Array
var characters: Array
var vehicles: Array
var dialogue: Dictionary

var poi_by_id: Dictionary = {}
var district_by_id: Dictionary = {}
var vehicle_by_id: Dictionary = {}
var character_by_id: Dictionary = {}
var mission_by_id: Dictionary = {}

signal loaded


func _ready() -> void:
	_load_all()
	loaded.emit()


func _read(name: String) -> Variant:
	var path := "res://data/%s" % name
	if not FileAccess.file_exists(path):
		push_error("%s nahi mila. Pehle `python tools/sync_godot_data.py` chalao." % path)
		return null
	return JSON.parse_string(FileAccess.get_file_as_string(path))


func _load_all() -> void:
	geo_json = _read("georeference.json")
	terrain_meta = _read("terrain.json")
	districts = (_read("districts.json") as Dictionary).get("districts", [])
	pois = (_read("pois.json") as Dictionary).get("pois", [])
	roads = _read("roads.json")
	missions = (_read("missions.json") as Dictionary).get("missions", [])
	characters = (_read("characters.json") as Dictionary).get("characters", [])
	vehicles = (_read("vehicles.json") as Dictionary).get("vehicles", [])
	dialogue = (_read("dialogue.json") as Dictionary).get("lines", {})

	for p in pois:
		poi_by_id[p["id"]] = p
	for d in districts:
		district_by_id[d["id"]] = d
	for v in vehicles:
		vehicle_by_id[v["id"]] = v
	for c in characters:
		character_by_id[c["id"]] = c
	for m in missions:
		mission_by_id[m["id"]] = m


## Kis ilaake mein hain? Shimla ke har district ka apna mizaaj aur police density hai.
func district_at(pos: Vector3) -> Dictionary:
	var best: Dictionary = {}
	var best_d := INF
	for d in districts:
		var w := Geo.to_world(d["lat"], d["lon"])
		var dist := Vector2(w.x - pos.x, w.y - pos.z).length()
		if dist < float(d["radius_m"]) and dist < best_d:
			best_d = dist
			best = d
	return best
