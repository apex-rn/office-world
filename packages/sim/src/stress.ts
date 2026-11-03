import { def } from '../../catalog/src/items.js';
import { OFFICE_V1 } from '../../catalog/src/layout.js';
import { rng } from '../../shared/src/rng.js';
import { BODY_RADIUS, snap } from './nav.js';
import { type Command, World } from './world.js';

// Headless stress harness: random but legal errands for N bodies. Measures physical violations.
// Used by the unit test (short run) and tools/headless.ts (24 h run).

export interface StressResult {
  overlaps: number; worstOverlap: { a: string; b: string; d: number } | null;
  offMesh: number; completed: number; failed: Record<string, number>; yields: number; failDetail: Record<string, number>; simSeconds: number; wallMs: number;
}

export async function runStress(o: { bodies: number; minutes: number; seed: number; dt?: number }): Promise<StressResult> {
  const t0 = Date.now();
  const w = await World.create(structuredClone(OFFICE_V1), Date.UTC(2026, 10, 3, 0, 0), o.seed);
  const r = rng(o.seed * 31 + 7);
  const ids = Array.from({ length: o.bodies }, (_, k) => `a${k}`);
  for (const id of ids) w.addBody({ id, name: id, heightM: 1.6 + r() * 0.25, walkSpeed: 1.25 + r() * 0.15 });
  const seats = OFFICE_V1.instances.filter(i => def(i.def).seatH && i.def !== 'toilet').map(i => i.id);
  const devices = OFFICE_V1.instances.flatMap(i => (def(i.def).affordances ?? []).filter(a => a.verb !== 'sit' && a.verb !== 'work' && a.verb !== 'switch').map(a => ({ id: i.id, verb: a.verb, yields: !!a.yields })));
  const zones = OFFICE_V1.zones.map(z => z.id);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;

  const res: StressResult = { overlaps: 0, worstOverlap: null, offMesh: 0, completed: 0, failed: {}, yields: 0, failDetail: {}, simSeconds: 0, wallMs: 0 };
  const dt = o.dt ?? 0.05, steps = Math.round((o.minutes * 60) / dt);
  let pending = 0;
  const lastTarget = new Map<string, string>();
  for (let s = 0; s < steps; s++) {
    // arrivals staggered over the first minute
    if (s % 40 === 0 && pending < ids.length) { if (w.command(ids[pending]!, { verb: 'arrive' }).ok) pending++; }
    for (const id of ids) {
      const b = w.bodies.get(id)!;
      if (b.state === 'offsite' || b.active) continue;
      let c: Command;
      if (b.state === 'sitting') c = r() < 0.5 ? { verb: 'stand' } : { verb: 'wait', seconds: 20 + r() * 60 };
      else if (b.holding) c = r() < 0.5 ? { verb: 'consume' } : { verb: 'place', target: pick(['kitchen.counter', 'kitchen.table', 'lounge.table', `desk.${pick(['writer', 'qa', 'facts', 'shorts'])}`]) };
      else {
        const x = r();
        if (x < 0.35) c = { verb: 'sit', target: pick(seats) };
        else if (x < 0.65) { const d = pick(devices); c = { verb: 'use', target: d.id, action: d.verb }; }
        else if (x < 0.9) c = { verb: 'go_to', target: pick(zones) };
        else c = { verb: 'go_to', target: pick(ids) };
      }
      const out = w.command(id, c);
      if ('target' in c) lastTarget.set(id, String(c.target).replace(/^a\d+$/, '<person>'));
      if (!out.ok) {
        res.failed[out.code] = (res.failed[out.code] ?? 0) + 1;
        if (c.verb === 'place' && b.holding) { w.items.delete(b.holding); b.holding = null; } // drop into a bin, keep the run moving
      }
    }
    w.step(dt);
    for (const e of w.drainEvents()) {
      if (e.type === 'action_done') res.completed++;
      if (e.type === 'yield') res.yields++;
      if (e.type === 'action_failed') {
        res.failed[e.code] = (res.failed[e.code] ?? 0) + 1;
        const k = `${e.code} ${e.verb} ${lastTarget.get(e.agent) ?? ''}`; res.failDetail[k] = (res.failDetail[k] ?? 0) + 1;
        if (process.env.STRESS_DEBUG && e.code === 'NO_PATH') {
          const b = w.bodies.get(e.agent)!;
          const near = [...w.bodies.values()].filter(o => o !== b && o.state !== 'offsite' && Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z) < 2).map(o => `${o.spec.id}:${o.state}:${o.active?.verb ?? '-'}@${o.pos.x.toFixed(2)},${o.pos.z.toFixed(2)}`);
          console.log(`FAIL ${k} at ${b.pos.x.toFixed(2)},${b.pos.z.toFixed(2)} near=[${near.join(' ')}]`);
        }
      }
    }
    // physical checks on bodies that are on the floor (sitting bodies are on their seat, outside the crowd)
    const floor = [...w.bodies.values()].filter(b => b.agent);
    for (let i = 0; i < floor.length; i++) for (let j = i + 1; j < floor.length; j++) {
      const A = floor[i]!, B = floor[j]!;
      const d = Math.hypot(A.pos.x - B.pos.x, A.pos.z - B.pos.z);
      if (d < BODY_RADIUS * 2 - 0.1) {           // >10 cm interpenetration of 25 cm capsules = visible clipping
        res.overlaps++;
        if (!res.worstOverlap || d < res.worstOverlap.d) res.worstOverlap = { a: A.spec.id, b: B.spec.id, d };
      }
    }
    if (s % 200 === 0) for (const b of floor) {
      const p = snap(w.nav, b.pos, { x: 0.02, y: 0.5, z: 0.02 });
      if (!p) res.offMesh++;
    }
  }
  res.simSeconds = steps * dt; res.wallMs = Date.now() - t0;
  return res;
}
