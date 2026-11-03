# blender -b -P preview_model.py -- <model.glb> <hdri> <out.png> : three-quarter front + side view of one model
import bpy, sys, math
G, HDR, OUT = sys.argv[sys.argv.index('--') + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
for dx, rz in ((-0.45, 0.6), (0.45, math.pi / 2)):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=G)
    for o in [o for o in bpy.data.objects if o not in before and o.parent is None]:
        o.location.x += dx; o.rotation_euler.z += rz
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
e = w.node_tree.nodes.new('ShaderNodeTexEnvironment'); e.image = bpy.data.images.load(HDR)
w.node_tree.links.new(e.outputs[0], w.node_tree.nodes['Background'].inputs[0])
bpy.ops.mesh.primitive_plane_add(size=20)
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50; cam.location = (0, -3.4, 0.9); cam.rotation_euler = (math.radians(84), 0, 0)
sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.render.resolution_x, sc.render.resolution_y = 1400, 800; sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
