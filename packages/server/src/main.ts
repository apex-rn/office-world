// Compound Chronicle office service — runs the world 24/7 on the server (WORLD_PLAN §17).
//   FREELLM_URL=http://127.0.0.1:3001 FREELLM_KEY_FILE=~/.config/freellmapi/unified_key \
//   FAST_MODEL=auto:office-fast STRONG_MODEL=auto:office-strong BOARD_PATH=~/office/board.json \
//   DATA_DIR=~/office-world-data PORT=8765 BOSS_TOKEN_FILE=~/office-world-data/boss.token npx tsx packages/server/src/main.ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseBoard } from '../../brain/src/board.js';
import { Ledger } from '../../brain/src/economy.js';
import type { Feelings } from '../../brain/src/emotion.js';
import type { MemoryStream } from '../../brain/src/memory.js';
import { STAFF } from '../../brain/src/identity.js';
import { OpenAICompatClient, Router } from '../../brain/src/llm.js';
import { runMeeting } from '../../brain/src/meeting.js';
import { OfficeRuntime } from '../../brain/src/runtime.js';
import { OFFICE_V1 } from '../../catalog/src/layout.js';
import { seoulTime } from '../../shared/src/time.js';
import { World } from '../../sim/src/world.js';
import { dueNow } from './scheduler.js';
import { startStream } from './stream.js';

const home = (p: string) => p.replace(/^~/, homedir());
const env = (k: string, d: string) => process.env[k] ?? d;
const DATA = home(env('DATA_DIR', '~/office-world-data'));
mkdirSync(DATA, { recursive: true });
const STATE = join(DATA, 'state.json');

const key = process.env.FREELLM_KEY ?? readFileSync(home(env('FREELLM_KEY_FILE', '~/.config/freellmapi/unified_key')), 'utf8').trim();
const free = new OpenAICompatClient(env('FREELLM_URL', 'http://127.0.0.1:3001'), key, env('FAST_MODEL', 'claude-opus-4-5'));
const router = new Router(free, null, { fast: env('FAST_MODEL', 'claude-opus-4-5'), strong: env('STRONG_MODEL', 'claude-opus-4-5') });
const claudeDown = home(env('CLAUDE_DOWN_FILE', '~/office/claude_down_until'));

const world = await World.create(structuredClone(OFFICE_V1), Date.now(), Date.now() % 1_000_003);
const rt = new OfficeRuntime(world, router, { maxConcurrentThoughts: Number(env('MAX_THOUGHTS', '3')) });
const ledger = new Ledger();
const done = new Set<string>();

// ---- restore ----
if (existsSync(STATE)) {
  try {
    const s = JSON.parse(readFileSync(STATE, 'utf8'));
    ledger.load(s.ledger);
    for (const k of s.done ?? []) done.add(k);
    const minds = (s.minds ?? {}) as Record<string, { memory: ReturnType<MemoryStream['toJSON']>; feelings: Feelings }>;
    for (const [id, m] of Object.entries(minds)) {
      const mind = rt.minds.get(id); if (!mind) continue;
      mind.memory.load(m.memory); mind.feelings = m.feelings;
    }
    console.log(`restored state: ${ledger.all().length} ledger entries, ${done.size} done keys`);
  } catch (e) { console.error('state restore failed, starting fresh:', (e as Error).message); }
}
function save(): void {
  const s = { savedAt: Date.now(), ledger: ledger.toJSON(), done: [...done].slice(-500), minds: Object.fromEntries([...rt.minds].map(([id, m]) => [id, { memory: m.memory.toJSON(), feelings: m.feelings }])) };
  writeFileSync(`${STATE}.tmp`, JSON.stringify(s)); renameSync(`${STATE}.tmp`, STATE);
}

// ---- stream for renderers ----
const tokenFile = home(env('BOSS_TOKEN_FILE', join(DATA, 'boss.token')));
const stream = startStream(rt, { port: Number(env('PORT', '8765')), hz: 10, bossToken: existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : undefined });

// ---- world clock: real time ----
setInterval(() => rt.step(0.05), 50);

// ---- board polling ----
const boardPath = home(env('BOARD_PATH', '~/office/board.json'));
setInterval(() => {
  try { if (existsSync(boardPath)) rt.applyBoard(parseBoard(JSON.parse(readFileSync(boardPath, 'utf8')))); } catch (e) { console.error('board read failed:', (e as Error).message); }
  try { if (existsSync(claudeDown)) router.claudeDownUntil = Date.parse(readFileSync(claudeDown, 'utf8').trim()) || 0; } catch { /* optional */ }
}, 30_000);

// ---- calendar: meetings, birthdays, anniversaries, payday ----
let busy = false;
setInterval(async () => {
  if (busy || !rt.plan) return;
  busy = true;
  try {
    const t = seoulTime(world.now);
    for (const d of dueNow(rt.plan, t.minuteOfDay, done)) {
      done.add(d.key);
      stream.broadcastEvent({ type: 'calendar', ...d });
      if (d.kind === 'meeting') {
        // wait until people have gathered (runtime walks them in from start-5 min)
        const out = await runMeeting(d.type, world, router, rt.minds, { cards: [...rt.cardOf.values()], metrics: env('METRICS_LINE', 'see analytics'), bossPresent: world.present('boss') });
        stream.broadcastEvent({ type: 'meeting_done', meeting: d.type, decisions: out.decisions, praise: out.praise, criticism: out.criticism });
        writeFileSync(join(DATA, `meeting-${t.date}-${d.type}.json`), JSON.stringify(out, null, 1));
      } else if (d.kind === 'birthday') {
        const givers = [...rt.minds.keys()].filter(id => world.present(id));
        ledger.birthdayGifts(world.now, d.person, givers, d.giftUsdEach);
        for (const [id, m] of rt.minds) if (world.present(id)) await m.feel({ kind: 'celebration', what: id === d.person ? 'own_birthday' : 'birthday' });
      } else if (d.kind === 'anniversary' || d.kind === 'new_year') {
        for (const [id, m] of rt.minds) if (world.present(id)) await m.feel({ kind: 'celebration', what: d.kind === 'new_year' ? 'office_anniversary' : d.label.includes('year') ? 'office_anniversary' : 'monthly_31' });
      } else if (d.kind === 'payday') {
        const pay = ledger.payday(world.now, STAFF);
        for (const p of pay) await rt.minds.get(p.id)?.feel({ kind: 'salary', usd: p.paid, expectedUsd: p.base });
        stream.broadcastEvent({ type: 'payday', paid: pay.map(p => ({ id: p.id, usd: p.paid })) });
      }
    }
  } catch (e) { console.error('calendar step failed:', (e as Error).message); }
  finally { busy = false; }
}, 20_000);

// ---- persistence ----
setInterval(save, 60_000);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { try { save(); } finally { stream.close(); process.exit(0); } });
console.log(`office service up: ws://0.0.0.0:${env('PORT', '8765')}, data ${DATA}`);
