extends SceneTree
# Seat diagnostics: sit a person on a real chair with the seated clip and measure where the pelvis lands.
#   godot --path godot -s res://tools/seat_check.gd -- --out=<dir> [--who=manager] [--chair=chair.shorts]

var out_dir := "user://"
var who := "manager"
var chair_id := "chair.shorts"
var stand := false

func _init() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="): out_dir = a.substr(6)
		elif a.begins_with("--who="): who = a.substr(6)
		elif a.begins_with("--chair="): chair_id = a.substr(8)
		elif a == "--stand": stand = true
	root.size = Vector2i(1600, 900)
	var main: Node = load("res://main.tscn").instantiate()
	root.add_child.call_deferred(main)
	_run.call_deferred(main)

func _run(main: Node) -> void:
	await create_timer(1.0).timeout
	main.ws = WebSocketPeer.new()        # offline: no stream moves anyone
	var ch: Dictionary = {}
	for i in main.L.instances:
		if i.id == chair_id: ch = i
	var p: Dictionary = main._person(who)
	main.people[who] = p
	p.pos = Vector3(ch.x, 0, ch.z); p.yaw = ch.yaw; p.state = "standing" if stand else "sitting"
	p.node.position = p.pos; p.node.rotation.y = p.yaw; p.node.visible = true
	main._play(p, p.state, "idle" if stand else "sit_idle")
	await create_timer(1.5).timeout
	var sk: Skeleton3D = p.node.find_child("Skeleton3D", true, false)
	var bi := sk.find_bone("Bip01 Pelvis")
	var pelvis: Vector3 = (sk.global_transform * sk.get_bone_global_pose(bi)).origin
	var fwd := Vector3(sin(ch.yaw), 0, cos(ch.yaw))
	var off := pelvis - Vector3(ch.x, 0, ch.z)
	print("SEAT chair=", chair_id, " yaw=", ch.yaw, " seat_h=", ch.seat, " anim=", p.anim.current_animation)
	print("SEAT pelvis height=%.3f forward(chair +Z)=%.3f side=%.3f" % [pelvis.y, off.dot(fwd), off.dot(fwd.cross(Vector3.UP))])
	for view in [["side", ch.yaw + PI / 2], ["front", ch.yaw]]:
		main.follow_id = ""
		main.orbit.target = Vector3(ch.x, 0.7, ch.z); main.orbit.yaw = view[1]; main.orbit.dist = 2.6; main.orbit.pitch = -0.1
		await create_timer(0.5).timeout
		await process_frame
		root.get_texture().get_image().save_png(out_dir.path_join("seat_%s_%s%s.png" % [who, view[0], "_stand" if stand else ""]))
		print("SHOT ", view[0])
	quit()
