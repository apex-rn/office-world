"""Fill godot/assets/ for the Godot client from Poly Haven (CC0, 2K).

  python tools/assets/godot_assets.py            (run from the repo root)

materials/<name>/{diff,nor,rough}.jpg  - nor is the OpenGL convention (Godot expects +Y)
furniture/<catalog def id>.glb          - Poly Haven glTF packed to GLB; office.gd fits it to the catalog size
hdri/interior.hdr
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from fetch_polyhaven import files, get, pack_glb  # noqa: E402

OUT = 'godot/assets'
# office.gd material name -> Poly Haven id. brass, leaves and metal_black keep office.gd's plain PBR colour:
# Poly Haven has no brass/foliage tiling set, and its dark metals are tread plates that look wrong on monitors.
MATERIALS = {'walnut': 'herringbone_parquet', 'oak': 'oak_veneer_01', 'plaster': 'white_plaster_02', 'marble': 'marble_01',
             'leather': 'brown_leather', 'carpet': 'poly_wool_herringbone', 'stone': 'stone_tiles_02',
             'fabric': 'wool_boucle'}
# catalog def id (packages/catalog/src/items.ts) -> Poly Haven model; ids without a good match keep office.gd's boxes
# office_chair is built by make_office_chair.py (no task chair on Poly Haven)
FURNITURE = {'side_chair': 'modern_arm_chair_01', 'sofa_3': 'sofa_02',
             'desk_140': 'metal_office_desk', 'desk_160': 'metal_office_desk', 'coffee_table': 'modern_coffee_table_02',
             'cabinet_low': 'modern_wooden_cabinet', 'plant_floor': 'potted_plant_02', 'desk_plant': 'potted_plant_04',
             'desk_lamp': 'desk_lamp_arm_01'}
HDRI = 'hotel_room'


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'wb').write(data)


def main():
    lic = []
    for name, pid in MATERIALS.items():
        f = files(pid)
        for key, short in (('Diffuse', 'diff'), ('nor_gl', 'nor'), ('Rough', 'rough')):
            write(f'{OUT}/materials/{name}/{short}.jpg', get(f[key]['2k']['jpg']['url']))
        lic.append((f'materials/{name}/', pid))
        print('material', name, pid)
    for def_id, pid in FURNITURE.items():
        x = files(pid)['gltf']['2k']['gltf']
        pack_glb(x['url'], x.get('include', {}), f'{OUT}/furniture/{def_id}.glb')
        lic.append((f'furniture/{def_id}.glb', pid))
        print('furniture', def_id, pid)
    write(f'{OUT}/hdri/interior.hdr', get(files(HDRI)['hdri']['2k']['hdr']['url']))
    lic.append(('hdri/interior.hdr', HDRI))
    rows = '\n'.join(f'| `{p}` | [{i}](https://polyhaven.com/a/{i}) | CC0 1.0 |' for p, i in lic)
    open(f'{OUT}/LICENSES_POLYHAVEN.md', 'w', encoding='utf-8').write(
        '# Poly Haven assets (CC0 1.0, https://polyhaven.com/license)\n\n| Path | Source | License |\n|---|---|---|\n' + rows + '\n')


if __name__ == '__main__':
    main()
