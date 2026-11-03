import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=a[0], use_anim=False)
for o in bpy.data.objects:
    print('OBJ', o.type, o.name, tuple(round(v, 3) for v in o.dimensions), o.parent.name if o.parent else '-', len(o.material_slots))
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); print('BONES', len(arm.data.bones), [b.name for b in arm.data.bones][:6])
for m in bpy.data.materials:
    print('MAT', m.name, [(n.type, n.image.name if getattr(n, 'image', None) else '') for n in m.node_tree.nodes if n.type in ('TEX_IMAGE', 'BSDF_PRINCIPLED')], m.blend_method)
before = set(bpy.data.objects); bpy.ops.import_scene.fbx(filepath=a[1])
na = [o for o in bpy.data.objects if o not in before]
print('ANIM objs', [(o.type, o.name) for o in na], 'actions', [(ac.name, ac.frame_range[:]) for ac in bpy.data.actions])
aa = next(o for o in na if o.type == 'ARMATURE'); print('ANIM bones match', set(b.name for b in aa.data.bones) == set(b.name for b in arm.data.bones), len(aa.data.bones))
