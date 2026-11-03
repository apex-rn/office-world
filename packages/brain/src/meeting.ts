import type { World } from '../../sim/src/world.js';
import type { Card } from './board.js';
import { SHARED_WORLDVIEW } from './identity.js';
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

async function say(router: Router, m: Mind, prompt: string, now: number, maxTokens = 160): Promise<string> {
  const r = router.pick('dialogue', now);
  if ('deferred' in r) return '';
  const msgs: ChatMessage[] = [{ role: 'system', content: persona(m) }, { role: 'user', content: prompt }];
  try { return (await r.llm.chat(msgs, { model: r.model, maxTokens, temperature: 0.7 })).trim().replace(/^"|"$/g, ''); } catch { return ''; }
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
  };

  speak('manager', await say(router, manager, `${lang}\nOpen the ${type.replace('_', ' ')} meeting in 2-3 sentences. Purpose: ${PURPOSE[type]}.\nBoard:\n${board}\nNumbers: ${ctx.metrics}`, w.now));
  for (const m of present) {
    const mine = ctx.cards.filter(c => c.owner === m.me.id).map(c => `${c.id} [${c.status}] ${c.title}`).join('; ') || 'no card right now';
    const heard = out.transcript.slice(-3).map(t => `${t.who}: ${t.text}`).join('\n');
    speak(m.me.id, await say(router, m, `${lang}\nYou are in the ${type.replace('_', ' ')} meeting. Your work: ${mine}.\nJust said:\n${heard}\nGive your update in 1-2 sentences (status, next step, any blocker or idea). Be yourself.`, w.now, 120));
  }
  const closing = await say(router, manager, `${lang}\nClose the meeting. Transcript:\n${out.transcript.map(t => `${t.who}: ${t.text}`).join('\n')}\n` +
    'Reply as JSON only: {"speech": "<your closing words>", "decisions": [{"owner": "<id>", "title": "<task>"}], "praise": [{"who": "<id>", "reason": "<why>"}], "criticism": [{"who": "<id>", "reason": "<work-only, respectful>"}]}', w.now, 400);
  try {
    const j = JSON.parse(/\{[\s\S]*\}/.exec(closing)?.[0] ?? '{}') as Partial<MeetingOutcome> & { speech?: string };
    speak('manager', j.speech ?? '');
    out.decisions = (j.decisions ?? []).filter(d => d && minds.has(d.owner) && d.title).slice(0, 6);
    out.praise = (j.praise ?? []).filter(p => p && minds.has(p.who)).slice(0, 4);
    out.criticism = (j.criticism ?? []).filter(c => c && minds.has(c.who)).slice(0, 3);
  } catch { speak('manager', closing); }
  for (const p of out.praise) await minds.get(p.who)!.feel({ kind: 'praise', by: 'manager', reason: p.reason, publicly: true });
  for (const c of out.criticism) await minds.get(c.who)!.feel({ kind: 'reprimand', reason: c.reason, publicly: true });
  return out;
}
