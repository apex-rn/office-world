import { def } from '../../catalog/src/items.js';
import type { Command, World, WorldEvent } from '../../sim/src/world.js';
import { type Appraisal, type Feelings, appraise, baseline, behaviour, decay } from './emotion.js';
import { type Identity, ROLE_WORK, SHARED_WORLDVIEW } from './identity.js';
import { type Needs, describe as describeNeeds, freshNeeds, satisfy, tick as tickNeeds, urgency } from './needs.js';
import { seoulTime } from '../../shared/src/time.js';
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
  /** a one-shot situational cue for the next thought (e.g. a greeting to answer) */
  private cue = '';
  /** what I said lately, word for word (anti-repetition) */
  readonly saidLines: string[] = [];
  onFriction?: (what: string, why: string) => void;
  private lastSpokeAt = 0;
  /** body needs (hunger, coffee, toilet, focus...) — pressure, never a schedule */
  needs: Needs = freshNeeds();
  private needsAt = 0;
  /** my own plan for today, written by me in the morning (one model call a day) */
  dayPlan = '';
  private planDate = '';
  private planning = false;
  /** the running conversations: partner -> last lines (who: text) */
  private talks = new Map<string, { at: number; lines: string[] }>();
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
      if (e.to === this.me.id) this.talkLine(e.from, `${nameOf(e.from)}: ${e.text}`, e.t);
    }
    if (e.type === 'speech' && e.from === this.me.id && e.to) this.talkLine(e.to, `me: ${e.text}`, e.t);
    if (e.type === 'arrived' && e.agent === this.me.id) { this.needs = freshNeeds(); this.needsAt = e.t; }
    if (e.type === 'action_done' && e.agent === this.me.id && e.verb === 'sit') this.satAt = e.t;
    if ((e.type === 'action_done' || e.type === 'action_failed') && e.agent === this.me.id) {
      this.pendingWake = true;
      if (e.type === 'action_failed') void this.memory.add('observation', `I tried to ${e.verb} but couldn't: ${e.msg}.`, 3, e.t);
    }
  }

  /** Something I notice about the day (a meeting soon, a party): taken into my next thought. */
  notice(text: string): void { this.cue = this.cue ? `${this.cue}\n${text}` : text; this.pendingWake = true; }

  /** A colleague bowed to me / I bowed to someone: real people say something with the bow (first thing next thought). */
  greeted(other: string, theyGreetedMe: boolean, t: number): void {
    this.cue = theyGreetedMe ? `${nameOf(other)} (${other}) just bowed to me in greeting — I greet them back out loud (use "say" with "to": "${other}").`
      : `I just bowed to ${nameOf(other)} (${other}) — I say a short greeting to them (use "say" with "to": "${other}").`;
    this.pendingWake = true; if (theyGreetedMe) this.addressed = true;
    void this.memory.add('observation', theyGreetedMe ? `${nameOf(other)} greeted me.` : `I greeted ${nameOf(other)}.`, 2, t);
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

  /** My job, my plan, my body and the conversation I am in — the context a real person carries into each decision. */
  private situation(): string {
    const w = this.deps.world, t = seoulTime(w.now);
    const parts = [`My job: ${ROLE_WORK[this.me.id] ?? this.me.title}. It is ${String(Math.floor(t.minuteOfDay / 60)).padStart(2, '0')}:${String(t.minuteOfDay % 60).padStart(2, '0')}.`];
    if (this.dayPlan) parts.push(`My plan for today:\n${this.dayPlan}`);
    const body = describeNeeds(this.needs, this.me.habits.smoker);
    parts.push(body.length ? `My body: ${body.slice(0, 3).join(' ')}` : 'My body: fine — nothing pulls me away from work.');
    const talk = [...this.talks.entries()].filter(([, c]) => w.now - c.at < 180_000).sort((a, b) => b[1].at - a[1].at)[0];
    if (talk) parts.push(`My conversation with ${nameOf(talk[0])} (${talk[0]}) so far:\n${talk[1].lines.slice(-6).join('\n')}\n(Keep it natural: answer what was said; when it has run its course, close it kindly and get back to work.)`);
    return `${parts.join('\n')}\n`;
  }

  private talkLine(partner: string, line: string, t: number): void {
    const c = this.talks.get(partner) ?? { at: t, lines: [] };
    c.at = t; c.lines.push(line); if (c.lines.length > 8) c.lines.shift();
    this.talks.set(partner, c);
  }

  private tickBody(now: number, working: boolean): void {
    if (this.needsAt) this.needs = tickNeeds(this.me, this.needs, Math.max(0, now - this.needsAt) / 3_600_000, working);
    this.needsAt = now;
  }

  /** The morning plan: once a day, in my own words, from my job, my cards and what I learned (background call). */
  private ensurePlan(card?: { id: string; title: string; status: string }): void {
    const w = this.deps.world, day = seoulTime(w.now).date;
    if (this.planDate === day || this.planning) return;
    this.planning = true;
    const lessons = this.memory.all().filter(m => m.kind === 'reflection' || m.kind === 'lesson').slice(-4).map(m => `- ${m.text}`).join('\n');
    const r = this.deps.router.pick('reflection', w.now);
    if ('deferred' in r) { this.planning = false; return; }
    void r.llm.chat([
      { role: 'system', content: this.systemPrompt().split('\nOutput ONLY')[0]! },
      { role: 'user', content: `It is the start of my workday (09:00-21:00; morning plan meeting 09:10, evening review 20:20). My job: ${ROLE_WORK[this.me.id] ?? this.me.title}. My card: ${card ? `${card.title} [${card.status}]` : 'none yet'}.\nWhat I learned lately:\n${lessons || '- nothing yet'}\nWrite my plan for today as 4-6 short lines "HH:MM – what", in first person, concrete, toward our goal (YouTube monetization, Instagram growth). Plain text only.` },
    ], { model: r.model, maxTokens: 1100, temperature: 0.6, reasoning: 'low' })
      .then(t => { const plan = t.trim().split('\n').filter(l => /\d{1,2}:\d{2}/.test(l)).slice(0, 6).join('\n'); if (plan) { this.dayPlan = plan; this.planDate = day; void this.memory.add('plan', `My plan today:\n${plan}`, 5, w.now); } })
      .catch(() => {}).finally(() => { this.planning = false; });
  }

  shouldThink(): boolean {
    const w = this.deps.world, b = w.bodies.get(this.me.id)!;
    if (this.thinking || b.state === 'offsite') return false;
    // a pressing need (the toilet, real hunger, drained focus) breaks off desk work or waiting — not a walk already under way
    const interruptible = b.active && (b.active.verb === 'wait' || b.active.target?.startsWith('desk.'));
    if (interruptible && w.now - this.lastThought > 120_000) { this.tickBody(w.now, b.active?.target?.startsWith('desk.') ?? false); if (urgency(this.needs, this.me.habits.smoker) >= 0.8) return true; }
    if (b.active && !this.addressed) return false;            // busy bodies are not interrupted unless spoken to
    // idle with a pressing need: don't wait for the quiet-spell re-think
    if (!b.active && w.now - this.lastThought > 60_000) { this.tickBody(w.now, false); if (urgency(this.needs, this.me.habits.smoker) >= 0.8) return true; }
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
    const desk = w.inst(`desk.${this.me.id}`) ? `My desk: desk.${this.me.id}:work (focused work 10-60 min — sit in chair.${this.me.id} first)` : '';
    return [`People here: ${people.join(', ') || 'nobody'}`, `Places: ${zones.join(', ')}`, `Seats: ${seats.join(', ')}`, desk, `Devices: ${devices.join(', ')}`].filter(Boolean).join('\n');
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
      'Live like a real professional: most of the day you do focused work at your desk (desk.<you>:work); you take a break when your body asks (coffee, water, food, toilet, a cigarette if you smoke), you talk to colleagues when it helps the work or when you have been alone too long, and you follow your own plan for the day.',
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
      ], { model: r.model, maxTokens: 1100, temperature: 0.6, reasoning: 'low' });
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
      const bodyNow = w.bodies.get(this.me.id);
      this.tickBody(w.now, !!bodyNow?.active?.target?.startsWith('desk.'));
      const feeling = behaviour(this.me, this.feelings).selfReport;
      const obs = perceive(w, this.me.id, { heard: this.heard.splice(0), card, feeling, recent: this.recent });
      const mems = await this.memory.recall(obs, w.now, 6);
      const quietMin = Math.floor((w.now - (this.lastSpokeAt || w.now - 3_600_000)) / 60_000);
      const messages: ChatMessage[] = [
        { role: 'system', content: this.systemPrompt() },
        { role: 'user', content: `${obs}\n${this.deps.social?.describe(this.me.id) ?? ''}\n${this.situation()}\nWhat I remember:\n${mems.map(m => `- ${m.text}`).join('\n') || '- nothing special yet'}\n\n${this.options()}\n\n${this.cue ? `${this.cue}\n` : ''}${wasAddressed ? 'Someone just spoke to me — I should answer them now.\n' : ''}${quietMin >= 20 ? `I haven't talked to anyone for ${quietMin} minutes.\n` : ''}${this.saidLines.length ? `Lines I already said today (never say the same again, say something new): ${this.saidLines.slice(-5).map(x => `"${x}"`).join(' ')}\n` : ''}What do I do next?` },
      ];
      this.cue = '';
      const route = this.deps.router.pick('life', w.now);
      if ('deferred' in route) return null;
      let raw = '';
      // reasoning models spend max_tokens on thinking first: keep it brief by default (LIFE_REASONING=off to disable)
      const reasoning = process.env.LIFE_REASONING === 'off' ? undefined : ((process.env.LIFE_REASONING as 'low' | 'medium') || 'low');
      try { raw = await route.llm.chat(messages, { model: route.model, json: true, maxTokens: 1200, reasoning }); }
      catch (e1) {
        // some providers reject response_format: retry once in plain mode, then report the failure
        try { raw = await route.llm.chat(messages, { model: route.model, maxTokens: 1200 }); }
        catch (e2) { raw = ''; this.onThinkError?.(`${(e1 as Error).message} | retry: ${(e2 as Error).message}`); }
      }
      if (raw && !parseDecision(raw)) this.onThinkError?.(`unparseable reply: ${raw.slice(0, 160)}`);
      const parsed = parseDecision(raw);
      if (!parsed) { const c: Command = { verb: 'wait', seconds: 30 }; w.command(this.me.id, c); return c; }
      // no sit/stand ping-pong: having just sat down, a person stays at least 90 s unless someone needs them
      if (parsed.command.verb === 'stand' && w.now - this.satAt < 90_000 && !wasAddressed) parsed.command = { verb: 'wait', seconds: 60 };
      let res = w.command(this.me.id, parsed.command);
      let issued: Command = parsed.command;   // what the body actually started (may be a natural first step)
      // a person does the obvious step by themselves: stand up before walking off, sit down at the desk before working
      if (!res.ok && /stand up first/.test(res.msg ?? '')) {
        const up = w.command(this.me.id, { verb: 'stand' });
        if (up.ok) { res = up; issued = { verb: 'x' } as never; parsed.then = [parsed.command, ...parsed.then].slice(0, 4); }
      } else if (!res.ok && /hands full/.test(res.msg ?? '')) {
        // finish what is in your hand first (the drink, the snack), then do what you wanted
        const drink = w.command(this.me.id, { verb: 'consume' });
        if (drink.ok) { res = drink; issued = { verb: 'x' } as never; parsed.then = [parsed.command, ...parsed.then].slice(0, 4); }
      } else if (!res.ok && /sit at (chair\.[\w-]+) first/.test(res.msg ?? '')) {
        const chair = /sit at (chair\.[\w-]+) first/.exec(res.msg ?? '')![1]!;
        const sit = w.command(this.me.id, { verb: 'sit', target: chair });
        if (sit.ok) { res = sit; issued = { verb: 'x' } as never; parsed.then = [parsed.command, ...parsed.then].slice(0, 4); }
      }
      // what a person obviously does next when the model did not say: drink the coffee you made, then back to your desk
      if (res.ok && issued.verb === 'use' && /brew_coffee|take_food|take_drink|fill_water|heat_food/.test(String(issued.action))) {
        if (!parsed.then.length && w.inst(`chair.${this.me.id}`)) parsed.then = [{ verb: 'sit', target: `chair.${this.me.id}` }];
        // drink it where you are going to sit (or right away), so the hands are free again
        if (!parsed.then.some(c => c.verb === 'consume')) { const k = parsed.then.findIndex(c => c.verb === 'sit'); parsed.then.splice(k >= 0 ? k + 1 : 0, 0, { verb: 'consume' }); }
      }
      this.plan = res.ok ? parsed.then : [];
      if (res.ok) for (const c of [parsed.command, ...parsed.then]) this.needs = satisfy(this.needs, c);
      this.ensurePlan(card);                 // after the decision: the day plan is written in the background
      if (res.ok && parsed.command.verb === 'say') { this.lastSpokeAt = w.now; this.saidLines.push(parsed.command.text); if (this.saidLines.length > 12) this.saidLines.shift(); }
      const summary = summarize(parsed.command);
      this.recent.push(summary); if (this.recent.length > 20) this.recent.shift();
      await this.memory.add('observation', res.ok ? `I ${summary}. (${parsed.thought})` : `I wanted to ${summary}, but: ${res.msg}.`, res.ok ? 2 : 3, w.now);
      if (!res.ok) { this.pendingWake = true; this.onFriction?.(summary, res.msg ?? 'failed'); }
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
