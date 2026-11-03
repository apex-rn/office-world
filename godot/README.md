# Godot 4 client (hisobsiz, bepul, MIT)

1. Godot 4.3+ (standart, .NET emas) — godotengine.org yoki github.com/godotengine/godot/releases dan yuklab, ochish (o'rnatish shart emas).
2. Godot'da **Import** → shu `godot/` papkasi → **Run (F5)**.
3. Jonli ofis uchun server oqimi: kompyuterda `npx tsx packages/server/src/main.ts` (FreeLLM serverda — SSH tunnel: `ssh -L 3001:127.0.0.1:3001 cc@<server>`), Godot `ws://127.0.0.1:8765` ga ulanadi.

Assetlar (ixtiyoriy, bo'lmasa to'g'ri o'lchamli bloklar):
- `assets/materials/<nom>/diff.jpg, nor.jpg, rough.jpg` — walnut, plaster, marble, leather, carpet, stone, brass, metal_black, fabric, oak, leaves (pc/assets dan)
- `assets/furniture/<def id>.glb` — masalan `office_chair.glb`, `sofa_3.glb` (katalog o'lchamiga avtomatik moslanadi)
- `assets/people/<xodim id>.glb` + `assets/people/anims.json` — Rocketbox (Blender'da FBX→GLB), `{"idle":"...","walk":"...","sit_idle":"...","typing":"...","bow_30":"..."}`
- `assets/hdri/interior.hdr`

Yangilash: `npx tsx tools/export-godot.ts > godot/layout.json`.
