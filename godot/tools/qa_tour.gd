extends SceneTree
# QA tour: walk the office at eye level and photograph every zone and every person present.
#   godot --path godot -s res://tools/qa_tour.gd -- --server=ws://127.0.0.1:8765 --out=<dir>
# zone_<id>.png from inside each zone; person_<id>.png from 2.2 m in front of each visible person.

const EYE := 1.68
var main: Node
var out_dir := "user://"
var ZONES := {   # id: [from (x, z), look at (x, y, z)]
	"work": [Vector2(16.4, 16.2), Vector3(6.0, 1.0, 7.0)],
	"kitchen": [Vector2(10.8, 4.6), Vector3(5.5, 1.0, 0.8)],
	"meeting": [Vector2(17.4, 5.4), Vector3(12.5, 0.9, 1.0)],
	"manager": [Vector2(18.6, 6.0), Vector3(22.5, 1.0, 1.0)],
	"reception": [Vector2(4.0, 16.0), Vector3(1.5, 1.0, 6.0)],
	"wc": [Vector2(4.0, 3.6), Vector3(0.8, 1.0, 0.8)],
	"print": [Vector2(17.6, 9.4), Vector3(23.6, 1.0, 7.0)],
	"lounge": [Vector2(17.6, 16.4), Vector3(23.0, 0.8, 11.0)],
	"balcony": [Vector2(9.5, 16.4), Vector3(9.5, 1.0, 19.0)],
}

func _init() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="): out_dir = a.substr(6)
	root.size = Vector2i(1280, 720)
	main = load("res://main.tscn").instantiate()
	root.add_child.call_deferred(main)
	_run.call_deferred()

func _wait(s: float) -> void:
	await create_timer(s).timeout

func _look(from: Vector3, at: Vector3) -> void:
	main.eye_mode = true
	main.eye_locked = true
	main.follow_id = ""
	var d := at - from
	main.eye.pos = from
	main.eye.yaw = atan2(-d.x, -d.z)
	main.eye.pitch = atan2(d.y, Vector2(d.x, d.z).length())

func _shot(name: String) -> void:
	await _wait(1.0)
	root.get_texture().get_image().save_png(out_dir.path_join(name + ".png"))
	print("SHOT ", name)

func _run() -> void:
	for i in 20:   # wait for the stream
		await _wait(0.5)
		if main.people.size() > 0: break
	await _wait(2.0)
	for id in ZONES:
		var s: Array = ZONES[id]
		_look(Vector3(s[0].x, EYE, s[0].y), s[1])
		await _shot("zone_" + id)
	for id in main.people:
		var p: Dictionary = main.people[id]
		if not p.node.visible or id == "boss": continue
		var n: Node3D = p.node
		var fwd := Vector3(sin(n.rotation.y), 0, cos(n.rotation.y))
		var head := n.position + Vector3(0, 1.1 if p.state == "sitting" else 1.45, 0)
		_look(Vector3(n.position.x, EYE, n.position.z) + fwd * 2.2 + fwd.cross(Vector3.UP) * 0.5, head)
		await _shot("person_%s_%s" % [id, p.state])
	print("DONE")
	quit()
