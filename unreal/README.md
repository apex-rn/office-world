# Unreal Engine 5 — Compound Chronicle ofisi

Reja: `docs/UNREAL_PLAN.md`. Bu papkadagi fayllar Unreal'da ishlatiladi.

| Fayl | Nima qiladi |
|---|---|
| `layout_ue.json` | Ofis rejasi Unreal o'lchamlarida (sm). Yangilash: `npx tsx tools/export-unreal.ts > unreal/layout_ue.json` |
| `LevelBuilder.py` | Editor Python: devorlar, shisha, eshiklar, pol, mebel (real o'lchamga moslab), quyosh, osmon, Lumen. Har safar qayta ishga tushirsa, eskisini o'chirib qayta quradi. |
| `Source/CCOffice/CCBridge.*` | C++ aktor: serverga WebSocket bilan ulanadi, har bir xodimga MetaHuman Blueprint chiqaradi, joy va burilishni silliq yangilaydi; `GetBody(id)` — AnimBP holatni o'qiydi; `OnSpeech` — gap pufaklari/subtitr; `SendBossCommand` — Boss tanasi. |

## Birinchi ishga tushirish (PC sessiyasi qiladi)
1. Epic Launcher'dan UE 5.x; Visual Studio "Game development with C++" (UE versiyasi qo'llaydigan VS/MSVC).
2. Yangi C++ loyiha `CCOffice` (Blank, With Starter Content yo'q). Plaginlar: Python Editor Script Plugin, WebSockets (o'rnatilgan), MetaHuman.
3. `Source/CCOffice/CCOffice.Build.cs` → `PublicDependencyModuleNames` ga `"WebSockets", "Json", "JsonUtilities"` qo'shish; `CCBridge.h/.cpp` ni `Source/CCOffice/` ga nusxalash; kompilyatsiya.
4. `pc/assets` dagi materiallarni `/Game/Office/Materials/` ga (M_Walnut, M_Plaster, M_Carpet, M_Stone, M_Marble, M_Leather, M_Brass ...), mebelni `/Game/Office/Meshes/<def id>` nomi bilan import (masalan `office_chair`, `sofa_3`) — LevelBuilder ularni katalog o'lchamiga moslaydi.
5. Tools → Execute Python Script → `unreal/LevelBuilder.py`.
6. Darajaga `CCBridge` aktorini qo'yish, `ServerUrl` = serverdagi stream (SSH tunnel: `ssh -L 8765:127.0.0.1:8765 ...` → `ws://127.0.0.1:8765`).

## Koordinatalar
Server metr (x sharq, y yuqori, z janub) → Unreal sm: X = x·100, Y = z·100, Z = y·100; Yaw° = 90 − yaw·180/π.
