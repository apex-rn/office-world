"""Rocketbox avatar FBX + animation FBXs -> one GLB (textured mesh, skeleton, all clips) for the Godot client.

blender -b --factory-startup -P rocketbox_to_glb.py -- <avatar.fbx> <anims_dir> <m|f> <out.glb>

- Materials are rebuilt from the avatar's Textures/ folder (the FBX texture paths do not resolve):
  *_color (base colour), *_normal (normal map), *_opacity_color (hair/lashes, alpha clip).
- Clips are retargeted, not copied: the animation files use a different rest pose than the avatars, so each
  clip drives the avatar through world-space constraints and is baked onto the avatar skeleton.
- The walk clip comes from the root-motion set and is made in-place (the client moves the body itself).
- Each clip becomes one GLB animation named after its Rocketbox clip (see godot/assets/people/anims.json).
"""
import bpy, glob, os, sys

AVATAR, ANIMS, G, OUT = sys.argv[sys.argv.index('--') + 1:][:4]
CLIPS = ['idle_neutral_01', 'walk_neutral', 'sit_chair_idle_neutral_01', 'sit_table_idle_neutral_01', 'work_table', 'work_mid',
         'gestic_talk_neutral_01', 'drink_drinking', 'wave_01', 'claphands_01', 'dancing_neutral']
MAX_FRAMES = 360          # long idles are cut: they loop anyway
STEP = 2                  # bake every 2nd frame (Godot interpolates); halves animation size
TEX = {'body': int(os.environ.get('BODY_TEX', 2048)), 'head': 1024, 'opacity': 1024}  # BODY_TEX=1536 keeps a heavy avatar under 8 MB

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=AVATAR, use_anim=False)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in [o for o in bpy.data.objects if o.type == 'EMPTY']:
    bpy.data.objects.remove(o)
mesh = next(o for o in bpy.data.objects if o.type == 'MESH')

# --- materials from Textures/
tex_dir = os.path.join(os.path.dirname(os.path.dirname(AVATAR)), 'Textures')


def tex(pattern, size, non_color=False):
    hits = glob.glob(os.path.join(tex_dir, pattern))
    if not hits:
        return None
    img = bpy.data.images.load(hits[0])
    if img.size[0] > size:
        img.scale(size, size * img.size[1] // img.size[0])
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    return img


for slot in mesh.material_slots:
    m = slot.material
    part = next((p for p in ('opacity', 'head', 'body') if m.name.endswith(p)), 'body')
    prefix = m.name.rsplit('_', 1)[0]
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    bsdf.inputs['Roughness'].default_value = 0.55 if part != 'opacity' else 0.7
    col = tex(f'{prefix}_{part}_color.*', TEX[part])
    if col:
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = col
        nt.links.new(n.outputs['Color'], bsdf.inputs['Base Color'])
        if part == 'opacity':
            nt.links.new(n.outputs['Alpha'], bsdf.inputs['Alpha'])
            m.blend_method = 'CLIP' if hasattr(m, 'blend_method') else m.blend_method
            if hasattr(m, 'surface_render_method'):
                m.surface_render_method = 'DITHERED'
    nor = tex(f'{prefix}_{part}_normal.*', TEX[part], True)
    if nor:
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = nor
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    print('MAT', m.name, part, bool(col), bool(nor))

# --- clips: retarget + bake
arm.animation_data_create()
bpy.context.view_layer.objects.active = arm


def make_in_place(act):
    for fc in act.fcurves:
        if fc.data_path != 'pose.bones["Bip01 Pelvis"].location' or len(fc.keyframe_points) < 2:
            continue
        k = fc.keyframe_points
        (f0, v0), (f1, v1) = k[0].co, k[-1].co
        if abs(v1 - v0) < 0.05:
            continue
        for p in k:
            d = (p.co.x - f0) / (f1 - f0) * (v1 - v0)
            p.co.y -= d; p.handle_left.y -= d; p.handle_right.y -= d
        fc.update()


for clip in CLIPS:
    path = os.path.join(ANIMS, f'{G}_{clip}.fbx')
    if not os.path.exists(path):
        print('MISSING', path); continue
    objs, acts = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path)
    new_objs = [o for o in bpy.data.objects if o not in objs]
    src = next(o for o in new_objs if o.type == 'ARMATURE')
    src_act = src.animation_data.action
    if clip.startswith('walk'):
        make_in_place(src_act)
    f0, f1 = int(src_act.frame_range[0]), int(min(src_act.frame_range[1], src_act.frame_range[0] + MAX_FRAMES))
    src_bones = {b.name for b in src.data.bones}
    for pb in arm.pose.bones:
        if pb.name not in src_bones:
            continue
        c = pb.constraints.new('COPY_ROTATION'); c.target = src; c.subtarget = pb.name
        if pb.name == 'Bip01 Pelvis':
            c = pb.constraints.new('COPY_LOCATION'); c.target = src; c.subtarget = pb.name
    bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='SELECT')
    arm.animation_data.action = None
    bpy.ops.nla.bake(frame_start=f0, frame_end=f1, step=STEP, only_selected=True, visual_keying=True,
                     clear_constraints=True, use_current_action=False, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    act = arm.animation_data.action; act.name = clip
    arm.animation_data.action = None
    tr = arm.animation_data.nla_tracks.new(); tr.name = clip; tr.mute = True
    st = tr.strips.new(clip, f0, act)
    if hasattr(st, 'action_slot') and getattr(act, 'slots', None):
        st.action_slot = act.slots[0]
    for a in [a for a in bpy.data.actions if a not in acts and a is not act]:
        bpy.data.actions.remove(a)
    for o in new_objs:
        bpy.data.objects.remove(o)
    print('CLIP', clip, f0, f1)

for pb in arm.pose.bones:   # back to rest so the exported bind pose is clean
    pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animation_mode='NLA_TRACKS', export_image_format='JPEG',
                          export_jpeg_quality=85, export_skins=True, export_def_bones=True, export_optimize_animation_size=True)
print('OUT', OUT, round(os.path.getsize(OUT) / 1e6, 2), 'MB')
