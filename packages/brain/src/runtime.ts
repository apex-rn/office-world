import { seoulTime } from '../../shared/src/time.js';
import { rng } from '../../shared/src/rng.js';
import type { World, WorldEvent } from '../../sim/src/world.js';
import { BOSS, type Identity, STAFF } from './identity.js';
import type { Router } from './llm.js';
import { type BoardChange, type Card, ErrandRunner, diffBoard, errandsFor } from './board.js';
import { type DayPlan, dayPlan } from './calendar.js';
import { Mind } from './mind.js';
import { Society } from './social.js';
import { pointInPolygon } from '../../shared/src/math.js';

// Office runtime — ties the world (bodies) to the minds. Real Seoul time, workday 09:00-21:00 every day (§26).
// Thinking is event-driven and rate-limited (max concurrent model calls) to respect free-tier limits.
// Korean greetings are a social reflex (no tokens): the first time two people meet each day they bow —
// 15° among peers, 30° to the Manager, 45° to the Boss; people who like handshakes add one.

export type SocialEvent =
  | { t: number; type: 'greet'; from: string; to: string; bowDeg: 15 | 30 | 45; handshake: boolean };

export interface RuntimeOpts { maxConcurrentThoughts?: number; seed?: number; staff?: Identity[]; /** add the Boss's body (driven by the Boss, never by a model) */ boss?: boolean }

export class OfficeRuntime {
  readonly minds = new Map<string, Mind>();
  readonly society: Society;
  private eveningDone = '';
  private nextHabit = new Map<string, number>();
  private lastRoute = '';
  readonly social: SocialEvent[] = [];
  /** failed thoughts (model errors, unusable replies) for logs */
  thoughts = 0;
  /** every world event after the minds heard it (speech, greetings, arrivals, action results), e.g. for the live stream */
  onEvent?: (e: WorldEvent) => void;
  readonly diagnostics: { t: number; who: string; reason: string }[] = [];
  private greetedToday = new Set<string>();
  private day = '';
  private inFlight = 0;
  private arrivalMin = new Map<string, number>();   // minute of day each person walks in today
  private rand: () => number;
  private readonly maxConcurrent: number;
  plan: DayPlan | null = null;
  private inFlightIds = new Set<string>();
  readonly errands = new ErrandRunner();
  private cards: Card[] = [];
  readonly cardOf = new Map<string, Card>();

  constructor(readonly world: World, readonly router: Router, opts: RuntimeOpts = {}) {
    this.maxConcurrent = opts.maxConcurrentThoughts ?? 3;
    this.rand = rng(opts.seed ?? 1);
    this.society = new Society(opts.staff ?? STAFF, opts.seed ?? 1);
    if (opts.boss ?? true) world.addBody({ id: BOSS.id, name: 'Boss', heightM: 2.0, walkSpeed: 1.4 });
    for (const p of opts.staff ?? STAFF) {
      world.addBody({ id: p.id, name: p.name, heightM: p.heightM, walkSpeed: 1.25 + 0.1 * p.bigFive.conscientiousness });
      const mind = new Mind(p, { world, router, social: this.society });
      mind.onThinkError = reason => { this.diagnostics.push({ t: world.now, who: p.id, reason }); if (this.diagnostics.length > 500) this.diagnostics.shift(); };
      this.minds.set(p.id, mind);
    }
  }

  /** Arrival minute from the person's habit text, jittered a few minutes each day (never the same twice). */
  private planDay(dateStr: string): void {
    this.day = dateStr; this.greetedToday.clear();
    this.plan = dayPlan(dateStr, [...this.minds.values()].map(m => m.me));
    const bday = this.plan.events.find(e => e.kind === 'birthday');
    for (const m of this.minds.values()) {
      const hm = /(\d{2}):(\d{2})/.exec(m.me.habits.arrival);
      let at = (hm ? Number(hm[1]) * 60 + Number(hm[2]) : 8 * 60 + 55) + Math.round((this.rand() - 0.5) * 8);
      // birthday: everyone else comes at 07:30 to decorate; the birthday person comes at their usual time
      if (bday && bday.kind === 'birthday' && bday.person !== m.me.id) at = Math.min(at, bday.decorateFrom + Math.round(this.rand() * 10));
      this.arrivalMin.set(m.me.id, at);
    }
  }

  /** Advance the world by dt seconds; schedule thoughts. Model calls run asynchronously. */
  step(dt: number): void {
    const w = this.world;
    w.step(dt);
    const t = seoulTime(w.now);
    if (t.date !== this.day) this.planDay(t.date);
    for (const e of w.drainEvents()) { this.route(e); this.onEvent?.(e); }

    const plan = this.plan!;
    const now = t.minuteOfDay;
    const leave = plan.leaveFrom;
    const meeting = plan.events.find(e => e.kind === 'meeting' && now >= e.start - 5 && now < e.end);
    const party = plan.events.find(e =>
      (e.kind === 'birthday' && now >= e.surpriseAt && now < e.partyEnd) ||
      ((e.kind === 'anniversary' || e.kind === 'new_year') && now >= e.partyStart && now < e.partyEnd));
    this.activity = meeting ? `meeting:${meeting.kind === 'meeting' ? meeting.type : ''}` : party ? `party:${party.kind}` : 'work';
    for (const m of this.minds.values()) {
      const id = m.me.id, b = w.bodies.get(id)!;
      // arrivals and departures follow the day plan; the office keeper stays until everyone has left
      if (b.state === 'offsite') {
        const arr = this.arrivalMin.get(id) ?? 540;
        if (!plan.noWork && now >= arr && now < leave) w.command(id, { verb: 'arrive' });
        continue;
      }
      // meetings and parties gather everyone (a body already busy finishes its step first)
      if (!b.active && (meeting || party)) {
        const zone = meeting ? 'meeting' : 'lounge';
        const z = w.layout.zones.find(x => x.id === zone)!;
        if (!pointInPolygon(b.pos, z.poly) && !(b.seat && b.seat.inst.startsWith(`${zone}.`))) {
          if (b.state === 'sitting') { w.command(id, { verb: 'stand' }); continue; }
          const chair = meeting && id !== 'manager' ? w.layout.instances.find(i => i.id.startsWith('meeting.chair') && !w.occupancy.get(i.id)?.size) : undefined;
          w.command(id, chair ? { verb: 'sit', target: chair.id } : { verb: 'go_to', target: zone });
          continue;
        }
        b.anim = party ? (party.kind === 'birthday' ? 'clap' : 'dance') : b.anim;
        continue;   // during gatherings the meeting/party module drives speech
      }
      // after a gathering, people go back to their desks
      if (!meeting && !party && !b.active && b.seat?.inst.startsWith('meeting.') && now < plan.workEnds) { w.command(id, { verb: 'stand' }); this.errands.add({ who: id, why: 'back to desk', steps: [{ verb: 'sit', target: `chair.${id}` }] }); continue; }
      // board errands take priority over free thinking (habits, no model call)
      // someone spoke to a person who is following their own plan: the plan waits, the answer comes first
      if (m.wantsReply && this.errands.has(id) && !this.inFlightIds.has(id)) this.errands.drop(id, 'plan');
      if (!b.active && this.errands.has(id)) {
        if (b.state === 'sitting' && this.errands.peek(id)?.verb !== 'sit') { w.command(id, { verb: 'stand' }); continue; }
        this.errands.next(id, w.now, c => w.command(id, c)); continue;
      }
      if (now >= leave && !b.active && b.state !== 'sitting') {
        const othersIn = [...w.bodies.values()].some(o => o.spec.id !== id && o.state !== 'offsite' && o.spec.id !== BOSS.id);
        if (id !== 'guard' || !othersIn) { w.command(id, { verb: 'go_home' }); continue; }
      }
      if (now >= leave && b.state === 'sitting' && !b.active) { w.command(id, { verb: 'stand' }); continue; }
      // replies jump the queue (a person spoken to answers within seconds, not after others finish thinking)
      const cap = this.maxConcurrent + (m.wantsReply ? 3 : 0);
      if (this.inFlight < cap && m.shouldThink()) {
        this.inFlight++; this.thoughts++; this.inFlightIds.add(id);
        m.think(this.cardOf.get(id))
          .then(() => { if (m.plan.length) { this.errands.add({ who: id, why: 'plan', steps: m.plan }); m.plan = []; } })
          .catch(() => null).finally(() => { this.inFlight--; this.inFlightIds.delete(id); });
      }
    }
    this.greetings();
    if (!meeting && !party && now < plan.workEnds) this.habits();
    if (now >= plan.leaveFrom + 30 && this.eveningDone !== t.date && [...w.bodies.values()].every(b => b.state === 'offsite' || b.spec.id === BOSS.id)) {
      this.eveningDone = t.date;
      for (const f of this.society.evening(w.now)) void this.minds.get(f.who)?.feel(f.appraisal);
      // evening reflection, one person after another (free model, small and rare)
      void (async () => { for (const m of this.minds.values()) await m.reflect().catch(() => []); })();
    }
  }

  /** Habit errands (no model call): the housekeeper dusts desks whose owners are away; Viktor walks his rounds. */
  private habits(): void {
    const w = this.world;
    for (const id of ['cleaner', 'guard']) {
      const b = w.bodies.get(id);
      if (!b || b.state === 'offsite' || b.active || this.errands.has(id)) continue;
      const due = this.nextHabit.get(id) ?? w.now + (id === 'cleaner' ? 5 : 20) * 60_000;
      if (!this.nextHabit.has(id)) { this.nextHabit.set(id, due); continue; }
      if (w.now < due) continue;
      if (id === 'cleaner') {
        const away = w.layout.instances.filter(i => i.id.startsWith('desk.') && i.owner && w.bodies.get(i.owner)?.state !== 'sitting');
        const desk = away[Math.floor(this.rand() * away.length)];
        if (desk) this.errands.add({ who: id, why: `dust ${desk.id}`, steps: [{ verb: 'go_to', target: desk.id }, { verb: 'wait', seconds: 35 + this.rand() * 30 }] });
        this.nextHabit.set(id, w.now + (15 + this.rand() * 10) * 60_000);
      } else {
        const zones = ['kitchen', 'work', 'lounge', 'print', 'reception', 'balcony'].sort(() => this.rand() - 0.5).slice(0, 3);
        if (zones.join() === this.lastRoute) zones.reverse();
        this.lastRoute = zones.join();
        this.errands.add({ who: id, why: 'rounds', steps: [...zones.map(z => ({ verb: 'go_to', target: z }) as const), { verb: 'sit', target: 'chair.guard' }] });
        this.nextHabit.set(id, w.now + (40 + this.rand() * 20) * 60_000);
      }
    }
  }

  /** what the office is doing right now: work, meeting:<type>, party:<kind> */
  activity = 'work';

  /** Feed the latest board snapshot; changes become errands and feelings. */
  applyBoard(next: Card[]): BoardChange[] {
    const ch = diffBoard(this.cards, next);
    this.cards = next;
    for (const c of next) if (c.owner && !['done', 'approved', 'rejected'].includes(c.status)) this.cardOf.set(c.owner, c); else if (c.owner && this.cardOf.get(c.owner)?.id === c.id) this.cardOf.delete(c.owner);
    for (const x of ch) {
      for (const e of errandsFor(x)) this.errands.add(e);
      const m = x.card.owner ? this.minds.get(x.card.owner) : undefined;
      if (m && x.type === 'status') {
        if (x.card.status === 'approved' || x.card.status === 'done') void m.feel({ kind: 'qa', passed: true, firstTry: x.from === 'review' });
        if (x.card.status === 'rejected') void m.feel({ kind: 'qa', passed: false, firstTry: false });
      }
    }
    return ch;
  }

  private route(e: WorldEvent): void {
    // conversations build relationships; mutual warmth can turn into romance (rarely, in stages)
    if (e.type === 'speech' && e.to && this.minds.has(e.from) && this.minds.has(e.to)) {
      const tone = /thank|great|love|nice|well done|barakalla|rahmat|haha|:\)/i.test(e.text) ? 0.8 : /wrong|late|again|fix/i.test(e.text) ? 0 : 0.35;
      this.society.talked(e.from, e.to, e.t, tone);
      const r = this.society.romance(e.from, e.to, e.t);
      if (r) for (const f of r.feelings) void this.minds.get(f.who)?.feel(f.appraisal);
    }
    // listening reflex: the person spoken to turns toward the speaker right away, while their answer is being thought
    if (e.type === 'speech' && e.to && this.world.bodies.has(e.to) && this.world.bodies.get(e.to)!.state !== 'offsite') this.world.faceToward(e.to, e.from);
    // arriving: walk in and go to your own place first (habit reflex), then start thinking
    if (e.type === 'arrived') {
      const m = this.minds.get(e.agent);
      if (m) {
        const own = this.world.inst(`chair.${e.agent}`);
        this.world.command(e.agent, own ? { verb: 'sit', target: own.id } : { verb: 'go_to', target: 'kitchen' });
      }
    }
    for (const m of this.minds.values()) m.observe(e);
  }

  /** First sight of the day within 3 m and in line of sight → bow (and maybe a handshake). */
  private greetings(): void {
    const w = this.world;
    const present = [...w.bodies.values()].filter(b => b.state !== 'offsite');
    for (const a of present) for (const b of present) {
      if (a === b) continue;
      const key = `${a.spec.id}>${b.spec.id}`;
      if (this.greetedToday.has(key)) continue;
      if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 3 || !w.acoustics.canSee(a.pos, b.pos)) continue;
      // people greet someone they can actually see: the other person is inside a's field of view (±55°)
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const off = Math.abs(((Math.atan2(dx, dz) - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (off > (55 * Math.PI) / 180 && a.state !== 'sitting') continue;
      if (a.state === 'sitting' && b.state === 'sitting') continue;   // two seated people nod later, when one stands
      this.greetedToday.add(key);
      const bowDeg: 15 | 30 | 45 = b.spec.id === BOSS.id ? 45 : b.spec.id === 'manager' && a.spec.id !== BOSS.id ? 30 : 15;
      const pa = this.minds.get(a.spec.id)?.me, pb = this.minds.get(b.spec.id)?.me;
      const handshake = !!pa && !!pb && pa.habits.greeting === 'bow_handshake' && pb.habits.greeting === 'bow_handshake';
      if (a.spec.id === BOSS.id) continue;               // the Boss is greeted; he greets as he likes
      this.social.push({ t: w.now, type: 'greet', from: a.spec.id, to: b.spec.id, bowDeg, handshake });
      // face each other, pause ~1.5 s for the bow, then carry on
      this.world.pauseToGreet(a.spec.id, b.spec.id, handshake ? 'bow_handshake' : `bow_${bowDeg}`);
    }
  }
}
