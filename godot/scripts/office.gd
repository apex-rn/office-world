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
var view_only := false
var boss_auto := false
var ws := WebSocketPeer.new()
var people := {}            # id -> {node, anim, target_pos, target_yaw, state}
var doors := {}             # id -> [pivots]
var door_open := {}
var chairs := []            # rolling chairs: {node, home, back}
var mats := {}
var cam: Camera3D
var orbit := {"yaw": -0.6, "pitch": -0.75, "dist": 26.0, "target": Vector3(12, 0, 8.5)}
# eye-level view (V toggles): a person standing in the office, 1.68 m eye height
var eye_mode := true
var eye := {"pos": Vector3(3.0, 1.68, 14.5), "yaw": 2.4, "pitch": -0.05}
var eye_locked := false
var ceiling_parts := []    # slab + LED panels: hidden in the top-down (V) view, which they would block
var ceiling_shown := true     # a tool (screenshots, tours) places the eye itself: do not ride with the Boss
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
	_ceiling()
	_lightmap()
	_camera()
	_hud()
	# --view: watch only (never sends the Boss token); --boss: walk in as the Boss right after connecting
	# --token-file=<path>: where the Boss token lives (the desktop launcher passes it)
	var args := OS.get_cmdline_user_args() + OS.get_cmdline_args()
	view_only = "--view" in args
	boss_auto = "--boss" in args
	var tok := ""
	var files := ["user://boss.token", "res://boss.token"]
	for a in args:
		if a.begins_with("--token-file="): files.push_front(a.substr(13))
	if not view_only:
		for f in files:
			if FileAccess.file_exists(f): tok = FileAccess.get_file_as_string(f).strip_edges(); break
	# Godot's WebSocketPeer rejects "ws://host:port?token=..." as an invalid URL: the query needs a path ("/?")
	var base := SERVER_URL if SERVER_URL.count("/") > 2 else SERVER_URL + "/"
	url = base + ("?token=" + tok if tok != "" else "")
	ws.connect_to_url(url)
	_chat_box()

# ---------------------------------------------------------------- the Boss: WASD walk, F enter/leave, Enter talk
var url := SERVER_URL
var steer_sent := Vector2.ZERO
var steer_t := 0.0
var boss_v := Vector2.ZERO   # this client's own steering (m/s): the Boss moves at once, the server only corrects him
var chat: LineEdit

func _send_boss(cmd: Dictionary) -> void:
	if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		ws.send_text(JSON.stringify({"t": "boss", "cmd": cmd}))

func _boss_input(dt: float) -> void:
	boss_v = Vector2.ZERO
	if chat.has_focus():
		return
	var v := Vector2(Input.get_axis("ui_left", "ui_right") + float(Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_A)),
		Input.get_axis("ui_up", "ui_down") + float(Input.is_key_pressed(KEY_S)) - float(Input.is_key_pressed(KEY_W)))
	if v.length() > 1.0: v = v.normalized()
	# camera-relative: W walks where the camera looks (the mouse look in first person, the orbit from above)
	var look_yaw: float = eye.yaw if eye_mode else orbit.yaw
	var fwd := Vector2(-sin(look_yaw), -cos(look_yaw)); var right := Vector2(-fwd.y, fwd.x)
	var speed := 3.5 if Input.is_key_pressed(KEY_SHIFT) else 2.0   # brisk office walk; Shift to hurry
	var world_v := (right * v.x - fwd * v.y) * speed
	steer_t += dt
	if eye_mode and not (people.has("boss") and people["boss"].state != "offsite"):
		var f3 := Vector3(-sin(eye.yaw), 0, -cos(eye.yaw)); var r3 := Vector3(-f3.z, 0, f3.x)
		eye.pos += (r3 * v.x - f3 * v.y) * speed * dt
		return
	boss_v = world_v
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
	env.volumetric_fog_enabled = false
	env.tonemap_exposure = 1.15
	env.glow_intensity = 0.4
	env.glow_bloom = 0.1
	var we := WorldEnvironment.new()
	we.name = "WorldEnvironment"
	we.environment = env
	add_child(we)
	# Luxury modern architectural lighting: warm bright sun casting soft shadows through south windows
	env.ambient_light_energy = 0.85
	var sun := DirectionalLight3D.new()
	sun.light_energy = 1.2
	sun.light_color = Color(1.0, 0.96, 0.90)   # warm natural sunlight
	sun.shadow_enabled = true
	sun.shadow_bias = 0.04
	sun.shadow_opacity = 0.65
	sun.shadow_blur = 1.5
	sun.rotation_degrees = Vector3(-38, 200, 0)     # sunny afternoon through the south windows
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
	_box(Vector3(w + 0.4, 0.04, d + 0.4), Vector3(w / 2, -0.02, d / 2), 0, _mat("walnut", Color(0.42, 0.30, 0.21), 0.30, 0.05, 0.5))
	for z in L.zones:
		var xs: Array = z.poly.map(func(p): return p[0])
		var zs: Array = z.poly.map(func(p): return p[1])
		var x0: float = xs.min(); var x1: float = xs.max(); var z0: float = zs.min(); var z1: float = zs.max()
		var m: Material = null
		if z.id in ["meeting", "manager"]: m = _mat("carpet", Color(0.20, 0.26, 0.32), 0.85)
		elif z.outdoor: m = _mat("stone", Color(0.55, 0.55, 0.52), 0.85)
		elif z.id == "wc": m = _mat("marble", Color(0.93, 0.92, 0.9), 0.25)
		if m:
			_box(Vector3(x1 - x0, 0.01, z1 - z0), Vector3((x0 + x1) / 2, 0.005, (z0 + z1) / 2), 0, m)

func _walls() -> void:
	for p in L.walls:
		var m: Material = _glass() if p.glass else _mat("plaster", Color(0.97, 0.96, 0.94), 0.7)
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

# models whose front is not +Z (the catalog's "user side"): extra turn in radians
const MODEL_YAW := {}   # extra turns for models whose front is not +Z (desk lamp checked in the Boss's screenshot: none needed)

func _fitted(path: String, size: Vector3, def_id: String = "") -> Node3D:
	var inst: Node3D = load(path).instantiate()
	var aabb := _aabb(inst, Transform3D.IDENTITY)
	if aabb.size.length() < 0.001:
		return inst
	# One uniform scale that fits the model inside the catalog's real dimensions: a per-axis scale would stretch
	# lamps, chairs and plants out of shape. If the model's long side is the catalog's other horizontal axis, turn it 90°.
	var m := aabb.size
	var turn := absf(size.x - size.z) > 0.05 and (size.x - size.z) * (m.x - m.z) < 0.0
	if turn:
		m = Vector3(m.z, m.y, m.x)
	var k: float = min(size.x / max(m.x, 0.001), size.y / max(m.y, 0.001), size.z / max(m.z, 0.001))
	inst.scale = Vector3.ONE * k
	var c := aabb.get_center()
	inst.position = -Vector3(c.x, aabb.position.y, c.z) * k   # centred on the spot, standing on its base
	var pivot := Node3D.new()
	pivot.rotation.y = (PI / 2 if turn else 0.0) + float(MODEL_YAW.get(def_id, 0.0))
	pivot.add_child(inst)
	var holder := Node3D.new()
	holder.add_child(pivot)
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
			node = _fitted(path, size, String(i.def))
		else:
			node = _built(i.def, size)
		if node == null:
			node = Node3D.new()
			_box(size, Vector3(0, i.h / 2, 0), 0, _placeholder_mat(i.def), node)
		node.position = Vector3(i.x, i.y, i.z)
		node.rotation.y = i.yaw
		node.name = String(i.id).replace(".", "_")
		add_child(node)
		if i.def in ["monitor_24", "tv_65", "whiteboard"]:
			_add_screen(i, node)
		if i.def == "office_chair":
			chairs.append({"node": node, "home": node.position, "back": -Vector3(sin(i.yaw), 0, cos(i.yaw))})

# A standing or walking person at a desk stands where the chair is: roll that chair back out of the way
# (as in a real office) and roll it home when they sit down or leave.
func _roll_chairs(dt: float) -> void:
	for c in chairs:
		var want: Vector3 = c.home
		var occupied := false   # someone sits on it: never roll it out from under them (they sat in the air)
		var blocked := false    # someone stands where the chair is
		for id in people:
			var p: Dictionary = people[id]
			if not p.node.visible and id != "boss": continue
			var dist := Vector2(p.pos.x - c.home.x, p.pos.z - c.home.z).length()
			if p.state == "sitting" and dist < 0.6: occupied = true
			elif p.state != "sitting" and p.state != "offsite" and dist < 0.5: blocked = true
		if blocked and not occupied:
			want = c.home + c.back * 0.55
		c.node.position = c.node.position.lerp(want, clamp(dt * 3.0, 0, 1))

# Small electronics built to their real geometry (a box the size of a monitor's bounding volume looks like a crate)
func _built(def_id: String, s: Vector3) -> Node3D:
	var n := Node3D.new()
	var alu := _mat("aluminium", Color(0.78, 0.79, 0.81), 0.22, 0.9)
	var dark := _mat("metal_black", Color(0.08, 0.08, 0.09), 0.35, 0.5)
	var screen := StandardMaterial3D.new()
	screen.albedo_color = Color(0.05, 0.08, 0.12); screen.emission_enabled = true
	screen.emission = Color(0.35, 0.55, 0.85); screen.emission_energy_multiplier = 0.8; screen.roughness = 0.1
	var chrome := _mat("chrome", Color(0.85, 0.86, 0.88), 0.08, 1.0)
	var ceramic := _mat("ceramic", Color(0.95, 0.95, 0.94), 0.1, 0.0)
	match def_id:
		"faucet":   # chrome single-lever mixer: base, upright body, spout reaching forward (+Z), lever
			_box(Vector3(0.05, 0.02, 0.05), Vector3(0, 0.01, -0.07), 0, chrome, n)
			_box(Vector3(0.032, 0.2, 0.032), Vector3(0, 0.12, -0.07), 0, chrome, n)
			_box(Vector3(0.022, 0.022, 0.17), Vector3(0, 0.215, 0.0), 0, chrome, n)
			_box(Vector3(0.018, 0.05, 0.018), Vector3(0, 0.19, 0.08), 0, chrome, n)
			_box(Vector3(0.012, 0.01, 0.07), Vector3(0, 0.235, -0.1), 0, chrome, n)
		"vanity_basin":   # white vanity, ceramic top with a shaded basin
			_box(Vector3(s.x - 0.02, s.y - 0.1, s.z - 0.04), Vector3(0, 0.1 + (s.y - 0.16) / 2, -0.02), 0, _mat("vanity", Color(0.93, 0.93, 0.92), 0.4), n)
			_box(Vector3(s.x - 0.06, 0.08, s.z - 0.08), Vector3(0, 0.04, -0.04), 0, dark, n)
			_box(Vector3(s.x, 0.06, s.z), Vector3(0, s.y - 0.03, 0), 0, ceramic, n)
			_box(Vector3(0.4, 0.004, 0.28), Vector3(0, s.y + 0.001, 0.02), 0, _mat("basin_in", Color(0.78, 0.79, 0.8), 0.1), n)
			_box(Vector3(0.008, 0.12, 0.008), Vector3(-0.04, s.y - 0.25, s.z / 2 + 0.005), 0, chrome, n)
			_box(Vector3(0.008, 0.12, 0.008), Vector3(0.04, s.y - 0.25, s.z / 2 + 0.005), 0, chrome, n)
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
		if id == "boss":
			body.scale = Vector3.ONE * 1.13   # Rocketbox men are ~1.77 m; the Boss is 2.00 m
		# avatars must face +Z like the catalog; anims.json "forward_yaw_deg" corrects a model authored facing -Z (180)
		if anim_map.is_empty() and ResourceLoader.exists("res://assets/people/anims.json"):
			anim_map = JSON.parse_string(FileAccess.get_file_as_string("res://assets/people/anims.json"))
		body.rotation.y = deg_to_rad(float(anim_map.get("forward_yaw_deg", 0)))
		node.add_child(body)
		anim = body.find_child("AnimationPlayer", true, false)
	else:
		var cap := MeshInstance3D.new()
		var cm := CapsuleMesh.new(); cm.radius = 0.22; cm.height = 1.75
		cap.mesh = cm; cap.position.y = 0.875
		cap.material_override = _mat("fabric", Color(0.25, 0.28, 0.35), 0.9)
		node.add_child(cap)
	var tag := Label3D.new()
	tag.text = NAMES.get(id, id)
	tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	tag.position.y = 2.15
	tag.pixel_size = 0.0009          # same size on screen near or far (no giant names up close)
	tag.fixed_size = true
	tag.font_size = 22
	tag.outline_size = 8
	node.add_child(tag)
	# speech bubble over the name: who says what, while they say it
	var bubble := Label3D.new()
	bubble.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	bubble.position.y = 2.55
	bubble.pixel_size = 0.0009
	bubble.fixed_size = true
	bubble.font_size = 22
	bubble.outline_size = 14
	bubble.outline_modulate = Color(0.05, 0.05, 0.07, 0.95)
	bubble.modulate = Color(1.0, 0.97, 0.82)
	bubble.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	bubble.width = 420
	bubble.no_depth_test = true          # readable even when someone stands in front
	bubble.visible = false
	node.add_child(bubble)
	return {"node": node, "anim": anim, "pos": Vector3.ZERO, "yaw": 0.0, "state": "offsite", "tag": tag, "bubble": bubble, "bubble_until": 0.0}

var anim_map := {}

func _play(p: Dictionary, state: String, anim_name: String) -> void:
	var ap: AnimationPlayer = p.anim
	if ap == null:
		return
	if anim_map.is_empty() and ResourceLoader.exists("res://assets/people/anims.json"):
		anim_map = JSON.parse_string(FileAccess.get_file_as_string("res://assets/people/anims.json"))
	if anim_name.begins_with("bow_") or anim_name == "bow_handshake":
		_bow(p, 45.0 if anim_name == "bow_45" else 30.0 if anim_name == "bow_30" else 15.0)
	# the world keeps anim "walk" on a body that has stopped (state standing): that played the stride on the spot
	# forever. Only a walking body walks; a stopped one falls back to its state's clip (idle).
	if anim_name == "walk" and state != "walking":
		anim_name = state
	elif state == "walking" and p.get("still", 0.0) > 0.4:
		anim_name = "standing"
	var want: String = anim_map.get(anim_name, anim_map.get(state, ""))
	if want != "" and ap.has_animation(want) and ap.current_animation != want:
		# 0.3 s blend between poses; sitting down / standing up eases over 0.6 s so the body lowers instead of popping
		var sit_clip: String = anim_map.get("sitting", "")
		var blend := 0.6 if (want == sit_clip or ap.current_animation == sit_clip) else 0.3
		ap.play(want, blend)
	p.walk_clip = anim_map.get("walk", "")

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
		# snapshot buffer: bodies are drawn ~100 ms in the past, between two real samples (no jumps at 10 Hz)
		var hist: Array = p.get("hist", [])
		hist.append({"t": Time.get_ticks_msec() / 1000.0, "pos": p.pos, "yaw": b.yaw})
		if hist.size() > 6: hist.pop_front()
		p.hist = hist
		p.state = b.state
		# when the camera is the Boss's own eyes, his body is not drawn (he saw the top of his own capsule)
		var own_eyes: bool = b.id == "boss" and eye_mode and not eye_locked
		p.node.visible = b.state != "offsite" and not own_eyes
		_play(p, b.state, b.anim)
	for id in s.doors:
		door_open[id] = s.doors[id] > 0

# ---- the live board on the kanban: one index card per task (real title + owner), in its column ----
const CARD_COL := {"todo": 0, "blocked": 0, "doing": 1, "review": 2, "approved": 3, "done": 3, "rejected": 3}
const CARD_TINT := [Color(1.0, 0.93, 0.55), Color(0.72, 0.88, 1.0), Color(1.0, 0.8, 0.85), Color(0.78, 0.95, 0.72)]

# ---- screens that show real things: each monitor its owner's current task, the meeting TV the agenda ----
var screens := {}          # instance id -> {label, panel_mat, owner, def}
var board_cards := []
const APP := {"shorts": "Premiere Pro — Shorts edit", "writer": "Google Docs — script", "facts": "Fact-check sheet",
	"qa": "QA checklist", "ig_res": "Instagram Insights", "yt_res": "YouTube Studio — Analytics",
	"longform": "DaVinci Resolve — long-form edit", "publisher": "YouTube Studio — upload queue",
	"manager": "Team board — overview", "guard": "CCTV — entrance · hall · balcony · server"}

func _add_screen(i: Dictionary, node: Node3D) -> void:
	# the box in the node's own frame: _aabb applies the node's transform, and the node is already placed in the
	# room, so without the inverse a monitor's screen landed metres away (its room z added to its front face)
	var box := _aabb(node, node.transform.affine_inverse())
	var sz: Vector2; var cy: float
	match String(i.def):
		"monitor_24": sz = Vector2(i.w - 0.016, 0.30); cy = i.h - 0.159   # = the glass of monitor_24.glb (furnish.py)
		"tv_65": sz = Vector2(i.w - 0.03, i.h - 0.03); cy = i.h / 2
		_: sz = Vector2(i.w - 0.08, i.h - 0.12); cy = i.h / 2 + 0.03
	var panel := MeshInstance3D.new()
	var q := QuadMesh.new(); q.size = sz; panel.mesh = q
	var m := StandardMaterial3D.new()
	var lit: bool = i.def != "whiteboard"
	m.albedo_color = Color(0.02, 0.025, 0.03) if lit else Color(1, 1, 1, 0)
	if not lit: m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.emission_enabled = lit; m.emission = Color(0.0, 0.0, 0.0); m.roughness = 0.15
	panel.material_override = m
	# on the glass itself: the monitor's box reaches past the screen (its stand base sits 5 cm further forward),
	# which left the live panel floating in front of the lit glass as a second screen
	var front: float = 0.0425 if i.def == "monitor_24" else box.end.z + 0.0015
	panel.position = Vector3(0, cy, front)
	node.add_child(panel)
	var t := Label3D.new()
	t.font_size = 40 if i.def == "monitor_24" else 64
	t.pixel_size = 0.00045 if i.def == "monitor_24" else 0.0011
	t.width = sz.x / t.pixel_size * 0.92; t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT; t.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	t.modulate = Color(0.9, 0.94, 1.0) if lit else Color(0.1, 0.2, 0.55)
	t.outline_size = 0; t.shaded = not lit
	t.position = Vector3(-sz.x / 2 * 0.92, sz.y / 2 * 0.88, 0.001)
	panel.add_child(t)
	var owner := String(i.id).get_slice(".", 1) if String(i.id).begins_with("monitor.") else ""
	screens[i.id] = {"label": t, "mat": m, "owner": owner, "def": String(i.def), "last": ""}

func _card_of(owner: String) -> Dictionary:
	for c in board_cards:
		if c.get("owner", "") == owner and c.get("status", "") in ["doing", "review", "todo", "blocked"]:
			return c
	return {}

func _update_screens(snap: Dictionary) -> void:
	var seated := {}
	for b in snap.bodies:
		if b.get("seat") != null: seated[b.id] = String(b.seat)
	var act := String(snap.get("activity", "work"))
	for id in screens:
		var sc: Dictionary = screens[id]
		var text := ""; var on := false
		if sc.def == "monitor_24":
			# a monitor wakes when its owner sits at the desk, and shows what they are actually working on
			on = seated.get(sc.owner, "") == "chair." + sc.owner
			if on:
				var c := _card_of(sc.owner)
				text = "%s\n\n%s" % [APP.get(sc.owner, "Workspace"), ("▶ " + String(c.title) + "  [" + String(c.status) + "]") if not c.is_empty() else "Inbox — no open card"]
		elif sc.def == "tv_65":
			on = true
			if act.begins_with("meeting:"):
				var lines := ["%s" % act.get_slice(":", 1).replace("_", " ").to_upper(), ""]
				for c in board_cards:
					if c.get("status", "") in ["doing", "review", "blocked"]: lines.append("• %s — %s (%s)" % [String(c.title).left(48), String(c.owner), String(c.status)])
				text = "\n".join(lines.slice(0, 12))
			else:
				text = "COMPOUND CHRONICLE\n\nGoal by 31 Jan 2027\nYouTube: monetization (YPP)\nInstagram: 5k+ followers · 5 × 1M views"
		else:
			continue
		if text == sc.last: continue
		sc.last = text
		sc.label.text = text
		sc.mat.emission = Color(0.1, 0.13, 0.2) if on else Color(0, 0, 0)
		sc.mat.emission_energy_multiplier = 0.6 if on else 0.0

func _write_whiteboard(e: Dictionary) -> void:
	# after a meeting the Manager's decisions stay written on the meeting-room whiteboard
	if not screens.has("meeting.whiteboard"): return
	var lines := ["%s — decisions" % String(e.get("meeting", "")).replace("_", " ")]
	for d in e.get("decisions", []): lines.append("– %s → %s" % [String(d.get("title", "")).left(70), String(d.get("owner", ""))] if d is Dictionary else "– " + String(d).left(80))
	screens["meeting.whiteboard"].label.text = "\n".join(lines.slice(0, 9))

func _pin_cards(cards: Array) -> void:
	var board: Node3D = get_node_or_null("reception_board")
	if board == null:
		return
	var old := board.get_node_or_null("cards")
	if old: old.queue_free()
	var root := Node3D.new(); root.name = "cards"; board.add_child(root)
	var w := 2.4; var h := 1.2; var cw := (w - 0.04) / 4.0
	var cols := [[], [], [], []]
	for c in cards:
		cols[int(CARD_COL.get(c.get("status", "todo"), 0))].append(c)
	cols[3] = cols[3].slice(max(0, cols[3].size() - 10))        # DONE shows the latest ten
	for ci in 4:
		var list: Array = cols[ci]
		var shown: int = min(list.size(), 10)
		for k in shown:
			var c: Dictionary = list[k]
			var x := -w / 2 + 0.02 + ci * cw + (0.145 if k % 2 == 1 else -0.135) + cw / 2 - 0.005
			var y := h - 0.27 - (k / 2) * 0.2
			var card := MeshInstance3D.new()
			var q := QuadMesh.new(); q.size = Vector2(0.26, 0.17); card.mesh = q
			var m := StandardMaterial3D.new(); m.albedo_color = CARD_TINT[ci]; m.roughness = 0.85
			card.material_override = m
			card.position = Vector3(x, y, 0.017)
			card.rotation.z = deg_to_rad((k * 37 % 5) - 2.0)          # pinned by hand, not machine-straight
			root.add_child(card)
			var t := Label3D.new()
			var who := String(c.get("owner", ""))
			t.text = "%s\n— %s" % [String(c.get("title", "")).left(70), who]
			t.font_size = 44; t.pixel_size = 0.00042; t.outline_size = 0
			t.modulate = Color(0.08, 0.08, 0.1)
			t.width = 560; t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			t.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT; t.vertical_alignment = VERTICAL_ALIGNMENT_TOP
			t.position = Vector3(-0.12, 0.075, 0.002); t.shaded = true
			card.add_child(t)
		if list.size() > shown:
			var more := Label3D.new(); more.text = "+%d" % (list.size() - shown)
			more.font_size = 64; more.pixel_size = 0.0005; more.modulate = Color(0.1, 0.1, 0.12)
			more.position = Vector3(-w / 2 + 0.02 + ci * cw + cw / 2, 0.08, 0.017); root.add_child(more)

const INTERP_DELAY := 0.1   # seconds bodies are drawn behind the newest snapshot (one 10 Hz interval)

# position and facing at render time t, between the two buffered snapshots around it
func _interp(p: Dictionary, t: float) -> Dictionary:
	var h: Array = p.get("hist", [])
	if h.is_empty():
		return {"pos": p.pos, "yaw": p.yaw}
	if h.size() == 1 or t <= h[0].t:
		return {"pos": h[0].pos, "yaw": h[0].yaw}
	for i in range(h.size() - 1, 0, -1):
		var a: Dictionary = h[i - 1]; var b: Dictionary = h[i]
		if t >= a.t:
			var k: float = clamp((t - a.t) / max(b.t - a.t, 0.001), 0.0, 1.0)
			# a big step is a teleport (arrival, seat snap): no slide across the room
			if (b.pos as Vector3).distance_to(a.pos) > 2.0: k = 1.0
			return {"pos": (a.pos as Vector3).lerp(b.pos, k), "yaw": lerp_angle(a.yaw, b.yaw, k)}
	return {"pos": h[-1].pos, "yaw": h[-1].yaw}


func _on_payday(e: Dictionary) -> void:
	_log_line("🏦 Safe / Viktor", "🎉 Bugun oylik kuni! Hamma xodimlarga oylik va bonuslar topshirildi!")
	for id in people:
		var p: Dictionary = people[id]
		if p.state != "offsite":
			_play(p, p.state, "clap")

func _speech(e: Dictionary) -> void:
	if not people.has(e.from):
		return
	var p: Dictionary = people[e.from]
	var who: String = NAMES.get(e.from, e.from)
	# bubbles stay readable: at most the two latest speakers, words cut short (the full line is in the log)
	var words: String = e.text if e.text.length() <= 110 else e.text.substr(0, 107).strip_edges() + "…"
	p.bubble.text = "%s: %s" % [who, words]
	p.bubble.visible = true
	p.bubble_until = Time.get_ticks_msec() / 1000.0 + clamp(words.length() * 0.07, 3.0, 8.0)
	p.spoke_at = Time.get_ticks_msec()
	var talking: Array = people.values().filter(func(q): return q.bubble_until > 0)
	talking.sort_custom(func(x, y): return x.get("spoke_at", 0) > y.get("spoke_at", 0))
	for i in range(2, talking.size()):
		talking[i].bubble.visible = false; talking[i].bubble_until = 0.0
	_log_line(who, e.text)

# ---------------------------------------------------------------- conversation log (bottom left, up to 1/4 of the screen)
const NAMES := {"boss": "Boss", "manager": "Daniel", "guard": "Viktor", "ig_res": "Mia", "yt_res": "Jun", "facts": "Elena",
	"writer": "Leo", "shorts": "Aziza", "longform": "Tom", "qa": "Sara", "publisher": "Rustam", "cleaner": "Min-ji"}
const LOG_HOLD := 10.0   # seconds a line stays fully visible
const LOG_FADE := 3.0    # then fades away over this long
var log_box: VBoxContainer

func _log_line(who: String, text: String) -> void:
	var l := Label.new()
	l.text = "%s: %s" % [who, text]
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", 17)
	l.add_theme_color_override("font_color", Color(1, 1, 1))
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	l.add_theme_constant_override("outline_size", 6)
	l.set_meta("born", Time.get_ticks_msec() / 1000.0)
	log_box.add_child(l)

func _update_log() -> void:
	var vp := get_viewport().get_visible_rect().size
	log_box.size.x = vp.x * 0.25
	var now := Time.get_ticks_msec() / 1000.0
	for l in log_box.get_children():
		var age: float = now - float(l.get_meta("born"))
		l.modulate.a = clamp(1.0 - (age - LOG_HOLD) / LOG_FADE, 0.0, 1.0)
		if age > LOG_HOLD + LOG_FADE: l.queue_free()
	# never taller than a quarter of the screen: the oldest lines go first
	while log_box.get_child_count() > 1 and log_box.get_combined_minimum_size().y > vp.y * 0.25:
		var old := log_box.get_child(0); log_box.remove_child(old); old.queue_free()
	log_box.position = Vector2(16, vp.y - 72 - log_box.get_combined_minimum_size().y)

func _process(dt: float) -> void:
	ws.poll()
	if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		while ws.get_available_packet_count() > 0:
			var m = JSON.parse_string(ws.get_packet().get_string_from_utf8())
			if m == null: continue
			if m.t == "snap":
				_apply_snap(m); _update_screens(m)
				if boss_auto:
					boss_auto = false
					if not (people.has("boss") and people["boss"].state != "offsite"): _send_boss({"verb": "arrive"})
			elif m.t == "event" and m.e.get("type", "") == "speech": _speech(m.e)
			elif m.t == "event" and m.e.get("type", "") == "payday": _on_payday(m.e)
			elif m.t == "board": _pin_cards(m.cards); board_cards = m.cards
			elif m.t == "event" and m.e.get("type", "") == "meeting_done": _write_whiteboard(m.e)
	elif ws.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		ws.connect_to_url(url)
	_boss_input(dt)
	var now := Time.get_ticks_msec() / 1000.0
	for id in people:
		var p: Dictionary = people[id]
		var n: Node3D = p.node
		var before := n.position
		var at: Dictionary = _interp(p, now - INTERP_DELAY)
		if id == "boss" and p.state != "offsite":
			# the Boss is never drawn from the 100 ms buffer: he follows the newest server position (nudged 0.1 s
			# ahead along his own steering) with a fast smooth lerp, so keys answer at once and nothing fights the
			# server (a local copy that ran ahead and snapped back made him jerk at walls and people)
			# his own body walks at his steering speed every frame (smooth for the eye camera); a soft spring pulls it
			# toward the server's position (newest snapshot + steering x its age), and it never gets more than 0.35 m
			# ahead of the server along the walk (a wall or a person stops him without a jump back)
			var h: Array = p.get("hist", [])
			var age: float = clamp(now - (h[-1].t if not h.is_empty() else now), 0.0, 0.15)
			# the server's real velocity (it accelerates and caps below the requested speed): walking at the requested
			# speed ran ahead and the spring pulled back — that was the shaking
			var v3 := Vector3.ZERO
			if h.size() >= 2 and boss_v.length() > 0.01:
				# over the last few snapshots (~0.3 s): two equal positions in a row must not read as a stop
				var first: Dictionary = h[max(0, h.size() - 4)]
				v3 = ((h[-1].pos as Vector3) - (first.pos as Vector3)) / max(h[-1].t - first.t, 0.05)
			var server: Vector3 = p.pos + v3 * age
			var local: Vector3 = p.get("local", n.position)
			local += v3 * dt
			local = local.lerp(server, clamp(dt * 3.0, 0, 1))
			if local.distance_to(server) > 2.0: local = server   # teleport (arrival, seat): no slide across the room
			p.local = local
			var face: float = atan2(boss_v.x, boss_v.y) if boss_v.length() > 0.01 else p.yaw
			at = {"pos": local, "yaw": lerp_angle(n.rotation.y, face, clamp(dt * 8.0, 0, 1))}
		n.position = at.pos
		var spd: float = Vector2(n.position.x - before.x, n.position.z - before.z).length() / max(dt, 0.001)
		# "walking" but not getting anywhere (blocked in a crowd, no path): _play shows them standing instead of
		# striding on the spot
		p.still = p.get("still", 0.0) + dt if spd < 0.08 else 0.0
		# stride matches the real ground speed (clip authored at ~1.3 m/s): feet do not skate
		if p.anim and p.get("walk_clip", "") != "" and (p.anim as AnimationPlayer).current_animation == p.walk_clip:
			(p.anim as AnimationPlayer).speed_scale = clamp(spd / 1.3, 0.6, 1.5)
		elif p.anim:
			(p.anim as AnimationPlayer).speed_scale = 1.0
		n.rotation.y = at.yaw
		if p.bubble_until > 0 and now > p.bubble_until:
			p.bubble.visible = false
			p.bubble_until = 0.0
		# names only for whoever is speaking or close by: twelve labels at once covered the whole view
		p.tag.visible = p.bubble_until == 0.0 and cam.global_position.distance_to(n.position) < 5.0   # the bubble carries the name while they speak
	_roll_chairs(dt)
	_update_log()
	for id in doors:
		var want := 1.35 if door_open.get(id, false) else 0.0
		for d in doors[id]:
			d.pv.rotation.y = lerp(d.pv.rotation.y, d.side * want, clamp(dt * 6.0, 0, 1))
	if follow_id != "" and people.has(follow_id):
		orbit.target = orbit.target.lerp(people[follow_id].node.position, clamp(dt * 3.0, 0, 1))
	_update_camera()
	hud.text = "Compound Chronicle HQ   ·   %s   ·   %d people   ·   drag: rotate · wheel: zoom · 1-9: follow · 0: free" % ["live" if ws.get_ready_state() == WebSocketPeer.STATE_OPEN else "connecting…", people.size()] + "   ·   V: ko'z/maket · F: Boss kirish · WASD yurish · Enter gapirish"

# ---------------------------------------------------------------- camera + hud
func _camera() -> void:
	cam = Camera3D.new()
	cam.fov = 45
	add_child(cam)
	_update_camera()

func _update_camera() -> void:
	if ceiling_shown != eye_mode:
		ceiling_shown = eye_mode
		for c in ceiling_parts: c.visible = eye_mode
	if eye_mode:
		if not eye_locked and people.has("boss") and people["boss"].state != "offsite":
			eye.pos = people["boss"].node.position + Vector3(0, 1.82, 0)   # the Boss is 2.00 m tall
		cam.position = eye.pos
		cam.rotation = Vector3(eye.pitch, eye.yaw, 0)
		cam.fov = 62
		return
	cam.fov = 45
	var dir := Vector3(cos(orbit.pitch) * sin(orbit.yaw), -sin(orbit.pitch), cos(orbit.pitch) * cos(orbit.yaw))
	cam.position = orbit.target + dir * orbit.dist
	cam.look_at(orbit.target, Vector3.UP)

# ---------------------------------------------------------------- ceiling, lights, finishes, baked GI
func _ceiling() -> void:
	var w: float = L.room.w; var d: float = L.room.d; var h: float = L.room.h
	var ceil_m := _mat("ceiling", Color(0.96, 0.96, 0.95), 0.9)
	ceiling_parts.append(_box(Vector3(w + 0.4, 0.05, d + 0.4), Vector3(w / 2, h + 0.025, d / 2), 0, ceil_m))
	# recessed 600x600 LED panels on a 2.4 m grid with real (baked) light sources
	var panel := StandardMaterial3D.new()
	panel.albedo_color = Color(1, 1, 1); panel.emission_enabled = true; panel.emission = Color(1.0, 0.97, 0.92); panel.emission_energy_multiplier = 3.0
	var x := 1.2
	while x < w:
		var z := 1.2
		while z < d:
			ceiling_parts.append(_box(Vector3(0.6, 0.01, 0.6), Vector3(x, h - 0.006, z), 0, panel))
			var l := OmniLight3D.new()
			l.position = Vector3(x, h - 0.15, z); l.omni_range = 5.5; l.light_energy = 0.85; l.light_color = Color(1.0, 0.96, 0.91)
			l.omni_attenuation = 1.2
			l.light_bake_mode = Light3D.BAKE_STATIC; l.shadow_enabled = false
			add_child(l)
			z += 2.4
		x += 2.4
	# baseboards along every solid wall piece that touches the floor
	var base_m := _mat("metal_black", Color(0.1, 0.1, 0.11), 0.4, 0.3)
	for p in L.walls:
		if p.glass or p.y0 > 0.01: continue
		_box(Vector3(p.hx * 2 + 0.002, 0.08, p.hz * 2 + 0.024), Vector3(p.cx, 0.04, p.cz), p.yaw, base_m)

func _lightmap() -> void:
	# baked global illumination: open main.tscn in the editor, select LightmapGI, "Bake Lightmaps" (RTX: minutes)
	var lm := LightmapGI.new()
	lm.name = "LightmapGI"
	lm.quality = LightmapGI.BAKE_QUALITY_HIGH
	lm.bounces = 4
	lm.directional = true
	add_child(lm)
	var cam_attr := CameraAttributesPractical.new()
	cam_attr.auto_exposure_enabled = true
	cam_attr.dof_blur_far_enabled = true
	cam_attr.dof_blur_far_distance = 14.0
	cam_attr.dof_blur_amount = 0.05
	if has_node("WorldEnvironment"):
		(get_node("WorldEnvironment") as WorldEnvironment).camera_attributes = cam_attr

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventKey and e.pressed and e.keycode == KEY_V and not chat.has_focus():
		eye_mode = not eye_mode
		return
	if eye_mode and e is InputEventMouseMotion and (e.button_mask & MOUSE_BUTTON_MASK_LEFT):
		eye.yaw -= e.relative.x * 0.004
		eye.pitch = clamp(eye.pitch - e.relative.y * 0.004, -1.2, 1.0)
		return
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
	log_box = VBoxContainer.new()
	log_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	log_box.add_theme_constant_override("separation", 4)
	layer.add_child(log_box)
