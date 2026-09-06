extends Node
## Save/load. user:// mein rehta hai (Windows: %APPDATA%, Linux: ~/.local/share).

const PATH := "user://shimla-rising.save.json"


func save_state(player_pos: Vector3, hour: float, weather_mode: String) -> bool:
	var data := {
		"version": 1,
		"money": MissionManager.money,
		"completed": MissionManager.completed.keys(),
		"available": MissionManager.available.keys(),
		"pos": {"x": player_pos.x, "z": player_pos.z},
		"hour": hour,
		"weather": weather_mode,
		"saved_at": Time.get_unix_time_from_system(),
	}
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	if f == null:
		push_warning("save nahi ho paaya: %s" % FileAccess.get_open_error())
		return false
	f.store_string(JSON.stringify(data, "  "))
	return true


func load_state() -> Dictionary:
	if not FileAccess.file_exists(PATH):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	return parsed if parsed is Dictionary else {}


func apply_to_mission_manager(state: Dictionary) -> void:
	if state.is_empty():
		return
	MissionManager.money = int(state.get("money", 2500))
	MissionManager.completed.clear()
	MissionManager.available.clear()
	for id: String in state.get("completed", []):
		MissionManager.completed[id] = true
	for id: String in state.get("available", ["a1_m1"]):
		MissionManager.available[id] = true
	if MissionManager.available.is_empty():
		MissionManager.available["a1_m1"] = true
