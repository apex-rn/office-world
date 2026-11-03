import { seoulTime } from '../../shared/src/time.js';
import { rng } from '../../shared/src/rng.js';
import type { World, WorldEvent } from '../../sim/src/world.js';
import { BOSS, type Identity, STAFF } from './identity.js';
import type { Router } from './llm.js';
import { Mind } from './mind.js';

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
  private greetedToday = new Set<string>();
  private day = '';
  private inFlight = 0;
  private arrivalMin = new Map<string, number>();   // minute of day each person walks in today
  private rand: () => number;
  private readonly maxConcurrent: number;

  constructor(readonly world: World, readonly router: Router, opts: RuntimeOpts = {}) {
    this.maxConcurrent = opts.maxConcurrentThoughts ?? 3;
    this.rand = rng(opts.seed ?? 1);
    for (const p of opts.staff ?? STAFF) {
      world.addBody({ id: p.id, name: p.name, heightM: p.heightM, walkSpeed: 1.25 + 0.1 * p.bigFive.conscientiousness });
      this.minds.set(p.id, new Mind(p, { world, router }));
    }
  }

  /** Arrival minute from the person's habit text, jittered a few minutes each day (never the same twice). */
  private planDay(dateStr: string): void {
    this.day = dateStr; this.greetedToday.clear();
    for (const m of this.minds.values()) {
      const hm = /(\d{2}):(\d{2})/.exec(m.me.habits.arrival);
      const base = hm ? Number(hm[1]) * 60 + Number(hm[2]) : 8 * 60 + 55;
      this.arrivalMin.set(m.me.id, base + Math.round((this.rand() - 0.5) * 8));
    }
  }

  /** Advance the world by dt seconds; schedule thoughts. Model calls run asynchronously. */
  step(dt: number): void {
    const w = this.world;
    w.step(dt);
    const t = seoulTime(w.now);
    if (t.date !== this.day) this.planDay(t.date);
    for (const e of w.drainEvents()) this.route(e);

    for (const m of this.minds.values()) {
      const id = m.me.id, b = w.bodies.get(id)!;
      // arrivals and departures follow the workday; the office keeper stays until everyone has left
      if (b.state === 'offsite') {
        const arr = this.arrivalMin.get(id) ?? 540;
        if (t.minuteOfDay >= arr && t.minuteOfDay < 21 * 60) w.command(id, { verb: 'arrive' });
        continue;
      }
      if (t.minuteOfDay >= 21 * 60 && !b.active && b.state !== 'sitting') {
        const othersIn = [...w.bodies.values()].some(o => o.spec.id !== id && o.state !== 'offsite' && o.spec.id !== BOSS.id);
        if (id !== 'guard' || !othersIn) { w.command(id, { verb: 'go_home' }); continue; }
      }
      if (t.minuteOfDay >= 21 * 60 && b.state === 'sitting' && !b.active) { w.command(id, { verb: 'stand' }); continue; }
      if (this.inFlight < this.maxConcurrent && m.shouldThink()) {
        this.inFlight++;
        m.think().catch(() => null).finally(() => { this.inFlight--; });
      }
    }
    this.greetings();
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
