# PROGRESS — qayerda to'xtadik

> Har sessiya: 1) shu faylni o'qi, 2) `docs/WORLD_PLAN.md`dan kerakli bo'limni o'qi, 3) bitta vazifa, 4) `npm test`, 5) shu faylni yangila, 6) commit.

## Holat (2026-11-03, kechqurun) — 33/33 test, umumiy ~63%
- Unreal o'rniga **Godot 4** (Epic hisobi/tasdiqlash yo'q): `godot/` (office.gd: SDFGI/SSAO/SSR, PBR, GLB mebel moslash, Rocketbox odamlar, gap yozuvlari, Boss WASD/F/Enter). PC sessiyasi K vazifada assetlarni joylab, skrinshot oladi.
- Jamiyat: `social.ts` (suhbat → tanishlik/iliqlik, do'stlik bosqichlari, o'zaro iliqlikda bosqichli romantika, kechki uchrashuvlar xotira sifatida).
- Boss: `steer` buyrug'i (faqat Boss, crowd xavfsiz).

## Holat (2026-11-03) — 31/31 test, office_v2 (24×17 m)
- **office_v2**: 24×17 m, shift 3.2 m; majlis 6.5×6 m, WC 4.5×4 m (3 kabina), Manager 6×6.5 m, oshxona-kafe 2 stol, 10 ish stoli (2 tasi bo'sh), keng lounge va balkon. Validator 0 xato. **Tiqilinch 0.54%** (maqsad <1% bajarildi), 0 to'qnashuv.
- Miya tuzatishlari (PC jonli sinovi I asosida): JSON'ni nasr/fence ichidan topish, verb sinonimlari, 700 token, birinchi javob berish, jimlikdan keyin suhbat, sit/stand cooldown, bare `auto` emas — `claude-opus-4-5` bepul alias.

## Avvalgi (tun) — 30/30 test
**B (dunyo) + C (miya) + server xizmati tayyor; D (ko'rinish) Unreal yo'liga o'tdi.**

### Qo'shilganlar
- `packages/brain`: identity (11 xodim + Boss, katta orzular), emotion (birinchi shaxs, o'sish qoidasi), perception, memory (eksport/import), llm (Router, failover), mind (`think_failed` diagnostikasi, response_format'siz qayta urinish, FreeLLM ovoz namunalari), runtime (ish kuni, kelish refleksi, salom 15/30/45°, majlis/bazm yig'ilishi, doska topshiriqlari), board (board.json → Viktor kartani NAVBAT'ga), calendar (§29), economy (ledger, 25-sana oylik, bonus/jarima, sovg'alar), meeting (Manager majlislari → qarorlar, maqtov/tanqid → his).
- `packages/server`: stream.ts (WebSocket: hello/snap 10 Hz/event, Boss token), scheduler.ts (vaqtida bir marta), **main.ts — 24/7 xizmat** (real vaqt, doska 30 s, claude_down fayli, kalendar, state.json saqlash/tiklash).
- `tools/live.ts` (haqiqiy FreeLLM bilan jonli sinov), `tools/export-viewer.ts` + `client/viewer.html` (three.js maket — Boss: "multfilm", shuning uchun **Unreal Engine 5 + MetaHuman** tanlandi: docs/UNREAL_PLAN.md).

### PC sessiyasi (session_01HP9LLq9Y9QqQt2wLyK8Ndk) natijalari
- E: Graphify yangilash FreeLLM'ga o'tdi, majlislar grafda. Profillar `auto:office-strong/fast` — Boss dashboard'da yaratadi (cloud/FREELLM_PROFILLAR.md); ungacha bepul `claude-opus-4-5` aliasi.
- F: jonli sinov 10 daq: 69 harakat, 0 xato, lekin **speech=0** → LLM xatosi jim yutilgan edi; tuzatildi (`think_failed`), qayta sinov (I vazifa) kutilmoqda.
- G: PR apex-rn/office-world#2 (`pc/assets`): 9 PBR material, 2 HDRI, 16 mebel GLB, 168 MB, CC0 — main'ga birlashtirilmagan (hajm; Unreal'ga to'g'ridan import qilinadi).
- H: UE5 va Epic Launcher YO'Q; VS Community 2026 bor (C++ game workload yo'q); C: 112 GB bo'sh; RTX 4060 Laptop 8 GB.

### Keyingi
1. I natijasi bo'yicha jonli ofisda gaplar paydo bo'lishini ta'minlash (model/format).
2. Boss: Epic Launcher + UE 5.x + VS "Game development with C++" (UE 5.x VS 2026 ni qo'llashini tekshirish; bo'lmasa VS 2022 Build Tools).
3. Unreal U1–U2: LevelBuilder (Editor Python) + CCBridge (C++ WebSocket) — kodi repo'ga `unreal/` ichida tayyorlanadi.
4. Serverga o'rnatish: systemd unit (main.ts), Caddy/Cloudflare (Boss roziligi bilan), zaxira.
5. Tiqilinch: 7.1% → 1.78% → **1.07%** (odam yonida bo'sh joy tanlash, faqat u siljiganda qayta reja; javondan kitob olish 20–60 s). Qolgani WC lobbisi va oshxona — haqiqiy miyali yuklamada qayta o'lchanadi.
6. Tayyor: Boss tanasi dunyoda (faqat Boss boshqaradi, 45° salom), `ops/` (systemd unit + install.sh, hali o'rnatilmagan), `unreal/` (LevelBuilder.py, CCBridge C++, layout_ue.json).

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

## 2026-11-03 — latency of the minds
- A thought may carry `then` (≤3 follow-up steps, no speech) → run as an errand without another model call: fewer gaps where a person stands "frozen".
- People spoken to jump the thought queue (+3 slots); their self-made plan is dropped so they answer first.
- Listening reflex: the addressee turns toward the speaker immediately (`World.faceToward`), before the reply is thought.
- LLM calls time out after 20 s (AbortSignal); `LIFE_REASONING=low` sends `reasoning_effort` (gpt-oss) for fast life thoughts; MAX_THOUGHTS default 5.
- Still to verify live (J): real reply latency with FreeLLM chains.
- Coat rack in use: arrival = hang coat → own chair; leaving = take coat → go home.
- Frictions: every failed action ("wanted X, but Y") is counted per day (`rt.topFrictions`), fed into the Manager's meetings and written to DATA/office_frictions.json — the staff's own list of what to improve in the office (a Claude work session fixes them; the Boss approves).
- Speech fix: gpt-oss spends max_tokens on reasoning → meeting turns (120-160 tokens) came back empty and were dropped silently. Now: reasoning 'low', +700 token room, one retry, `clean()` keeps only spoken words; life thoughts 1200 tokens, reflection 1100.

## 2026-11-03 — Mind v2 (phase 1 of the behaviour upgrade)
- Body needs (`brain/src/needs.ts`): hunger, thirst, caffeine (per coffeePerDay), bladder, mental fatigue, social, nicotine (smokers). They rise with time, fall when an action meets them, appear in the prompt as first-person feelings, and a pressing one (≥0.8) interrupts desk work. No schedules.
- Real desk work: `use desk.<me> work` while seated in `chair.<me>` (typing, 10-60 min); offered in every prompt. People stand up / sit down by themselves when an action needs it (mind auto-step), drink the coffee they made (consume, hands free), errands no longer stand a seated person up for seated steps.
- Morning plan: one background call per person per day ("HH:MM – what"), shown in every later thought and stored as memory.
- Conversations: per-partner dialogue (last 6 lines) in the prompt, closed naturally.
- Headless 4 h check (scripted model): 10/10 staff typing at 13:00, coffee/toilet trips happen, 0 frictions (was: 2/10 typing, 179 rejections).
- Month simulator `tools/month.ts [days] [start]` (scripted model, real everything else; ~20 s per office day). 30-day run: ~226 speech/day, ~78 % desk work, all meetings/payday/birthday fired. Bugs found and fixed: typing while standing, hands stuck full (staff starved), errand double-consume blocking thoughts, cleaner blocked dusting desks (furniture approach), urgent needs while idle. Open: guard sometimes still in at 23:00 (door/exit after everyone left), rare 10-min stall at the coat rack, 8-10 of 11 seated in some meetings.

## HANDOFF (2026-11-04) — read this first in a new session
**Where things are**
- Code: GitHub `apex-rn/office-world`, branch `main` (all merged; 43 tests; `npm test`, `npx tsc --noEmit`).
- Boss's PC (Windows): repo `C:\Users\MSI\office-world` (always on main; the desktop icons pull it), office data/logs
  `%USERPROFILE%\office-world-data\` (`office.log` = service log incl. `llm:`/`meeting:`/`think:`/`clock:` lines,
  `state.json`, `meeting-*.json`), launcher config `%USERPROFILE%\.config\office\launch.json` (+ `launcher.log`),
  desktop icons `office.bat` (watch), `office-boss.bat` (walk in as Boss), `office-stop.bat`.
  Godot 4.7.2 `C:\Users\MSI\apps\godot\`, portable Node `C:\Users\MSI\apps\node`. PC session notes: `C:\Users\MSI\monetization\cloud\FAILOVER_PROGRESS.md`.
- Models: FreeLLM local `127.0.0.1:3001` (chains to be created in its dashboard: `auto:office-fast`, `auto:office-strong`);
  never bare `auto`. Vultr server 64.176.231.4 suspended (unpaid) until ~10th — not used now.
**Who owns what** (two Claude sessions): cloud session = `packages/**` (brain, sim, catalog, server) + merges to main;
PC session (Remote Control) = `godot/**`, `ops/windows/**`, assets, Blender (`tools/assets/furnish.py`). PC pushes `pc/*` branches; cloud squash-merges after tests. PC must not use send_message.
**State**: Mind v2 (needs, desk work, day plan, conversations), meetings seat 11/11 and speak, greetings with words,
smooth standing turns, live screens/kanban/whiteboard, Boss avatar, one-click launch. Month sim: `node --import tsx tools/month.ts 30 2026-11-01`.
**Next**: (1) PC: pc/smooth (interpolation, sit/stand transitions, head turns); (2) real-model 15-min check after the
morning meeting (speech quality, desk work, WC/kitchen); (3) FreeLLM chains; (4) Graphify office graph (PC, after FreeLLM);
(5) behaviour phase 2 (gestures, small talk topics from the graph). Open: brief jam at the meeting-room door.
