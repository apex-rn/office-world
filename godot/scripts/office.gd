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

# server address: --server=ws://host:port on the command line, CC_SERVER_URL env, user://server.txt, else localhost
# (when the office service runs inside WSL, use the WSL address, e.g. ws://172.18.250.139:8765)
var SERVER_URL := _server_url()

func _server_url() -> String:
	for a in OS.get_cmdline_user_args() + OS.get_cmdline_args():
		if a.begins_with("--server="): return a.substr(9)
	if OS.get_environment("CC_SERVER_URL") != "": return OS.get_environment("CC_SERVER_URL")
	if FileAccess.file_exists("user://server.txt"): return FileAccess.get_file_as_string("user://server.txt").strip_edges()
	return "ws://127.0.0.1:8765"
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
	var tok := ""
	for f in ["user://boss.token", "res://boss.token"]:
		if FileAccess.file_exists(f): tok = FileAccess.get_file_as_string(f).strip_edges(); break
	url = SERVER_URL + ("?token=" + tok if tok != "" else "")
	ws.connect_to_url(url)
	_chat_box()

# ---------------------------------------------------------------- the Boss: WASD walk, F enter/leave, Enter talk
var url := SERVER_URL
var steer_sent := Vector2.ZERO
var steer_t := 0.0
var chat: LineEdit

func _send_boss(cmd: Dictionary) -> void:
	if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		ws.send_text(JSON.stringify({"t": "boss", "cmd": cmd}))

func _boss_input(dt: float) -> void:
	if chat.has_focus():
		return
	var v := Vector2(Input.get_axis("ui_left", "ui_right") + float(Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_A)),
		Input.get_axis("ui_up", "ui_down") + float(Input.is_key_pressed(KEY_S)) - float(Input.is_key_pressed(KEY_W)))
	if v.length() > 1.0: v = v.normalized()
	# camera-relative: "up" walks away from the camera
	var fwd := Vector2(-sin(orbit.yaw), -cos(orbit.yaw)); var right := Vector2(-fwd.y, fwd.x)
	var world_v := (right * v.x - fwd * v.y) * 1.4
	steer_t += dt
	if (world_v - steer_sent).length() > 0.05 or (world_v.length() > 0.05 and steer_t > 0.2):
		_send_boss({"verb": "steer", "vx": world_v.x, "vz": world_v.y})
		steer_sent = world_v; steer_t = 0.0
	if people.has("boss") and people["boss"].state != "offsite" and follow_id == "":
		orbit.target = orbit.target.lerp(people["boss"].node.position, clamp(dt * 4.0, 0, 1))

func _chat_box() -> void:
	var layer := CanvasLayer.new(); add_child(layer)
	chat = LineEdit.new()
	chat.placeholder_text = "Enter — eng yaqin xodimga gapiring (o'zbekcha)"
	chat.position = Vector2(16, 1020); chat.size = Vector2(720, 40)
	chat.text_submitted.connect(func(t: String):
		var near := ""; var best := 6.0
		if people.has("boss"):
			for id in people:
				if id == "boss" or people[id].state == "offsite": continue
				var d: float = people[id].node.position.distance_to(people["boss"].node.position)
				if d < best: best = d; near = id
		_send_boss({"verb": "say", "to": near if near != "" else null, "text": t})
		chat.text = ""; chat.release_focus())
	layer.add_child(chat)

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
			if name == "plaster": m.normal_scale = 0.25   # painted plaster is smooth, not raw concrete
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
	var tt: Transform3D = t * (n.transform if n is Node3D else Transform3D.IDENTITY)
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
		elif _built(i.def, size) != null:
			node = _built(i.def, size)
		else:
			node = Node3D.new()
			_box(size, Vector3(0, i.h / 2, 0), 0, _placeholder_mat(i.def), node)
		node.position = Vector3(i.x, i.y, i.z)
		node.rotation.y = i.yaw
		node.name = String(i.id).replace(".", "_")
		add_child(node)

# Small electronics built to their real geometry (a box the size of a monitor's bounding volume looks like a crate)
func _built(def_id: String, s: Vector3) -> Node3D:
	var n := Node3D.new()
	var alu := _mat("aluminium", Color(0.78, 0.79, 0.81), 0.22, 0.9)
	var dark := _mat("metal_black", Color(0.08, 0.08, 0.09), 0.35, 0.5)
	var screen := StandardMaterial3D.new()
	screen.albedo_color = Color(0.05, 0.08, 0.12); screen.emission_enabled = true
	screen.emission = Color(0.35, 0.55, 0.85); screen.emission_energy_multiplier = 0.8; screen.roughness = 0.1
	match def_id:
		"monitor_24":
			_box(Vector3(0.22, 0.012, 0.17), Vector3(0, 0.006, 0), 0, alu, n)                      # foot
			_box(Vector3(0.035, 0.24, 0.025), Vector3(0, 0.13, -0.05), 0, alu, n)                   # neck
			_box(Vector3(s.x, 0.312, 0.018), Vector3(0, s.y - 0.156, -0.03), 0, dark, n)           # thin panel
			_box(Vector3(s.x - 0.012, 0.3, 0.002), Vector3(0, s.y - 0.156, -0.02), 0, screen, n)   # lit screen
		"laptop_14":
			_box(Vector3(s.x, 0.009, s.z), Vector3(0, 0.0045, 0), 0, alu, n)
			var lid := Node3D.new(); lid.position = Vector3(0, 0.009, -s.z / 2); lid.rotation.x = -1.85; n.add_child(lid)
			_box(Vector3(s.x, 0.006, s.z), Vector3(0, 0, s.z / 2), 0, alu, lid)
			_box(Vector3(s.x - 0.02, 0.001, s.z - 0.03), Vector3(0, -0.0035, s.z / 2), 0, screen, lid)
		"keyboard":
			_box(Vector3(s.x, 0.011, s.z), Vector3(0, 0.0055, 0), 0, alu, n)
			var keys := _mat("keycap", Color(0.92, 0.92, 0.9), 0.5)
			for r in 5:
				for c in 15:
					_box(Vector3(0.024, 0.007, 0.019), Vector3(-s.x / 2 + 0.03 + c * 0.0273, 0.014, -s.z / 2 + 0.018 + r * 0.023), 0, keys, n)
		"mouse":
			var mi := MeshInstance3D.new(); var sm := SphereMesh.new(); sm.radius = 0.5; sm.height = 1.0
			mi.mesh = sm; mi.scale = Vector3(s.x, s.y * 1.6, s.z); mi.material_override = dark; n.add_child(mi)
		_:
			return null
	return n

func _placeholder_mat(def_id: String) -> Material:
	if def_id in ["desk_140", "reception_desk"]: return _mat("desk_white", Color(0.94, 0.93, 0.91), 0.42)   # white matte top, black steel frame in the GLB
	if def_id == "desk_160" or def_id.ends_with("table") or def_id == "bookcase": return _mat("walnut", Color(0.36, 0.25, 0.17), 0.45, 0, 0.5)
	if def_id in ["keyboard", "mouse"]: return _mat("metal_black", Color(0.23, 0.24, 0.26), 0.5, 0.3)
	if def_id == "laptop_14": return _mat("aluminium", Color(0.79, 0.8, 0.82), 0.22, 0.9)
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
	if anim_name.begins_with("bow_") or anim_name == "bow_handshake":
		_bow(p, 45.0 if anim_name == "bow_45" else 30.0 if anim_name == "bow_30" else 15.0)
	var want: String = anim_map.get(anim_name, anim_map.get(state, ""))
	if want != "" and ap.has_animation(want) and ap.current_animation != want:
		ap.play(want, 0.3)   # 0.3 s blend: no robotic snapping between poses

# Korean bow (Rocketbox has no bow clip): bend the spine chain forward, hold, and straighten — on top of idle
func _bow(p: Dictionary, deg: float) -> void:
	if p.get("bowing", false) or p.node.get_child_count() == 0:
		return
	var sk: Skeleton3D = p.node.find_child("*", true, false) as Skeleton3D
	if sk == null:
		for c in p.node.find_children("*", "Skeleton3D", true, false): sk = c; break
	if sk == null:
		return
	var bones: Array[int] = []
	for i in sk.get_bone_count():
		var n := sk.get_bone_name(i).to_lower()
		if n.contains("spine") or n.contains("pelvis"): bones.append(i)
	if bones.is_empty():
		return
	p.bowing = true
	var per := deg_to_rad(deg) / bones.size()
	var tw := create_tween()
	tw.tween_method(func(t: float):
		for b in bones:
			sk.set_bone_pose_rotation(b, sk.get_bone_rest(b).basis.get_rotation_quaternion() * Quaternion(Vector3.RIGHT, per * t)), 0.0, 1.0, 0.6).set_trans(Tween.TRANS_SINE)
	tw.tween_interval(0.8)
	tw.tween_method(func(t: float):
		for b in bones:
			sk.set_bone_pose_rotation(b, sk.get_bone_rest(b).basis.get_rotation_quaternion() * Quaternion(Vector3.RIGHT, per * t)), 1.0, 0.0, 0.7).set_trans(Tween.TRANS_SINE)
	tw.finished.connect(func(): p.bowing = false)

func _apply_snap(s: Dictionary) -> void:
	for b in s.bodies:
		if not people.has(b.id):
			people[b.id] = _person(b.id)
		var p: Dictionary = people[b.id]
		# the root stays on the floor: the seated clip itself puts the pelvis on the seat (no double lift)
		p.pos = Vector3(b.x, 0.0, b.z)
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
		ws.connect_to_url(url)
	_boss_input(dt)
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
	hud.text = "Compound Chronicle HQ   ·   %s   ·   %d people   ·   drag: rotate · wheel: zoom · 1-9: follow · 0: free" % ["live" if ws.get_ready_state() == WebSocketPeer.STATE_OPEN else "connecting…", people.size()] + "   ·   Boss: F kirish/chiqish · WASD yurish · Enter gapirish"

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
	elif e is InputEventKey and e.pressed and e.keycode == KEY_F and not chat.has_focus():
		var inside: bool = people.has("boss") and people["boss"].state != "offsite"
		_send_boss({"verb": "go_home"} if inside else {"verb": "arrive"})
	elif e is InputEventKey and e.pressed and e.keycode == KEY_ENTER and not chat.has_focus():
		chat.grab_focus()
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
