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
Use only ids from the lists. "say" needs "text" (and "to" if you address someone). Use "use" with the device id and its verb.
Optionally add "then": [up to 3 more actions in the same format, no "say"] for what you plan right after (e.g. walk to the coffee machine, use it, sit back down).`;

export interface MindDeps { world: World; router: Router; social?: { describe(id: string): string } }

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
  /** follow-up steps from the last thought (run by the runtime without another model call) */
  plan: Command[] = [];
  private lastSpokeAt = 0;
  private satAt = 0;
  thinking = false;
  /** diagnostics hook: called with a short reason when a thought fails (model error or unusable reply) */
  onThinkError?: (reason: string) => void;

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
    if (e.type === 'action_done' && e.agent === this.me.id && e.verb === 'sit') this.satAt = e.t;
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

  /** someone spoke to this person and is waiting for an answer */
  get wantsReply(): boolean { return this.addressed && !this.thinking; }

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
      'You are a social person in a real office: when someone speaks to you, answer them first; when a colleague you know is near and you have been quiet for a while, talk to them — about work (ideas, help, a question, feedback) or a little about life. Keep lines short and natural.',
      'Output ONLY the JSON object. No reasoning, no prose, no code fences.',
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

  /** Evening reflection (§11.2): a few first-person conclusions from today's important memories, then forget trivia. */
  async reflect(): Promise<string[]> {
    const w = this.deps.world;
    const today = this.memory.all().filter(m => m.at > w.now - 18 * 3_600_000 && m.importance >= 4).slice(-25);
    if (today.length < 3) { this.memory.prune(w.now); return []; }
    const r = this.deps.router.pick('reflection', w.now);
    if ('deferred' in r) return [];
    let raw = '';
    try {
      raw = await r.llm.chat([
        { role: 'system', content: `You are ${this.me.name}, ${this.me.title}. ${this.me.character}` },
        { role: 'user', content: `Today, in my own words:\n${today.map(m => `- ${m.text}`).join('\n')}\n\nWrite 2-3 short first-person conclusions I will carry into tomorrow (about my work, people, how I feel). One per line, no numbering. Output only the lines.` },
      ], { model: r.model, maxTokens: 400, temperature: 0.6 });
    } catch (e) { this.onThinkError?.(`reflection: ${(e as Error).message}`); }
    const lines = raw.split('\n').map(s => s.replace(/^[-*\d.)\s]+/, '').trim()).filter(s => s.length > 12 && s.length < 240).slice(0, 3);
    for (const l of lines) await this.memory.add('reflection', l, 7, w.now);
    this.memory.prune(w.now);
    return lines;
  }

  /** Think once and act. Returns the command issued (or null). */
  async think(card?: { id: string; title: string; status: string }): Promise<Command | null> {
    const w = this.deps.world;
    const wasAddressed = this.addressed;
    this.thinking = true; this.pendingWake = false; this.addressed = false; this.lastThought = w.now;
    try {
      this.tickFeelings();
      const feeling = behaviour(this.me, this.feelings).selfReport;
      const obs = perceive(w, this.me.id, { heard: this.heard.splice(0), card, feeling, recent: this.recent });
      const mems = await this.memory.recall(obs, w.now, 6);
      const quietMin = Math.floor((w.now - (this.lastSpokeAt || w.now - 3_600_000)) / 60_000);
      const messages: ChatMessage[] = [
        { role: 'system', content: this.systemPrompt() },
        { role: 'user', content: `${obs}\n${this.deps.social?.describe(this.me.id) ?? ''}\n\nWhat I remember:\n${mems.map(m => `- ${m.text}`).join('\n') || '- nothing special yet'}\n\n${this.options()}\n\n${wasAddressed ? 'Someone just spoke to me — I should answer them now.\n' : ''}${quietMin >= 20 ? `I haven't talked to anyone for ${quietMin} minutes.\n` : ''}What do I do next?` },
      ];
      const route = this.deps.router.pick('life', w.now);
      if ('deferred' in route) return null;
      let raw = '';
      const reasoning = (process.env.LIFE_REASONING as 'low' | undefined) || undefined;
      try { raw = await route.llm.chat(messages, { model: route.model, json: true, maxTokens: 700, reasoning }); }
      catch (e1) {
        // some providers reject response_format: retry once in plain mode, then report the failure
        try { raw = await route.llm.chat(messages, { model: route.model, maxTokens: 700 }); }
        catch (e2) { raw = ''; this.onThinkError?.(`${(e1 as Error).message} | retry: ${(e2 as Error).message}`); }
      }
      if (raw && !parseDecision(raw)) this.onThinkError?.(`unparseable reply: ${raw.slice(0, 160)}`);
      const parsed = parseDecision(raw);
      if (!parsed) { const c: Command = { verb: 'wait', seconds: 30 }; w.command(this.me.id, c); return c; }
      // no sit/stand ping-pong: having just sat down, a person stays at least 90 s unless someone needs them
      if (parsed.command.verb === 'stand' && w.now - this.satAt < 90_000 && !wasAddressed) parsed.command = { verb: 'wait', seconds: 60 };
      const res = w.command(this.me.id, parsed.command);
      this.plan = res.ok ? parsed.then : [];
      if (res.ok && parsed.command.verb === 'say') this.lastSpokeAt = w.now;
      const summary = summarize(parsed.command);
      this.recent.push(summary); if (this.recent.length > 20) this.recent.shift();
      await this.memory.add('observation', res.ok ? `I ${summary}. (${parsed.thought})` : `I wanted to ${summary}, but: ${res.msg}.`, res.ok ? 2 : 3, w.now);
      if (!res.ok) this.pendingWake = true;
      return parsed.command;
    } finally { this.thinking = false; }
  }
}

const VERBS = new Set(['go_to', 'sit', 'stand', 'use', 'consume', 'pick', 'place', 'say', 'wait', 'go_home']);

const VERB_ALIASES: Record<string, string> = {
  get_to: 'go_to', walk_to: 'go_to', go: 'go_to', move_to: 'go_to', walk: 'go_to', approach: 'go_to', visit: 'go_to',
  talk: 'say', speak: 'say', tell: 'say', greet: 'say', ask: 'say', reply: 'say', chat: 'say',
  sit_down: 'sit', take_seat: 'sit', stand_up: 'stand', get_up: 'stand',
  drink: 'consume', eat: 'consume', use_device: 'use', operate: 'use', idle: 'wait', rest: 'wait', leave: 'go_home',
};

/** Every balanced {...} block in a reply (models sometimes reason in prose or fences before the JSON). */
function jsonCandidates(raw: string): string[] {
  const out: string[] = [];
  const text = raw.replace(/```(?:json)?/gi, '');
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j]!;
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) { out.push(text.slice(i, j + 1)); i = j; break; }
    }
  }
  return out;
}

export function parseDecision(raw: string): { thought: string; command: Command; then: Command[] } | null {
  // prefer the last complete object that carries an action (reasoning models often draft first)
  let j: { thought?: unknown; action?: Record<string, unknown>; then?: unknown } | null = null;
  for (const c of jsonCandidates(raw).reverse()) {
    try { const o = JSON.parse(c); if (o && typeof o === 'object' && o.action) { j = o; break; } } catch { /* next */ }
  }
  if (!j || !j.action || typeof j.action !== 'object') return null;
  const command = actionToCommand(j.action);
  if (!command) return null;
  const thought = typeof j.thought === 'string' ? j.thought.slice(0, 200) : '';
  // a short plan of follow-up steps (no speech: what to say depends on what others say meanwhile)
  const then: Command[] = [];
  if (Array.isArray(j.then)) for (const t of j.then) {
    const c = t && typeof t === 'object' ? actionToCommand(t as Record<string, unknown>) : null;
    if (c && c.verb !== 'say' && then.length < 3) then.push(c);
  }
  return { thought, command, then };
}

function actionToCommand(a: Record<string, unknown>): Command | null {
  if (typeof a.verb !== 'string') return null;
  const verb = VERB_ALIASES[a.verb.toLowerCase()] ?? a.verb.toLowerCase();
  if (!VERBS.has(verb)) return null;
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : undefined);
  switch (verb) {
    case 'go_to': case 'sit': case 'pick': case 'place': return s('target') ? { verb, target: s('target')! } as Command : null;
    case 'use': return s('target') && s('action') ? { verb: 'use', target: s('target')!, action: s('action') as never } : null;
    case 'say': return s('text') ? { verb: 'say', to: s('to') && s('to') !== 'null' ? s('to')! : null, text: s('text')!.slice(0, 280) } : null;
    case 'wait': return { verb: 'wait', seconds: Math.max(5, Math.min(600, Number(a.seconds) || 30)) };
    default: return { verb } as Command;
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
