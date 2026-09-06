extends CharacterBody3D
class_name ShimlaVehicle
## Arcade gaadi.
##
## Godot ka VehicleBody3D (rigid-body + raycast suspension) jaan-boojh kar
## use NAHI kiya. Do wajah:
##   1. Shimla ki sadak matlab lagataar hairpin, 15% grade aur 6 m chaudi gali.
##      Ek proper suspension sim wahan aksar ulat jaata ya atak jaata hai, aur
##      use tune karne ke liye khelna padta hai.
##   2. Web build (web/src/vehicle.js) bhi yahi arcade model chalata hai. Ek hi
##      model dono engines mein rakhne se gaadi ka feel identical rehta hai.
## Agar poora simulation chahiye to is script ko VehicleBody3D + VehicleWheel3D
## se badla ja sakta hai -- data/vehicles.json ke stats waise ke waise chalenge.

@export var terrain_path: NodePath
@export var vehicle_id: String = "taxi"

var spec: Dictionary = {}
var speed: float = 0.0          # m/s, forward
var slip: float = 0.0           # lateral, m/s
var steer_amount: float = 0.0
var top_speed: float = 30.0
var is_police: bool = false

## Seedha reference, NodePath se pehle. Police chasers WantedSystem ke bachche
## hote hain, isliye unke liye "../Terrain" galat node pe resolve hota tha --
## caller ab seedha `terrain` set kar sakta hai.
var terrain: ShimlaTerrain
var _ai_target: Node3D = null


func _ready() -> void:
	if terrain == null and terrain_path:
		terrain = get_node_or_null(terrain_path) as ShimlaTerrain
	spec = GameData.vehicle_by_id.get(vehicle_id, {})
	if spec.is_empty():
		push_warning("vehicle spec '%s' nahi mila" % vehicle_id)
		spec = {"top_speed_kmh": 100.0, "accel": 7.0, "grip": 1.0, "brake": 1.0}
	top_speed = float(spec["top_speed_kmh"]) / 3.6


func kmh() -> float:
	return absf(speed) * 3.6


func forward() -> Vector3:
	return Vector3(-sin(rotation.y), 0.0, -cos(rotation.y))


func set_ai_target(t: Node3D) -> void:
	_ai_target = t
	is_police = true


func _physics_process(delta: float) -> void:
	var throttle := 0.0
	var steer := 0.0
	var handbrake := false

	if _ai_target:
		# Police AI: khiladi ki taraf steer karo
		var to := _ai_target.global_position - global_position
		var want := atan2(-to.x, -to.z)
		var d := wrapf(want - rotation.y, -PI, PI)
		steer = clampf(d * 1.6, -1.0, 1.0)
		throttle = 0.75 if to.length() > 14.0 else -0.4
	else:
		throttle = Input.get_axis("move_back", "move_forward")
		steer = Input.get_axis("move_right", "move_left")
		handbrake = Input.is_action_pressed("handbrake")

	var grip: float = float(spec.get("grip", 1.0)) * _weather_grip()
	var fwd := forward()

	# --- dhalan: Shimla mein yahi sab decide karta hai -----------------------
	var grade := 0.0
	if terrain:
		var ahead := 3.0
		var h0 := terrain.height_at(global_position.x, global_position.z)
		var h1 := terrain.height_at(global_position.x + fwd.x * ahead,
				global_position.z + fwd.z * ahead)
		grade = (h1 - h0) / ahead

	var a := 0.0
	if throttle > 0.0:
		a += float(spec["accel"]) * throttle * (1.8 if speed < 0.0 else 1.0)
	elif throttle < 0.0:
		a += (-float(spec["brake"]) * 14.0) if speed > 0.4 else (float(spec["accel"]) * 0.55 * throttle)
	a -= 9.81 * grade * 0.85
	a -= speed * 0.30 + signf(speed) * 0.55
	if handbrake:
		a -= signf(speed) * 13.0

	speed += a * delta
	var cap := top_speed * (0.72 if grade > 0.06 else 1.0)
	speed = clampf(speed, -top_speed * 0.32, cap)
	if absf(speed) < 0.12 and is_zero_approx(throttle):
		speed = 0.0

	# --- steering ------------------------------------------------------------
	var cls: String = spec.get("class", "car")
	var target_steer: float = steer * (0.55 if cls in ["bus", "truck"] else 1.0)
	steer_amount = lerpf(steer_amount, target_steer, minf(1.0, delta * 7.0))
	var sf := minf(1.0, absf(speed) / 7.0) * (1.0 - minf(0.55, absf(speed) / (top_speed * 1.7)))
	var turn := steer_amount * sf * 2.2 * signf(speed if not is_zero_approx(speed) else 1.0)
	rotation.y += turn * delta

	# --- lateral slip: barf pe gaadi baahar khisakti hai ---------------------
	var slip_in := turn * absf(speed) * (1.0 - grip) * (2.6 if handbrake else 1.0)
	slip = lerpf(slip, slip_in, minf(1.0, delta * 3.2))
	slip *= 1.0 - minf(0.95, delta * 2.4 * grip)

	fwd = forward()
	var right := Vector3(-fwd.z, 0.0, fwd.x)
	velocity = fwd * speed + right * slip
	velocity.y = -9.81 * delta          # zameen pe chipke raho
	move_and_slide()

	# terrain pe baithao aur dhalan ke saath jhukao
	if terrain:
		global_position.y = terrain.height_at(global_position.x, global_position.z)
		var n := terrain.normal_at(global_position.x, global_position.z)
		var yaw := rotation.y
		var basis_up := Basis(Quaternion(Vector3.UP, n))
		global_transform.basis = basis_up * Basis(Vector3.UP, yaw)

	# world bounds
	if terrain:
		var lim := terrain.half() - 12.0
		if absf(global_position.x) > lim or absf(global_position.z) > lim:
			global_position.x = clampf(global_position.x, -lim, lim)
			global_position.z = clampf(global_position.z, -lim, lim)
			speed *= 0.35


func _weather_grip() -> float:
	var w := get_tree().get_first_node_in_group("weather")
	return w.grip if w and "grip" in w else 1.0
