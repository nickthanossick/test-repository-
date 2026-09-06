extends Node3D
class_name WorldBuilder
## Shimla ki sadkein, imaaratein aur deodar ka jungle banata hai.
##
## data/roads.json aur data/districts.json se -- wahi files jo web game padhta
## hai. Seed fix hai, isliye sheher har baar aur dono engines mein ek jaisa banta hai.

const ROOF_COLORS := [Color("8c3b2e"), Color("2f5d8a"), Color("3f6b47"),
					  Color("6b6b70"), Color("9c5a2b")]
const WALL_COLORS := [Color("d8cdb8"), Color("c9bda6"), Color("bfae95"),
					  Color("d2c4ad"), Color("a8998a"), Color("e0d6c4")]

@export var terrain_path: NodePath
@export var tree_count: int = 6000
@export var world_seed: int = 31104877

var road_points: Array[Dictionary] = []      # {pos: Vector3, road: Dictionary, n: Vector2}
var _terrain: ShimlaTerrain
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_terrain = get_node_or_null(terrain_path) as ShimlaTerrain
	if _terrain == null:
		push_error("WorldBuilder ko terrain chahiye")
		return
	_rng.seed = world_seed
	_build_roads()
	_build_buildings()
	_build_forest()


# ---------------------------------------------------------------------- roads

func _build_roads() -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var types: Dictionary = GameData.roads["road_types"]

	for r: Dictionary in GameData.roads["roads"]:
		var spec: Dictionary = types[r["type"]]
		var pts := _resample(_to_world(r["points"]), 10.0)
		# har node ka perpendicular pehle nikaal lo -- placement aur AI dono use karte hain
		for i in pts.size():
			var a := pts[maxi(0, i - 1)]
			var b := pts[mini(pts.size() - 1, i + 1)]
			var d := Vector2(b.x - a.x, b.z - a.z)
			var L := maxf(d.length(), 0.001)
			road_points.append({"pos": pts[i], "road": r, "n": Vector2(-d.y / L, d.x / L)})

		var w := float(spec["width_m"]) * 0.5
		var lift := 0.35 if r["type"] == "rail" else 0.5
		var col := Color(spec["color"])
		for i in pts.size() - 1:
			var a := pts[i]
			var b := pts[i + 1]
			var d := Vector2(b.x - a.x, b.z - a.z)
			var L := maxf(d.length(), 0.001)
			var nx := -d.y / L
			var nz := d.x / L
			# har kona alag se terrain pe drape karo -- centerline use karne se
			# sadak ka kinara zameen ke neeche chala jaata hai aur gayab ho jaati hai
			var p := func(pt: Vector3, s: float) -> Vector3:
				var X := pt.x + nx * s
				var Z := pt.z + nz * s
				return Vector3(X, _terrain.height_at(X, Z) + lift, Z)
			_quad_up(st, p.call(a, -w), p.call(b, -w), p.call(b, w), p.call(a, w), col)

	st.generate_normals()
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 1.0
	st.set_material(mat)
	var mi := MeshInstance3D.new()
	mi.name = "Roads"
	mi.mesh = st.commit()
	add_child(mi)


## Sabse nazdeek road node. Police spawn aur gaadi khadi karne ke liye.
func nearest_road_point(x: float, z: float, skip_pedestrian: bool = true) -> Dictionary:
	var best: Dictionary = {}
	var bd := INF
	for n: Dictionary in road_points:
		var t: String = n["road"]["type"]
		if skip_pedestrian and (t == "pedestrian" or t == "rail"):
			continue
		var d := Vector2(n["pos"].x - x, n["pos"].z - z).length_squared()
		if d < bd:
			bd = d
			best = n
	best["dist"] = sqrt(bd) if not best.is_empty() else INF
	return best


## Is jagah pe koi sadak hai? Mall Road ka niyam isi se lagta hai.
func road_at(x: float, z: float, slack: float = 3.0) -> Dictionary:
	var best: Dictionary = {}
	var bd := INF
	for n: Dictionary in road_points:
		var d := Vector2(n["pos"].x - x, n["pos"].z - z).length()
		if d < bd:
			bd = d
			best = n
	if best.is_empty():
		return {}
	var types: Dictionary = GameData.roads["road_types"]
	var w := float(types[best["road"]["type"]]["width_m"]) * 0.5
	return best["road"] if bd <= w + slack else {}


# ----------------------------------------------------------------- buildings

func _build_buildings() -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var placed: Array[Vector2] = []
	var count := 0

	for d: Dictionary in GameData.districts:
		var c := Geo.to_world(d["lat"], d["lon"])
		var radius := float(d["radius_m"])
		var density: float = 0.60 + float(d["wealth"]) * 0.30 + (0.45 if d["id"] == "sanjauli" else 0.0)

		for n: Dictionary in road_points:
			if Vector2(n["pos"].x - c.x, n["pos"].z - c.y).length() > radius:
				continue
			if _rng.randf() > density:
				continue
			var types: Dictionary = GameData.roads["road_types"]
			var w := float(types[n["road"]["type"]]["width_m"]) * 0.5
			for side in [-1.0, 1.0]:
				if _rng.randf() > 0.80:
					continue
				var off := w + 4.5 + _rng.randf() * 10.0
				var x: float = n["pos"].x + side * off * n["n"].x
				var z: float = n["pos"].z + side * off * n["n"].y
				if _too_close(placed, x, z, 8.5):
					continue
				placed.append(Vector2(x, z))
				_house(st, x, z, d)
				count += 1

	st.generate_normals()
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.9
	st.set_material(mat)
	var mi := MeshInstance3D.new()
	mi.name = "Buildings"
	mi.mesh = st.commit()
	add_child(mi)
	print("[WorldBuilder] %d imaaratein" % count)


## Ek Shimla-style pahadi ghar: dhalan pakadne wala plinth + manzilein + tin chhat.
func _house(st: SurfaceTool, x: float, z: float, d: Dictionary) -> void:
	var w := 5.0 + _rng.randf() * 4.5
	var dep := 5.0 + _rng.randf() * 4.5
	var floors := 2 + _rng.randi_range(0, 2 if float(d["wealth"]) > 0.7 else 1)
	var body_h := float(floors) * 3.0

	var hs := [
		_terrain.height_at(x - w * 0.5, z - dep * 0.5), _terrain.height_at(x + w * 0.5, z - dep * 0.5),
		_terrain.height_at(x - w * 0.5, z + dep * 0.5), _terrain.height_at(x + w * 0.5, z + dep * 0.5),
	]
	var lo: float = hs.min()
	var hi: float = hs.max()
	var drop := minf(hi - lo, 9.0)

	if drop > 0.8:
		_box(st, Vector3(x, hi - drop * 0.5, z), Vector3(w * 0.92, drop + 0.6, dep * 0.92),
				Color("6f6459"))
	_box(st, Vector3(x, hi + body_h * 0.5, z), Vector3(w, body_h, dep),
			WALL_COLORS[_rng.randi() % WALL_COLORS.size()])
	# tin ki chhat -- Shimla ki pehchaan
	_box(st, Vector3(x, hi + body_h + 0.3, z), Vector3(w * 1.12, 0.55, dep * 1.12),
			ROOF_COLORS[_rng.randi() % ROOF_COLORS.size()])


# -------------------------------------------------------------------- forest

func _build_forest() -> void:
	# MultiMesh isliye ki 6000 alag Node3D banane pe editor aur runtime dono mar jaate hain
	var trunk_mm := MultiMesh.new()
	trunk_mm.transform_format = MultiMesh.TRANSFORM_3D
	trunk_mm.mesh = _offset_mesh(_cylinder(0.35, 3.2), 1.6)
	var canopy_mm := MultiMesh.new()
	canopy_mm.transform_format = MultiMesh.TRANSFORM_3D
	canopy_mm.use_colors = true
	canopy_mm.mesh = _offset_mesh(_cone(2.5, 11.0), 8.7)

	var xs: Array[Transform3D] = []
	var cols: Array[Color] = []
	var half := _terrain.half() - 30.0
	var tries := 0
	while xs.size() < tree_count and tries < tree_count * 12:
		tries += 1
		var x := (_rng.randf() * 2.0 - 1.0) * half
		var z := (_rng.randf() * 2.0 - 1.0) * half
		var y := _terrain.height_at(x, z)
		if y > 2380.0:                                    # treeline ke upar barf
			continue
		var n := _terrain.normal_at(x, z)
		if n.y < 0.55:                                    # nangi chattan
			continue
		var rp := nearest_road_point(x, z, false)
		if not rp.is_empty() and float(rp["dist"]) < 11.0:
			continue
		# deodar belt 1800-2400 m; us se neeche patla chir pine
		if y < 1800.0 and _rng.randf() > 0.42:
			continue
		var s := 0.62 + _rng.randf() * 0.85
		xs.append(Transform3D(Basis().scaled(Vector3(s, s * (0.85 + _rng.randf() * 0.5), s))
				.rotated(Vector3.UP, _rng.randf() * TAU), Vector3(x, y, z)))
		var t := 0.24 + _rng.randf() * 0.13
		cols.append(Color(t * 0.55, t + 0.09, t * 0.62))

	for mm in [trunk_mm, canopy_mm]:
		mm.instance_count = xs.size()
		for i in xs.size():
			mm.set_instance_transform(i, xs[i])
	for i in cols.size():
		canopy_mm.set_instance_color(i, cols[i])

	_add_multimesh("Trunks", trunk_mm, Color("4a3a2c"), false)
	_add_multimesh("Canopies", canopy_mm, Color.WHITE, true)
	print("[WorldBuilder] %d ped" % xs.size())


func _add_multimesh(nm: String, mm: MultiMesh, albedo: Color, use_vc: bool) -> void:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = albedo
	mat.roughness = 1.0
	if use_vc:
		mat.vertex_color_use_as_albedo = true
	var mmi := MultiMeshInstance3D.new()
	mmi.name = nm
	mmi.multimesh = mm
	mmi.material_override = mat
	add_child(mmi)


# ------------------------------------------------------------------- helpers

func _to_world(latlon_pairs: Array) -> Array[Vector3]:
	var out: Array[Vector3] = []
	for pair: Array in latlon_pairs:
		var v := Geo.to_world(pair[0], pair[1])
		out.append(Vector3(v.x, _terrain.height_at(v.x, v.y), v.y))
	return out


func _resample(pts: Array[Vector3], step: float) -> Array[Vector3]:
	var out: Array[Vector3] = [pts[0]]
	var carry := 0.0
	for i in pts.size() - 1:
		var a := pts[i]
		var b := pts[i + 1]
		var seg := a.distance_to(b)
		var t := carry
		while t < seg:
			var p := a.lerp(b, t / seg)
			p.y = _terrain.height_at(p.x, p.z)
			out.append(p)
			t += step
		carry = t - seg
	out.append(pts[pts.size() - 1])
	return out


func _too_close(placed: Array[Vector2], x: float, z: float, r: float) -> bool:
	var r2 := r * r
	for i in range(maxi(0, placed.size() - 400), placed.size()):
		if Vector2(placed[i].x - x, placed[i].y - z).length_squared() < r2:
			return true
	return false


## Zameen-jaisa quad jiska normal hamesha upar. Winding ka sign road ki disha pe
## nirbhar karta hai, isliye check karke palat dete hain -- warna aadhi sadkein
## back-face cull ho kar gayab ho jaati hain.
func _quad_up(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3, col: Color) -> void:
	var ny := (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)
	if ny > 0.0:
		_tri(st, a, b, c, col)
		_tri(st, a, c, d, col)
	else:
		_tri(st, a, d, c, col)
		_tri(st, a, c, b, col)


func _tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, col: Color) -> void:
	for p in [a, b, c]:
		st.set_color(col)
		st.add_vertex(p)


func _box(st: SurfaceTool, centre: Vector3, size: Vector3, col: Color) -> void:
	var h := size * 0.5
	var p := [
		centre + Vector3(-h.x, -h.y, -h.z), centre + Vector3(h.x, -h.y, -h.z),
		centre + Vector3(h.x, h.y, -h.z),   centre + Vector3(-h.x, h.y, -h.z),
		centre + Vector3(-h.x, -h.y, h.z),  centre + Vector3(h.x, -h.y, h.z),
		centre + Vector3(h.x, h.y, h.z),    centre + Vector3(-h.x, h.y, h.z),
	]
	var faces := [[1, 0, 3, 1, 3, 2], [4, 5, 6, 4, 6, 7], [0, 4, 7, 0, 7, 3],
				  [5, 1, 2, 5, 2, 6], [3, 7, 6, 3, 6, 2], [0, 1, 5, 0, 5, 4]]
	# nakli AO -- har mukh ka apna tone, isse box flat nahi lagta
	var shade := [0.88, 0.88, 0.78, 0.97, 1.0, 0.70]
	for f in faces.size():
		var k: float = shade[f]
		for i: int in faces[f]:
			st.set_color(Color(col.r * k, col.g * k, col.b * k))
			st.add_vertex(p[i])


## Primitive meshes origin pe centred hote hain, par ped ki jad zameen pe honi
## chahiye. Yahan mesh ko upar shift karke bake kar dete hain, taaki MultiMesh ka
## ek hi transform trunk aur canopy dono ke liye kaam kare.
func _offset_mesh(src: Mesh, dy: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.append_from(src, 0, Transform3D(Basis(), Vector3(0.0, dy, 0.0)))
	return st.commit()


func _cylinder(radius: float, height: float) -> Mesh:
	var m := CylinderMesh.new()
	m.top_radius = radius * 0.7
	m.bottom_radius = radius
	m.height = height
	m.radial_segments = 5
	m.rings = 0
	return m


func _cone(radius: float, height: float) -> Mesh:
	var m := CylinderMesh.new()
	m.top_radius = 0.0
	m.bottom_radius = radius
	m.height = height
	m.radial_segments = 7
	m.rings = 0
	return m
