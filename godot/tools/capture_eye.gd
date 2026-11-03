extends SceneTree
# Eye-level demo screenshots (1.68 m, where a person stands), taken from fixed spots and when moments happen:
#   godot --path godot -s res://tools/capture_eye.gd -- --server=ws://HOST:8765 --out=<dir> [--minutes=10] [--fast]
# --fast renders 3D at 60 % resolution (a slow GPU otherwise stretches a 10-minute run to 40)
# Fixed: corridor, desk_row, meeting_door, kitchen. Moments: bow, talk (speaker + listener), meeting (4+ inside).

const EYE := 1.68
var main: Node
var out_dir := "user://"
var minutes := 10.0
var fast := false
var done := {}
var SPOTS := {   # name: [from (x, z), look at (x, y, z)]
	"corridor": [Vector2(1.6, 13.9), Vector3(16.0, 1.3, 12.0)],
	"desk_row": [Vector2(16.6, 15.6), Vector3(6.0, 1.0, 8.0)],
	"meeting_door": [Vector2(14.75, 7.4), Vector3(14.75, 1.1, 2.0)],
	"kitchen": [Vector2(10.8, 6.4), Vector3(6.0, 1.0, 1.5)],
}

func _init() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="): out_dir = a.substr(6)
		elif a.begins_with("--minutes="): minutes = float(a.substr(10))
		elif a == "--fast": fast = true
	root.size = Vector2i(1920, 1080)
	if fast: root.scaling_3d_scale = 0.6
	main = load("res://main.tscn").instantiate()
	root.add_child.call_deferred(main)
	_run.call_deferred()

func _wait(sec: float) -> void:
	await create_timer(sec).timeout

func _look(from: Vector3, at: Vector3) -> void:
	main.eye_mode = true
	main.eye_locked = true   # otherwise the eye rides with the Boss and every shot is taken from the Boss's spot
	var d := at - from
	main.eye.pos = from
	main.eye.yaw = atan2(-d.x, -d.z)
	main.eye.pitch = atan2(d.y, Vector2(d.x, d.z).length())

func _shot(name: String) -> void:
	await _wait(1.2)   # let auto exposure and depth of field settle
	var img := root.get_texture().get_image()
	img.resize(1600, 900, Image.INTERPOLATE_LANCZOS)   # each PNG stays under ~3 MB
	var path := out_dir.path_join(name + ".png")
	img.save_png(path)
	done[name] = true
	print("SHOT ", path, " t=", Time.get_ticks_msec() / 1000, " fps=", Engine.get_frames_per_second())

func _visible() -> Array:
	return main.people.values().filter(func(p): return p.node.visible)

func _in_zone(v: Vector3, id: String) -> bool:
	for z in main.L.zones:
		if z.id == id:
			var xs: Array = z.poly.map(func(q): return q[0]); var zs: Array = z.poly.map(func(q): return q[1])
			return v.x >= xs.min() and v.x <= xs.max() and v.z >= zs.min() and v.z <= zs.max()
	return false

# stand 2.4 m in front of a person (their facing) and look at their face
func _face(p: Dictionary, dist := 2.4) -> void:
	var n: Node3D = p.node
	var fwd := Vector3(sin(n.rotation.y), 0, cos(n.rotation.y))
	_look(Vector3(n.position.x, EYE, n.position.z) + fwd * dist + fwd.cross(Vector3.UP) * 0.6, n.position + Vector3(0, 1.45, 0))

func _run() -> void:
	await _wait(1.0)
	var t0 := Time.get_ticks_msec() / 1000.0
	while Time.get_ticks_msec() / 1000.0 - t0 < minutes * 60.0 and done.size() < 7:
		await _wait(0.25)
		var t := Time.get_ticks_msec() / 1000.0 - t0
		var vis := _visible()
		if not done.has("bow"):
			for p in vis:
				if p.get("bowing", false):
					_face(p); await _wait(0.15); await _shot("bow"); break
		if not done.has("talk"):
			var now := Time.get_ticks_msec() / 1000.0
			for p in vis:
				if p.bubble_until > now:
					var near = null
					for q in vis:
						if q != p and q.node.position.distance_to(p.node.position) < 3.0: near = q; break
					if near == null: continue
					var mid: Vector3 = (p.node.position + near.node.position) / 2.0
					var side: Vector3 = (near.node.position - p.node.position).cross(Vector3.UP).normalized()
					_look(Vector3(mid.x, EYE, mid.z) + side * 2.8, mid + Vector3(0, 1.4, 0))
					await _shot("talk"); break
		if not done.has("meeting"):
			if vis.filter(func(p): return _in_zone(p.node.position, "meeting")).size() >= 4:
				var s: Array = SPOTS["meeting_door"]
				_look(Vector3(s[0].x, EYE, s[0].y), s[1]); await _shot("meeting")
		# the fixed views once people are in (or near the end, whoever is there)
		if vis.size() >= 4 or t > minutes * 60.0 - 40.0:
			for name in SPOTS:
				if not done.has(name) and (name != "meeting_door" or t > 200.0 or t > minutes * 60.0 - 40.0):
					var s: Array = SPOTS[name]
					_look(Vector3(s[0].x, EYE, s[0].y), s[1]); await _shot(name); break
	print("DONE ", done.keys())
	quit()
