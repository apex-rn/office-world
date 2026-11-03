"""QA still of several GLBs arranged as in the office, three-quarter eye-level view.

blender -b -P preview_set.py -- <hdri> <out.png> <file.glb>:<x>:<y>:<z>:<rot_deg> ...   (Blender axes, front = -Y)
"""
import bpy, sys, math
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
HDR, OUT, items = a[0], a[1], a[2:]
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
pts = []
for it in items:
    f, x, y, z, r = it.rsplit(':', 4)
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=f)
    for o in [o for o in bpy.data.objects if o not in before and o.parent is None]:
        o.location += Vector((float(x), float(y), float(z))); o.rotation_euler.z += math.radians(float(r))
    pts.append(Vector((float(x), float(y), float(z))))
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
e = w.node_tree.nodes.new('ShaderNodeTexEnvironment'); e.image = bpy.data.images.load(HDR)
w.node_tree.links.new(e.outputs[0], w.node_tree.nodes['Background'].inputs[0])
bpy.ops.mesh.primitive_plane_add(size=30)
fl = bpy.data.materials.new('floor'); fl.use_nodes = True; fl.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.45, 0.32, 0.2, 1)
bpy.context.object.data.materials.append(fl)
c = sum(pts, Vector()) / len(pts) + Vector((0, 0, 0.55))
span = max([(p - c).length for p in pts] + [1.0])
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 35; cam.location = c + Vector((-1.6, -2.4, 1.0)) * (0.8 + span * 0.5)
d = c - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.render.resolution_x, sc.render.resolution_y = 1500, 900; sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
