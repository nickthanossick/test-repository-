extends CharacterBody3D
class_name ShimlaPlayer
## Paidal Vicky.
##
## Shimla-specific: chadhai pe stamina teen guna tezi se khatam hoti hai.
## Ye decoration nahi -- Ridge (2205 m) se Jakhoo mandir (2455 m) tak 1.1 km mein
## 250 m chadhai hai, aur mission a1_m5 isi pe bana hai.

const WALK := 3.1
const RUN := 6.4
const JUMP_SPEED := 5.2
const GRAVITY := 19.6

@export var terrain_path: NodePath

var stamina: float = 100.0
var health: float = 100.0
var is_running: bool = false
var _terrain: ShimlaTerrain
var _cam_yaw: float = 0.0


func _ready() -> void:
	if terrain_path:
		_terrain = get_node_or_null(terrain_path) as ShimlaTerrain


func set_camera_yaw(y: float) -> void:
	_cam_yaw = y


func _physics_process(delta: float) -> void:
	var input := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var moving := input.length() > 0.01

	# camera-relative disha
	var dir := Vector3(
		input.x * cos(_cam_yaw) - input.y * sin(_cam_yaw), 0.0,
		input.x * sin(_cam_yaw) + input.y * cos(_cam_yaw)
	)
	if moving:
		dir = dir.normalized()

	# --- dhalan aur stamina --------------------------------------------------
	var grade := 0.0
	if moving and _terrain:
		var probe := 1.5
		var h0 := _terrain.height_at(global_position.x, global_position.z)
		var h1 := _terrain.height_at(global_position.x + dir.x * probe,
				global_position.z + dir.z * probe)
		grade = (h1 - h0) / probe

	is_running = Input.is_action_pressed("sprint") and stamina > 1.0 and moving
	var speed := RUN if is_running else WALK
	speed *= clampf(1.0 - grade * 0.85, 0.42, 1.28)   # chadhai dheemi, utraai tez

	if is_running:
		stamina -= delta * (9.0 + maxf(0.0, grade) * 46.0)
	else:
		stamina += delta * (5.5 if moving else 13.0)
	stamina = clampf(stamina, 0.0, 100.0)

	velocity.x = dir.x * speed
	velocity.z = dir.z * speed

	if is_on_floor():
		if Input.is_action_just_pressed("jump"):
			velocity.y = JUMP_SPEED
	else:
		velocity.y -= GRAVITY * delta

	if moving:
		rotation.y = atan2(dir.x, dir.z)

	move_and_slide()
