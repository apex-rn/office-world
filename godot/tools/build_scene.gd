extends SceneTree
# Save the office that office.gd builds at runtime as a real scene, ready for LightmapGI baking:
#   godot --headless --path godot -s res://tools/build_scene.gd
# -> res://office_built.tscn : every built node owned by the scene root, primitive meshes turned into
#    ArrayMeshes with a UV2 lightmap unwrap, static GI mode. GLB furniture stays as scene instances
#    (their import uses "Static Lightmaps", which generates UV2 at import).
# Then: open office_built.tscn in the editor, select LightmapGI, "Bake Lightmaps" (LightmapGI.bake is editor-only).

const OUT := "res://office_built.tscn"
const TEXEL := 0.08   # metres per lightmap texel for walls, floors and boxes

var unwrapped := {}

func _init() -> void:
	_run.call_deferred()

func _run() -> void:
	var main: Node3D = load("res://main.tscn").instantiate()
	root.add_child(main)
	await process_frame
	await process_frame
	main.set_process(false)
	var built := Node3D.new()
	built.name = "OfficeBuilt"
	for c in main.get_children():
		if c is Camera3D or c is CanvasLayer or main.people.has(String(c.name)):
			continue
		main.remove_child(c)
		built.add_child(c)
	var stats := {"nodes": 0, "meshes": 0, "instances": 0}
	for c in built.get_children():
		_own(c, built, stats)
	var packed := PackedScene.new()
	var err := packed.pack(built)
	if err == OK:
		err = ResourceSaver.save(packed, OUT)
	print("BUILT ", OUT, " err=", err, " ", stats)
	quit()

func _own(n: Node, owner_root: Node, stats: Dictionary) -> void:
	n.owner = owner_root
	stats.nodes += 1
	if n.scene_file_path != "":
		stats.instances += 1   # a GLB instance: keep the link, do not own its insides
		return
	if n is MeshInstance3D:
		var mi := n as MeshInstance3D
		mi.gi_mode = GeometryInstance3D.GI_MODE_STATIC
		if mi.mesh is PrimitiveMesh or (mi.mesh is ArrayMesh and not unwrapped.has(mi.mesh)):
			mi.mesh = _unwrap(mi)
			stats.meshes += 1
	for c in n.get_children():
		_own(c, owner_root, stats)

func _unwrap(mi: MeshInstance3D) -> ArrayMesh:
	var src: Mesh = mi.mesh
	var am := ArrayMesh.new()
	if src is PrimitiveMesh:
		am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, (src as PrimitiveMesh).get_mesh_arrays())
		var m: Material = (src as PrimitiveMesh).material
		if m: am.surface_set_material(0, m)
	else:
		am = src
	if am.lightmap_unwrap(mi.global_transform, TEXEL) != OK:
		push_warning("unwrap failed: %s" % mi.get_path())
	unwrapped[am] = true
	return am
