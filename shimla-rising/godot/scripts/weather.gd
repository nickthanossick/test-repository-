extends Node3D
class_name ShimlaWeather
## Mausam. Shimla mein ye gameplay hai, decoration nahi.
##
##   snow    Dec-Feb. Grip 0.55 -- Act 3 ("Barfeela Toofan") isi pe bana hai.
##   monsoon Jul-Sep. Grip 0.80, visibility kam, landslide ka khatra.
##   fog     Subah-shaam. Sirf visibility.

const PRESETS := {
	"clear":   {"grip": 1.00, "fog_density": 0.00025, "particles": 0,    "sky": Color(0.42, 0.56, 0.70)},
	"fog":     {"grip": 0.94, "fog_density": 0.0022,  "particles": 0,    "sky": Color(0.72, 0.75, 0.78)},
	"monsoon": {"grip": 0.80, "fog_density": 0.0012,  "particles": 5500, "sky": Color(0.46, 0.50, 0.54)},
	"snow":    {"grip": 0.55, "fog_density": 0.0018,  "particles": 4200, "sky": Color(0.78, 0.82, 0.86)},
}

@export var environment_path: NodePath

var mode: String = "clear"
var grip: float = 1.0

var _particles: GPUParticles3D
var _env: WorldEnvironment


func _ready() -> void:
	add_to_group("weather")
	_env = get_node_or_null(environment_path) as WorldEnvironment
	_build_particles()
	set_mode(month_preset(Time.get_datetime_dict_from_system()["month"]))


## Shimla ka asli calendar.
static func month_preset(m: int) -> String:
	if m == 12 or m <= 2:
		return "snow"
	if m >= 7 and m <= 9:
		return "monsoon"
	if m == 3 or m == 11:
		return "fog"
	return "clear"


func _build_particles() -> void:
	_particles = GPUParticles3D.new()
	_particles.name = "Precipitation"
	_particles.amount = 6000
	_particles.lifetime = 6.0
	_particles.visibility_aabb = AABB(Vector3(-160, -60, -160), Vector3(320, 200, 320))
	_particles.local_coords = false

	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(160, 2, 160)
	pm.direction = Vector3(0, -1, 0)
	pm.gravity = Vector3(0, -3.0, 0)
	pm.initial_velocity_min = 2.0
	pm.initial_velocity_max = 5.0
	_particles.process_material = pm

	var qm := QuadMesh.new()
	qm.size = Vector2(0.10, 0.10)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.albedo_color = Color.WHITE
	qm.material = mat
	_particles.draw_pass_1 = qm

	_particles.emitting = false
	add_child(_particles)


func set_mode(m: String) -> void:
	var p: Dictionary = PRESETS.get(m, PRESETS["clear"])
	mode = m
	grip = p["grip"]

	_particles.emitting = int(p["particles"]) > 0
	_particles.amount = maxi(1, int(p["particles"]))
	var pm := _particles.process_material as ParticleProcessMaterial
	var snowy := m == "snow"
	pm.gravity = Vector3(0, -3.0 if snowy else -22.0, 0)
	var qm := _particles.draw_pass_1 as QuadMesh
	qm.size = Vector2(0.10, 0.10) if snowy else Vector2(0.03, 0.32)
	(qm.material as StandardMaterial3D).albedo_color = (
			Color.WHITE if snowy else Color(0.62, 0.71, 0.78, 0.6))

	if _env and _env.environment:
		_env.environment.fog_enabled = true
		_env.environment.fog_density = p["fog_density"]
		_env.environment.fog_light_color = p["sky"]


func cycle() -> void:
	var order := ["clear", "fog", "monsoon", "snow"]
	set_mode(order[(order.find(mode) + 1) % order.size()])


func _process(_delta: float) -> void:
	# particles ko camera ke saath rakho -- warna khiladi barf se bahar nikal jaata hai
	var cam := get_viewport().get_camera_3d()
	if cam and _particles:
		_particles.global_position = cam.global_position + Vector3(0, 45, 0)
