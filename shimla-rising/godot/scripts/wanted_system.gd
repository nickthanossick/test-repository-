extends Node3D
class_name WantedSystem
## Himachal Police ka heat system. 0-5 sitare.
##
## Shimla ka signature niyam: **Mall Road pe gaadi le jaana** apne aap heat deta
## hai. Asli Shimla mein Mall pedestrian-only hai (sirf ambulance/fire ko chhoot),
## isliye game ka sabse pehchana jurm yahi hai.

signal stars_changed(stars: int)

const VEHICLE_SCENE := preload("res://scenes/Vehicle.tscn")

@export var terrain_path: NodePath
@export var max_chasers: int = 5

var stars: int = 0
var heat: float = 0.0
var chasers: Array[Node3D] = []

var _terrain: ShimlaTerrain
var _target: Node3D


func _ready() -> void:
	_terrain = get_node_or_null(terrain_path) as ShimlaTerrain


func set_target(t: Node3D) -> void:
	_target = t


func add_heat(amount: float) -> void:
	heat = minf(100.0, heat + amount)
	_sync()


func clear() -> void:
	heat = 0.0
	_sync()
	_despawn_all()


func _sync() -> void:
	# Pehla sitara 8 heat pe -- warna zaraa si heat bhi poora sitara dikha deti hai.
	var s := 0 if heat < 8.0 else mini(5, 1 + int((heat - 8.0) / 18.0))
	if s != stars:
		stars = s
		stars_changed.emit(s)


func update(delta: float, player_pos: Vector3, in_vehicle: bool, district: Dictionary,
		on_pedestrian_road: bool) -> void:
	if in_vehicle and on_pedestrian_road:
		add_heat(delta * 26.0)
	elif in_vehicle and district.get("vehicle_restricted", false):
		add_heat(delta * 14.0)

	var near := false
	for c in chasers:
		if is_instance_valid(c) and c.global_position.distance_to(player_pos) < 85.0:
			near = true
			break
	if not near:
		heat = maxf(0.0, heat - delta * (2.2 if stars >= 4 else 4.5))
	_sync()

	var want := 0 if stars == 0 else mini(max_chasers, stars)
	while chasers.size() < want:
		_spawn(player_pos)
	while chasers.size() > want:
		_despawn(chasers.size() - 1)


func _spawn(player_pos: Vector3) -> void:
	var ang := randf() * TAU
	var r := 130.0 + randf() * 90.0
	var pos := Vector3(player_pos.x + cos(ang) * r, 0.0, player_pos.z + sin(ang) * r)
	if _terrain:
		pos.y = _terrain.height_at(pos.x, pos.z)
	var v := VEHICLE_SCENE.instantiate()
	v.vehicle_id = "police_jeep"
	v.terrain = _terrain          # seedha reference -- NodePath yahan se galat resolve hota hai
	add_child(v)
	v.global_position = pos
	if _target:
		v.set_ai_target(_target)
	chasers.append(v)


func _despawn(i: int) -> void:
	if i < 0 or i >= chasers.size():
		return
	var v := chasers[i]
	chasers.remove_at(i)
	if is_instance_valid(v):
		v.queue_free()


func _despawn_all() -> void:
	while not chasers.is_empty():
		_despawn(chasers.size() - 1)
