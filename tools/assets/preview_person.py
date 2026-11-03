"""QA still: re-import a person GLB and render it in several clips side by side.

blender -b --factory-startup -P preview_person.py -- <person.glb> <hdri> <out.png> [clip:frame ...]
"""
import bpy, sys, math

args = sys.argv[sys.argv.index('--') + 1:]
GLB, HDR, OUT = args[:3]
POSES = [a.split(':') for a in args[3:]] or [['idle_neutral_01', '100'], ['walk_neutral', '15'], ['sit_chair_idle_neutral_01', '200'], ['work_table', '150']]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
for i, (clip, frame) in enumerate(POSES):
    objs = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=GLB)
    new = [o for o in bpy.data.objects if o not in objs]
    roots = [o for o in new if o.parent is None]
    arm = next(o for o in new if o.type == 'ARMATURE')
    act = next((a for a in bpy.data.actions if a.name.startswith(clip)), None)
    if act is None:
        print('NOCLIP', clip, [a.name for a in bpy.data.actions][:12]); continue
    arm.animation_data_create(); arm.animation_data.action = act
    if hasattr(arm.animation_data, 'action_slot') and act.slots:
        arm.animation_data.action_slot = act.slots[0]
    # bake this pose so the shared timeline frame does not matter
    sc.frame_set(int(frame))
    for o in roots:
        o.location.x += i * 1.1
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='SELECT'); bpy.ops.pose.copy()
    arm.animation_data.action = None
    bpy.ops.pose.paste(); bpy.ops.object.mode_set(mode='OBJECT')
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
env = w.node_tree.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(HDR)
w.node_tree.links.new(env.outputs[0], w.node_tree.nodes['Background'].inputs[0])
bpy.ops.mesh.primitive_plane_add(size=40)
n = len(POSES)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50; cam.location = ((n - 1) * 0.55, -6.5, 1.1); cam.rotation_euler = (math.radians(88), 0, 0)
sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.render.resolution_x, sc.render.resolution_y = 1600, 900; sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
