// A month of office life, headless and fast, to find logic bugs (not to judge speech quality).
//   node --import tsx tools/month.ts [days=30] [start=2026-11-01]
// The model is a scripted stand-in that reacts to the cues a real model gets (body needs, being spoken to, a desk
// to work at, a plan to write, a meeting turn). Everything else — calendar, meetings, birthdays, payday, needs,
// the Body API, crowds and doors — is the real code. Prints one line per day and a list of problems found.
import { OFFICE_V1 } from '../packages/catalog/src/layout.js';
import { World } from '../packages/sim/src/world.js';
import { OfficeRuntime } from '../packages/brain/src/runtime.js';
import { type ChatMessage, type LLM, Router } from '../packages/brain/src/llm.js';
import { runMeeting } from '../packages/brain/src/meeting.js';
import { Ledger } from '../packages/brain/src/economy.js';
import { STAFF } from '../packages/brain/src/identity.js';
import { dueNow } from '../packages/server/src/scheduler.js';
import { seoulTime } from '../packages/shared/src/time.js';

const DAYS = Number(process.argv[2] ?? 30);
const START = process.argv[3] ?? '2026-11-01';
let calls = 0;
const fake: LLM = {
  async chat(m: ChatMessage[]) {
    calls++;
    const u = m[m.length - 1]!.content;
    if (/plan for today as/.test(u)) return '09:20 – draft\n11:00 – review\n13:00 – lunch\n15:00 – edit';
    if (/Close the meeting/.test(u)) return '{"speech":"Thanks all, good plan.","decisions":[{"owner":"writer","title":"Two hooks for the next Short"}],"praise":[{"who":"facts","reason":"careful check"}],"criticism":[]}';
    if (/meeting\./.test(u) && /Give YOUR OWN update|Open the/.test(u)) { const who = /You are ([A-Z][a-z]+)/.exec(u)?.[1] ?? 'I'; const job = /Your own job: ([^.]+)/.exec(u)?.[1] ?? 'work'; return `${who} here: ${job.split(':')[0]} is on track, ${Math.random().toString(36).slice(2, 7)} next.`; }
    if (/first-person conclusions|conclusions/.test(u)) return '["I work better after coffee."]';
    const chair = /sit in (chair\.[\w-]+) first/.exec(u)?.[1];
    const desk = chair?.replace('chair.', 'desk.');
    let a: Record<string, unknown>;
    if (/really need the toilet/.test(u)) a = { verb: 'use', target: 'wc.toilet1', action: 'use_toilet' };
    else if (/very hungry/.test(u)) a = { verb: 'use', target: 'kitchen.fridge', action: 'take_food' };
    else if (/need a cigarette/.test(u)) a = { verb: 'use', target: 'balcony.ashtray', action: 'smoke' };
    else if (/really thirsty/.test(u)) a = { verb: 'use', target: 'kitchen.water', action: 'fill_water' };
    else if (/badly want my coffee/.test(u)) a = { verb: 'use', target: 'kitchen.coffee', action: 'brew_coffee' };
    else if (/just spoke to me|bowed to me|greet them back|say a short greeting/.test(u)) {
      const to = /"to": "([\w-]+)"/.exec(u)?.[1] ?? null;
      a = { verb: 'say', to, text: `Hello ${Math.random().toString(36).slice(2, 6)}` };
    } else if (/want to talk to a colleague/.test(u)) a = { verb: 'say', to: null, text: `Quick question ${Math.random().toString(36).slice(2, 6)}` };
    else if (desk) a = { verb: 'use', target: desk, action: 'work' };
    else a = { verb: 'wait', seconds: 90 };
    return JSON.stringify({ thought: 'ok', action: a });
  },
};

const router = new Router(fake, null, { fast: 'f', strong: 's' });
const w = await World.create(structuredClone(OFFICE_V1), Date.parse(`${START}T07:00:00+09:00`), 2026);
const rt = new OfficeRuntime(w, router, {});
const ledger = new Ledger();
const done = new Set<string>();
const problems = new Map<string, number>();
const flag = (k: string) => problems.set(k, (problems.get(k) ?? 0) + 1);

type Day = { speech: number; failed: Map<string, number>; meetings: string[]; events: string[]; typingSamples: number; samples: number; seatedAtMeeting: number[] };
let day: Day | null = null, dayKey = '';
const blockedLog: string[] = [];
const ytlog: string[] = [];
const lastCmd = new Map<string, unknown>();
const origCommand = w.command.bind(w);
w.command = ((id: string, c: never) => { const r = origCommand(id, c); if ((r as { ok: boolean }).ok) lastCmd.set(id, c); return r; }) as typeof w.command;
rt.onEvent = e => {
  if (!day) return;
  if (e.type === 'speech') day.speech++;
  if ((e as { agent?: string }).agent === (process.env.WHO ?? 'yt_res') && /failed|done/.test(e.type) && ytlog.length < 400) ytlog.push(`${new Date(e.t).toISOString().slice(11, 19)} ${e.type} ${(e as { verb?: string }).verb} ${(e as { msg?: string; detail?: string }).msg ?? (e as { detail?: string }).detail ?? ''}`); // YTLOG
  if (e.type === 'action_failed' && /blocked/.test((e as { msg?: string }).msg ?? '') && blockedLog.length < 12) blockedLog.push(`${seoulTime(e.t).date} ${(e as { agent: string }).agent} ${JSON.stringify(lastCmd.get((e as { agent: string }).agent))}`);
  if (e.type === 'action_failed') { const b = w.bodies.get((e as { agent: string }).agent); const k = `${(e as { agent: string }).agent} ${e.verb}${b?.active?.target ? '' : ''}: ${(e as { msg?: string }).msg?.slice(0, 50)} near (${b?.pos.x.toFixed(0)},${b?.pos.z.toFixed(0)})`; day.failed.set(k, (day.failed.get(k) ?? 0) + 1); }
};

const lastMove = new Map<string, { x: number; z: number; t: number }>();
let busy = false;
const t0 = Date.now();
const end = Date.parse(`${START}T07:00:00+09:00`) + DAYS * 86_400_000;
let tick = 0;
while (w.now < end) {
  const t = seoulTime(w.now);
  const open = t.minuteOfDay >= 7 * 60 && t.minuteOfDay < 22 * 60;
  rt.step(open ? 0.1 : 1.0);                       // nights run coarse: nobody is in
  tick++;
  if (t.date !== dayKey) {
    if (day) report(dayKey, day);
    dayKey = t.date; day = { speech: 0, failed: new Map(), meetings: [], events: [], typingSamples: 0, samples: 0, seatedAtMeeting: [] };
    for (const e of rt.plan?.events ?? []) day.events.push(e.kind === 'meeting' ? `meeting:${e.type}` : e.kind);
  }
  if (tick % 100 === 0) {
    await new Promise(r => setImmediate(r));       // let the minds' promises run
    const present = [...w.bodies.values()].filter(b => b.state !== 'offsite' && b.spec.id !== 'boss');
    if (present.length) { day!.samples += present.length; day!.typingSamples += present.filter(b => b.anim === 'typing').length; }
    if (rt.activity.startsWith('meeting:')) day!.seatedAtMeeting.push(present.filter(b => b.seat?.inst.startsWith('meeting.')).length);
    // stuck: walking/standing with an active action but no movement for 10 sim minutes
    for (const b of present) {
      const lm = lastMove.get(b.spec.id);
      if (!lm || Math.hypot(lm.x - b.pos.x, lm.z - b.pos.z) > 0.3 || b.state === 'sitting' || !b.active || b.active.verb === 'wait') lastMove.set(b.spec.id, { x: b.pos.x, z: b.pos.z, t: w.now });
      else if (w.now - lm.t > 600_000) { flag(`stuck 10 min: ${b.spec.id} ${b.state} ${b.active?.verb}:${b.active?.target ?? ''}:${b.active?.phase} seat=${b.seat?.inst} at (${b.pos.x.toFixed(1)},${b.pos.z.toFixed(1)})`); lastMove.set(b.spec.id, { x: b.pos.x, z: b.pos.z, t: w.now }); }
    }
    for (const [id, m] of rt.minds) {
      const b = w.bodies.get(id)!;
      if (b.state !== 'offsite' && m.needs.bladder >= 1) flag(`bladder at 100%: ${id} (${b.state} ${b.active?.verb ?? '-'}:${b.active?.target ?? ''} ${rt.activity}) thinking=${m.thinking} sinceThought=${Math.round((w.now - ((m as unknown as { lastThought: number }).lastThought)) / 60000)}min errands=${JSON.stringify((rt as unknown as { errands: { queue: Map<string, unknown> } }).errands.queue.get(id))?.slice(0, 300)}`);
      if (b.state !== 'offsite' && m.needs.hunger >= 1) flag(`hunger at 100%: ${id}`);
    }
    if (t.minuteOfDay > 23 * 60 && present.length) flag(`still in the office after 23:00: ${present.map(b => b.spec.id).join(',')}`);
  }
  // the service's calendar (meetings, birthdays, anniversaries, payday), as in packages/server/src/main.ts
  if (tick % 200 === 0 && !busy && rt.plan) {
    busy = true;
    try {
      for (const d of dueNow(rt.plan, t.minuteOfDay, done)) {
        done.add(d.key);
        if (d.kind === 'meeting') {
          const out = await runMeeting(d.type, w, router, rt.minds, { cards: [...rt.cardOf.values()], metrics: 'n/a', bossPresent: false });
          day!.meetings.push(`${d.type}:${out.transcript.length}`);
          if (out.transcript.length < 3) flag(`meeting ${d.type} almost silent (${out.transcript.length} lines) on ${t.date}`);
        } else if (d.kind === 'birthday') {
          const givers = [...rt.minds.keys()].filter(id => w.present(id));
          ledger.birthdayGifts(w.now, d.person, givers, d.giftUsdEach); day!.meetings.push(`birthday:${d.person}`);
        } else if (d.kind === 'payday') { ledger.payday(w.now, STAFF); day!.meetings.push('payday'); }
        else day!.meetings.push(d.kind);
      }
    } finally { busy = false; }
  }
}
if (day) report(dayKey, day);

function report(date: string, d: Day): void {
  const typing = d.samples ? Math.round((100 * d.typingSamples) / d.samples) : 0;
  const seated = d.seatedAtMeeting.length ? Math.max(...d.seatedAtMeeting) : '-';
  const fails = [...d.failed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} x${n}`).join(' | ');
  console.log(`${date} speech=${d.speech} desk-work=${typing}% meetings=[${d.meetings.join(' ')}] maxSeated=${seated} plan=[${[...new Set(d.events)].join(',')}] fails: ${fails || '-'}`);
  if (d.samples && typing < 25 && !d.events.some(e => ['anniversary', 'new_year'].includes(e))) flag(`little desk work on ${date} (${typing}%)`);
  for (const [k, n] of d.failed) if (n >= 20) flag(`frequent failure on ${date}: ${k} x${n}`);
}

console.log(`\n${DAYS} days in ${Math.round((Date.now() - t0) / 1000)} s, ${calls} model calls (scripted)`);
console.log('top frictions:', rt.topFrictions(8).map(f => `${f.what} -> ${f.why} x${f.n}`).join('\n  '));
console.log('blocked:', blockedLog.join('\n  '));
if (process.env.YTLOG) console.log(ytlog.slice(-40).join('\n'));
console.log('PROBLEMS:'); for (const [k, n] of [...problems.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${n}x ${k}`);
