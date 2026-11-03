# COMPOUND CHRONICLE — OFFICE WORLD: TO'LIQ XARITA VA REJA (v1.0)

> Holat: **TASDIQLANGAN (2026-11-03)**. Qarorlar: §23.
> Bu fayl — har bir yangi Claude sessiyasi birinchi o'qiydigan yagona manba. `PROGRESS.md` esa "qayerda to'xtadik"ni saqlaydi.
> Til: hujjat o'zbekcha, kod/identifikatorlar inglizcha.

---

## 0. Maqsad va o'zgarmas tamoyillar

**Maqsad:** Compound Chronicle kanalining haqiqiy jamoasi yashaydigan, 24/7 ishlaydigan, **mukammal real 3D ofis**. Har bir xodim — o'z shaxsi, xotirasi, his-tuyg'usi, odatlari va tanasi bor AI. Ular kanal uchun **haqiqiy ish** qiladi, o'zaro maslahatlashadi, tanqidlashadi, kuladi, majlis qiladi, maosh oladi. Egasi o'z tanasi bilan ofisga kirib yura oladi.

**O'zgarmas tamoyillar (buzilmaydi):**
1. **Takror sikl yo'q.** Hech qanday oldindan yozilgan 30 daqiqa/1 soatlik ssenariy yo'q. Har bir harakat — AI qarori yoki haqiqiy voqea natijasi.
2. **Fizik haqiqat.** Hamma narsa metrda, real o'lchamda, tayanchda turadi; hech kim/hech narsa boshqa narsaning ichidan o'tmaydi.
3. **Shaxs modeldan tashqarida.** Xodimning "o'zi" (identity package + xotira + holat) serverda saqlanadi. Claude yoki FreeLLM — faqat fikrlash dvigateli; model almashganda shaxs **o'zgarmaydi**.
4. **Miya qaror qiladi, tana bajaradi.** AI faqat yuqori darajadagi buyruq beradi ("kofe mashinaga bor"); yurish, aylanib o'tish, animatsiya — dvigatelda. AI fizikani buza olmaydi.
5. **Haqiqiy ish bilan bog'liq.** Ofisdagi voqealar `board.json`dagi haqiqiy kartalardan keladi; majlis qarorlari doskaga qaytib yoziladi.
6. **Kam token.** Hayot = FreeLLM (bepul). Claude = faqat qiyin ish. Hodisaga asoslangan o'ylash, qat'iy byudjet.
7. **Server markaz, noutbuk yordamchi.** Hech narsa noutbukning yoniq turishiga bog'liq emas.
8. **Xavfsizlik chegaralari saqlanadi:** pul sarflamaslik, o'chirmaslik, parol kiritmaslik, ≤4 YouTube yuklash/24 soat, ofis ichidagi gap haqiqiy buyruqqa aylanmaydi (faqat Direktor doska orqali, mavjud qoidalar bilan).

---

## 1. Qabul qilish mezonlari ("mukammal" ning o'lchovi)

Har bir bosqich shu mezonlardan o'tmaguncha **tayyor emas**.

| Soha | Mezon | Qanday tekshiriladi |
|---|---|---|
| Dunyo | Placement validator: 0 xato (havoda/botgan/qiyshiq/noto'g'ri o'lcham) | `npm test` + CI |
| Dunyo | Har bir katalog buyumi o'lchami manba bilan, ±2 sm | katalog testi |
| Tana | 24 soatlik tezlashtirilgan simulyatsiyada 0 ta kapsula-kapsula to'qnashuvi, 0 ta devordan o'tish | headless sim testi |
| Tana | Oyoq sirpanishi < 3 sm/qadam (yurish tezligi ↔ animatsiya qadami mos) | animatsiya testi |
| Tana | O'tirganda son o'rindiqda ±2 sm, tizza stol ostida botmaydi | anchor testi + skrinshot |
| Miya | 24 soatda bir xil ≥3 harakatli zanjir takrori < 1% | sim log tahlili |
| Miya | Yo'q odamga gapirish = 0 | Body API rad etadi + test |
| Miya | Xarakter izchilligi: "bitta odammi?" baholovchi ≥ 90% | haftalik LLM-judge |
| Miya | Har suhbatda sabab + natija (yoki "shunchaki gap" belgisi) | dialog log |
| Ish | Ofis voqealari ↔ board.json 100% mos | integratsiya testi |
| Klient | Kompyuter 60 FPS, telefon ≥30 FPS (past sifat rejimi) | Playwright perf |
| Ops | Server qayta yonsa holat ≤10 s yo'qotish bilan tiklanadi | chaos test |
| Ops | Claude limit → FreeLLM ≤1 daqiqada, tiklanganda qaytish avtomatik | failover testi |
| Token | FreeLLM ≤ 1.5M token/kun (ofis hayoti), Claude ofis hayotiga 0 | byudjet logi |

---

## 2. Tizim xaritasi (topologiya)

```
                ┌──────────────────────────── ASOSIY SERVER (Contabo Cloud VPS M, Ubuntu 24.04) ────────────────────────────┐
 Egasi (PC/      │  Caddy (HTTPS, auth) ◄── Cloudflare Tunnel (parol bilan, egasi roziligi bilan)                             │
 telefon) ──────►│     ├── /world  → client (three.js statik fayllar)                                                        │
                 │     └── /ws     → world-sim (WebSocket)                                                                   │
                 │                                                                                                           │
                 │  world-sim (Node/TS, 20 Hz)  ◄──►  brain-service (Node/TS)  ◄──►  FreeLLMAPI (localhost:3001)             │
                 │     │  Rapier fizika                 │  identity/memory/plan         │  Gemini/Groq/Cerebras/OpenRouter        │
                 │     │  Recast navmesh+Crowd          │  model router + failover      │                                         │
                 │     ▼                                ▼                               └► Claude (claude -p / Agent SDK, faqat     │
                 │  SQLite (WAL): world snapshot, event log, memory(+vec), ledger, budgets        qiyin ish)                     │
                 │     ▲                                                                                                     │
                 │  board-adapter ◄──► office.py / board.json (haqiqiy ish doskasi)                                          │
                 │  work-runner (run_agent.sh v2: Claude↔Free failover, yagona identity)                                     │
                 │  job-queue (render/upload ishlari: server | laptop | kaggle)                                              │
                 │  render pipeline (make_short, whisper)  •  graphify ~/kb  •  backups  •  auto-continue  •  tg-notify       │
                 └───────────────▲───────────────────────────────────────────────────────────▲──────────────────────────────┘
                                 │ (noutbuk o'zi ulanadi, SSH/HTTPS outbound)                   │ Kaggle API
                 ┌───────────────┴──────────────┐                                ┌─────────────┴─────────────┐
                 │ NOUTBUK (Windows+WSL, GPU)   │                                │ KAGGLE (bepul GPU)        │
                 │ laptop-worker: Blender CUDA, │                                │ FLUX rasm, Chatterbox     │
                 │ Chrome yuklash, lightmap bake│                                │ ovoz, zaxira Blender      │
                 │ shart: zaryad+limitsiz net+  │                                │ render, zaxira nusxa      │
                 │ egasi faol emas              │                                │                           │
                 └──────────────────────────────┘                                └───────────────────────────┘
 GitHub (private repo `office-world`) = kod manbasi; bulutdagi Claude sessiyalari shu yerda quradi, CI testlar.
 Vultr = o'tish davri; hammasi ko'chgach bekor qilinadi (egasining collector/meme/tg servislari haqida alohida qaror).
```

### 2.1 Komponentlar va RAM byudjeti (16 GB server)
| Servis | systemd MemoryMax | Izoh |
|---|---|---|
| world-sim | 600 MB | fizika + navmesh + 12 agent |
| brain-service | 400 MB | LLM so'rovlari tarmoqda, og'ir hisob yo'q |
| FreeLLMAPI | 400 MB | |
| SQLite + sqlite-vec | (fayl) | ~1–3 GB disk/yil |
| claude -p ishlari (≤3 parallel) | 1.5 GB | navbat orqali |
| render (make_short) | 2 GB | navbat: bir vaqtda 1 ta |
| whisper | 1 GB | |
| QA headless Chromium | 1 GB | |
| graphify, cron | 0.5 GB | |
| OS + qolganlar | 1.5 GB | |
| **Zaxira** | **~6 GB** | |

**Resurs rejimlari:** render yoki QA ishlayotganda world-sim fizika tikini 20→10 Hz, brain o'ylash intervalini ×1.5 qiladi (ko'rinishda sezilmaydi).

---

## 3. Repozitoriya tuzilmasi (monorepo)

```
office-world/
  docs/            WORLD_PLAN.md, PROGRESS.md, DECISIONS.md, CATALOG_SOURCES.md, PROTOCOL.md
  packages/
    shared/        tiplar, birliklar, katalog sxemasi, tarmoq protokoli, vaqt (Asia/Seoul)
    catalog/       buyumlar katalogi (o'lcham+manba), affordance'lar, validator
    sim/           world-sim: holat, fizika (Rapier), nav (recast+crowd), Body API, sezgi, ehtiyojlar, tick
    brain/         identity, memory (stream/retrieval/reflection), planner, decider, dialog, meeting, router
    work/          board-adapter, work-runner (run_agent v2), job-queue, laptop-worker protokoli
    economy/       ledger, payroll, baholash qoidalari, ofisdan tashqari hayot
    client/        three.js ilova: render, animatsiya, egasi tanasi, UI, mobil rejim
    assets/        manba modellar, litsenziya reestri, pipeline (gltf-transform, bake skriptlari)
    ops/           systemd unitlar, Caddy, backup, auto-continue, deploy, health
    tools/         headless sim runner, eval (izchillik, takror), skrinshot regressiya
  CLAUDE.md        sessiya qoidalari: avval graphify, keyin PROGRESS.md, kichik vazifalar, testlar
```

---

## 4. Asosiy birliklar va konventsiyalar
- **Uzunlik:** metr. **Massa:** kg. **Vaqt:** real Asia/Seoul vaqti, 1:1 (Koreyada yozgi vaqt yo'q).
- **Koordinatalar:** three.js Y-up, o'ng qo'l; pol `y=0`. Eski sahifa (x,y,z) → yangi (x, z, y) xaritasi `shared/coords.ts`da.
- **Tik:** sim 20 Hz; tarmoq: 10 Hz snapshot+delta; klient 100 ms interpolatsiya buferi.
- **ID'lar:** `desk.writer`, `chair.writer`, `mug.leo.1`, `agent.leo`, `owner`.

---

## 5. Dunyo modeli

### 5.1 Ofis rejasi (zonalar)
Hozirgi 18×13 m, shift 3.0 m saqlanadi, lekin real ofisdek zonalarga bo'linadi:

| Zona | Tarkib |
|---|---|
| Kirish / qabulxona | eshik (0.9×2.1 m), qorovul stoli (post emas, ish joyi), kiyim ilgich, kirish kartasi o'quvchi |
| Ochiq ish zonasi | 8 ta ish stoli (har biriga shaxsiy predmetlar), kabel kanallari, stol lampalari |
| Direktor kabineti | shisha devor + eshik, stol, 2 mehmon stuli, javon |
| Majlis xonasi | 10 kishilik stol, ekran/TV, doska (whiteboard), eshik |
| Oshxona (pantry) | kofe mashina, choynak, muzlatkich, lavabo, mikroto'lqinli pech, stol+4 stul, axlat qutilari |
| Dam olish burchagi | divan, kofe stoli, o'simliklar, kitob javoni |
| WC | 2 kabina (eshik qulfi: band/bo'sh), lavabo+oyna |
| Printer/omborxona | printer, qog'oz, quti, server/GPU javoni |
| NAVBAT taxtasi | devordagi haqiqiy kanban doska (kartalar fizik qog'oz sifatida) |
| Balkon / chekish joyi | tashqarida, eshik orqali (yopiq ofisda chekilmaydi) |

Yakuniy reja `catalog/layouts/office_v1.json` da; validator o'tkazadi; egasi tasdiqlaydi.

### 5.2 Entity turlari
`Fixture` (devor, deraza, eshik — statik), `Furniture` (stol, stul, divan), `Device` (kofe mashina, PC, lampa, printer, muzlatkich, TV, lavabo, unitaz), `Item` (krujka, ovqat, qog'oz, quloqchin — ko'chma), `Character` (agent, owner).

### 5.3 Katalog sxemasi (har bir buyum)
```ts
{ id, kind, name,
  dims: {w,d,h},            // metr, real
  source: "url/standart",   // o'lcham manbasi (majburiy)
  mass, mesh, collider: "box|convex|compound",
  support: [{ name:"top", height, polygon }],   // ustiga narsa qo'yiladigan yuzalar
  anchors: { seat:{pos,rot}, use:{pos,rot}, grasp:{pos}, stand:[...], viewTarget },
  affordances: [{ verb:"brew_coffee", pre:[...], effects:[...], duration:[45,75], anim:"use_machine", capacity:1 }],
  states: { power:"on|off", fill:0..1, dirty:false, occupiedBy:null } }
```

### 5.4 Real o'lchamlar (boshlang'ich jadval; har biri manba bilan `CATALOG_SOURCES.md`da tasdiqlanadi)
| Buyum | O'lcham |
|---|---|
| Ish stoli | 140×70 sm, balandlik 74 sm |
| Ofis stuli | o'rindiq 46 sm (42–51 sozlanadi), suyanchiq 95–115 sm, asos Ø65 sm |
| Monitor 24" | ekran 53.1×29.9 sm, korpus ~54×32 sm, stend balandligi bilan ~45 sm, ko'z balandligiga yuqori cheti |
| Monitor 27" | ekran 59.8×33.6 sm |
| Klaviatura | 44×13 sm; sichqoncha 12×6 sm |
| Stol lampasi | balandlik 40–50 sm, asos Ø15–18 sm |
| Krujka | Ø8.5 sm, h 9.5 sm, 350 ml |
| Noutbuk 14" | 32×22 sm |
| Eshik | 90×210 sm; WC kabina eshigi 70×200 |
| Shift | 300 sm; deraza tokchasi 90 sm |
| Divan 3 o'rinli | 210×90 sm, o'rindiq 43 sm |
| Majlis stoli | 300×120 sm, h 74 |
| Kofe mashina | 30×45×40 sm, stol ustida (h 90 sm) |
| Muzlatkich | 60×65×180 sm |
| Kanban doska | 180×120 sm, pastki cheti 90 sm |
| Odam | bo'y 160–185 sm (har biriga individual), kapsula radius 0.25 m |

### 5.5 Placement validator (har o'zgarishda)
1. **Tayanch:** buyum pastki yuzasi tayanch yuzasidan ±5 mm.
2. **Turg'unlik:** og'irlik markazi proyeksiyasi tayanch poligoni ichida.
3. **To'qnashuv:** collider kesishmasi = 0 (ruxsat etilgan kontaktlar bundan mustasno).
4. **Chegaralar:** xona ichida; devor buyumlari devorda.
5. **Yo'laklar:** asosiy yo'lak ≥ 90 sm, eshik oldi 120×120 sm bo'sh.
6. **Mantiq:** monitor stolga qaragan + egasining stuli tomonga; lampa ishlovchi tomonda; stul stol oldida; elektr qurilmasi rozetka radiusida (≤1.5 m kabel).
7. **Ergonomika:** monitor yuqori cheti o'tirgan ko'z balandligida (±5 sm), masofa 50–75 sm.

---

## 6. Fizika (Rapier, `@dimforge/rapier3d-compat`)
- Statik: devorlar, mebel (fixed). Kinematik: odamlar (character controller). Dinamik: faqat qo'ldan qo'yilgan/tushgan buyumlar (keyin uxlaydi).
- Qo'lda olib yurilgan buyum — qo'l suyagiga "attach" (fizikasiz), qo'yilganda katalogdagi `support` yuzasiga aniq joylashtiriladi (jitter yo'q).
- Eshiklar: menteşali, ochilish burchagi; yopiq eshik navmeshda to'siq.
- Determinizm: fiksirlangan qadam; snapshotdan qayta tiklash.

## 7. Navigatsiya (recast-navigation-js + DetourCrowd)
- Navmesh statik colliderlardan avtomatik pishiriladi (agent radius 0.25, balandlik 1.8, qadam 0.3).
- Stullar, ochiq/yopiq eshiklar — `TileCache` dinamik to'siqlari.
- **DetourCrowd** — odamlar bir-birini aylanib o'tadi (RVO uslubi). Egasi tanasi ham crowd a'zosi (u ham boshqalar ichidan o'tmaydi).
- Tor joyda kutish/yo'l berish; eshikda navbat; "tiqilib qoldim" holati → qayta reja.
- Yurish tezligi: odatiy 1.25–1.4 m/s (individual), shoshilganda 1.6, charchaganda 1.1.

## 8. Tana va animatsiya (client tomonda)
- **Personajlar:** Quaternius Universal Base Characters (CC0) + modular kiyim; har xodimga individual bo'y, tana, soch, kiyim, rang.
- **Animatsiya kutubxonasi:** Quaternius Universal Animation Library (CC0) asosiy; yetishmagani Mixamo (shaxsiy loyiha uchun ruxsat) — litsenziya reestriga yoziladi.
- **Kerakli klipslar:** idle (×4 variant), walk/walk_fast/walk_tired, turn, sit_down/stand_up (stul tortish bilan), sit_idle, typing, mouse, writing, reading, phone, drink, eat, talk (×4 gest), listen/nod/laugh/shrug, point (majlis), clap, carry, pick_low/pick_table/place, open_door, use_machine, wash_hands, stretch, smoke, sad_idle, happy_idle, wave.
- **Blend daraxti:** 0.2–0.35 s cross-fade; yurish fazasi tezlikka sinxron (stride-matching) → sirpanish yo'q.
- **IK:** oyoq — polga; qo'l — grasp anchor (krujka, klaviatura, eshik tutqichi); bosh — qarash nishoni (suhbatdosh, monitor).
- **O'tirish:** stulning `seat` anchori; yaqinlashish → stulni 15 sm tortish → o'girilish → o'tirish → stulni stolga surish.
- **Server–klient bo'linishi:** server pozitsiya, yo'nalish, harakat holati va vaqt chizig'ini yuboradi; klient animatsiyani shu asosda o'ynaydi (barcha tomoshabinlarda bir xil).

## 9. Body API (miya ↔ tana shartnomasi)
Har bir buyruq: `{ verb, args, reason }` → `accepted | rejected(code)` → `completed | interrupted`.

| Verb | Shartlar (pre) | Davomiylik |
|---|---|---|
| `go_to(target)` | target mavjud, yo'l bor | yo'l uzunligi/tezlik |
| `sit(chair)` / `stand()` | stul bo'sh, yaqinida | 2–3 s |
| `pick(item)` / `place(item, surface)` | qo'l bo'sh / ushlab turibdi; masofa ≤ 0.7 m; yuza bo'sh joyi bor | 1–2 s |
| `use(device, action)` | affordance mavjud, band emas (bo'lsa navbat) | katalogdagi |
| `eat(item)`, `drink(item)` | qo'lida, to'la | 3–15 daq (bo'lib) |
| `say(to, text, volume)` | **adresat eshitish radiusida va mavjud** | matn uzunligi |
| `start_conversation(with, purpose)` | ikkalasi mavjud, adresat band emas yoki "qisqa savol" | — |
| `work(card)` | o'z stulida, karta unga biriktirilgan | haqiqiy ish tugaguncha |
| `hand_in(card, to)` | karta tayyor, qabul qiluvchi mavjud | — |
| `call_meeting(agenda, attendees)` | faqat Direktor | — |
| `go_home()` / `arrive()` | ish vaqti chegarasi | — |
| `toilet()`, `smoke_break()`, `stretch()` | ehtiyoj/odat | — |
| `wait(reason, max)` | — | — |

Rad etish kodlari: `NOT_PRESENT`, `OCCUPIED`, `OUT_OF_REACH`, `NO_PATH`, `HANDS_FULL`, `NOT_ALLOWED`, `BUSY`. Rad etilsa — miya sababni ko'radi va qayta qaror qiladi.

## 10. Sezgi (perception)
- **Ko'rish:** zona + nur (raycast) ko'rinishi, 12 m; shisha devordan ko'rinadi, yopiq eshikdan yo'q.
- **Eshitish:** oddiy gap 5 m, baland 10 m, shivir 1.5 m; majlis xonasi yopiq bo'lsa tashqariga eshitilmaydi.
- **Bilim:** faqat ko'rgan/eshitgan/aytilgan narsa (yashirin "hamma narsani bilish" yo'q). Oxirgi ko'rilgan joylar xotirasi.
- **Kuzatuv matni** (≤300 token): joy, vaqt, qo'lidagi, yaqindagilar va ular nima qilyapti, buyumlar holati, unga gapirilgan gap, ehtiyojlar, faol karta.

## 11. Miya arxitekturasi (Generative Agents++)

### 11.1 Identity package (har bir xodim; modeldan tashqarida)
`identity/<agent>.json`: ism, yosh, jins, bo'y, ko'rinish; rol va mas'uliyat; xarakter (Big Five + qisqa tavsif); qadriyatlar; odatlar (kofe soni, chekish, ovqat, kelish vaqti oralig'i); gapirish uslubi qoidalari; **20–30 ovoz namunasi**; orzular va moliyaviy maqsadlar; boshlang'ich munosabatlar grafi; kasb qo'llanmasi (playbook); qat'iy chegaralar.

### 11.2 Xotira
- **Stream:** kuzatuv, harakat, dialog, ish natijasi, his-tuyg'u; har biri `importance (1–10)`, vaqt, embedding.
- **Retrieval:** `score = a·recency + b·importance + c·relevance`; embedding — FreeLLM embeddings; zaxira — BM25.
- **Reflection:** importance yig'indisi > chegara yoki har kecha → xulosa ("Elena bugun ikkinchi marta raqamimni tuzatdi — u menga foydali").
- **Saboqlar (o'rganish):** ish natijasi (QA, Direktor bahosi, ko'rishlar) → saboq; ≥2 marta tasdiqlansa playbook'ga; haftalik tozalash/birlashtirish.
- **Siqish:** har kecha kun xulosasi; 30 kundan eski mayda xotiralar arxivga.

### 11.3 Reja va qaror sikli
- **Ertalab:** kunlik reja (soatlik bloklar) — kartalar, majlislar, odatlar asosida.
- **Qaror triggerlari:** harakat tugadi | unga gapirildi | yangi karta/vazifa | Direktor/egasi keldi | ehtiyoj chegarasi | 5–10 daq jimlik (adaptiv).
- **Chiqish:** qat'iy JSON (`{thought, action:{verb,args}, say?, mood_delta?}`), sxema validatori; noto'g'ri bo'lsa 1 marta tuzatish so'rovi; baribir noto'g'ri bo'lsa — joriy faoliyatni davom ettirish (xavfsiz).
- **Takrorga qarshi:** oxirgi 20 harakat va 10 gap kontekstda; n-gram takror detektori → "boshqacha qil" eslatmasi.

### 11.4 Ehtiyojlar va his-tuyg'ular
- Ehtiyojlar (0–1): energiya, ochlik, chanqoq/kofe, hojat, ijtimoiy, diqqat, (chekuvchida) nikotin — individual tezlik bilan o'zgaradi.
- His-tuyg'u: valentlik/qo'zg'alish + nomlangan (quvonch, g'urur, uyat, stress, g'azab, qayg'u), sababi bilan; vaqt o'tib so'nadi; chegaralangan (zaharli spiral yo'q).
- Ta'siri: qaror promptiga, yurish tezligiga, idle animatsiyasiga, gap ohangiga.

### 11.5 Suhbat va majlis
- Suhbat = maqsadli (maslahat, yordam, tanqid, xabar, hazil, dardlashish); navbatma-navbat 2–8 replika; har ikki tomon o'z miyasi bilan.
- **Natija:** qaror/maslahat/kelishuv → xotiraga; ishga oid bo'lsa → board-adapter orqali doskaga (izoh, yangi karta taklifi — Direktor tasdiqlaydi).
- **Majlislar:** kundalik stand-up 09:10, haftalik juma 17:00, favqulodda (2+ QA xato, KPI tushishi, egasi buyrug'i). Direktor kun tartibini real ma'lumotdan tuzadi; hamma tanasi bilan xonaga keladi; navbat bilan gapirish; maqtov/tanqid; bayonnoma `meetings/` ga; qarorlar → kartalar.

### 11.6 Model router va failover
| Vazifa turi | Model |
|---|---|
| Hayot qarorlari, oddiy gap | FreeLLM tez model (Groq) |
| Muhim suhbat, majlis, refleksiya | FreeLLM kuchli model (Gemini) |
| Embedding, importance baholash | FreeLLM arzon |
| Haqiqiy ish | xodimga biriktirilgan: `claude` yoki `free` |
| Direktorning muhim qarorlari (yuklash tasdig'i) | Claude (faqat) |

- **Circuit breaker:** Claude javobida `usage_limit_reached`/429 → `claude_down_until = resetsAt`; hammasi FreeLLM'ga; `requires_claude` ishlar navbatda kutadi; `resetsAt` o'tgach avtomatik qaytish + navbatni bo'shatish.
- FreeLLM o'zi ham provayderlararo routing qiladi; butunlay ishlamasa → miya "sekin rejim": faqat tana davom etadi, yangi qarorlar kechiktiriladi (hech qachon oldindan yozilgan sikl emas).

### 11.7 Shaxs izchilligi (model almashganda)
- Ikkala model bir xil identity package, bir xil xotira, bir xil JSON sxema, bir xil uslub qoidalari bilan.
- **Uslub tekshiruvi:** gap chiqishidan oldin arzon baholovchi ovoz namunalari bilan solishtiradi; mos emas → qayta yozish.
- Ish o'rtasida almashish: `work_state` (qadam, oraliq natijalar) saqlanadi → boshqa model shu joydan davom etadi.

### 11.8 Token byudjeti
- Har xodimga soatlik byudjet; global kunlik limit (FreeLLM ≤1.5M/kun hayot uchun); oshsa — o'ylash intervali uzayadi.
- O'zgarmas prefiks (identity) keshlanadi (provayder qo'llasa); kuzatuv qisqa; xotiradan faqat top-k.
- Kechasi (uyda) — faqat kunlik refleksiya, 1 marta.

### 11.9 Xavfsizlik (miya)
- YouTube izohlari, veb matnlari — "ma'lumot", buyruq emas (prompt-injection himoyasi).
- Ofis ichidagi gap hech qachon shell buyrug'iga aylanmaydi; faqat Direktor → doska → mavjud qoidalar.

## 12. Haqiqiy ish integratsiyasi
- **board-adapter:** `board.json` o'zgarishlarini kuzatadi → dunyo voqealari:
  - yangi karta Direktorda → qorovul (Viktor) borib oladi → NAVBAT taxtasiga qog'oz qilib ilib qo'yadi;
  - agent kartani oladi → stoliga borib `work(card)`; ish davomida ekranda haqiqiy vazifa;
  - tugadi → `hand_in` Direktorga (Direktor yo'q bo'lsa — stoliga qo'yadi va xabar qoldiradi);
  - Direktor baholaydi → maqtov/tanqid → ledger;
  - QA qaytarsa → agent QA bilan suhbat → qayta ishlash.
- **work-runner (run_agent v2):** bitta skript; xodimning identity + playbook bilan ishga tushiradi; Claude yoki FreeLLM (failover); natija va saboq xotiraga qaytadi.
- **Laptop/Kaggle ishlari:** job-queue (lease + heartbeat); noutbuk shartlari: zaryad + limitsiz tarmoq + egasi faol emas; muddat yaqinlashsa → Kaggle; yuklash: hozircha noutbuk Chrome; keyin YouTube audit + Instagram Graph API.

## 13. Iqtisod (USD)
- **Maosh (oylik):** Direktor $5,000; Ssenariychi/Long/Shorts $3,200–3,500; Fakt-chek/QA/IG/YT/Publisher $2,700; Qorovul $2,200. To'lov har oy 25-sanada.
- **Ledger:** o'zgarmas yozuvlar (append-only), har birida sabab va dalil (karta ID).
- **Bonus/jarima faqat obyektiv ma'lumotdan:** vaqtida + QA birinchi urinishda → bonus; ko'rishlar bo'yicha bonus; kechikish/QA xato/strike → ushlab qolish (oyiga ≤20%).
- **Halollik qoidasi:** xatoni o'zi tan olsa — jarima 50%.
- **Haftalik baholash** Direktor bilan; **majlisda** maqtov va (ish haqidagi) tanqid, haqoratsiz.
- **Ofisdan tashqari hayot:** kechqurun arzon "kun yakuni" simulyatsiyasi — xarajat, jamg'arma, orzuga yaqinlashish; xaridlar ertasi kuni ofisda ko'rinadi (yangi quloqchin, rasm ramkasi); kayfiyatga ta'sir.
- (Kutilmoqda) ishdan bo'shatish/yollash siyosati — egasi qarori.

## 14. Boss tanasi (egasi)
- Kirish: parol/passkey → sessiya cookie; faqat egasi boshqaradi, boshqalar tomoshabin.
- Boshqaruv: WASD + sichqoncha / mobil joystik; E — foydalanish; kamera: orqadan, erkin, CCTV burchaklari.
- Xodimlar bilan yozma suhbat (perception orqali "Egasi aytdi..."); Direktorga og'zaki topshiriq → **tasdiqlash oynasi** → doskada karta.
- Xodimlar egasini taniydi; Direktor hisobot beradi.

## 15. Klient (three.js)
- PBR materiallar; statik yorug'lik — Blender'da lightmap bake (noutbuk/Kaggle), dinamik — quyosh (CSM soyalar) Seul vaqtiga ko'ra, kechki chiroqlar, monitor shu'lasi.
- Sifat rejimlari: Ultra (PC) / Mobil (soya va effektlar kam); LOD; draw-call byudjeti.
- UI: xodimlar paneli, NAVBAT, voqealar lentasi, majlis subtitrlari, 3D gap pufaklari (o'lchami matnga mos), til tanlovi (tarjima keshlanadi).
- Hozirgi 2D sahifa yangi 3D tayyor bo'lguncha ishlab turadi; almashtirish — egasi tasdig'idan keyin.

## 16. Assetlar pipeline
- Manbalar: Kenney (CC0), Quaternius (CC0), Poly Haven (CC0); Mixamo — faqat zarur bo'lsa.
- `assets/LICENSES.md` reestri; `gltf-transform` (meshopt + KTX2); katalog o'lchamiga avtomatik masshtab; validator.

## 17. Persistensiya va ops
- SQLite WAL: `world_snapshot` (10 s), `events` (append), `memory`, `ledger`, `budgets`, `jobs`.
- Server qayta yonsa: oxirgi snapshot + event replay; uzoq uzilishdan keyin — "o'tkazib yuborilgan vaqt" xulosasi (har bir xodimga qisqa: "server 3 soat o'chdi, men uyda edim").
- systemd unitlar + MemoryMax; health endpoint; watchdog; log rotatsiya; Telegram orqali ogohlantirish (egasining tg bot'i — ruxsat bilan).
- Zaxira: har kecha → Kaggle private dataset + noutbuk (ulanganda).
- Deploy: GitHub → serverga `git pull` + test + restart (CI yashil bo'lsa).

## 18. Graphify integratsiyasi
- `office-world` repozitoriyasi serverdagi `~/kb` grafiga qo'shiladi; har merge'dan keyin va har kecha yangilanadi.
- `CLAUDE.md`: har sessiya kodni o'qishdan oldin graphify'dan so'raydi (token tejash).
- Hujjatlar (reja, qarorlar, majlis bayonnomalari) ham grafda → Direktor o'tgan qarorlarni topa oladi.

## 19. Qurish jarayoni va token tejash
- Har sessiya: `PROGRESS.md` o'qiydi → bitta aniq vazifa → test → `PROGRESS.md` yangilaydi → commit/push.
- Caveman: serverdagi headless agentlarda va hujjatlarni `compress` qilishda; egasi bilan suhbatda va ofis dialoglarida **yo'q**.
- $100 bonus (5-noyabrgacha): faqat yadroga (6–11-bo'limlar).
- **Auto-continue (serverda):** limit tiklanganda `PROGRESS.md` bo'yicha davom etadi; kunlik bonus sarfi limiti; 2 ketma-ket xato → to'xtaydi va egasiga xabar; hech narsa o'chirmaydi, pul sarflamaydi, YouTube/Instagram'ga tegmaydi.

## 20. Test va tekshiruv
- Unit: katalog, validator, Body API qoidalari, ledger.
- Simulyatsiya: 24 soat ×60 tezlikda headless — to'qnashuvlar, takror zanjirlar, "yo'q odamga gap", tiqilishlar.
- LLM eval: izchillik (shu odammi?), rolga sodiqlik, foydali suhbat ulushi.
- Vizual: Playwright skrinshot regressiya (har zona, kun/tun).
- Chaos: FreeLLM o'chiq, Claude limit, noutbuk oflayn, server restart, disk to'la.
- Perf: FPS (PC/telefon), server CPU/RAM.

## 21. Chekka holatlar (hisobga olingan)
- Ikki kishi bitta stul/kofe mashinaga → rezervatsiya + navbat + muloyim gap.
- Eshikda to'qnashuv → crowd yo'l beradi; tor joyda kutish.
- Buyum yo'qoldi/boshqa joyda qoldi → holat saqlanadi, egasi topadi yoki qorovul yig'ib qo'yadi.
- Egasi yo'lni to'sib turdi → aylanib o'tish yoki "uzr" deb kutish.
- LLM noto'g'ri JSON → tuzatish → xavfsiz davom.
- LLM butunlay o'chiq → tana davom, qarorlar kechikadi (sikl emas).
- Server uzoq o'chgan → vaqt xulosasi, "sakrash" yo'q.
- Tun/dam olish/Koreya bayramlari → ofis yopiq, xodimlar uyda (ixtiyoriy navbatchi qorovul).
- "Ofis o'chirish" tugmasi → hamma uyga ketadi (animatsiya bilan), sim minimal rejim.
- Render paytida resurs tanqisligi → sekin rejim.
- Ko'p tomoshabin → snapshot fan-out, bandwidth limiti.
- Telefon zaif → past sifat rejimi.
- Xodim ishdan bo'shatildi/yollandi → identity arxivlanadi, yangi xodim "birinchi kun" bilan keladi (siyosat egasidan).
- Xarakter "buzilishi" (haddan tashqari tushkunlik/zaharlilik) → chegaralar + haftalik tekshiruv; ish baribir bajariladi.
- Prompt injection (izohlar, veb) → ma'lumot sifatida belgilanadi.
- Ma'lumot o'sishi → kecha siqish, arxiv.
- Vaqt zonasi: hammasi Asia/Seoul; server UTC — konvertatsiya bitta modulda.

## 22. Bosqichlar (yo'l xaritasi)
| # | Bosqich | Natija (qabul mezoni) | Model/manba |
|---|---|---|---|
| A | Reja va xarita (shu hujjat) | egasi tasdig'i | bonus |
| B | **Yadro 1 — dunyo:** shared, catalog+validator, sim (Rapier, recast+crowd), Body API, sezgi, headless test | 24 soat simda 0 to'qnashuv, validator 0 xato | bonus |
| C | **Yadro 2 — miya:** identity, memory, planner, decider, router+failover, dialog | FreeLLM bilan 10 xodim 1 kun yashaydi, mezonlar §1 | bonus |
| D | Klient 3D: render, personajlar, animatsiya, egasi tanasi | 60/30 FPS, sirpanish yo'q | Pro limit |
| E | Ish integratsiyasi: board-adapter, work-runner v2, job-queue, laptop-worker | doska ↔ dunyo 100% | Pro limit |
| F | Jamiyat: majlislar, maslahat, tanqid, munosabatlar | foydali suhbat ulushi o'lchanadi | Pro + Free |
| G | Iqtisod va kayfiyat, ofisdan tashqari hayot | ledger testlari | Pro + Free |
| H | Server ko'chirish (Contabo), ops, backup, auto-continue, Cloudflare | chaos testlar | Pro |
| I | Pardozlash, yorug'lik bake, telefon optimizatsiya, haftalik eval | barcha §1 mezonlar | Pro |

Taxmin: 20–30 Pro limit oynasi (bonus va tejash vositalari bilan kamroq). Har bosqich oxirida egasiga ko'rsatiladi.

## 23. Qarorlar
**Qabul qilingan (2026-11-03):**
- Unvonlar: Direktor ofisda **Manager** deb ataladi; egasi — **Boss** (ofisning eng katta egasi). Hamma Boss'ni taniydi, Manager Boss'ga hisobot beradi.
- Resurslar: Claude sessiyalari + FreeLLM + $100 bonus — uchalasi ham ishlatiladi. Bonus → yadro (B, C); FreeLLM → hayot va oddiy ishlar; Claude agentlari ishlashda davom etadi, oddiy vazifalari FreeLLM'ga o'tkaziladi.
- Auto-continue: bonusdan kuniga **≤ $50** (bonus 5-noyabrda kuyadi — to'liq yadroga sarflanadi); 2 ketma-ket xato → to'xtash + xabar.
- GitHub: private `apex-rn/office-world` (egasi ochadi; sessiyadan repo yaratib bo'lmaydi).
- Server: Contabo Cloud VPS M (asosiy), noutbuk — ixtiyoriy ishchi.

**Hali ochiq (yadroni to'xtatmaydi):**
1. Xodimlar o'zaro tili: inglizcha (taklif) + Boss bilan o'zbekcha?
2. Ish vaqti: 09:00–19:00, dam olish kunlari yopiq, Seul vaqti 1:1?
3. Ishdan bo'shatish/yollash ruxsatmi?
4. Romantik munosabatlar o'chiq (taklif: ha)?
5. Telefondan kirish uchun parol bilan himoyalangan ochiq havola (Cloudflare)?
6. Boss personajining ko'rinishi.

## 24. Xodimlar (boshlang'ich ro'yxat; to'liq kartalar C bosqichida)
| Rol | Ism | Jinsi | Qisqa fe'l |
|---|---|---|---|
| Manager (Direktor) | Daniel Park | e | xotirjam, talabchan, adolatli |
| Qorovul / ofis menejeri | Viktor Sokolov | e | kam gapiradi, hammasini payqaydi, tashqarida chekadi |
| IG Research | Mia Chen | a | trendni sezadi, energiyali |
| YT Analitika | Jun Kim | e | raqamlar odami, quruq hazil |
| Fakt-chek | Elena Novak | a | pedant, shubhachi |
| Ssenariychi | Leo Martin | e | hikoyachi, kofe ishqibozi |
| Shorts Studio | Aziza Karimova | a | tez, hook perfeksionisti |
| Long Studio | Tom Walker | e | sabrli, chuqur ishlaydi |
| QA | Sara Holm | a | qattiqqo'l, mehribon |
| Publisher | Rustam Aliyev | e | aniq vaqtli, tartibli |
| **Boss** (ofis egasi, eng katta) | egasi | | hamma uni "Boss" deb ataydi; Manager unga hisobot beradi |

## 25. Boss qarorlari v1.1 (2026-11-03)
**Ofis va dunyo**
- Asosiy eshiklar ikki tavaqali, ikkala tomonga ochiladi (1.6–1.8 m): kirish, balkon, majlis, Manager. WC eshigi 0.9 m.
- Maydonni kattalashtirish mumkin. `office_v2` rejasi: **luxury, juda qulay ofis**: keng yo'laklar, dam olish zonasi, oshxona-kafe, tug'ilgan kun va bayramlar uchun joy. Xodimlar shu yerda ishlashdan faxrlanadi.
- **Hech narsa eskirmaydi va buzilmaydi**: personajlar qarimaydi, kasal bo'lmaydi; kiyim, mebel, texnika abadiy yangi. Faqat chang bo'ladi va uni **tozalovchi** artadi. Tozalovchi alohida (11-) personaj, u ham qarimaydi.

**Xodimlar hayoti**
- Har 10 xodimning tasodifiy tug'ilgan kuni bor. Shu kuni ofisda tort bilan bazm bo'ladi; bazm qachon tugab ishga qaytilishini Manager aytadi.
- Ofis ochilgan kun **31-oktyabr**: har yili 31-oktyabr va 31 kuni bor har oyning 31-sanasi nishonlanadi.
- Salomlashish koreyscha uslubda: holatga qarab 15° (tanish), 30° (oddiy), 45° (Manager va Boss oldida) egilish. Ba'zilar qo'l berib ham salomlashadi.
- **Romantika yoqilgan**: tanishuv, yoqtirish, juft bo'lish, mehr ko'rsatish. Yaqinlik sahna ortida, ishora bilan beriladi (ochiq jinsiy sahna yo'q).
- **Janjal bo'lmaydi.** Kelishmovchilik paydo bo'lsa, Manager darhol aralashadi va vaziyatni yaxshi tomonga hal qiladi.
- Telefon orqali yozishmalar yo'q: kerakli odamning oldiga borib, og'zaki gaplashiladi.
- Xodimlar ish uchun o'z sohasiga oid YouTube Shorts va Instagram Reels'ni tomosha qilishi mumkin (tadqiqot).
- Xodimlarga singdiriladi: ular o'z sohasida o'z dunyosidagi eng yuqori maosh oluvchi xodimlar. Ofis hashamatli, ular shu ish uchun minnatdor.
- His-tuyg'u modeli (§11.4) kengaytiriladi:
  - oylik, bonus, romantika va yaqinlikdan quvonch;
  - shu quvonch kasbni qadrlash va yaxshiroq ishlash istagini oshiradi;
  - bu kayfiyat ish sifatiga ulanadi.

**Biznes maqsadlari (ofisning bosh vazifasi)**
- Ofis Compound Chronicle'ning **YouTube va Instagram** hisoblarini to'liq boshqaradi (avvalgi versiya faqat YouTube uchun qurilgan edi).
- **Muddat 31-yanvar 2027 gacha (kechi bilan shu kungacha):**
  - YouTube: monetizatsiya (YPP shartlari: 1 000 obunachi + 12 oyda 4 000 soat ko'rish YOKI 90 kunda 10M Shorts ko'rishi);
  - Instagram: 5 000+ obunachi va kamida 5 ta 1M+ ko'rishli kontent.
- Har bir xodim o'z ishida eng zo'ri bo'lishga intiladi va tajriba to'playdi (§11.2 saboqlar).
- Xavfsizlik chegaralari o'zgarmaydi (§0.8): pul sarflanmaydi, platforma qoidalari buziladi, AI-kontent belgisi qo'yiladi.

**Qurilish byudjeti:** tejamkor rejim. Har bosqich oldindan rejalashtiriladi, uzun o'lchov sikllari qilinmaydi.

## 26. Boss qarorlari v1.2 (2026-11-03)
- **Ish vaqti:** har kuni 12 soat, 09:00–21:00 KST, dam olish kunisiz. Ofis 24/7 ochiq, lekin xodimlar 21:00 dan keyin uyga ketadi.
- **Til:** xodimlar o'zaro inglizcha gaplashadi. Boss'ga murojaat qilganda va Boss eshitadigan joyda o'zbekcha gapiradi.
- **Xodimlar soni moslashuvchan:** rollar ishga qarab qo'shiladi. Manager yangi xodim olishni taklif qiladi, Boss tasdiqlaydi.
- **His-tuyg'u birinchi shaxsda:** AI o'z holatini "men" nuqtai nazaridan boshdan kechiradi. Bu holat xotiraga yoziladi va fikr, gap, tana harakati va ish sifatini boshqaradi. Oldindan yozilgan bot javoblari yo'q (§11.4 kengaytiriladi: appraisal → emotion → memory → behaviour).
- **Yaqinlik** faqat ofisdan tashqarida bo'ladi (dunyo — faqat ofis); ofisda emas, xodimning xotirasida aks etadi.
- **FreeLLM:** Contabo hozircha olinmaydi. Miya provayderdan mustaqil yoziladi (OpenAI-mos endpoint). Real sinov Vultr serverida, egasining kompyuteridagi sessiya orqali o'tkaziladi.
- **Boss personaji:** erkak, bo'yi 2.00 m, vazni 100 kg, endomorf tana tuzilishi, juda keng yelkalar, juda kuchli va chiniqqan mushaklar, massiv gavda. Yuzida chandiqlar bor, "sigma" yuz ifodasi, oqish teri, juda chiroyli. Sochi orqaga taralgan, kaltaroq. Hamma uni "Boss" deb ataydi va 45° egilib salomlashadi.

## 27. Boss qarorlari v1.3 (2026-11-03)
- Maqsad muddati **31-yanvar 2027 gacha** (o'sha kundan kechikmasdan).
- Xodimlarga singdiriladi:
  - ular shu sharafli ish uchun tanlab olingan, dunyodagi eng aqlli odamlar (IQ ~500, hammasi bir darajada);
  - chiroyli va did bilan kiyingan, hashamatli ofisda ishlaydi.
- **Dangasalik va aldov yo'q.** Tekshiruv QA va haqiqiy metrikalar orqali bo'ladi (§11.2). Xatoni o'zi erta aytgan xodim hurmat qilinadi (§13 halollik qoidasi).
- **Maosh** — Viktor (Office Keeper) har oyning 25-sanasida ofis seyfidan qo'lma-qo'l beradi. Seyfga har oyning 25-sanasida pul o'zi paydo bo'ladi (ichki valyuta, USD).
- **Xodim almashtirilganda:** Manager yangi xodim oladi. Yangi xodimga eski xodimning ish saboqlari (playbook, ish bilimi) beriladi. Qolganlar uni yangi odam deb biladi.
- Viktor'ning qurolli qo'riqchiligi — §28.

## 28. Xavfsizlik va jazoga munosabat (2026-11-03, Boss tanlovi: tavsiya qilingan variant)
- **Viktor** — qurolli qo'riqchi (AKM). Seyf va ofisni tashqi xavfdan himoya qiladi; qurol ofisning kuchli xavfsizligi belgisi sifatida ko'rinib turadi.
- **O'g'irlik yoki og'ir qoidabuzarlik** → darhol ishdan bo'shatish. Viktor xodimni ofisdan olib chiqadi, Manager hisobot beradi va yangi xodim oladi (eski xodimning ish bilimi o'tkaziladi, §27).
- **Qoidalarni himoya qilish isyon emas:** platforma qoidalari, qonun yoki xavfsizlik sabab buyruqni bajarmaslik har doim ruxsat etiladi va hech qachon jazolanmaydi.
- **Jazoga munosabat (o'sish tafakkuri):**
  - hayfsan, majlisdagi tanqid yoki kam chiqqan oylik qisqa xafagarchilik keltiradi (bir necha soat, ish sifatiga ta'sir qilmaydi);
  - keyin bu his kuchli **shijoatga** aylanadi: "men bundan ham zo'r ishlayman va qo'shimcha bonus olaman";
  - ish tezligi va sifati tushmaydi, aksincha oshadi; xato saboqqa aylanadi (§11.2);
  - bu qoida his-tuyg'u yadrosida kod sifatida bajariladi (`packages/brain/src/emotion.ts`).

## 29. Majlislar va bayramlar (2026-11-03, Boss) — `packages/brain/src/calendar.ts`
**Majlislar** (Manager olib boradi, majlis xonasida):
- har kuni ertalab 09:10–09:30: bugungi rejalar;
- har kuni kechqurun 20:20–20:50: kunlik tahlil;
- har dushanba 10:00–11:30: o'tgan hafta bo'yicha katta tahlil majlisi (muhokama va qarorlar).

**Har oyning 31-sanasi** (ofis 31-oktyabrda ochilgan): "ofis N oylik bo'ldi".
- Ish 18:00 da tugaydi; tabriklar, yaxshi tilaklar, ishlarida omad tilash.
- Bazm va diskoteka; uyga 23:30 dan keyin qaytiladi.
- 31-oktyabr = "N yillik".

**Tug'ilgan kun** (hech kim qarimaydi, lekin tug'ilgan kun bor):
- qolgan xodimlar va Manager 07:30 da kelib, ofisni "Happy Birthday" uslubida bezatadi;
- tug'ilgan kun egasi kelganda xor bo'lib "Happy birthday to you" aytiladi, keyin qarsaklar, bazm va tabriklar;
- har kim pul sovg'a qiladi (taxminan $200), boshqa sovg'a yo'q;
- bazm tugagach ishga qaytiladi (qachon qaytishni Manager aytadi).

**Yangi yil:** hamma ofisda 10 soat: 31-dekabr 18:00 dan 1-yanvar 04:00 gacha, yarim tunda sanoq (countdown). Bu vaqtda ish yo'q, faqat bazm. 1-yanvar dam olish kuni.

