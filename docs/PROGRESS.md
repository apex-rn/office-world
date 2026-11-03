# PROGRESS — qayerda to'xtadik

> Har sessiya: 1) shu faylni o'qi, 2) `docs/WORLD_PLAN.md`dan kerakli bo'limni o'qi, 3) bitta vazifa, 4) `npm test`, 5) shu faylni yangila, 6) commit.

## Holat (2026-11-03)
**Bosqich B — Dunyo yadrosi: asosiy qismi TAYYOR, testlar yashil.**

### Tayyor
- `packages/shared`: geometriya (OBB, SAT), Seul vaqti, deterministik RNG.
- `packages/catalog`:
  - `items.ts` — 45 ta buyum, real o'lcham + manba (VERIFY: belgisi = mahsulot spec'i bilan tasdiqlanishi kerak).
  - `layout.ts` — office_v1: WC (2 kabina), oshxona, majlis xonasi, Manager kabineti (shisha), reception, 8 ish stoli, print/server burchagi, lounge, balkon (chekish). Rozetkalar.
  - `validator.ts` — tayanch, osilish, to'qnashuv (SAT), devor, chegaralar, elektr, ergonomika (monitor ko'z balandligi, ko'rish masofasi 0.5–0.8 m), mantiq (stul stolga, ekran foydalanuvchiga qaragan). **office_v1: 0 xato.**
- `packages/sim`:
  - `nav.ts` — navmesh layout'dan avtomatik (devor teshiklari, statik mebel), stullar dinamik to'siq, DetourCrowd.
  - `acoustics.ts` — ko'rish/eshitish: devor bloklaydi, shisha faqat ovozni, yopiq eshik ikkalasini; eshiklar yaqinlashganda ochiladi.
  - `world.ts` — Body API: arrive, go_to (joy/zona/odam), sit/stand (o'rindiq anchori ±2 sm), use (navbat qatori 0.9 m, guruhlangan qurilmalar, WC navbati lobbida), consume, pick/place (sirtda bo'sh joy topish), say (faqat eshitadigan joyda; tinglovchilar ro'yxati), wait, go_home. Reflekslar: qurilmadan keyin chetga chiqish, "kechirasiz" — yo'l berish, qat'iy to'qnashmaslik (resolveOverlaps).
  - `stress.ts` + `tools/headless.ts` — tasodifiy topshiriqlar bilan yuklama testi.

### O'lchangan natijalar
| Test | Natija |
|---|---|
| Unit testlar | 9/9 o'tdi |
| 24 soat, 12 tana, seed 5 | 0 to'qnashuv, 0 navmesh'dan chiqish, 24 274 harakat, 315 yo'l berish, 72 s |
| Bajarilmay qolgan harakat (miyasiz tasodifiy test) | 6.6% — **maqsad < 1%** |

### Keyingi vazifalar (tartib bilan)
1. **Tiqilinchni kamaytirish (<1%)**: deadlock detektori (ikki kishi bir-birini kutsa — biri orqaga chekinadi), tor yo'laklar uchun "bir tomonlama o'tish" navbati, eshik oldida kutish nuqtasi; uzoq ishlashda o'sish sababini tekshirish (30 daq: ~4%, 24 soat: 6.6%).
2. **Rapier fizika**: tushgan/qo'yilgan buyumlar (hozir buyumlar faqat sirt anchorlarida — fizik to'g'ri, lekin "tushib ketish" yo'q).
3. **Perception matn quruvchi** (§10): agent uchun ≤300 token kuzatuv.
4. **Bosqich C — miya**: identity package, memory, planner, decider (FreeLLM orqali), router + Claude↔Free failover, dialog. Avval FreeLLM'ning Anthropic/OpenAI formatini tekshirish.
5. Ish stoli: `work(card)` verb — o'z stulida o'tirib ishlash (board-adapter bilan).
6. VERIFY: belgili o'lchamlarni mahsulot spec'lari bilan tasdiqlash → `docs/CATALOG_SOURCES.md`.

### Ma'lum cheklovlar
- Navmesh qatlami 1 qavat; zinapoya yo'q (kerak emas).
- Sofaning 3 ta o'rni bor, hozircha birinchi bo'sh o'ringa yondashadi (o'rin tanlash keyin).
- GitHub: `apex-rn/office-world` hali ochilmagan — kod faqat shu konteynerda (egasi ochishi kerak).
