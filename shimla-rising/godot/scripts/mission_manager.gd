extends Node
## Mission engine. data/missions.json ko chalata hai -- wahi file jo web game
## padhta hai, isliye kahani dono mein bilkul ek jaisi chalti hai.
##
## Objective types: goto, drive_to, collect, evade, survive, race

signal mission_started(mission: Dictionary)
signal mission_completed(mission: Dictionary)
signal mission_failed(mission: Dictionary, reason: String)
signal objective_changed(objective: Dictionary)
signal pickup_collected(left: int)

var available: Dictionary = {"a1_m1": true}
var completed: Dictionary = {}
var active: Dictionary = {}
var obj_index: int = 0
var race_index: int = 0
var timer: float = 0.0
var pickups: Array = []          # [{pos: Vector3, taken: bool}]

var money: int = 2500


func current_objective() -> Dictionary:
	if active.is_empty():
		return {}
	var objs: Array = active["objectives"]
	return objs[obj_index] if obj_index < objs.size() else {}


func poi_pos(id: String) -> Vector3:
	var p: Dictionary = GameData.poi_by_id.get(id, {})
	return Geo.poi_to_world(p) if not p.is_empty() else Vector3.ZERO


## Khiladi kisi shuru-hone-yogya mission ke paas khada hai?
func startable_at(pos: Vector3, radius: float = 20.0) -> Dictionary:
	if not active.is_empty():
		return {}
	for id: String in available:
		var m: Dictionary = GameData.mission_by_id.get(id, {})
		if m.is_empty():
			continue
		if completed.has(id) and not m.get("repeatable", false):
			continue
		var p := poi_pos(m["start_poi"])
		if Vector2(p.x - pos.x, p.z - pos.z).length() < radius:
			return m
	return {}


func start(m: Dictionary) -> void:
	active = m
	obj_index = 0
	race_index = 0
	_begin_objective()
	mission_started.emit(m)


func _begin_objective() -> void:
	pickups.clear()
	var o := current_objective()
	if o.is_empty():
		return
	match o["type"]:
		"collect":
			_spawn_pickups(o)
		"survive":
			timer = float(o["seconds"])
		"race":
			race_index = 0
			timer = float(o["time_s"])
	objective_changed.emit(o)


func _spawn_pickups(o: Dictionary) -> void:
	var base := poi_pos(o["poi"])
	var count := int(o["count"])
	var spread := float(o.get("spread", 30))
	for i in count:
		var ang := (float(i) / float(count)) * TAU + randf()
		var r := spread * (0.35 + randf() * 0.65)
		pickups.append({"pos": base + Vector3(cos(ang) * r, 0.0, sin(ang) * r), "taken": false})


func fail(reason: String) -> void:
	var m := active
	active = {}
	pickups.clear()
	mission_failed.emit(m, reason)


func _complete() -> void:
	var m := active
	completed[m["id"]] = true
	for u: String in m.get("unlocks", []):
		available[u] = true
	if m.get("repeatable", false):
		available[m["id"]] = true
	money += int(m.get("reward", 0))
	active = {}
	pickups.clear()
	mission_completed.emit(m)


func update(delta: float, player_pos: Vector3, in_vehicle: bool, stars: int) -> void:
	if active.is_empty():
		return
	var o := current_objective()
	if o.is_empty():
		_complete()
		return

	var done := false
	match o["type"]:
		"goto":
			done = _within(player_pos, poi_pos(o["poi"]), float(o.get("radius", 12)))
		"drive_to":
			done = in_vehicle and _within(player_pos, poi_pos(o["poi"]), float(o.get("radius", 20)))
		"collect":
			var left := 0
			for pk: Dictionary in pickups:
				if not pk["taken"] and _within(player_pos, pk["pos"], 4.5):
					pk["taken"] = true
					pickup_collected.emit(_remaining())
				if not pk["taken"]:
					left += 1
			done = left == 0
		"evade":
			done = stars == 0
		"survive":
			timer -= delta
			done = timer <= 0.0
		"race":
			timer -= delta
			if timer <= 0.0:
				fail("Time khatam.")
				return
			var cps: Array = o["checkpoints"]
			if _within(player_pos, poi_pos(cps[race_index]), 24.0):
				race_index += 1
				if race_index >= cps.size():
					done = true
				else:
					objective_changed.emit(o)
		_:
			done = true

	if done:
		obj_index += 1
		if obj_index >= (active["objectives"] as Array).size():
			_complete()
		else:
			_begin_objective()


func _remaining() -> int:
	var n := 0
	for pk: Dictionary in pickups:
		if not pk["taken"]:
			n += 1
	return n


func _within(a: Vector3, b: Vector3, r: float) -> bool:
	return Vector2(a.x - b.x, a.z - b.z).length() < r
