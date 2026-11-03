extends SceneTree
# Demo screenshots from a live run, taken when the moment happens (no changes to the game):
#   godot --path godot -s res://tools/capture_demo.gd -- --server=ws://HOST:8765 --out=<dir> [--minutes=10]
# Saves: overview.png, bow.png (someone bowing), talk.png (a speaker + listener with the speech label),
# meeting.png (4+ people in the meeting room). Quits when all four exist or the time is up.

var main: Node
var out_dir := "user://"
var minutes := 10.0
var home := {}
var done := {}

func _init() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="): out_dir = a.substr(6)
		elif a.begins_with("--minutes="): minutes = float(a.substr(10))
	root.size = Vector2i(1920, 1080)
	main = load("res://main.tscn").instantiate()
	root.add_child.call_deferred(main)
	_run.call_deferred()

func _wait(sec: float) -> void:
	await create_timer(sec).timeout

func _shot(name: String) -> void:
	await process_frame
	await process_frame
	var path := out_dir.path_join(name + ".png")
	var img := root.get_texture().get_image()
	img.resize(1600, 900, Image.INTERPOLATE_LANCZOS)   # keeps each PNG under ~3 MB
	img.save_png(path)
	done[name] = true
	print("SHOT ", path, " t=", Time.get_ticks_msec() / 1000)

func _aim(target: Vector3, yaw: float, dist: float, pitch: float) -> void:
	main.follow_id = ""
	main.orbit.target = target
	main.orbit.yaw = yaw
	main.orbit.dist = dist
	main.orbit.pitch = pitch

func _restore() -> void:
	for k in home: main.orbit[k] = home[k]

func _visible() -> Array:
	return main.people.values().filter(func(p): return p.node.visible)

func _meeting_zone() -> Array:
	for z in main.L.zones:
		if z.id == "meeting": return z.poly
	return []

func _in_poly(v: Vector3, poly: Array) -> bool:
	var xs := poly.map(func(q): return q[0]); var zs := poly.map(func(q): return q[1])
	return v.x >= xs.min() and v.x <= xs.max() and v.z >= zs.min() and v.z <= zs.max()

func _run() -> void:
	await _wait(1.0)
	home = main.orbit.duplicate()
	var t0 := Time.get_ticks_msec() / 1000.0
	var poly := _meeting_zone()
	while Time.get_ticks_msec() / 1000.0 - t0 < minutes * 60.0 and done.size() < 4:
		await _wait(0.25)
		var t := Time.get_ticks_msec() / 1000.0 - t0
		var vis := _visible()
		if not done.has("overview") and t > 45.0 and vis.size() >= 3:
			_restore(); await _wait(0.5); await _shot("overview")
		if not done.has("bow"):
			for p in vis:
				if p.get("bowing", false):
					_aim(p.node.position + Vector3(0, 1.0, 0), p.node.rotation.y + 0.5, 3.0, -0.12)
					await _wait(0.45); await _shot("bow"); _restore(); break
		if not done.has("talk"):
			var now := Time.get_ticks_msec() / 1000.0
			for p in vis:
				if p.bubble_until > now:
					var near = null
					for q in vis:
						if q != p and q.node.position.distance_to(p.node.position) < 3.5: near = q; break
					if near == null: continue
					var mid: Vector3 = (p.node.position + near.node.position) / 2.0
					var side: Vector3 = (near.node.position - p.node.position).cross(Vector3.UP).normalized()
					_aim(mid + Vector3(0, 1.1, 0), atan2(side.x, side.z), 4.2, -0.18)
					await _wait(0.4); await _shot("talk"); _restore(); break
		if not done.has("meeting") and poly.size() > 0:
			var inside := vis.filter(func(p): return _in_poly(p.node.position, poly))
			if inside.size() >= 4:
				var c := Vector3((poly[0][0] + poly[2][0]) / 2.0, 0.8, (poly[0][1] + poly[2][1]) / 2.0)
				_aim(c, -0.7, 9.5, -0.62)
				await _wait(0.6); await _shot("meeting"); _restore()
	print("DONE ", done.keys())
	quit()
