extends Node3D
## Main game controller. Sab systems ko jodta hai.
##
## Web build (web/src/main.js) ke saath ek jaisa flow: paidal ya gaadi, mission
## markers, wanted level, mausam. Data dono ke liye ek hi hai -- data/.

const VEHICLE_SCENE := preload("res://scenes/Vehicle.tscn")
const PARK_SPOTS := ["vicky_garage", "sanjauli_chowk", "isbt", "railway_station",
	"lakkar_bazaar", "chhota_shimla", "kasumpti_market", "new_shimla_loop",
	"guru_dhaba", "bali_yard", "annandale_ground", "hpu", "timber_depot"]
const PARK_KINDS := ["taxi", "scooter", "bolero", "hrtc_bus", "timber_truck"]

@onready var terrain: ShimlaTerrain = $Terrain
@onready var world: WorldBuilder = $World
@onready var player: ShimlaPlayer = $Player
@onready var camera: ChaseCamera = $ChaseCamera
@onready var wanted: WantedSystem = $Wanted
@onready var weather: ShimlaWeather = $Weather
@onready var hud: CanvasLayer = $HUD
@onready var markers: Node3D = $Markers

var in_vehicle: bool = false
var current_vehicle: Node3D = null
var parked: Array[Node3D] = []
var hour: float = 9.5

var _dialogue_queue: Array = []
var _dialogue_timer: float = 0.0
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.seed = 770317
	camera.target = player
	wanted.set_target(player)
	wanted.stars_changed.connect(_on_stars_changed)
	MissionManager.mission_started.connect(_on_mission_started)
	MissionManager.mission_completed.connect(_on_mission_completed)
	MissionManager.mission_failed.connect(_on_mission_failed)

	SaveGame.apply_to_mission_manager(SaveGame.load_state())
	_spawn_player()
	_spawn_parked()
	_refresh_markers()

	hud.set_stars(0)
	hud.set_money(MissionManager.money)
	hud.clear_subtitle()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _spawn_player() -> void:
	var p: Dictionary = GameData.poi_by_id.get("vicky_garage", {})
	var w := Geo.to_world(p["lat"], p["lon"]) if not p.is_empty() else Vector2.ZERO
	var rp := world.nearest_road_point(w.x, w.y)
	var pos := rp["pos"] if not rp.is_empty() else Vector3(w.x, 0, w.y)
	player.global_position = Vector3(pos.x + 5.0, terrain.height_at(pos.x + 5.0, pos.z + 5.0) + 1.0, pos.z + 5.0)
	camera.snap()


func _spawn_parked() -> void:
	# Vicky ki apni taxi sabse pehle, uske ghar ke bahar
	_park("taxi", player.global_position.x, player.global_position.z)
	for id: String in PARK_SPOTS:
		var p: Dictionary = GameData.poi_by_id.get(id, {})
		if p.is_empty():
			continue
		var w := Geo.to_world(p["lat"], p["lon"])
		var kind := "hrtc_bus" if id == "isbt" else (
				"timber_truck" if id == "timber_depot" else PARK_KINDS[_rng.randi() % PARK_KINDS.size()])
		_park(kind, w.x, w.y)


func _park(kind: String, x: float, z: float) -> void:
	var rp := world.nearest_road_point(x, z)
	var pos: Vector3 = rp["pos"] if not rp.is_empty() else Vector3(x, 0, z)
	var v := VEHICLE_SCENE.instantiate()
	v.vehicle_id = kind
	v.terrain = terrain
	add_child(v)
	v.global_position = Vector3(pos.x, terrain.height_at(pos.x, pos.z), pos.z)
	v.rotation.y = _rng.randf() * TAU
	parked.append(v)


func _process(delta: float) -> void:
	_update_dialogue(delta)

	if Input.is_action_just_pressed("enter_vehicle"):
		_toggle_vehicle()
	if Input.is_action_just_pressed("interact"):
		_try_start_mission()
	if Input.is_action_just_pressed("cycle_weather"):
		weather.cycle()
	if Input.is_action_just_pressed("quick_save"):
		SaveGame.save_state(player.global_position, hour, weather.mode)
	if Input.is_action_just_pressed("ui_cancel"):
		Input.mouse_mode = (Input.MOUSE_MODE_VISIBLE
				if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED else Input.MOUSE_MODE_CAPTURED)

	var pos := current_vehicle.global_position if in_vehicle else player.global_position
	player.set_camera_yaw(camera.yaw)

	var district := GameData.district_at(pos)
	var road := world.road_at(pos.x, pos.z)
	var on_ped: bool = not road.is_empty() and road.get("type", "") == "pedestrian"

	wanted.update(delta, pos, in_vehicle, district, on_ped)
	MissionManager.update(delta, pos, in_vehicle, wanted.stars)

	if in_vehicle:
		hud.set_speed(current_vehicle.kmh(), current_vehicle.spec.get("name", "gaadi"))
	else:
		hud.set_speed(0.0, "daud rahe ho" if player.is_running else "paidal")
	hud.set_district(district.get("name", "Shimla ke bahar"))
	hud.set_mission(MissionManager.active, MissionManager.obj_index, _objective_extra())


func _objective_extra() -> String:
	var o := MissionManager.current_objective()
	if o.is_empty():
		return ""
	match o["type"]:
		"survive":
			return "(%ds)" % ceili(MissionManager.timer)
		"race":
			return "(%ds · %d baaki)" % [ceili(MissionManager.timer),
					(o["checkpoints"] as Array).size() - MissionManager.race_index]
		"collect":
			return "(%d baaki)" % MissionManager._remaining()
	return ""


func _toggle_vehicle() -> void:
	if in_vehicle:
		var v := current_vehicle
		var side := Vector3(-v.forward().z, 0, v.forward().x) * 2.2
		player.global_position = v.global_position + side + Vector3(0, 1.0, 0)
		player.visible = true
		in_vehicle = false
		current_vehicle = null
		camera.mode = "foot"
		camera.target = player
	else:
		var best: Node3D = null
		var bd := 6.5
		for v in parked:
			var d := v.global_position.distance_to(player.global_position)
			if d < bd:
				bd = d
				best = v
		if best == null:
			return
		current_vehicle = best
		in_vehicle = true
		player.visible = false
		camera.mode = "vehicle"
		camera.target = best


func _try_start_mission() -> void:
	var pos := current_vehicle.global_position if in_vehicle else player.global_position
	var m := MissionManager.startable_at(pos)
	if not m.is_empty():
		MissionManager.start(m)


# ------------------------------------------------------------------ markers

func _refresh_markers() -> void:
	for c in markers.get_children():
		c.queue_free()
	if not MissionManager.active.is_empty():
		var o := MissionManager.current_objective()
		if o.has("poi"):
			_add_marker(MissionManager.poi_pos(o["poi"]), Color("e8c33a"))
		elif o.has("checkpoints"):
			var cps: Array = o["checkpoints"]
			_add_marker(MissionManager.poi_pos(cps[MissionManager.race_index]), Color("6cc27a"))
		for pk: Dictionary in MissionManager.pickups:
			if not pk["taken"]:
				_add_marker(pk["pos"], Color("e8c33a"), 1.0)
		return
	for id: String in MissionManager.available:
		var m: Dictionary = GameData.mission_by_id.get(id, {})
		if m.is_empty() or (MissionManager.completed.has(id) and not m.get("repeatable", false)):
			continue
		_add_marker(MissionManager.poi_pos(m["start_poi"]),
				Color("5aa9e6") if m.get("side", false) else Color("e8c33a"))


func _add_marker(pos: Vector3, col: Color, radius: float = 3.2) -> void:
	var mi := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = radius
	cyl.bottom_radius = radius
	cyl.height = 60.0
	cyl.radial_segments = 12
	mi.mesh = cyl
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(col.r, col.g, col.b, 0.18)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mi.material_override = mat
	markers.add_child(mi)
	mi.global_position = Vector3(pos.x, terrain.height_at(pos.x, pos.z) + 30.0, pos.z)


# ------------------------------------------------------------------ signals

func _on_stars_changed(n: int) -> void:
	hud.set_stars(n)
	if n == 1:
		_play_dialogue("generic:wanted")


func _on_mission_started(m: Dictionary) -> void:
	_play_dialogue("%s:start" % m["id"])
	_refresh_markers()


func _on_mission_completed(m: Dictionary) -> void:
	hud.set_money(MissionManager.money)
	_play_dialogue("%s:end" % m["id"])
	SaveGame.save_state(player.global_position, hour, weather.mode)
	_refresh_markers()


func _on_mission_failed(_m: Dictionary, _reason: String) -> void:
	_refresh_markers()


# ----------------------------------------------------------------- dialogue

func _play_dialogue(key: String) -> void:
	var beat: Variant = GameData.dialogue.get(key)
	if beat == null:
		return
	_dialogue_queue.append_array(beat)
	if _dialogue_timer <= 0.0:
		_next_line()


func _next_line() -> void:
	if _dialogue_queue.is_empty():
		hud.clear_subtitle()
		_dialogue_timer = 0.0
		return
	var line: Dictionary = _dialogue_queue.pop_front()
	var c: Dictionary = GameData.character_by_id.get(line["speaker"], {})
	var nm: String = c.get("name", line["speaker"])
	hud.say(nm, line["text"])
	# padhne ka time lambai se, kam se kam 2.2s
	_dialogue_timer = clampf(float(line["text"].length()) * 0.055, 2.2, 6.5)


func _update_dialogue(delta: float) -> void:
	if _dialogue_timer <= 0.0:
		return
	_dialogue_timer -= delta
	if _dialogue_timer <= 0.0:
		_next_line()
