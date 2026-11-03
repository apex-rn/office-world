# PROGRESS — qayerda to'xtadik

> Har sessiya: 1) shu faylni o'qi, 2) `docs/WORLD_PLAN.md`dan kerakli bo'limni o'qi, 3) bitta vazifa, 4) `npm test`, 5) shu faylni yangila, 6) commit.

## Holat (2026-11-03, kech)
**Bosqich C — miya yadrosi: asosiy qismlar TAYYOR (17/17 test).**
- `packages/brain`: identity (11 xodim + Boss), emotion (birinchi shaxs his, o'sish qoidasi), perception (faqat ko'rgan/eshitgani), memory (recency+importance+relevance, embedding ixtiyoriy), llm (OpenAI-mos klient, Router: life→free, critical→faqat Claude, limitda free), mind (hodisaga asoslangan qaror, qat'iy JSON, tana rad etsa xotiraga), runtime (09:00–21:00, kelganda o'z joyiga, bir vaqtda ≤3 o'ylash, koreyscha salom refleksi 15/30/45° + qo'l berish).
- Kompyuterdagi sessiya (Auto): FreeLLM tekshiruvi (OpenAI + Anthropic /v1/messages + embeddings ishlaydi), run_agent.sh failover, guard/ig_res/yt_res doimiy FreeLLM, voice_samples (FreeLLM), Graphify'ni FreeLLM bilan yangilash.

### Keyingi (C davomi)
1. FREELLM_PROBE natijasidagi strong/fast model nomlarini Router'ga ulash; serverda haqiqiy FreeLLM bilan 1 soatlik 'jonli ofis' sinovi (headless).
2. Ish integratsiyasi: board-adapter (board.json → dunyo voqealari: Viktor kartani olib NAVBAT'ga, tayyor ishni Manager'ga), `work(card)`.
3. Majlislar (stand-up 09:10, juma, favqulodda), tug'ilgan kunlar va 31-sana bayramlari, payroll 25-sana (Viktor seyfdan).
4. Tiqilinch < 1% (hozir 1.78% og'ir tasodifiy testda).

## Avvalgi holat (2026-11-03, ertalab)
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
  - `world.ts` — Body API: arrive, go_to (joy/zona/odam), sit/stand (o'rindiq anchori ±2 sm), use (navbat kelgan yo'l bo'ylab 0.9 m oraliqda, guruhlangan qurilmalar, WC navbati eshik tashqarisida), consume, pick/place (sirtda bo'sh joy topish), say (faqat eshitadigan joyda; tinglovchilar ro'yxati), wait, go_home. Reflekslar: qurilmadan keyin chetga chiqish, "kechirasiz" — yo'l berish, qat'iy to'qnashmaslik (resolveOverlaps).
  - `stress.ts` + `tools/headless.ts` — tasodifiy topshiriqlar bilan yuklama testi.

### O'lchangan natijalar
| Test | Natija |
|---|---|
| Unit testlar | 9/9 o'tdi; validator: office_v1 — 0 xato |
| 24 soat, 12 tana (v1, birinchi o'lchov) | 0 to'qnashuv, 0 navmesh'dan chiqish, 24 274 harakat |
| Tiqilinch (tasodifiy, miyasiz, ataylab og'ir yuklama; 4 seed × 4 soat) | 7.1% → **1.78%** (maqsad < 1%), 0 to'qnashuv |

**Tiqilinchni kamaytirish uchun qilingan ishlar (2026-11-03):**
- Ko'p kishilik joylarda har bir odamga alohida turish nuqtasi (kuldon, kanban doska; divan o'rinlari).
- Navbat odamlar kelgan yo'l bo'ylab, 0.9 m oraliqda, boshqa qurilmalarning foydalanish nuqtalariga tushmaydi.
- Navbatdagilar o'tuvchiga yo'l berib, 3 s dan keyin qaytadi.
- Tor eshik (<1.3 m): bir vaqtda bir yo'nalish; qarshi tomondan kelgan kutadi.
- Yuzma-yuz tiqilib qolganda past ustuvorlikdagi chetga chiqadi.
- Kichik xonalar sig'imi (WC 3, Manager kabineti 5): to'la bo'lsa eshik yonida (oldida emas) kutiladi, 3 daqiqadan keyin voz kechiladi.
- Reja me'yorlarga moslandi: majlis stoli shimol–janub, har tomonda ≥1.05 m yo'lak, ekran va doska shimoliy devorda; oshxonada pishtaxta va stul suyanchig'i orasi ≥1.2 m; balkon 2.0 m chuqur, kuldon panjara yonida; Manager javonlari g'arbiy devorda; WC navbati WC eshigi tashqarisida.

### Keyingi vazifalar (tartib bilan)
1. **Tiqilinch < 1%**: qolgan xatolar WC lobbisi, Manager kabineti va "odam oldiga borish"da. Keyingi g'oyalar: odam oldiga borishda u o'tirgan/band bo'lsa yaqin bo'sh joyni tanlash; WC lobbisini qayta loyihalash (kabinalar eshiklarini lobbiga ochish yo'nalishi); real ish kuni yuklamasi bilan alohida benchmark (miyali agentlar bilan).
2. **Rapier fizika**: tushgan/qo'yilgan buyumlar (hozir buyumlar faqat sirt anchorlarida — fizik to'g'ri, lekin "tushib ketish" yo'q).
3. **Perception matn quruvchi** (§10): agent uchun ≤300 token kuzatuv.
4. **Bosqich C — miya**: identity package, memory, planner, decider (FreeLLM orqali), router + Claude↔Free failover, dialog. Avval FreeLLM'ning Anthropic/OpenAI formatini tekshirish.
5. Ish stoli: `work(card)` verb — o'z stulida o'tirib ishlash (board-adapter bilan).
6. VERIFY: belgili o'lchamlarni mahsulot spec'lari bilan tasdiqlash → `docs/CATALOG_SOURCES.md`.

### Ma'lum cheklovlar
- Navmesh qatlami 1 qavat; zinapoya yo'q (kerak emas).
- Sofaning 3 ta o'rni bor, hozircha birinchi bo'sh o'ringa yondashadi (o'rin tanlash keyin).
- GitHub: `apex-rn/office-world` hali ochilmagan — kod faqat shu konteynerda (egasi ochishi kerak).
