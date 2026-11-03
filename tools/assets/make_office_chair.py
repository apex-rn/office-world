"""Build a realistic office task chair in Blender and export it as GLB (Poly Haven has no task chair).

blender -b --factory-startup -P make_office_chair.py -- <fabric_diff.jpg> <fabric_nor.jpg> <out.glb>

Real dimensions: 0.65 x 1.05 x 0.65 m, seat top at 0.47 m (where Rocketbox's seated clip puts the thighs).
Front faces glTF +Z (Blender -Y), like the catalog. Five-star polished aluminium base on twin casters,
chrome gas lift, padded fabric seat, curved breathable back on a spine, padded armrests.
"""
import bpy, bmesh, math, sys

_DIFF, NOR, OUT = sys.argv[sys.argv.index('--') + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)


IMAGES = {}


def image(path, non_color=False):
    """Load once, 1K is plenty for a chair (keeps the GLB small)."""
    if path not in IMAGES:
        img = bpy.data.images.load(path)
        if img.size[0] > 1024: img.scale(1024, 1024)
        if non_color: img.colorspace_settings.name = 'Non-Color'
        IMAGES[path] = img
    return IMAGES[path]


def mat(name, color, rough, metal=0.0, tex=None, scale=3.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if tex:
        uv = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (scale, scale, scale)
        nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
        # plain upholstery colour; the fabric set only gives the weave relief (its colour pattern reads as tartan)
        b.inputs['Base Color'].default_value = (*color, 1)
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = image(tex[1], True)
        nt.links.new(mp.outputs[0], n.inputs[0])
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 0.6
        nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    else:
        b.inputs['Base Color'].default_value = (*color, 1)
    return m


FABRIC = mat('fabric_charcoal', (0.16, 0.16, 0.17), 0.92, tex=(_DIFF, NOR))
MESH = mat('mesh_back', (0.10, 0.10, 0.11), 0.85, tex=(_DIFF, NOR), scale=6.0)
PLASTIC = mat('plastic_black', (0.025, 0.025, 0.028), 0.45)
ALU = mat('aluminium_polished', (0.80, 0.80, 0.82), 0.22, metal=1.0)
CHROME = mat('chrome', (0.90, 0.90, 0.92), 0.08, metal=1.0)
parts = []


def finish(o, m, bevel=0.0, segs=3, smooth=True, subsurf=0):
    o.data.materials.append(m)
    if bevel:
        bv = o.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = segs; bv.limit_method = 'ANGLE'
    if subsurf:
        ss = o.modifiers.new('sub', 'SUBSURF'); ss.levels = ss.render_levels = subsurf
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
        o.modifiers.new('wn', 'WEIGHTED_NORMAL').keep_sharp = True
    parts.append(o)
    return o


def box(name, size, loc, m, bevel=0.0, segs=3, rot=(0, 0, 0), subsurf=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, bevel, segs, subsurf=subsurf)


def cyl(name, r, depth, loc, m, rot=(0, 0, 0), verts=32, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object; o.name = name
    return finish(o, m, bevel, 2)


# --- base: hub, five tapered legs, twin-wheel casters
cyl('hub', 0.055, 0.07, (0, 0, 0.115), ALU, bevel=0.01)
for i in range(5):
    a = i * 2 * math.pi / 5 + math.pi / 2
    dx, dy = math.cos(a), math.sin(a)
    bpy.ops.mesh.primitive_cube_add(size=1)
    leg = bpy.context.object; leg.name = f'leg{i}'
    bm = bmesh.new(); bm.from_mesh(leg.data)
    for v in bm.verts:   # taper: 0.055 wide at the hub, 0.03 at the tip, sloping down to the caster
        t = v.co.x + 0.5
        w = 0.055 * (1 - t) + 0.03 * t
        v.co.x = t * 0.30; v.co.y *= w; v.co.z = v.co.z * (0.045 * (1 - t) + 0.025 * t) + 0.115 - t * 0.04
    bm.to_mesh(leg.data); bm.free()
    leg.rotation_euler = (0, 0, a)
    finish(leg, ALU, 0.008, 3)
    cx, cy = dx * 0.30, dy * 0.30
    cyl(f'caster_fork{i}', 0.012, 0.05, (cx, cy, 0.075), PLASTIC)
    for s in (-1, 1):
        cyl(f'wheel{i}{s}', 0.03, 0.018, (cx + s * 0.012 * -dy, cy + s * 0.012 * dx, 0.03), PLASTIC,
            rot=(math.pi / 2, 0, a), verts=24, bevel=0.004)

# --- gas lift + seat mechanism
cyl('gas_lift_cover', 0.032, 0.14, (0, 0, 0.21), PLASTIC)
cyl('gas_lift', 0.024, 0.13, (0, 0, 0.33), CHROME)
box('mechanism', (0.22, 0.24, 0.045), (0, 0.01, 0.405), PLASTIC, 0.008)
box('tilt_lever', (0.012, 0.16, 0.012), (0.17, -0.05, 0.405), PLASTIC, 0.004, rot=(0, 0, 0.25))

# --- seat: soft cushion on a shell
box('seat_shell', (0.49, 0.47, 0.03), (0, -0.01, 0.435), PLASTIC, 0.012)
box('seat_cushion', (0.50, 0.48, 0.055), (0, -0.015, 0.47), FABRIC, 0.022, 4, subsurf=1)

# --- spine and curved back
box('spine', (0.07, 0.03, 0.26), (0, 0.215, 0.53), PLASTIC, 0.01, rot=(math.radians(-8), 0, 0))
bpy.ops.mesh.primitive_cube_add(size=1)
back = bpy.context.object; back.name = 'backrest'
back.scale = (0.47, 0.045, 0.52); bpy.ops.object.transform_apply(scale=True)
ss = back.modifiers.new('cuts', 'SUBSURF'); ss.levels = 2; ss.subdivision_type = 'SIMPLE'
bpy.ops.object.modifier_apply(modifier='cuts')
for v in back.data.vertices:   # wrap around the sitter and add lumbar support
    v.co.y += 0.06 * (v.co.x / 0.235) ** 2 - 0.025 * math.exp(-((v.co.z + 0.12) / 0.09) ** 2)
back.location = (0, 0.235, 0.78); back.rotation_euler = (math.radians(-8), 0, 0)
finish(back, MESH, 0.015, 3)
box('back_frame', (0.49, 0.03, 0.03), (0, 0.27, 1.035), PLASTIC, 0.012, rot=(math.radians(-8), 0, 0))

# --- armrests: post + padded rest
for s in (-1, 1):
    box(f'arm_post{s}', (0.035, 0.06, 0.24), (s * 0.29, 0.03, 0.55), PLASTIC, 0.01)
    box(f'arm_bracket{s}', (0.06, 0.05, 0.025), (s * 0.265, 0.03, 0.43), PLASTIC, 0.008)
    box(f'arm_pad{s}', (0.075, 0.26, 0.03), (s * 0.29, -0.01, 0.675), PLASTIC, 0.013, 4)

# real overall size check, then UVs for the fabric and export
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
for o in parts:
    if o.data.materials[0] in (FABRIC, MESH):
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.cube_project(cube_size=0.5); bpy.ops.object.mode_set(mode='OBJECT')
xs, ys, zs = [], [], []
dg = bpy.context.evaluated_depsgraph_get()
for o in parts:
    for c in o.evaluated_get(dg).bound_box:
        w = o.matrix_world @ __import__('mathutils').Vector(c); xs.append(w.x); ys.append(w.y); zs.append(w.z)
print('SIZE w=%.3f d=%.3f h=%.3f' % (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_image_format='JPEG', export_jpeg_quality=88,
                          use_selection=False)
print('OUT', OUT)
