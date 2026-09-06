@tool
extends MeshInstance3D
class_name ShimlaTerrain
## Shimla ka terrain heightmap se banata hai.
##
## `data/heightmap.png` ek RGB8 image hai jisme 16-bit elevation do channels mein
## packed hai (R = high byte, G = low byte). Ye packing web game ke liye zaroori
## thi (browser canvas sirf 8-bit deta hai), aur Godot bhi wahi file padh leta hai --
## isliye dono engines mein terrain bilkul ek jaisa hai.
##
## Image.load_from_file() jaan-boojh kar use kiya hai (load() ke bajaye): wo
## source PNG seedha padhta hai, Godot ke import pipeline ko bypass karke.
## Import compression byte values badal deta, aur elevation galat aa jaati.

const HEIGHTMAP_PATH := "res://data/heightmap.png"

@export var chunks: int = 8
@export var quads_per_chunk: int = 64
@export_range(0.0, 1.0) var rebuild: bool = false:
	set(v):
		rebuild = false
		if v:
			build()

var _heights: PackedFloat32Array
var _size: int = 0
var _world_size: float = 8192.0
var _elev_min: float = 1300.0
var _elev_max: float = 2500.0

var _collision: StaticBody3D


func _ready() -> void:
	if _size == 0:
		build()


func build() -> void:
	if not _load_heightmap():
		return
	mesh = _build_mesh()
	_build_collision()


func _load_heightmap() -> bool:
	var img := Image.load_from_file(HEIGHTMAP_PATH)
	if img == null:
		push_error("heightmap load fail: %s -- `python tools/sync_godot_data.py` chalao." % HEIGHTMAP_PATH)
		return false

	var meta_raw := FileAccess.get_file_as_string("res://data/terrain.json")
	if not meta_raw.is_empty():
		var meta: Dictionary = JSON.parse_string(meta_raw)
		_world_size = float(meta["world_size_m"])
		_elev_min = float(meta["elevation_min_m"])
		_elev_max = float(meta["elevation_max_m"])

	_size = img.get_width()
	_heights.resize(_size * _size)
	var span := _elev_max - _elev_min
	for y in _size:
		for x in _size:
			var c := img.get_pixel(x, y)
			# 8-bit channels wapas 16-bit mein jodo
			var hi := int(round(c.r * 255.0))
			var lo := int(round(c.g * 255.0))
			_heights[y * _size + x] = _elev_min + (float((hi << 8) | lo) / 65535.0) * span
	return true


func half() -> float:
	return _world_size * 0.5


func _at(col: int, row: int) -> float:
	var c := clampi(col, 0, _size - 1)
	var r := clampi(row, 0, _size - 1)
	return _heights[r * _size + c]


## World (x east, z south) pe bilinear elevation, metres.
func height_at(x: float, z: float) -> float:
	if _size == 0:
		return 0.0
	var h := half()
	var fx := (x + h) / _world_size * float(_size - 1)
	var fz := (z + h) / _world_size * float(_size - 1)
	var c0 := int(floor(fx))
	var r0 := int(floor(fz))
	var tx := fx - float(c0)
	var tz := fz - float(r0)
	var h00 := _at(c0, r0)
	var h10 := _at(c0 + 1, r0)
	var h01 := _at(c0, r0 + 1)
	var h11 := _at(c0 + 1, r0 + 1)
	return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz)


func normal_at(x: float, z: float) -> Vector3:
	var d := _world_size / float(_size - 1)
	return Vector3(height_at(x - d, z) - height_at(x + d, z), 2.0 * d,
			height_at(x, z - d) - height_at(x, z + d)).normalized()


func _build_mesh() -> ArrayMesh:
	var am := ArrayMesh.new()
	var chunk_size := _world_size / float(chunks)
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.95
	# Flat shading -- yahi game ka low-poly art style hai, aur 16 m ke quads
	# faceted chattan jaise lagte hain, blurry blob ke bajaye.
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_VERTEX

	for cz in chunks:
		for cx in chunks:
			var x0 := -half() + float(cx) * chunk_size
			var z0 := -half() + float(cz) * chunk_size
			_add_chunk(am, mat, x0, z0, chunk_size)
	return am


func _add_chunk(am: ArrayMesh, mat: Material, x0: float, z0: float, size: float) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n := quads_per_chunk
	var step := size / float(n)

	for r in n:
		for q in n:
			var xa := x0 + float(q) * step
			var za := z0 + float(r) * step
			var xb := xa + step
			var zb := za + step
			var p00 := Vector3(xa, height_at(xa, za), za)
			var p10 := Vector3(xb, height_at(xb, za), za)
			var p01 := Vector3(xa, height_at(xa, zb), zb)
			var p11 := Vector3(xb, height_at(xb, zb), zb)
			_tri(st, p00, p01, p10)
			_tri(st, p10, p01, p11)

	st.generate_normals()
	st.set_material(mat)
	st.commit(am)


func _tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3) -> void:
	for p in [a, b, c]:
		st.set_color(ground_color(p.x, p.z, p.y))
		st.add_vertex(p)


## Elevation + slope se zameen ka rang. web/src/terrain.js ke colorAt() se match karta hai.
func ground_color(x: float, z: float, y: float) -> Color:
	var t := (y - _elev_min) / (_elev_max - _elev_min)
	var c: Color
	if t < 0.30:
		c = Color(0.10, 0.22, 0.10)      # khad -- ghana chir pine
	elif t < 0.52:
		c = Color(0.13, 0.27, 0.12)      # dhalan -- mila jungle
	elif t < 0.72:
		c = Color(0.17, 0.30, 0.14)      # deodar belt
	elif t < 0.86:
		c = Color(0.28, 0.32, 0.18)      # ridge -- sookhi ghaas
	else:
		c = Color(0.40, 0.40, 0.37)      # uncha -- chattan

	var nrm := normal_at(x, z)
	var slope := clampf(acos(clampf(nrm.y, -1.0, 1.0)) / (PI / 3.0), 0.0, 1.0)
	if slope > 0.55:
		c = c.lerp(Color(0.29, 0.25, 0.21), minf(1.0, (slope - 0.55) / 0.45) * 0.8)
	if y > 2330.0:
		c = c.lerp(Color(0.93, 0.95, 0.97), minf(1.0, (y - 2330.0) / 110.0) * 0.85)
	return c


## HeightMapShape3D collision. Render mesh se alag, kam resolution -- physics ko
## 1024x1024 nahi chahiye, aur utna bada shape memory kha jaata hai.
func _build_collision(res: int = 257) -> void:
	if _collision and is_instance_valid(_collision):
		_collision.queue_free()
	var shape := HeightMapShape3D.new()
	shape.map_width = res
	shape.map_depth = res
	var data := PackedFloat32Array()
	data.resize(res * res)
	var step := _world_size / float(res - 1)
	for r in res:
		for c in res:
			data[r * res + c] = height_at(-half() + float(c) * step, -half() + float(r) * step)
	shape.map_data = data

	var cs := CollisionShape3D.new()
	cs.shape = shape
	_collision = StaticBody3D.new()
	_collision.name = "TerrainCollision"
	_collision.add_child(cs)
	# HeightMapShape3D 1 unit per sample maanta hai, isliye world scale pe le jao
	_collision.scale = Vector3(step, 1.0, step)
	add_child(_collision)
	if Engine.is_editor_hint() and owner:
		cs.owner = owner
		_collision.owner = owner
