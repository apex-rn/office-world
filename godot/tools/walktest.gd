extends SceneTree
func _init():
	var main: Node = load("res://main.tscn").instantiate()
	root.add_child.call_deferred(main)
	for i in 60:
		await create_timer(0.5).timeout
		if main.people.has("boss") and main.people["boss"].state != "offsite": break
	await create_timer(1.5).timeout
	var n: Node3D = main.people["boss"].node
	var ev := InputEventKey.new(); ev.keycode = KEY_W; ev.physical_keycode = KEY_W; ev.pressed = true
	Input.parse_input_event(ev)
	var pts: Array = []; var t0 := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t0 < 3000:
		await process_frame
		pts.append([Time.get_ticks_msec(), n.position])
	var back := 0; var steps: Array = []; var dir: Vector3 = (pts[-1][1] - pts[0][1]).normalized()
	for i in range(1, pts.size()):
		var d: Vector3 = pts[i][1] - pts[i-1][1]; var dt: float = (pts[i][0] - pts[i-1][0]) / 1000.0
		if d.dot(dir) < -0.01: back += 1
		if dt > 0 and pts[i][0] - t0 > 600: steps.append(d.length() / dt)
	steps.sort()
	var dist: float = (pts[-1][1] - pts[0][1]).length()
	print("frames ", pts.size(), " dist ", snapped(dist, 0.01), " backward ", back, "  cruise speed p10 ", snapped(steps[steps.size() / 10], 0.01), " median ", snapped(steps[steps.size() / 2], 0.01), " p90 ", snapped(steps[steps.size() * 9 / 10], 0.01))
	quit()
