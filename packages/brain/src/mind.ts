import { def } from '../../catalog/src/items.js';
import type { Command, World, WorldEvent } from '../../sim/src/world.js';
import { type Appraisal, type Feelings, appraise, baseline, behaviour, decay } from './emotion.js';
import { type Identity, SHARED_WORLDVIEW } from './identity.js';
import type { ChatMessage, Router } from './llm.js';
import { MemoryStream } from './memory.js';
import { nameOf, perceive } from './perception.js';
import voiceData from '../data/voice_samples.json' with { type: 'json' };

const VOICES = voiceData as Record<string, { en: string[]; uz: string[] }>;

// One person's mind — WORLD_PLAN §11.3. Event-driven: it thinks only when something happens (an action finished,
// someone spoke to them, a new card) or after a quiet spell — never on a fixed loop. The model returns one action
// in strict JSON; the body (World) enforces physics and social rules and may refuse it.

const ACTION_SCHEMA = `Reply with ONE JSON object only:
{"thought": "<one short first-person sentence>",
 "action": {"verb": "go_to|sit|stand|use|consume|pick|place|say|wait|go_home", "target": "<id>", "action": "<device verb>", "to": "<person id or null>", "text": "<what you say>", "seconds": <number>}}
Use only ids from the lists. "say" needs "text" (and "to" if you address someone). Use "use" with the device id and its verb.`;

export interface MindDeps { world: World; router: Router }

export class Mind {
  readonly memory: MemoryStream;
  feelings: Feelings;
  private heard: Extract<WorldEvent, { type: 'speech' }>[] = [];
  private recent: string[] = [];
  private lastThought = 0;
  private lastFeelingsAt: number;
  pendingWake = false;
  /** someone spoke to me: worth interrupting what my body is doing */
  private addressed = false;
  thinking = false;

  constructor(readonly me: Identity, private deps: MindDeps, memory?: MemoryStream) {
    this.memory = memory ?? new MemoryStream();
    this.feelings = baseline(me);
    this.lastFeelingsAt = deps.world.now;
  }

  /** Route world events to this mind; returns true if it should think now. */
  observe(e: WorldEvent): void {
    if (e.type === 'speech' && e.from !== this.me.id && e.hearers.includes(this.me.id)) {
      this.heard.push(e);
      if (e.to === this.me.id) { this.pendingWake = true; this.addressed = true; }
      else if (e.to === null) this.pendingWake = true;
      void this.memory.add('conversation', `${nameOf(e.from)} said${e.to === this.me.id ? ' to me' : ''}: "${e.text}"`, e.to === this.me.id ? 4 : 2, e.t);
    }
    if ((e.type === 'action_done' || e.type === 'action_failed') && e.agent === this.me.id) {
      this.pendingWake = true;
      if (e.type === 'action_failed') void this.memory.add('observation', `I tried to ${e.verb} but couldn't: ${e.msg}.`, 3, e.t);
    }
  }

  /** Something happened to me emotionally (salary, praise, romance...). */
  async feel(a: Appraisal): Promise<void> {
    this.tickFeelings();
    const r = appraise(this.me, this.feelings, a, this.deps.world.now);
    this.feelings = r.feelings;
    await this.memory.add('feeling', r.memory.text, r.memory.importance, r.memory.at);
    this.pendingWake = true;
  }

  private tickFeelings(): void {
    const now = this.deps.world.now;
    this.feelings = decay(this.me, this.feelings, (now - this.lastFeelingsAt) / 3_600_000);
    this.lastFeelingsAt = now;
  }

  shouldThink(): boolean {
    const w = this.deps.world, b = w.bodies.get(this.me.id)!;
    if (this.thinking || b.state === 'offsite') return false;
    if (b.active && !this.addressed) return false;            // busy bodies are not interrupted unless spoken to
    if (this.pendingWake) return true;
    // a quiet spell: idle people re-think every 3-6 minutes, busy ones are left alone
    return !b.active && w.now - this.lastThought > 180_000 * (1 + (this.me.id.length % 3) / 2);
  }

  /** Options the person knows about (ids the model may use). */
  private options(): string {
    const w = this.deps.world;
    const people = [...w.bodies.values()].filter(o => o.state !== 'offsite' && o.spec.id !== this.me.id).map(o => `${o.spec.id}=${nameOf(o.spec.id)}`);
    const zones = w.layout.zones.map(z => `${z.id}=${z.name}`);
    const devices = w.layout.instances.flatMap(i => (def(i.def).affordances ?? []).filter(a => a.verb !== 'sit' && a.verb !== 'work').map(a => `${i.id}:${a.verb}`));
    const seats = [`chair.${this.me.id}=my chair`, 'lounge.sofa=sofa', 'kitchen.chair1', 'kitchen.chair2', 'kitchen.chair3', 'kitchen.chair4'];
    return [`People here: ${people.join(', ') || 'nobody'}`, `Places: ${zones.join(', ')}`, `Seats: ${seats.join(', ')}`, `Devices: ${devices.join(', ')}`].join('\n');
  }

  private systemPrompt(): string {
    const p = this.me;
    return [
      `You are ${p.name}, ${p.title} at Compound Chronicle. You live your own life in this office; you decide what your body does next.`,
      `Character: ${p.character} Values: ${p.values.join(', ')}.`,
      `Habits: ${p.habits.coffeePerDay} coffees a day${p.habits.smoker ? ', you smoke on the balcony' : ''}; snacks: ${p.habits.snacks}; ${p.habits.focusStyle}.`,
      `How you speak: ${p.speech.rules.join(' ')} Examples (vary, never copy): ${this.voiceExamples().map(s => `"${s}"`).join(' ')}`,
      ...SHARED_WORLDVIEW,
      `Your dreams: ${p.dreams.map(d => d.text).join(' / ')}`,
      'Never repeat the same thing twice in a row; vary what you do like a real person. Work hours 09:00-21:00.',
      ACTION_SCHEMA,
    ].join('\n');
  }

  /** A few different voice samples each time, so the person's tone is stable but their lines never repeat. */
  private voiceExamples(): string[] {
    const v = VOICES[this.me.id];
    const pool = [...(v?.en ?? []), ...this.me.speech.samples.filter(s => !s.startsWith('Boss'))];
    const out: string[] = [];
    for (let i = 0; i < 4 && pool.length; i++) out.push(pool.splice((this.deps.world.now / 1000 + i * 7919) % pool.length | 0, 1)[0]!);
    return out;
  }

  /** Think once and act. Returns the command issued (or null). */
  async think(card?: { id: string; title: string; status: string }): Promise<Command | null> {
    const w = this.deps.world;
    this.thinking = true; this.pendingWake = false; this.addressed = false; this.lastThought = w.now;
    try {
      this.tickFeelings();
      const feeling = behaviour(this.me, this.feelings).selfReport;
      const obs = perceive(w, this.me.id, { heard: this.heard.splice(0), card, feeling, recent: this.recent });
      const mems = await this.memory.recall(obs, w.now, 6);
      const messages: ChatMessage[] = [
        { role: 'system', content: this.systemPrompt() },
        { role: 'user', content: `${obs}\n\nWhat I remember:\n${mems.map(m => `- ${m.text}`).join('\n') || '- nothing special yet'}\n\n${this.options()}\n\nWhat do I do next?` },
      ];
      const route = this.deps.router.pick('life', w.now);
      if ('deferred' in route) return null;
      let raw = '';
      try { raw = await route.llm.chat(messages, { model: route.model, json: true, maxTokens: 300 }); } catch { raw = ''; }
      const parsed = parseDecision(raw);
      if (!parsed) { const c: Command = { verb: 'wait', seconds: 30 }; w.command(this.me.id, c); return c; }
      const res = w.command(this.me.id, parsed.command);
      const summary = summarize(parsed.command);
      this.recent.push(summary); if (this.recent.length > 20) this.recent.shift();
      await this.memory.add('observation', res.ok ? `I ${summary}. (${parsed.thought})` : `I wanted to ${summary}, but: ${res.msg}.`, res.ok ? 2 : 3, w.now);
      if (!res.ok) this.pendingWake = true;
      return parsed.command;
    } finally { this.thinking = false; }
  }
}

const VERBS = new Set(['go_to', 'sit', 'stand', 'use', 'consume', 'pick', 'place', 'say', 'wait', 'go_home']);

export function parseDecision(raw: string): { thought: string; command: Command } | null {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) return null;
  let j: { thought?: unknown; action?: Record<string, unknown> };
  try { j = JSON.parse(m[0]); } catch { return null; }
  const a = j.action;
  if (!a || typeof a.verb !== 'string' || !VERBS.has(a.verb)) return null;
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : undefined);
  const thought = typeof j.thought === 'string' ? j.thought.slice(0, 200) : '';
  switch (a.verb) {
    case 'go_to': case 'sit': case 'pick': case 'place': return s('target') ? { thought, command: { verb: a.verb, target: s('target')! } as Command } : null;
    case 'use': return s('target') && s('action') ? { thought, command: { verb: 'use', target: s('target')!, action: s('action') as never } } : null;
    case 'say': return s('text') ? { thought, command: { verb: 'say', to: s('to') && s('to') !== 'null' ? s('to')! : null, text: s('text')!.slice(0, 280) } } : null;
    case 'wait': return { thought, command: { verb: 'wait', seconds: Math.max(5, Math.min(600, Number(a.seconds) || 30)) } };
    default: return { thought, command: { verb: a.verb } as Command };
  }
}

function summarize(c: Command): string {
  switch (c.verb) {
    case 'say': return `said${c.to ? ` to ${nameOf(c.to)}` : ''} "${c.text}"`;
    case 'use': return `used ${c.target} (${c.action})`;
    case 'wait': return `waited ${Math.round(c.seconds)} s`;
    case 'go_to': case 'sit': case 'pick': case 'place': return `${c.verb.replace('_', ' ')} ${c.target}`;
    default: return c.verb.replace('_', ' ');
  }
}
