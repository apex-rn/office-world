// Live office run with real models (on the server, next to FreeLLMAPI).
//   FREELLM_URL=http://127.0.0.1:3001 FREELLM_KEY_FILE=~/.config/freellmapi/unified_key \
//   FAST_MODEL=<fast> STRONG_MODEL=<strong> npx tsx tools/live.ts [minutes=10] [speed=1] [log=live.jsonl]
// Logs every speech, greeting and action to JSONL (no secrets). speed>1 accelerates the world clock.
import { appendFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { OFFICE_V1 } from '../packages/catalog/src/layout.js';
import { OpenAICompatClient, Router } from '../packages/brain/src/llm.js';
import { OfficeRuntime } from '../packages/brain/src/runtime.js';
import { World } from '../packages/sim/src/world.js';

const [minutes = '10', speed = '1', log = 'live.jsonl'] = process.argv.slice(2);
const keyFile = (process.env.FREELLM_KEY_FILE ?? '~/.config/freellmapi/unified_key').replace(/^~/, homedir());
const key = process.env.FREELLM_KEY ?? readFileSync(keyFile, 'utf8').trim();
const free = new OpenAICompatClient(process.env.FREELLM_URL ?? 'http://127.0.0.1:3001', key, process.env.FAST_MODEL ?? 'auto');
const router = new Router(free, null, { fast: process.env.FAST_MODEL ?? 'auto', strong: process.env.STRONG_MODEL ?? 'auto' });

const w = await World.create(structuredClone(OFFICE_V1), Date.now(), Date.now() % 100000);
const rt = new OfficeRuntime(w, router, { maxConcurrentThoughts: Number(process.env.MAX_THOUGHTS ?? 3) });
const write = (o: object) => appendFileSync(log, JSON.stringify(o) + '\n');
const origDrain = w.drainEvents.bind(w);
w.drainEvents = () => { const ev = origDrain(); for (const e of ev) if (e.type !== 'yield') write(e); return ev; };
let seenSocial = 0;

const dt = 0.05, end = Date.now() + Number(minutes) * 60_000 / Number(speed);
const tick = setInterval(() => {
  for (let k = 0; k < Number(speed); k++) rt.step(dt);
  for (; seenSocial < rt.social.length; seenSocial++) write(rt.social[seenSocial]!);
  if (Date.now() > end) {
    clearInterval(tick);
    const people = [...w.bodies.values()].map(b => `${b.spec.name}: ${b.state}${b.active ? ` (${b.active.verb})` : ''}`);
    console.log(`done. activity=${rt.activity}\n${people.join('\n')}\nlog: ${log}`);
    process.exit(0);
  }
}, dt * 1000);
