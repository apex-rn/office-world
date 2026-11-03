"""Compound Chronicle office — Unreal Editor builder (UE 5.x, Python Editor Script Plugin).

Run inside the editor (Tools > Execute Python Script) or:
  UnrealEditor-Cmd.exe CCOffice.uproject -run=pythonscript -script="<repo>/unreal/LevelBuilder.py"
Reads unreal/layout_ue.json (npx tsx tools/export-unreal.ts) — centimetres, X=east, Y=south, Z=up.
Real dimensions come from packages/catalog; meshes imported under /Game/Office/Meshes/<def> are fitted to them,
otherwise a correctly sized placeholder box is used so the level is always complete and to scale.
"""
import json
import os

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
L = json.load(open(os.path.join(HERE, "layout_ue.json"), encoding="utf-8"))

EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
EAL = unreal.EditorAssetLibrary
CUBE = EAL.load_asset("/Engine/BasicShapes/Cube.Cube")  # 100 cm cube, pivot at centre
ROOT = "CCOffice"


def mat(name):
    """Material from /Game/Office/Materials (Poly Haven PBR imported by the PC session) or None."""
    path = f"/Game/Office/Materials/{name}"
    return EAL.load_asset(path) if EAL.does_asset_exist(path) else None


def glass_material():
    path = "/Game/Office/Materials/M_Glass"
    if EAL.does_asset_exist(path):
        return EAL.load_asset(path)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    m = tools.create_asset("M_Glass", "/Game/Office/Materials", unreal.Material, unreal.MaterialFactoryNew())
    m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    m.set_editor_property("translucency_lighting_mode", unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)
    mel = unreal.MaterialEditingLibrary
    col = mel.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -400, 0)
    col.set_editor_property("constant", unreal.LinearColor(0.75, 0.85, 0.9, 1))
    op = mel.create_material_expression(m, unreal.MaterialExpressionConstant, -400, 200)
    op.set_editor_property("r", 0.15)
    rough = mel.create_material_expression(m, unreal.MaterialExpressionConstant, -400, 300)
    rough.set_editor_property("r", 0.03)
    mel.connect_material_property(col, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(op, "", unreal.MaterialProperty.MP_OPACITY)
    mel.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.recompile_material(m)
    EAL.save_loaded_asset(m)
    return m


def clear_previous():
    for a in EAS.get_all_level_actors():
        if str(a.get_folder_path()).startswith(ROOT):
            EAS.destroy_actor(a)


def box(label, loc, yaw, size, material=None, folder="Structure"):
    a = EAS.spawn_actor_from_object(CUBE, unreal.Vector(*loc), unreal.Rotator(roll=0.0, pitch=0.0, yaw=yaw))
    a.set_actor_label(label)
    a.set_actor_scale3d(unreal.Vector(size[0] / 100.0, size[1] / 100.0, size[2] / 100.0))
    a.set_folder_path(f"{ROOT}/{folder}")
    if material:
        a.static_mesh_component.set_material(0, material)
    return a


def fitted_mesh(defn, label, loc, yaw, size, folder):
    """Imported mesh scaled so its bounds match the catalog's real dimensions (base on the floor/surface)."""
    path = f"/Game/Office/Meshes/{defn}"
    if not EAL.does_asset_exist(path):
        return None
    mesh = EAL.load_asset(path)
    a = EAS.spawn_actor_from_object(mesh, unreal.Vector(loc[0], loc[1], loc[2]), unreal.Rotator(roll=0.0, pitch=0.0, yaw=yaw))
    a.set_actor_label(label)
    a.set_folder_path(f"{ROOT}/{folder}")
    b = mesh.get_bounding_box()
    ext = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]
    sc = [size[i] / ext[i] if ext[i] > 0.1 else 1.0 for i in range(3)]
    a.set_actor_scale3d(unreal.Vector(*sc))
    a.set_actor_location(unreal.Vector(loc[0], loc[1], loc[2] - b.min.z * sc[2]), False, False)
    return a


def build():
    clear_previous()
    room = L["room"]
    wall_m, floor_m, carpet_m, stone_m = mat("M_Plaster"), mat("M_Walnut"), mat("M_Carpet"), mat("M_Stone")
    glass = glass_material()

    # floor slab and room finishes
    box("Floor", [room["w"] / 2, room["d"] / 2, -1], 90, [room["d"] + 40, room["w"] + 40, 2], floor_m)
    for z in L["zones"]:
        xs = [p[0] for p in z["poly"]]
        ys = [p[1] for p in z["poly"]]
        m = carpet_m if z["id"] in ("meeting", "manager") else stone_m if z["outdoor"] else None
        if m or z["outdoor"]:
            box(f"Floor_{z['id']}", [(min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, 0.2], 90, [max(ys) - min(ys), max(xs) - min(xs), 0.4], m, "Floors")

    for k, w in enumerate(L["walls"]):
        box(f"Wall_{k:02d}", w["loc"], w["yaw"], w["size"], glass if w["glass"] else wall_m, "Walls")

    for d in L["openings"]:
        leaves = 2 if d["width"] >= 150 else 1
        lw = d["width"] / leaves - 1
        for s in range(leaves):
            side = (-1 if s == 0 else 1) if leaves == 2 else -1
            # door leaf centre: along the wall (UE local Y) from the opening centre
            import math
            yr = math.radians(d["yaw"])
            off = side * (d["width"] / 2 - lw / 2)
            loc = [d["loc"][0] - math.sin(yr) * off, d["loc"][1] + math.cos(yr) * off, d["height"] / 2]
            box(f"Door_{d['id']}_{s}", loc, d["yaw"], [4.5, lw, d["height"] - 1], None if d["exterior"] else glass, "Doors")

    for i in L["instances"]:
        size = i["size"]
        loc = i["loc"]
        if not fitted_mesh(i["def"], i["id"], loc, i["yaw"], size, "Furniture"):
            box(i["id"], [loc[0], loc[1], loc[2] + size[2] / 2], i["yaw"], size, None, "Furniture")

    # light: Lumen GI, physical sky, afternoon sun over Seoul
    sun = EAS.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(900, 650, 1000), unreal.Rotator(roll=0.0, pitch=-35.0, yaw=135.0))
    sun.set_actor_label("Sun"); sun.set_folder_path(f"{ROOT}/Light")
    lc = sun.get_component_by_class(unreal.DirectionalLightComponent)
    lc.set_editor_property("intensity", 10.0)
    lc.set_editor_property("atmosphere_sun_light", True)
    for cls, label in ((unreal.SkyAtmosphere, "SkyAtmosphere"), (unreal.SkyLight, "SkyLight"), (unreal.ExponentialHeightFog, "HeightFog")):
        a = EAS.spawn_actor_from_class(cls, unreal.Vector(900, 650, 0))
        a.set_actor_label(label); a.set_folder_path(f"{ROOT}/Light")
        if cls is unreal.SkyLight:
            a.get_component_by_class(unreal.SkyLightComponent).set_editor_property("real_time_capture", True)
    ppv = EAS.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(900, 650, 150))
    ppv.set_actor_label("PostProcess"); ppv.set_folder_path(f"{ROOT}/Light")
    ppv.set_editor_property("unbound", True)
    s = ppv.get_editor_property("settings")
    s.set_editor_property("override_dynamic_global_illumination_method", True)
    s.set_editor_property("dynamic_global_illumination_method", unreal.DynamicGlobalIlluminationMethod.LUMEN)
    s.set_editor_property("override_reflection_method", True)
    s.set_editor_property("reflection_method", unreal.ReflectionMethod.LUMEN)
    ppv.set_editor_property("settings", s)

    start = EAS.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(120, 1105, 100), unreal.Rotator(roll=0.0, pitch=0.0, yaw=0.0))
    start.set_actor_label("BossStart"); start.set_folder_path(f"{ROOT}/Game")
    unreal.log(f"CCOffice built: {len(L['walls'])} wall pieces, {len(L['instances'])} objects, {len(L['openings'])} doors")


build()
