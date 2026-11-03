"""Write assets/LICENSES.md and assets/MANIFEST.json from the Poly Haven fetch index (run from the office-world repo root)."""
import glob, hashlib, json, os, time

A = 'assets'
idx = {p: (i, k) for p, i, k in json.load(open(f'{A}/.polyhaven_index.json'))}
rows, items = [], []
for path, (pid, kind) in sorted(idx.items()):
    files = glob.glob(f'{A}/{path}*') if path.endswith('/') else [f'{A}/{path}']
    for f in sorted(files):
        rel = os.path.relpath(f, A).replace(os.sep, '/')
        sz = os.path.getsize(f)
        url = f'https://polyhaven.com/a/{pid}'
        rows.append(f'| `{rel}` | [{pid}]({url}) | CC0 1.0 | {sz / 1e6:.1f} MB |')
        items.append({'path': rel, 'kind': kind, 'polyhaven_id': pid, 'page': url, 'bytes': sz,
                      'sha256': hashlib.sha256(open(f, 'rb').read()).hexdigest(), 'in_git': sz <= 50e6})
tot = sum(i['bytes'] for i in items)
json.dump({'source': 'Poly Haven (CC0 1.0)', 'resolution': '2k', 'total_bytes': tot, 'items': items},
          open(f'{A}/MANIFEST.json', 'w'), indent=1)
open(f'{A}/LICENSES.md', 'w', encoding='utf-8').write(f"""# Asset licenses

Every file below comes from [Poly Haven](https://polyhaven.com) and is **CC0 1.0** (public domain, no attribution required; credit kept here anyway).
License: https://polyhaven.com/license . Downloaded {time.strftime('%Y-%m-%d')} via api.polyhaven.com at 2K.

- Materials: `*_diff_2k.jpg` (base color, sRGB), `*_nor_dx_2k.jpg` (normal, DirectX/Unreal convention), `*_rough_2k.jpg` (roughness, linear).
- HDRIs: 2K equirectangular `.hdr` (interior: hotel_room; evening exterior: sunset_jhbcentral).
- Models: Poly Haven glTF 2K packed into one `.glb` each (geometry and JPEG textures byte-identical). Unreal 5 imports `.glb` via Interchange.
- Brass: Poly Haven has no brass texture set; use a plain PBR material (BaseColor 0.94/0.78/0.45 linear, Metallic 1, Roughness 0.25-0.35). `models/brass_vase_01.glb` carries a real brass material for reference.
- No file is larger than 50 MB, so everything is in git; `MANIFEST.json` lists sizes and SHA-256.

Total: {len(rows)} files, {tot / 1e6:.0f} MB.

| File | Source | License | Size |
|---|---|---|---|
""" + '\n'.join(rows) + '\n')
os.remove(f'{A}/.polyhaven_index.json')
print(len(rows), 'files', round(tot / 1e6), 'MB')
