import type { World } from '../../sim/src/world.js';
import type { Card } from './board.js';
import { ROLE_WORK, SHARED_WORLDVIEW } from './identity.js';
import type { ChatMessage, Router } from './llm.js';
import type { Mind } from './mind.js';

// Meetings — WORLD_PLAN §11.5, §29. The Manager chairs: opens with an agenda built from the real board and numbers,
// each attendee reports in their own voice, the Manager closes with decisions, praise and (work-only) criticism.
// Decisions become card proposals for the board; praise and criticism become feelings (growth rule applies).

export type MeetingType = 'morning_plan' | 'evening_review' | 'weekly_review';
export interface MeetingOutcome {
  type: MeetingType;
  transcript: { who: string; text: string }[];
  decisions: { owner: string; title: string }[];
  praise: { who: string; reason: string }[];
  criticism: { who: string; reason: string }[];
}

const PURPOSE: Record<MeetingType, string> = {
  morning_plan: "today's plan: who does what by when, blockers, the one thing that matters most today",
  evening_review: "today's results: what shipped, what the numbers say, what we learned, what moves to tomorrow",
  weekly_review: 'last week in depth: views, followers, wins and misses, why, and the three bets for this week',
};

function persona(m: Mind): string {
  const p = m.me;
  return [`You are ${p.name}, ${p.title}. ${p.character}`, `How you speak: ${p.speech.rules.join(' ')}`, ...SHARED_WORLDVIEW].join('\n');
}

/** One spoken turn. Reasoning models (gpt-oss) spend part of max_tokens thinking before they answer: give room,
 *  ask for brief thinking, and retry once if the answer came back empty (the meeting must never fall silent). */
async function say(router: Router, m: Mind, prompt: string, now: number, maxTokens = 160, json = false): Promise<string> {
  // the strong (dialogue) model first; if it errors or stays empty, the fast life model speaks instead —
  // a meeting must never fall silent because one model name or provider is down
  const routes = [router.pick('dialogue', now), router.pick('life', now)];
  const msgs: ChatMessage[] = [{ role: 'system', content: persona(m) }, { role: 'user', content: json ? prompt : `${prompt}\nReply with only the words you say out loud.` }];
  for (const [k, r] of routes.entries()) {
    if ('deferred' in r) continue;
    try {
      const raw = await r.llm.chat(msgs, { model: r.model, maxTokens: maxTokens + 700 + k * 600, temperature: 0.7, reasoning: 'low' });
      const text = json ? raw.trim() : clean(raw, m.me.name);
      if (text) return text;
      console.error(`meeting: ${m.me.id} got an empty reply from ${r.model}`);
    } catch (e) { console.error(`meeting: ${m.me.id} via ${r.model} failed: ${(e as Error).message.slice(0, 200)}`); }
  }
  return '';
}

/** Spoken words only: no quotes, no "Name:" prefix, no stage directions, at most ~4 sentences. */
export function clean(raw: string, name: string): string {
  let t = raw.trim().replace(/^```[a-z]*|```$/g, '').trim().replace(/^"|"$/g, '').trim();
  const first = name.split(' ')[0]!;
  t = t.replace(new RegExp(`^(${name}|${first})\\s*:\\s*`, 'i'), '').replace(/^[A-Z][\w'-]*( [A-Z][\w'-]*)?\s*:\s+/, '').replace(/^\*[^*]*\*\s*/, '').replace(/^"|"$/g, '').trim();
  const sentences = t.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 4) t = sentences.slice(0, 4).join('').trim();
  return t.slice(0, 400);
}

export async function runMeeting(
  type: MeetingType, w: World, router: Router, minds: Map<string, Mind>,
  ctx: { cards: Card[]; metrics: string; bossPresent: boolean },
): Promise<MeetingOutcome> {
  const manager = minds.get('manager');
  const out: MeetingOutcome = { type, transcript: [], decisions: [], praise: [], criticism: [] };
  if (!manager) return out;
  const present = [...minds.values()].filter(m => m.me.id !== 'manager' && w.bodies.get(m.me.id)?.state !== 'offsite');
  const board = ctx.cards.map(c => `${c.id} [${c.status}] ${c.owner}: ${c.title}`).join('\n') || '(no open cards)';
  const lang = ctx.bossPresent ? 'The Boss is in the room: everyone speaks Uzbek.' : 'Speak English.';
  const speak = (who: string, text: string) => {
    if (!text) return;
    out.transcript.push({ who, text });
    w.command(who, { verb: 'say', to: null, text, volume: 'loud' });
    const mm = minds.get(who); if (mm) { mm.saidLines.push(text); if (mm.saidLines.length > 12) mm.saidLines.shift(); }
  };

  speak('manager', await say(router, manager, `${lang}\nOpen the ${type.replace('_', ' ')} meeting in 2-3 sentences. Purpose: ${PURPOSE[type]}.\nBoard:\n${board}\nNumbers: ${ctx.metrics}`, w.now));
  for (const m of present) {
    const mine = ctx.cards.filter(c => c.owner === m.me.id).map(c => `${c.id} [${c.status}] ${c.title}`).join('; ') || 'no card right now';
    const heard = out.transcript.slice(-3).map(t => `${minds.get(t.who)?.me.name ?? t.who}: ${t.text}`).join('\n');
    const job = ROLE_WORK[m.me.id] ?? m.me.title;
    const ask = (extra: string) => `${lang}\nYou are ${m.me.name}, ${m.me.title}, in the ${type.replace('_', ' ')} meeting.\n` +
      `Your own job: ${job}. Your cards: ${mine}.\n` +
      `Colleagues just said (context only — never repeat or paraphrase them, never speak for them):\n${heard || '(nobody yet)'}\n` +
      'Give YOUR OWN update in 1-2 sentences, about your own work only: status, next step, a blocker or an idea.' +
      `${m.saidLines.length ? ` Do not repeat what you said before: ${m.saidLines.slice(-3).map(x => `"${x}"`).join(' ')}` : ''}${extra}`;
    let line = await say(router, m, ask(''), w.now, 120);
    // an echo of someone else's update is no update: ask once more, firmly
    if (line && out.transcript.some(t => similar(t.text, line))) line = await say(router, m, ask(`\nYour last attempt repeated a colleague. Talk about ${job} instead.`), w.now, 120);
    if (line && !out.transcript.some(t => similar(t.text, line))) speak(m.me.id, line);
  }
  const closing = await say(router, manager, `${lang}\nClose the meeting. Transcript:\n${out.transcript.map(t => `${t.who}: ${t.text}`).join('\n')}\n` +
    'Reply as JSON only: {"speech": "<your closing words>", "decisions": [{"owner": "<id>", "title": "<task>"}], "praise": [{"who": "<id>", "reason": "<why>"}], "criticism": [{"who": "<id>", "reason": "<work-only, respectful>"}]}', w.now, 400, true);
  try {
    const j = JSON.parse(/\{[\s\S]*\}/.exec(closing)?.[0] ?? '{}') as Partial<MeetingOutcome> & { speech?: string };
    speak('manager', clean(j.speech ?? '', manager.me.name));
    out.decisions = (j.decisions ?? []).filter(d => d && minds.has(d.owner) && d.title).slice(0, 6);
    out.praise = (j.praise ?? []).filter(p => p && minds.has(p.who)).slice(0, 4);
    out.criticism = (j.criticism ?? []).filter(c => c && minds.has(c.who)).slice(0, 3);
  } catch { speak('manager', clean(closing, manager.me.name)); }
  for (const p of out.praise) await minds.get(p.who)!.feel({ kind: 'praise', by: 'manager', reason: p.reason, publicly: true });
  for (const c of out.criticism) await minds.get(c.who)!.feel({ kind: 'reprimand', reason: c.reason, publicly: true });
  return out;
}

/** Two lines say the same thing (word overlap) — used to drop echoes in meetings. */
export function similar(a: string, b: string): boolean {
  const words = (x: string) => new Set(x.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3));
  const A = words(a), B = words(b);
  if (Math.min(A.size, B.size) < 4) return false;      // too short to call it an echo
  let both = 0; for (const w of A) if (B.has(w)) both++;
  return both / Math.min(A.size, B.size) >= 0.6;
}
