# blender -b -P preview_assets.py -- <assets_dir> <out.png> : import every GLB, check it, lay them out, render one still under the interior HDRI
import bpy, sys, os, glob, math
A, OUT = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; x = 0.0
for f in sorted(glob.glob(os.path.join(A, 'models', '*.glb'))):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=f); new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']; imgs = {i.name for o in meshes for s in o.material_slots if s.material and s.material.use_nodes for n in s.material.node_tree.nodes if n.type == 'TEX_IMAGE' and (i := n.image)}
    xs = [(o.matrix_world @ __import__('mathutils').Vector(c)).x for o in meshes for c in o.bound_box] or [0]
    w = max(xs) - min(xs); roots = [o for o in new if o.parent is None]
    for r in roots: r.location.x += x - min(xs)
    print(f'CHECK {os.path.basename(f)} meshes={len(meshes)} textures={len(imgs)} width={w:.2f}m size={os.path.getsize(f)/1e6:.1f}MB')
    x += w + 0.3
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
env = w.node_tree.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(glob.glob(os.path.join(A, 'hdri', 'interior_*.hdr'))[0])
w.node_tree.links.new(env.outputs[0], w.node_tree.nodes['Background'].inputs[0])
bpy.ops.mesh.primitive_plane_add(size=60, location=(x / 2, 0, 0))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = x * 1.02; cam.location = (x / 2, -20, 1.2); cam.rotation_euler = (math.radians(88), 0, 0)
sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.render.resolution_x, sc.render.resolution_y = 2400, 600; sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
