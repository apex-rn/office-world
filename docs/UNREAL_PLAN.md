# Unreal Engine 5 renderer — reja (Boss tanlovi: Unreal sifati, 2026-11-03)

**Arxitektura.** Server (dunyo + AI miyalar) yagona haqiqat manbai bo'lib qoladi. Unreal faqat ko'rsatadi:
u WebSocket orqali ulanadi va har bir xodimning MetaHuman tanasini server holatiga qarab harakatlantiradi.
Boss tanasi Unreal'dan boshqariladi (WASD) va serverga `boss` buyruqlari ketadi.

```
packages/server/src/stream.ts  ──ws://<host>:8765──►  UE5 loyiha "CCOffice"
   hello (layout, metr)                                   LevelBuilder (Editor Python): layout → aktorlar
   snap 10 Hz (bodies, doors, activity)                   CCBridge (C++, WebSockets moduli): snap → MetaHuman pozalari
   event (speech, greet, arrived...)                      UI: gap pufaklari/subtitr, majlis, bayram effektlari
   ◄── boss (token bilan)                                  BossPawn: WASD/joystik, E — foydalanish, chat
```

## Kompyuter
- RTX 4060 Laptop, 8 GB VRAM → Lumen yoqilgan (High), Nanite mebel uchun. MetaHuman'lar LOD bilan: yaqin 1–2 kishi LOD0, qolganlari LOD2–3 (kinodagidek; ko'zga sezilmaydi).
- Unreal Engine 5.x (eng so'nggi barqaror), Visual Studio 2022 "Game development with C++". Epic hisobi — Boss.

## Koordinatalar (aniq)
| Biz (server) | Unreal |
|---|---|
| metr | santimetr (×100) |
| x (sharq) | X = x·100 |
| z (janub) | Y = z·100 |
| y (yuqori) | Z = y·100 |
| yaw (radian; oldinga = (sin yaw, cos yaw) x–z tekisligida) | Yaw° = 90 − yaw·180/π (UE oldinga = +X) |

Biz o'ng qo'l tizimidamiz, Unreal chap qo'l; y↔z almashinuvi buni to'g'ri aylantiradi (aks-tasvir yo'q).

## Bosqichlar
1. **U1 — Loyiha va daraja** (PC sessiyasi): `CCOffice` C++ loyiha; Editor Python `LevelBuilder.py` — `hello.layout` dan devorlar (shisha — Translucent material), eshik/deraza teshiklari, pol zonalari, mebel (Poly Haven modellari real o'lchamga masshtablanadi; yo'q bo'lsa vaqtincha oddiy mesh), Lumen + Sky Atmosphere (Seul vaqtiga ko'ra quyosh), PBR materiallar (Poly Haven 2K).
2. **U2 — Ko'prik**: `ACCBridge` aktor — WebSocket mijoz, `snap` → har bir xodim uchun Character joylashuvi (interpolatsiya 100 ms), animatsiya holati (`state`/`anim`: idle, walk, sit, use, bow_15/30/45, bow_handshake, clap, dance), eshiklar ochilishi.
3. **U3 — MetaHuman'lar**: identity.ts tavsiflariga mos 11 xodim + Boss (2.00 m, 100 kg, endomorf, keng yelka, chandiqlar, orqaga taralgan qisqa soch). Animatsiyalar: UE5 Manny/Quinn retarget + Mixamo/Fab.
4. **U4 — UI va hayot**: gap pufaklari va subtitrlar (en/uz), majlis rejimi, tug'ilgan kun bezaklari, 31-sana diskoteka chiroqlari, Yangi yil.
5. **U5 — Boss**: BossPawn, kamera, xodimlar bilan yozma suhbat, Manager'ga topshiriq (tasdiq oynasi bilan).
6. **U6 — Ko'rish**: noutbukda paket (Shipping build). Telefon: keyinroq, Boss qaroriga ko'ra (Pixel Streaming, pullik GPU).

## Server tomoni (tayyor)
- `startStream(runtime, { port: 8765, hz: 10, bossToken })` — protokol `packages/server/src/stream.ts` boshida.
- Ko'rish uchun ulanish o'qish rejimida; Boss tanasini boshqarish faqat token bilan.
