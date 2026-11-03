import { seoulTime } from '../../shared/src/time.js';
import { rng } from '../../shared/src/rng.js';
import type { World, WorldEvent } from '../../sim/src/world.js';
import { BOSS, type Identity, STAFF } from './identity.js';
import type { Router } from './llm.js';
import { type BoardChange, type Card, ErrandRunner, diffBoard, errandsFor } from './board.js';
import { type DayPlan, dayPlan } from './calendar.js';
import { Mind } from './mind.js';
import { pointInPolygon } from '../../shared/src/math.js';

// Office runtime — ties the world (bodies) to the minds. Real Seoul time, workday 09:00-21:00 every day (§26).
// Thinking is event-driven and rate-limited (max concurrent model calls) to respect free-tier limits.
// Korean greetings are a social reflex (no tokens): the first time two people meet each day they bow —
// 15° among peers, 30° to the Manager, 45° to the Boss; people who like handshakes add one.

export type SocialEvent =
  | { t: number; type: 'greet'; from: string; to: string; bowDeg: 15 | 30 | 45; handshake: boolean };

export interface RuntimeOpts { maxConcurrentThoughts?: number; seed?: number; staff?: Identity[] }

export class OfficeRuntime {
  readonly minds = new Map<string, Mind>();
  readonly social: SocialEvent[] = [];
  /** failed thoughts (model errors, unusable replies) for logs */
  thoughts = 0;
  readonly diagnostics: { t: number; who: string; reason: string }[] = [];
  private greetedToday = new Set<string>();
  private day = '';
  private inFlight = 0;
  private arrivalMin = new Map<string, number>();   // minute of day each person walks in today
  private rand: () => number;
  private readonly maxConcurrent: number;
  plan: DayPlan | null = null;
  readonly errands = new ErrandRunner();
  private cards: Card[] = [];
  readonly cardOf = new Map<string, Card>();

  constructor(readonly world: World, readonly router: Router, opts: RuntimeOpts = {}) {
    this.maxConcurrent = opts.maxConcurrentThoughts ?? 3;
    this.rand = rng(opts.seed ?? 1);
    for (const p of opts.staff ?? STAFF) {
      world.addBody({ id: p.id, name: p.name, heightM: p.heightM, walkSpeed: 1.25 + 0.1 * p.bigFive.conscientiousness });
      const mind = new Mind(p, { world, router });
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
    for (const e of w.drainEvents()) this.route(e);

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
      if (!b.active && this.errands.has(id)) {
        if (b.state === 'sitting' && this.errands.peek(id)?.verb !== 'sit') { w.command(id, { verb: 'stand' }); continue; }
        this.errands.next(id, w.now, c => w.command(id, c)); continue;
      }
      if (now >= leave && !b.active && b.state !== 'sitting') {
        const othersIn = [...w.bodies.values()].some(o => o.spec.id !== id && o.state !== 'offsite' && o.spec.id !== BOSS.id);
        if (id !== 'guard' || !othersIn) { w.command(id, { verb: 'go_home' }); continue; }
      }
      if (now >= leave && b.state === 'sitting' && !b.active) { w.command(id, { verb: 'stand' }); continue; }
      if (this.inFlight < this.maxConcurrent && m.shouldThink()) {
        this.inFlight++; this.thoughts++;
        m.think(this.cardOf.get(id)).catch(() => null).finally(() => { this.inFlight--; });
      }
    }
    this.greetings();
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
      this.greetedToday.add(key);
      const bowDeg: 15 | 30 | 45 = b.spec.id === BOSS.id ? 45 : b.spec.id === 'manager' && a.spec.id !== BOSS.id ? 30 : 15;
      const pa = this.minds.get(a.spec.id)?.me, pb = this.minds.get(b.spec.id)?.me;
      const handshake = !!pa && !!pb && pa.habits.greeting === 'bow_handshake' && pb.habits.greeting === 'bow_handshake';
      if (a.spec.id === BOSS.id) continue;               // the Boss is greeted; he greets as he likes
      this.social.push({ t: w.now, type: 'greet', from: a.spec.id, to: b.spec.id, bowDeg, handshake });
      a.anim = handshake ? 'bow_handshake' : `bow_${bowDeg}`;
    }
  }
}
