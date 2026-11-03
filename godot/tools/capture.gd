extends SceneTree
# Screenshots without touching the game: loads main.tscn, waits for the live stream, saves an overview and a close-up.
#   godot --path godot -s res://tools/capture.gd -- <out_dir> [person_id]
# (windowed, not --headless: it needs a real renderer)

var out_dir := "user://"
var who := ""

func _init() -> void:
	var a := OS.get_cmdline_user_args()
	if a.size() > 0: out_dir = a[0]
	if a.size() > 1: who = a[1]
	root.size = Vector2i(1920, 1080)
	var main: Node = load("res://main.tscn").instantiate()
	root.add_child.call_deferred(main)
	_run.call_deferred(main)

func _wait(sec: float) -> void:
	await create_timer(sec).timeout

func _shot(name: String) -> void:
	await process_frame
	await process_frame
	var img := root.get_texture().get_image()
	var path := out_dir.path_join(name)
	img.save_png(path)
	print("SHOT ", path)

func _run(main: Node) -> void:
	# optional 3rd arg: stream URL (e.g. ws://<wsl ip>:8765 when Windows localhost is not forwarded to WSL)
	var a := OS.get_cmdline_user_args()
	if a.size() > 2:
		await process_frame
		main.ws = WebSocketPeer.new()
		main.ws.connect_to_url(a[2])
	# give the stream time to deliver bodies and the GI (SDFGI) time to settle
	for i in 30:
		await _wait(1.0)
		if main.people.size() > 0 and i > 12: break
	print("people ", main.people.keys())
	await _shot("office_overview.png")
	var id := who
	if id == "" or not main.people.has(id) or not main.people[id].node.visible:   # offsite people are hidden
		id = ""
		for k in main.people.keys():
			if main.people[k].node.visible: id = k; break
	if id == "" and FileAccess.file_exists("res://assets/people/manager.glb"):
		# nobody is in (outside 09:00-21:00 Seoul): stop the stream and stand the manager by a desk for the close-up
		main.ws.close()
		main.ws = WebSocketPeer.new()          # never connects, so no snapshot hides the body again
		id = "manager"
		var p: Dictionary = main.people[id] if main.people.has(id) else main._person(id)
		main.people[id] = p
		p.pos = Vector3(7.25, 0.0, 8.5)        # at the side of desk.shorts, clear of the monitor
		p.yaw = 0.5                            # turned towards the close-up camera below
		p.node.position = p.pos
		p.node.visible = true
		p.state = "standing"
		main._play(p, "standing", "idle")
		print("offline close-up (office closed): ", id)
	if id != "":
		# frame the upper body: aim at chest height instead of following the feet
		main.follow_id = ""
		main.orbit.target = main.people[id].node.position + Vector3(0, 1.25, 0)
		main.orbit.yaw = main.people[id].yaw
		main.orbit.dist = 2.4
		main.orbit.pitch = -0.12
		await _wait(4.0)
		await _shot("office_closeup_%s.png" % id)
	quit()
