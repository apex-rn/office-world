# Compound Chronicle HQ — Godot 4 client. Builds the real-dimension office from layout.json (exported from
# packages/catalog, metres, same axes as the server) and mirrors the live office from the server stream
# (packages/server/src/stream.ts). The server is the only source of truth: this client never moves people itself.
#
# Assets (optional; without them correct-size placeholders are used):
#   res://assets/materials/<name>/diff.jpg|nor.jpg|rough.jpg   Poly Haven PBR (walnut, plaster, marble, leather, ...)
#   res://assets/furniture/<def id>.glb                         fitted to the catalog's real dimensions
#   res://assets/people/<person id>.glb (+ anims.json)          Rocketbox avatars with an AnimationPlayer
#   res://assets/hdri/interior.hdr                              sky / reflections
extends Node3D

const SERVER_URL := "ws://127.0.0.1:8765"
var L: Dictionary
var ws := WebSocketPeer.new()
var people := {}            # id -> {node, anim, target_pos, target_yaw, state}
var doors := {}             # id -> [pivots]
var door_open := {}
var mats := {}
var cam: Camera3D
var orbit := {"yaw": -0.6, "pitch": -0.75, "dist": 26.0, "target": Vector3(12, 0, 8.5)}
var follow_id := ""
var hud: Label

func _ready() -> void:
	L = JSON.parse_string(FileAccess.get_file_as_string("res://layout.json"))
	orbit.target = Vector3(L.room.w / 2.0, 0, L.room.d / 2.0)
	_environment()
	_floors()
	_walls()
	_doors()
	_furniture()
	_camera()
	_hud()
	ws.connect_to_url(SERVER_URL)

# ---------------------------------------------------------------- look: light, sky, post
func _environment() -> void:
	var env := Environment.new()
	var sky := Sky.new()
	if ResourceLoader.exists("res://assets/hdri/interior.hdr"):
		var pano := PanoramaSkyMaterial.new()
		pano.panorama = load("res://assets/hdri/interior.hdr")
		sky.sky_material = pano
	else:
		sky.sky_material = ProceduralSkyMaterial.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.0
	env.sdfgi_enabled = true            # real-time global illumination (light bouncing off walls and floor)
	env.sdfgi_use_occlusion = true
	env.ssao_enabled = true             # contact shadows in corners and under furniture
	env.ssil_enabled = true
	env.ssr_enabled = true              # reflections in glass, marble and polished wood
	env.glow_enabled = true
	env.volumetric_fog_enabled = true
	env.volumetric_fog_density = 0.004
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.light_energy = 2.4
	sun.light_color = Color(1.0, 0.92, 0.82)
	sun.shadow_enabled = true
	sun.rotation_degrees = Vector3(-38, 200, 0)     # late afternoon, through the south windows
	add_child(sun)

func _mat(name: String, fallback: Color, rough := 0.6, metal := 0.0, scale := 1.0) -> StandardMaterial3D:
	var key := "%s_%s" % [name, scale]
	if mats.has(key):
		return mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = fallback
	m.roughness = rough
	m.metallic = metal
	var base := "res://assets/materials/%s/" % name
	if ResourceLoader.exists(base + "diff.jpg"):
		m.albedo_color = Color.WHITE
		m.albedo_texture = load(base + "diff.jpg")
		if ResourceLoader.exists(base + "nor.jpg"):
			m.normal_enabled = true
			m.normal_texture = load(base + "nor.jpg")
		if ResourceLoader.exists(base + "rough.jpg"):
			m.roughness_texture = load(base + "rough.jpg")
			m.roughness = 1.0
		m.uv1_triplanar = true          # boxes have no UVs: project textures in world scale
		m.uv1_world_triplanar = true
		m.uv1_scale = Vector3.ONE * scale
	mats[key] = m
	return m

func _glass() -> StandardMaterial3D:
	if mats.has("glass"):
		return mats["glass"]
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.75, 0.85, 0.9, 0.16)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.roughness = 0.03
	m.metallic = 0.2
	mats["glass"] = m
	return m

func _box(size: Vector3, pos: Vector3, yaw: float, m: Material, parent: Node3D = self) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = m
	mi.position = pos
	mi.rotation.y = yaw
	parent.add_child(mi)
	return mi

# ---------------------------------------------------------------- building
func _floors() -> void:
	var w: float = L.room.w
	var d: float = L.room.d
	_box(Vector3(w + 0.4, 0.04, d + 0.4), Vector3(w / 2, -0.02, d / 2), 0, _mat("walnut", Color(0.36, 0.25, 0.17), 0.45, 0, 0.5))
	for z in L.zones:
		var xs: Array = z.poly.map(func(p): return p[0])
		var zs: Array = z.poly.map(func(p): return p[1])
		var x0: float = xs.min(); var x1: float = xs.max(); var z0: float = zs.min(); var z1: float = zs.max()
		var m: Material = null
		if z.id in ["meeting", "manager"]: m = _mat("carpet", Color(0.24, 0.25, 0.29), 1.0)
		elif z.outdoor: m = _mat("stone", Color(0.55, 0.55, 0.52), 0.85)
		elif z.id == "wc": m = _mat("marble", Color(0.93, 0.92, 0.9), 0.25)
		if m:
			_box(Vector3(x1 - x0, 0.01, z1 - z0), Vector3((x0 + x1) / 2, 0.005, (z0 + z1) / 2), 0, m)

func _walls() -> void:
	for p in L.walls:
		var m: Material = _glass() if p.glass else _mat("plaster", Color(0.93, 0.91, 0.88), 0.9)
		var h: float = p.y1 - p.y0
		_box(Vector3(p.hx * 2, h, p.hz * 2), Vector3(p.cx, (p.y0 + p.y1) / 2, p.cz), p.yaw, m)
	for wdw in L.windows:
		_box(Vector3(wdw.width, wdw.top - wdw.sill, 0.02), Vector3(wdw.cx, (wdw.sill + wdw.top) / 2, wdw.cz), wdw.yaw, _glass())

func _doors() -> void:
	for d in L.doors:
		var root := Node3D.new()
		root.position = Vector3(d.cx, 0, d.cz)
		root.rotation.y = d.yaw
		add_child(root)
		var leaves := 2 if d.width >= 1.5 else 1
		var lw: float = d.width / leaves - 0.01
		var pivots := []
		for k in leaves:
			var side := (-1 if k == 0 else 1) if leaves == 2 else -1
			var pv := Node3D.new()
			pv.position = Vector3(side * d.width / 2, 0, 0)
			root.add_child(pv)
			var m: Material = _mat("walnut", Color(0.3, 0.2, 0.14), 0.5) if d.exterior else _glass()
			_box(Vector3(lw, d.top - 0.01, 0.045), Vector3(-side * lw / 2, (d.top - 0.01) / 2, 0), 0, m, pv)
			_box(Vector3(0.02, 0.3, 0.06), Vector3(-side * (lw - 0.08), 1.05, 0), 0, _mat("brass", Color(0.72, 0.58, 0.35), 0.3, 0.9), pv)
			pivots.append({"pv": pv, "side": side})
		doors[d.id] = pivots

func _fitted(path: String, size: Vector3) -> Node3D:
	var inst: Node3D = load(path).instantiate()
	var aabb := _aabb(inst, Transform3D.IDENTITY)
	if aabb.size.length() < 0.001:
		return inst
	# GLB furniture faces +Z like our catalog; scale each axis to the real dimensions and stand it on its base
	var s := Vector3(size.x / max(aabb.size.x, 0.001), size.y / max(aabb.size.y, 0.001), size.z / max(aabb.size.z, 0.001))
	inst.scale = s
	inst.position = -Vector3((aabb.position.x + aabb.size.x / 2) * s.x, aabb.position.y * s.y, (aabb.position.z + aabb.size.z / 2) * s.z)
	var holder := Node3D.new()
	holder.add_child(inst)
	return holder

func _aabb(n: Node, t: Transform3D) -> AABB:
	var out := AABB()
	var first := true
	var tt := t * (n.transform if n is Node3D else Transform3D.IDENTITY)
	if n is MeshInstance3D and n.mesh:
		out = tt * n.mesh.get_aabb()
		first = false
	for c in n.get_children():
		var a := _aabb(c, tt)
		if a.size.length() > 0:
			out = a if first else out.merge(a)
			first = false
	return out

func _furniture() -> void:
	for i in L.instances:
		var size := Vector3(i.w, i.h, i.d)
		var node: Node3D
		var path := "res://assets/furniture/%s.glb" % i.def
		if ResourceLoader.exists(path):
			node = _fitted(path, size)
		else:
			node = Node3D.new()
			_box(size, Vector3(0, i.h / 2, 0), 0, _placeholder_mat(i.def), node)
		node.position = Vector3(i.x, i.y, i.z)
		node.rotation.y = i.yaw
		node.name = String(i.id).replace(".", "_")
		add_child(node)

func _placeholder_mat(def_id: String) -> Material:
	if def_id.begins_with("desk") or def_id.ends_with("table") or def_id == "bookcase": return _mat("walnut", Color(0.36, 0.25, 0.17), 0.45, 0, 0.5)
	if def_id.ends_with("chair"): return _mat("leather", Color(0.2, 0.2, 0.22), 0.6)
	if def_id == "sofa_3": return _mat("leather", Color(0.54, 0.34, 0.21), 0.55)
	if def_id in ["kitchen_counter", "sink_unit", "cabinet_low"]: return _mat("marble", Color(0.93, 0.92, 0.9), 0.25)
	if def_id in ["fridge", "microwave", "coffee_machine", "server_rack", "monitor_24", "tv_65"]: return _mat("metal_black", Color(0.12, 0.12, 0.13), 0.35, 0.6)
	if def_id == "plant_floor": return _mat("leaves", Color(0.25, 0.42, 0.27), 0.8)
	return _mat("oak", Color(0.69, 0.54, 0.37), 0.6)

# ---------------------------------------------------------------- people
func _person(id: String) -> Dictionary:
	var node := Node3D.new()
	node.name = id
	add_child(node)
	var anim: AnimationPlayer = null
	var path := "res://assets/people/%s.glb" % id
	if ResourceLoader.exists(path):
		var body: Node3D = load(path).instantiate()
		node.add_child(body)
		anim = body.find_child("AnimationPlayer", true, false)
	else:
		var cap := MeshInstance3D.new()
		var cm := CapsuleMesh.new(); cm.radius = 0.22; cm.height = 1.75
		cap.mesh = cm; cap.position.y = 0.875
		cap.material_override = _mat("fabric", Color(0.25, 0.28, 0.35), 0.9)
		node.add_child(cap)
	var tag := Label3D.new()
	tag.text = id
	tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	tag.position.y = 2.15
	tag.pixel_size = 0.004
	tag.outline_size = 8
	node.add_child(tag)
	return {"node": node, "anim": anim, "pos": Vector3.ZERO, "yaw": 0.0, "state": "offsite", "tag": tag, "bubble_until": 0.0}

var anim_map := {}

func _play(p: Dictionary, state: String, anim_name: String) -> void:
	var ap: AnimationPlayer = p.anim
	if ap == null:
		return
	if anim_map.is_empty() and ResourceLoader.exists("res://assets/people/anims.json"):
		anim_map = JSON.parse_string(FileAccess.get_file_as_string("res://assets/people/anims.json"))
	var want: String = anim_map.get(anim_name, anim_map.get(state, ""))
	if want != "" and ap.has_animation(want) and ap.current_animation != want:
		ap.play(want, 0.3)   # 0.3 s blend: no robotic snapping between poses

func _apply_snap(s: Dictionary) -> void:
	for b in s.bodies:
		if not people.has(b.id):
			people[b.id] = _person(b.id)
		var p: Dictionary = people[b.id]
		p.pos = Vector3(b.x, b.y if b.state == "sitting" else 0.0, b.z)
		p.yaw = b.yaw
		p.state = b.state
		p.node.visible = b.state != "offsite"
		_play(p, b.state, b.anim)
	for id in s.doors:
		door_open[id] = s.doors[id] > 0

func _speech(e: Dictionary) -> void:
	if not people.has(e.from):
		return
	var p: Dictionary = people[e.from]
	p.tag.text = "%s: %s" % [e.from, e.text]
	p.bubble_until = Time.get_ticks_msec() / 1000.0 + clamp(e.text.length() * 0.06, 2.5, 8.0)

func _process(dt: float) -> void:
	ws.poll()
	if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		while ws.get_available_packet_count() > 0:
			var m = JSON.parse_string(ws.get_packet().get_string_from_utf8())
			if m == null: continue
			if m.t == "snap": _apply_snap(m)
			elif m.t == "event" and m.e.get("type", "") == "speech": _speech(m.e)
	elif ws.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		ws.connect_to_url(SERVER_URL)
	var now := Time.get_ticks_msec() / 1000.0
	for id in people:
		var p: Dictionary = people[id]
		var n: Node3D = p.node
		n.position = n.position.lerp(p.pos, clamp(dt * 10.0, 0, 1))
		n.rotation.y = lerp_angle(n.rotation.y, p.yaw, clamp(dt * 10.0, 0, 1))
		if p.bubble_until > 0 and now > p.bubble_until:
			p.tag.text = id
			p.bubble_until = 0.0
	for id in doors:
		var want := 1.35 if door_open.get(id, false) else 0.0
		for d in doors[id]:
			d.pv.rotation.y = lerp(d.pv.rotation.y, d.side * want, clamp(dt * 6.0, 0, 1))
	if follow_id != "" and people.has(follow_id):
		orbit.target = orbit.target.lerp(people[follow_id].node.position, clamp(dt * 3.0, 0, 1))
	_update_camera()
	hud.text = "Compound Chronicle HQ   ·   %s   ·   %d people   ·   drag: rotate · wheel: zoom · 1-9: follow · 0: free" % ["live" if ws.get_ready_state() == WebSocketPeer.STATE_OPEN else "connecting…", people.size()]

# ---------------------------------------------------------------- camera + hud
func _camera() -> void:
	cam = Camera3D.new()
	cam.fov = 45
	add_child(cam)
	_update_camera()

func _update_camera() -> void:
	var dir := Vector3(cos(orbit.pitch) * sin(orbit.yaw), -sin(orbit.pitch), cos(orbit.pitch) * cos(orbit.yaw))
	cam.position = orbit.target + dir * orbit.dist
	cam.look_at(orbit.target, Vector3.UP)

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventMouseMotion and (e.button_mask & MOUSE_BUTTON_MASK_LEFT):
		orbit.yaw -= e.relative.x * 0.005
		orbit.pitch = clamp(orbit.pitch - e.relative.y * 0.005, -1.45, -0.08)
	elif e is InputEventMouseButton and e.pressed:
		if e.button_index == MOUSE_BUTTON_WHEEL_UP: orbit.dist = max(1.5, orbit.dist * 0.9)
		elif e.button_index == MOUSE_BUTTON_WHEEL_DOWN: orbit.dist = min(60.0, orbit.dist * 1.1)
	elif e is InputEventKey and e.pressed:
		var k: int = e.keycode - KEY_0
		if k == 0: follow_id = ""
		elif k >= 1 and k <= 9:
			var ids := people.keys()
			if k - 1 < ids.size(): follow_id = ids[k - 1]; orbit.dist = 5.0

func _hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	hud = Label.new()
	hud.position = Vector2(16, 12)
	hud.add_theme_font_size_override("font_size", 18)
	layer.add_child(hud)
