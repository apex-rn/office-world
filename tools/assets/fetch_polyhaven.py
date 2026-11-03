"""Fetch CC0 Poly Haven assets for office-world into assets/ (2K): materials (diff/nor_dx/rough), HDRIs, furniture as GLB."""
import json, os, struct, sys, urllib.request, concurrent.futures as cf
OUT = sys.argv[1] if __name__ == '__main__' else None
UA = {'User-Agent': 'office-world-assets/1.0'}
MATERIALS = {  # role -> Poly Haven id
    'walnut_parquet': 'herringbone_parquet', 'oak_parquet': 'rectangular_parquet', 'walnut_wood': 'walnut_veneer',
    'white_marble': 'marble_01', 'dark_metal': 'metal_plate', 'leather_brown': 'brown_leather',
    'grey_fabric': 'wool_boucle', 'plaster_wall': 'painted_plaster_wall', 'carpet': 'poly_wool_herringbone'}
HDRIS = {'interior': 'hotel_room', 'evening_city': 'sunset_jhbcentral'}
MODELS = ['modern_arm_chair_01', 'mid_century_lounge_chair', 'sofa_02', 'metal_office_desk', 'modern_coffee_table_01', 'modern_coffee_table_02',
          'side_table_01', 'drawer_cabinet', 'modern_wooden_cabinet', 'book_encyclopedia_set_01', 'office_notepads',
          'potted_plant_02', 'potted_plant_04', 'desk_lamp_arm_01', 'modern_ceiling_lamp_01', 'brass_vase_01']
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=300).read()
def files(i): return json.loads(get(f'https://api.polyhaven.com/files/{i}'))
def save(path, url):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path): open(path, 'wb').write(get(url))
    return url
def pack_glb(gltf_url, include, dst):
    """Pack a .gltf + .bin + images into one .glb, bytes unchanged."""
    base = gltf_url.rsplit('/', 1)[0] + '/'
    g = json.loads(get(gltf_url)); blobs = []; off = 0
    def add(b):
        nonlocal off
        pad = (-len(b)) % 4; start = off; blobs.append(b + b'\0' * pad); off += len(b) + pad; return start
    bin_starts = [add(get(include.get(b['uri'], {}).get('url', base + b['uri']))) for b in g['buffers']]
    for bv in g['bufferViews']: bv['byteOffset'] = bv.get('byteOffset', 0) + bin_starts[bv['buffer']]; bv['buffer'] = 0
    for im in g.get('images', []):
        if 'uri' in im:
            data = get(include.get(im['uri'], {}).get('url', base + im['uri']))
            g['bufferViews'].append({'buffer': 0, 'byteOffset': add(data), 'byteLength': len(data)})
            im['bufferView'] = len(g['bufferViews']) - 1; im['mimeType'] = 'image/png' if im['uri'].endswith('.png') else 'image/jpeg'; del im['uri']
    g['buffers'] = [{'byteLength': off}]
    js = json.dumps(g, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
    body = b''.join(blobs)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(body)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(body), 0x004E4942) + body
    os.makedirs(os.path.dirname(dst), exist_ok=True); open(dst, 'wb').write(out)
if __name__ == '__main__':
    jobs, lic = [], []
    def mat(role, i):
        f = files(i)
        for k, short in (('Diffuse', 'diff'), ('nor_dx', 'nor_dx'), ('Rough', 'rough')):
            save(f'{OUT}/materials/{role}/{role}_{short}_2k.jpg', f[k]['2k']['jpg']['url'])
        return (f'materials/{role}/', i, 'textures')
    def hdri(role, i):
        save(f'{OUT}/hdri/{role}_{i}_2k.hdr', files(i)['hdri']['2k']['hdr']['url']); return (f'hdri/{role}_{i}_2k.hdr', i, 'hdris')
    def model(i):
        x = files(i)['gltf']['2k']['gltf']; pack_glb(x['url'], x.get('include', {}), f'{OUT}/models/{i}.glb'); return (f'models/{i}.glb', i, 'models')
    with cf.ThreadPoolExecutor(8) as ex:
        futs = [ex.submit(mat, r, i) for r, i in MATERIALS.items()] + [ex.submit(hdri, r, i) for r, i in HDRIS.items()] + [ex.submit(model, i) for i in MODELS]
        for fu in futs:
            try: lic.append(fu.result()); print('ok', lic[-1][0])
            except Exception as e: print('FAIL', e)
    json.dump(sorted(lic), open(f'{OUT}/.polyhaven_index.json', 'w'), indent=1)
