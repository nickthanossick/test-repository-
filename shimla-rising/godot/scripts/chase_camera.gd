extends Camera3D
class_name ChaseCamera
## GTA-style chase camera: peeche-upar se, smooth, aur zameen/deewar ke andar nahi.

@export var terrain_path: NodePath
@export var mouse_sensitivity: float = 0.0026

var yaw: float = 0.0
var pitch: float = 0.22
var distance: float = 6.2

var target: Node3D
var mode: String = "foot"          # "foot" | "vehicle"

var _terrain: ShimlaTerrain
var _pos := Vector3.ZERO
var _look := Vector3.ZERO
var _initialised := false


func _ready() -> void:
	_terrain = get_node_or_null(terrain_path) as ShimlaTerrain


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		yaw -= event.relative.x * mouse_sensitivity
		pitch = clampf(pitch + event.relative.y * mouse_sensitivity, -0.42, 1.15)


func _process(delta: float) -> void:
	if target == null:
		return
	var want_dist := 10.5 if mode == "vehicle" else 6.2
	var height := 3.4 if mode == "vehicle" else 2.4
	distance = lerpf(distance, want_dist, minf(1.0, delta * 4.0))

	# gaadi mein camera dheere-dheere gaadi ke peeche aa jaata hai
	if mode == "vehicle":
		yaw = lerp_angle(yaw, target.rotation.y, minf(1.0, delta * 1.5))

	var t := target.global_position
	var cp := cos(pitch)
	var want := Vector3(
		t.x + sin(yaw) * distance * cp,
		t.y + height + sin(pitch) * distance,
		t.z + cos(yaw) * distance * cp)

	if _terrain:
		var ground := _terrain.height_at(want.x, want.z) + 1.6
		if want.y < ground:
			want.y = ground

	if not _initialised:
		_pos = want
		_initialised = true
	else:
		_pos = _pos.lerp(want, minf(1.0, delta * 9.0))

	_look = _look.lerp(t + Vector3(0, 1.4 if mode == "vehicle" else 1.5, 0),
			minf(1.0, delta * 12.0))
	global_position = _pos
	look_at(_look, Vector3.UP)


func snap() -> void:
	_initialised = false
