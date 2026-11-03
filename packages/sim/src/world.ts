import { def } from '../../catalog/src/items.js';
import type { Instance, Layout, Verb } from '../../catalog/src/schema.js';
import { baseY } from '../../catalog/src/validator.js';
import { type Vec2, type Vec3, localToWorld, pointInPolygon } from '../../shared/src/math.js';
import { between, rng } from '../../shared/src/rng.js';
import { Acoustics, HEARING } from './acoustics.js';
import { AGENT_PARAMS, BODY_RADIUS, type CrowdAgent, type Nav, buildNav, path, snap } from './nav.js';

// Authoritative world simulation — WORLD_PLAN §§5-10. The brain issues high-level commands (Body API);
// the body walks, queues, sits, uses devices and speaks under physical and social rules it cannot break.

export type BodyState = 'offsite' | 'standing' | 'walking' | 'sitting' | 'using';

export type Command =
  | { verb: 'go_to'; target: string }                     // instance id, zone id or agent id
  | { verb: 'sit'; target: string }                       // chair/sofa instance id
  | { verb: 'stand' }
  | { verb: 'use'; target: string; action: Verb }         // walk to the device anchor, wait for capacity, use it
  | { verb: 'consume' }                                   // drink/eat what is in hand
  | { verb: 'pick'; target: string }
  | { verb: 'place'; target: string }                     // instance with a support surface
  | { verb: 'say'; to: string | null; text: string; volume?: keyof typeof HEARING }
  | { verb: 'wait'; seconds: number }
  | { verb: 'arrive' }
  | { verb: 'go_home' };

export type RejectCode = 'NOT_PRESENT' | 'OCCUPIED' | 'OUT_OF_REACH' | 'NO_PATH' | 'HANDS_FULL' | 'HANDS_EMPTY'
  | 'NOT_ALLOWED' | 'BUSY' | 'UNKNOWN_TARGET' | 'NO_SPACE' | 'OFFSITE' | 'OUT_OF_EARSHOT';

export type Result = { ok: true; actionId: number } | { ok: false; code: RejectCode; msg: string };

export type WorldEvent =
  | { t: number; type: 'action_done'; agent: string; actionId: number; verb: string; detail?: string }
  | { t: number; type: 'action_failed'; agent: string; actionId: number; verb: string; code: RejectCode; msg: string }
  | { t: number; type: 'speech'; from: string; to: string | null; text: string; volume: string; hearers: string[] }
  | { t: number; type: 'arrived' | 'left'; agent: string }
  | { t: number; type: 'yield'; agent: string; for: string };

export interface BodySpec { id: string; name: string; heightM: number; walkSpeed: number }

interface Active {
  id: number; verb: Command['verb'];
  phase: 'walk' | 'queue' | 'turn' | 'transition' | 'perform' | 'timer';
  target?: string; goal?: Vec3; goalYaw?: number;
  until?: number; aff?: { verb: Verb; at: string; dur: [number, number]; yields?: string; anim: string; slots?: string[] };
  lastProgressT: number; bestDist: number; retries: number;
  started?: number; cur?: Vec3;
  /** seat or device slot index this action holds */
  slot?: number;
  lastRetarget?: number;
  after?: 'sit' | 'use' | 'home' | 'go';
}

export interface Body {
  spec: BodySpec;
  state: BodyState;
  pos: Vec3; yaw: number;
  agent: CrowdAgent | null;
  holding: string | null;
  seat: { inst: string; anchor: string } | null;
  active: Active | null;
  anim: string;
  /** passive reflex target (stepping out of the way); cleared by the next command */
  stepAside?: Vec3;
  stepAsideT?: number;
  /** waiting for a narrow doorway to clear */
  doorHold?: string;
}

export interface DynItem { id: string; def: string; at: { on: string; x: number; z: number } | { heldBy: string }; fill: number }

const REACH = 0.85;            // hand reach from the body centre (m, plan distance)
const ARRIVE_EPS = 0.18;
const STUCK_S = 6, GIVE_UP_S = 25;

export class World {
  readonly bodies = new Map<string, Body>();
  readonly items = new Map<string, DynItem>();
  /** instance id -> agents currently using/reserving it */
  readonly occupancy = new Map<string, Set<string>>();
  /** device instance id -> FIFO queue of waiting agents */
  readonly queues = new Map<string, string[]>();
  /** "inst#slot" -> agent holding that seat / standing spot */
  readonly slotTaken = new Map<string, string>();
  /** cached bent queue lines per device */
  private lines = new Map<string, Vec3[]>();
  readonly events: WorldEvent[] = [];
  readonly acoustics: Acoustics;
  /** reachable representative standing spot per zone (closest free navmesh point to the zone centre) */
  readonly zoneSpot = new Map<string, Vec3>();
  /** narrow doorways (one person at a time): centre, along-wall unit, normal unit, half width */
  private doors: { id: string; c: Vec2; u: Vec2; n: Vec2; hw: number }[] = [];
  private nextAction = 1;
  private nextItem = 1;
  private rand: () => number;

  private constructor(readonly layout: Layout, readonly nav: Nav, public now: number, seed: number) {
    this.acoustics = new Acoustics(layout);
    this.rand = rng(seed);
    this.computeZoneSpots();
    for (const o of layout.openings.filter(o => o.kind === 'door' && o.to - o.from < 1.3)) {
      const w = layout.walls.find(x => x.id === o.wall)!;
      const L = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z), u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
      const m = (o.from + o.to) / 2;
      this.doors.push({ id: o.id, c: { x: w.a.x + u.x * m, z: w.a.z + u.z * m }, u, n: { x: -u.z, z: u.x }, hw: (o.to - o.from) / 2 });
    }
    for (const i of layout.instances) {
      const d = def(i.def);
      if (d.kind === 'item') this.items.set(i.id, { id: i.id, def: i.def, at: { on: i.on!, x: i.x, z: i.z }, fill: 0 });
    }
  }

  static async create(layout: Layout, nowMs: number, seed = 1): Promise<World> {
    return new World(layout, await buildNav(layout), nowMs, seed);
  }

  private computeZoneSpots(): void {
    const e = snap(this.nav, { x: this.layout.entrance.x, y: 0, z: this.layout.entrance.z })!;
    for (const z of this.layout.zones) {
      const cx = z.poly.reduce((s, p) => s + p.x, 0) / z.poly.length, cz = z.poly.reduce((s, p) => s + p.z, 0) / z.poly.length;
      const xs = z.poly.map(p => p.x), zs = z.poly.map(p => p.z);
      let best: Vec3 | null = null, bestD = Infinity;
      for (let x = Math.min(...xs) + 0.3; x < Math.max(...xs); x += 0.25) for (let zz = Math.min(...zs) + 0.3; zz < Math.max(...zs); zz += 0.25) {
        const dd = Math.hypot(x - cx, zz - cz);
        if (dd >= bestD || !pointInPolygon({ x, z: zz }, z.poly)) continue;
        const s = snap(this.nav, { x, y: 0, z: zz }, { x: 0.05, y: 0.5, z: 0.05 });
        if (!s || Math.hypot(s.x - x, s.z - zz) > 0.06) continue;
        const pth = path(this.nav, e, s);
        if (!pth || Math.hypot(pth.at(-1)!.x - s.x, pth.at(-1)!.z - s.z) > 0.1) continue;
        best = s; bestD = dd;
      }
      if (best) this.zoneSpot.set(z.id, best);
    }
  }

  // ------------------------------------------------------------------ lookups
  inst(id: string): Instance | undefined { return this.layout.instances.find(i => i.id === id); }

  anchorWorld(i: Instance, name: string): { p: Vec3; yaw: number } | null {
    const a = def(i.def).anchors?.[name];
    if (!a) return null;
    const w = localToWorld(i.x, i.z, i.yaw, a.x, a.z);
    return { p: { x: w.x, y: (a.y ?? 0) + baseY(this.layout, i), z: w.z }, yaw: i.yaw + (a.yaw ?? 0) };
  }

  zoneOf(p: Vec2): string | null {
    return this.layout.zones.find(z => pointInPolygon(p, z.poly))?.id ?? null;
  }

  present(id: string): boolean { const b = this.bodies.get(id); return !!b && b.state !== 'offsite'; }

  private emit(e: WorldEvent): void { this.events.push(e); }
  drainEvents(): WorldEvent[] { return this.events.splice(0); }

  // ------------------------------------------------------------------ bodies
  addBody(spec: BodySpec): void {
    this.bodies.set(spec.id, {
      spec, state: 'offsite', pos: { x: this.layout.entrance.x, y: 0, z: this.layout.entrance.z }, yaw: Math.PI / 2,
      agent: null, holding: null, seat: null, active: null, anim: 'none',
    });
  }

  private spawnAgent(b: Body, p: Vec3): void {
    const s = snap(this.nav, p) ?? p;
    b.agent = this.nav.crowd.addAgent(s, { ...AGENT_PARAMS, maxSpeed: b.spec.walkSpeed });
    b.pos = { ...s };
  }

  private despawnAgent(b: Body): void {
    if (b.agent) { this.nav.crowd.removeAgent(b.agent); b.agent = null; }
  }

  private freeSpot(p: Vec2, except: string): boolean {
    for (const o of this.bodies.values()) {
      if (o.spec.id === except || o.state === 'offsite') continue;
      if (Math.hypot(o.pos.x - p.x, o.pos.z - p.z) < BODY_RADIUS * 2 + 0.05) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ Body API
  command(agentId: string, c: Command): Result {
    const b = this.bodies.get(agentId);
    if (!b) return { ok: false, code: 'UNKNOWN_TARGET', msg: `no body ${agentId}` };
    const rej = (code: RejectCode, msg: string): Result => ({ ok: false, code, msg });

    if (c.verb === 'arrive') {
      if (b.state !== 'offsite') return rej('NOT_ALLOWED', 'already in the office');
      if (!this.freeSpot(this.layout.entrance, agentId)) return rej('BUSY', 'someone is standing in the doorway');
      this.spawnAgent(b, { x: this.layout.entrance.x, y: 0, z: this.layout.entrance.z });
      b.state = 'standing'; b.anim = 'idle';
      this.emit({ t: this.now, type: 'arrived', agent: agentId });
      return { ok: true, actionId: 0 };
    }
    if (b.state === 'offsite') return rej('OFFSITE', 'not in the office');

    if (c.verb === 'say') {
      const vol = c.volume ?? 'normal';
      if (c.to) {
        const o = this.bodies.get(c.to);
        if (!o || o.state === 'offsite') return rej('NOT_PRESENT', `${c.to} is not in the office`);
        if (!this.acoustics.canHear(b.pos, o.pos, vol)) return rej('OUT_OF_EARSHOT', `${c.to} cannot hear you from here`);
      }
      const hearers = [...this.bodies.values()]
        .filter(o => o.spec.id !== agentId && o.state !== 'offsite' && this.acoustics.canHear(b.pos, o.pos, vol))
        .map(o => o.spec.id);
      this.emit({ t: this.now, type: 'speech', from: agentId, to: c.to, text: c.text, volume: vol, hearers });
      return { ok: true, actionId: 0 };
    }

    if (c.verb === 'consume') {
      if (!b.holding) return rej('HANDS_EMPTY', 'nothing in hand');
      return this.begin(b, { verb: 'consume', phase: 'timer', until: this.now + between(this.rand, 20, 60) * 1000 });
    }

    if (c.verb === 'pick') {
      const it = this.items.get(c.target);
      if (!it || 'heldBy' in it.at) return rej('UNKNOWN_TARGET', 'no such item lying around');
      if (b.holding) return rej('HANDS_FULL', `already holding ${b.holding}`);
      if (Math.hypot(it.at.x - b.pos.x, it.at.z - b.pos.z) > REACH + (b.state === 'sitting' ? 0.15 : 0)) return rej('OUT_OF_REACH', 'too far away to reach');
      it.at = { heldBy: agentId }; b.holding = it.id;
      return this.finishInstant(b, 'pick', it.id);
    }

    if (c.verb === 'place') {
      if (!b.holding) return rej('HANDS_EMPTY', 'nothing in hand');
      const surf = this.inst(c.target);
      if (!surf || !def(surf.def).support) return rej('UNKNOWN_TARGET', 'not a surface');
      const spot = this.findSpot(surf, b.holding, b.pos);
      if (!spot) return rej('NO_SPACE', 'no free space within reach on that surface');
      const it = this.items.get(b.holding)!;
      it.at = { on: surf.id, x: spot.x, z: spot.z }; b.holding = null;
      return this.finishInstant(b, 'place', it.id);
    }

    if (b.state === 'sitting' && c.verb !== 'stand' && c.verb !== 'wait') {
      // work/use from the seat is only allowed for the device the seat belongs to; anything else needs standing up first
      return rej('BUSY', 'sitting — stand up first');
    }

    switch (c.verb) {
      case 'stand': return this.standUp(b);
      case 'wait': return this.begin(b, { verb: 'wait', phase: 'timer', until: this.now + c.seconds * 1000 });
      case 'go_home': return this.walkTo(b, { x: this.layout.entrance.x, y: 0, z: this.layout.entrance.z }, Math.PI * 1.5, 'go_home', 'home');
      case 'go_to': {
        const g = this.resolveTarget(b, c.target);
        if (!g) return rej('UNKNOWN_TARGET', `unknown target ${c.target}`);
        return this.walkTo(b, g.p, g.yaw, 'go_to', 'go', c.target);
      }
      case 'sit': {
        const i = this.inst(c.target);
        const d = i && def(i.def);
        if (!i || !d?.seatH) return rej('UNKNOWN_TARGET', 'not a seat');
        const n = this.seatCount(i);
        let slot = -1;
        for (let k = 0; k < n; k++) if (!this.slotTaken.has(`${i.id}#${k}`)) { slot = k; break; }
        if (slot < 0) return rej('OCCUPIED', `${i.id} is taken`);
        const ap = this.seatApproach(i, slot);
        if (!ap) return rej('NO_PATH', 'seat cannot be approached');
        const res = this.walkTo(b, ap.p, ap.yaw, 'sit', 'sit', i.id);
        if (res.ok) { this.reserve(i.id, b.spec.id); this.slotTaken.set(`${i.id}#${slot}`, b.spec.id); b.active!.slot = slot; }
        return res;
      }
      case 'use': {
        let i = this.inst(c.target);
        if (i?.group) {
          const load = (x: Instance) => (this.occupancy.get(x.id)?.size ?? 0) + (this.queues.get(x.id)?.length ?? 0);
          i = this.layout.instances.filter(x => x.group === i!.group).sort((a, b) => load(a) - load(b))[0]!;
        }
        const aff = i && def(i.def).affordances?.find(a => a.verb === c.action);
        if (!i || !aff) return rej('UNKNOWN_TARGET', `${c.target} cannot ${c.action}`);
        if (aff.yields && b.holding) return rej('HANDS_FULL', `hands full (${b.holding})`);
        const at = aff.at === 'self' ? { p: { x: i.x, y: 0, z: i.z }, yaw: i.yaw } : this.anchorWorld(i, aff.at);
        if (!at) return rej('UNKNOWN_TARGET', 'device has no use point');
        const res = this.walkTo(b, at.p, at.yaw + Math.PI, 'use', 'use', i.id);
        if (res.ok) {
          b.active!.aff = { verb: aff.verb, at: aff.at, dur: aff.duration, yields: aff.yields, anim: aff.anim, slots: aff.slots };
          b.active!.started = this.now;
          const q = this.queues.get(i.id) ?? []; q.push(b.spec.id); this.queues.set(i.id, q);
        }
        return res;
      }
    }
    return rej('NOT_ALLOWED', 'unsupported');
  }

  private begin(b: Body, a: Omit<Active, 'id' | 'lastProgressT' | 'bestDist' | 'retries'>): Result {
    this.cancel(b);
    b.stepAside = undefined;
    const id = this.nextAction++;
    b.active = { id, lastProgressT: this.now, bestDist: Infinity, retries: 0, ...a };
    return { ok: true, actionId: id };
  }

  private finishInstant(b: Body, verb: string, detail: string): Result {
    const id = this.nextAction++;
    this.emit({ t: this.now, type: 'action_done', agent: b.spec.id, actionId: id, verb, detail });
    return { ok: true, actionId: id };
  }

  /** Abandon the current action (releases reservations and queue places). */
  cancel(b: Body): void {
    const a = b.active;
    if (!a) return;
    if (a.target && (a.verb === 'sit' || a.verb === 'use') && !(b.seat && b.seat.inst === a.target)) {
      this.release(a.target, b.spec.id);
      if (a.slot !== undefined && this.slotTaken.get(`${a.target}#${a.slot}`) === b.spec.id) this.freeSlot(`${a.target}#${a.slot}`);
    }
    if (a.target) { const q = this.queues.get(a.target); if (q) this.queues.set(a.target, q.filter(x => x !== b.spec.id)); }
    b.active = null;
  }

  private reserve(inst: string, agent: string): void {
    let s = this.occupancy.get(inst); if (!s) this.occupancy.set(inst, (s = new Set()));
    s.add(agent);
  }
  private release(inst: string, agent: string): void { this.occupancy.get(inst)?.delete(agent); }

  private seatCount(i: Instance): number {
    const an = def(i.def).anchors ?? {};
    return an.seat ? 1 : Object.keys(an).filter(k => /^seat\d+$/.test(k)).length;
  }
  private seatName(i: Instance, slot: number): string { return def(i.def).anchors?.seat ? 'seat' : `seat${slot}`; }
  private seatApproach(i: Instance, slot: number): { p: Vec3; yaw: number } | null {
    return def(i.def).anchors?.approach ? this.anchorWorld(i, 'approach') : this.anchorWorld(i, `approach${slot}`);
  }
  private freeSlot(key: string): void { this.slotTaken.delete(key); }

  /** Queue spots for a device: people line up back along the route they came by (the walking path from the line's
   *  start towards the office entrance), one every 0.9 m, so the next in line is always in front of the others. */
  private lineSpots(i: Instance, start: Vec3, _yaw: number, n: number): Vec3[] {
    const key = `${i.id}@${start.x.toFixed(2)},${start.z.toFixed(2)}`;
    let line = this.lines.get(key);
    if (!line) {
      line = [];
      const e = snap(this.nav, { x: this.layout.entrance.x, y: 0, z: this.layout.entrance.z })!;
      const pth = path(this.nav, start, e) ?? [];
      let acc = 0, want = 0.9;
      for (let k = 1; k < pth.length && line.length < 12; k++) {
        const a = pth[k - 1]!, b = pth[k]!, L = Math.hypot(b.x - a.x, b.z - a.z);
        while (acc + L >= want && line.length < 12) {
          const t = (want - acc) / L;
          const sp = snap(this.nav, { x: a.x + (b.x - a.x) * t, y: 0, z: a.z + (b.z - a.z) * t }, { x: 0.1, y: 0.5, z: 0.1 });
          if (sp) line.push(sp);
          want += 0.9;
        }
        acc += L;
      }
      this.lines.set(key, line);
    }
    return line.slice(0, n);
  }

  private resolveTarget(b: Body, t: string): { p: Vec3; yaw?: number } | null {
    const other = this.bodies.get(t);
    if (other) {
      if (other.state === 'offsite') return null;
      // stand 1.0 m from the other person, on the side facing us
      const dx = b.pos.x - other.pos.x, dz = b.pos.z - other.pos.z, L = Math.hypot(dx, dz) || 1;
      return { p: { x: other.pos.x + (dx / L) * 1.0, y: 0, z: other.pos.z + (dz / L) * 1.0 }, yaw: Math.atan2(-dx, -dz) };
    }
    const i = this.inst(t);
    if (i) {
      const d = def(i.def);
      const a = (d.anchors?.front && this.anchorWorld(i, 'front')) || (d.anchors?.approach && this.anchorWorld(i, 'approach'));
      if (a) return { p: a.p, yaw: a.yaw + Math.PI };
      return { p: { x: i.x, y: 0, z: i.z } };
    }
    const spot = this.zoneSpot.get(t);
    if (spot) return { p: spot };
    return null;
  }

  private walkTo(b: Body, p: Vec3, yaw: number | undefined, verb: Command['verb'], after: Active['after'], target?: string): Result {
    if (!b.agent) return { ok: false, code: 'OFFSITE', msg: 'no body on the floor' };
    const s = snap(this.nav, p);
    if (!s) return { ok: false, code: 'NO_PATH', msg: 'target is not reachable on foot' };
    const res = this.begin(b, { verb, phase: 'walk', goal: s, goalYaw: yaw, target, after });
    b.agent.requestMoveTarget(s);
    b.state = 'walking'; b.anim = 'walk';
    return res;
  }

  private standUp(b: Body): Result {
    if (b.state !== 'sitting' || !b.seat) return { ok: false, code: 'NOT_ALLOWED', msg: 'not sitting' };
    const i = this.inst(b.seat.inst)!;
    const slot = b.seat.anchor === 'seat' ? 0 : Number(b.seat.anchor.slice(4));
    const ap = this.seatApproach(i, slot)!;
    if (!this.freeSpot(ap.p, b.spec.id)) return { ok: false, code: 'BUSY', msg: 'someone is standing right behind the seat' };
    this.release(i.id, b.spec.id);
    this.freeSlot(`${i.id}#${slot}`);
    b.seat = null;
    this.spawnAgent(b, ap.p);
    b.state = 'standing'; b.anim = 'stand_up'; b.yaw = ap.yaw;
    return this.finishInstant(b, 'stand', i.id);
  }

  /** Free spot on a surface for an item, preferring the side closest to the agent. */
  private findSpot(surf: Instance, itemId: string, from: Vec3): Vec2 | null {
    const s = def(surf.def).support!.find(x => x.name === 'top')!;
    const it = this.items.get(itemId)!, d = def(it.def).dims;
    const r = Math.max(d.w, d.d) / 2 + 0.01;
    const occupied: { x: number; z: number; r: number }[] = [];
    for (const o of this.layout.instances) if (o.on === surf.id && def(o.def).kind !== 'item') occupied.push({ x: o.x, z: o.z, r: Math.max(def(o.def).dims.w, def(o.def).dims.d) / 2 });
    for (const o of this.items.values()) if (!('heldBy' in o.at) && o.at.on === surf.id) occupied.push({ x: o.at.x, z: o.at.z, r: Math.max(def(o.def).dims.w, def(o.def).dims.d) / 2 });
    let best: Vec2 | null = null, bestD = Infinity;
    for (let lx = s.x0 + r; lx <= s.x1 - r + 1e-9; lx += 0.03) for (let lz = s.z0 + r; lz <= s.z1 - r + 1e-9; lz += 0.03) {
      const w = localToWorld(surf.x, surf.z, surf.yaw, lx, lz);
      if (occupied.some(o => Math.hypot(o.x - w.x, o.z - w.z) < o.r + r)) continue;
      const dd = Math.hypot(w.x - from.x, w.z - from.z);
      if (dd <= REACH + 0.15 && dd < bestD) { best = w; bestD = dd; }
    }
    return best;
  }

  // ------------------------------------------------------------------ tick
  /** The body's current walking target (line spot, goal or a side step). */
  private goalOf(b: Body): Vec3 | undefined { return b.stepAside ?? b.active?.cur ?? b.active?.goal; }

  /** One-at-a-time doorways: whoever is in the doorway (or nearest to it) goes first; people coming the other way wait. */
  private arbitrateDoors(): void {
    const held = new Set<string>();
    for (const d of this.doors) {
      const rel = (p: Vec2) => ({ a: (p.x - d.c.x) * d.u.x + (p.z - d.c.z) * d.u.z, n: (p.x - d.c.x) * d.n.x + (p.z - d.c.z) * d.n.z });
      const users: { b: Body; side: number; dist: number; inside: boolean }[] = [];
      for (const b of this.bodies.values()) {
        if (!b.agent || b.state !== 'walking') continue;
        const r = rel(b.pos);
        if (Math.abs(r.a) > d.hw + 0.6 || Math.abs(r.n) > 1.8) continue;
        const nx = b.agent.nextTargetInPath(), rn = rel(nx);
        const inside = Math.abs(r.a) < d.hw + 0.15 && Math.abs(r.n) < 0.45;
        const crossing = inside || (Math.sign(rn.n) !== Math.sign(r.n) && Math.abs(rn.a) < d.hw + 0.6);
        if (!crossing) continue;
        users.push({ b, side: Math.sign(r.n) || 1, dist: Math.hypot(r.a, r.n), inside });
      }
      if (users.length < 2) continue;
      // the first through (inside, else closest) sets the direction of flow; people coming the other way wait
      users.sort((x, y) => (Number(y.inside) - Number(x.inside)) || x.dist - y.dist);
      const flowSide = users[0]!.side;
      for (const u of users.slice(1)) if (u.side !== flowSide && !u.inside && u.dist < 1.6) held.add(u.b.spec.id);
    }
    for (const b of this.bodies.values()) {
      if (!b.agent) continue;
      if (held.has(b.spec.id)) {
        if (!b.doorHold) { b.doorHold = 'door'; b.agent.requestMoveVelocity({ x: 0, y: 0, z: 0 }); }
        if (b.active) b.active.lastProgressT = this.now;   // waiting politely is not being stuck
      } else if (b.doorHold) {
        b.doorHold = undefined;
        const g = this.goalOf(b); if (g) b.agent.requestMoveTarget(g);
      }
    }
  }

  /** Two people blocking each other face to face: the one with lower priority steps aside for 2.5 s. */
  private breakDeadlock(b: Body): void {
    if (!b.agent || b.stepAside) return;
    const v = b.agent.velocity();
    if (Math.hypot(v.x, v.z) > 0.15) return;
    for (const o of this.bodies.values()) {
      if (o === b || !o.agent || o.state !== 'walking') continue;
      if (Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z) > 0.9) continue;
      const ov = o.agent.velocity();
      if (Math.hypot(ov.x, ov.z) > 0.15) continue;
      const slot = Math.floor(this.now / 10000);
      const pri = (id: string) => [...(id + slot)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
      if (pri(b.spec.id) > pri(o.spec.id)) return;          // the other one yields
      const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z, L = Math.hypot(dx, dz) || 1;
      for (const side of [1, -1]) {
        const p = snap(this.nav, { x: b.pos.x - (dz / L) * side * 0.7 - (dx / L) * 0.3, y: 0, z: b.pos.z + (dx / L) * side * 0.7 - (dz / L) * 0.3 }, { x: 0.2, y: 1, z: 0.2 });
        if (!p) continue;
        b.stepAside = p; b.stepAsideT = this.now; b.agent.requestMoveTarget(p);
        this.emit({ t: this.now, type: 'yield', agent: b.spec.id, for: o.spec.id });
        if (b.active) b.active.lastProgressT = this.now;
        return;
      }
    }
  }

  step(dt: number): void {
    this.now += dt * 1000;
    this.arbitrateDoors();
    this.nav.crowd.update(dt);
    for (const b of this.bodies.values()) {
      if (b.agent) {
        const p = b.agent.position(), v = b.agent.velocity();
        b.pos = { x: p.x, y: p.y, z: p.z };
        if (Math.hypot(v.x, v.z) > 0.05) b.yaw = Math.atan2(v.x, v.z);
      }
      this.advance(b);
    }
    this.resolveOverlaps();
    this.acoustics.updateDoors([...this.bodies.values()].filter(b => b.state !== 'offsite').map(b => b.pos));
  }

  /** Device use with a real line. Front of the line takes a free use spot (one per simultaneous user);
   *  the rest wait on bent line spots that avoid furniture; anyone in line steps aside for passers-by and returns. */
  private advanceUse(b: Body, a: Active, fail: (c: RejectCode, m: string) => void): void {
    const i = this.inst(a.target!)!;
    const cap = def(i.def).affordances?.find(x => x.verb === a.aff!.verb)?.capacity ?? 1;
    const users = this.occupancy.get(i.id)?.size ?? 0;
    const q = this.queues.get(i.id) ?? [];
    const pos = q.indexOf(b.spec.id);
    const free = Math.max(0, cap - users);
    const k = pos < free ? 0 : pos - free + 1;
    let want = a.goal!;
    if (k === 0 && a.aff?.slots?.length) {
      if (a.slot === undefined) {
        const s = a.aff.slots.findIndex((_, n) => !this.slotTaken.has(`${i.id}#${n}`));
        if (s >= 0) { a.slot = s; this.slotTaken.set(`${i.id}#${s}`, b.spec.id); }
      }
      if (a.slot !== undefined) {
        const an = this.anchorWorld(i, a.aff.slots[a.slot]!);
        if (an) { want = snap(this.nav, an.p) ?? want; a.goalYaw = an.yaw + Math.PI; }
      }
    } else if (k > 0) {
      const start = i.queueAt ? { p: { x: i.queueAt.x, y: 0, z: i.queueAt.z }, yaw: i.queueAt.yaw, n: k - 1 }
        : a.goalYaw !== undefined ? { p: a.goal!, yaw: a.goalYaw, n: k } : null;
      if (start) {
        const startP = snap(this.nav, start.p) ?? start.p;
        if (start.n === 0) want = startP;
        else { const line = this.lineSpots(i, startP, start.yaw, start.n); want = line[Math.min(start.n, line.length) - 1] ?? startP; }
      }
    }
    // stepping aside for someone: hold the side spot ~3 s, then return to the line
    if (b.stepAside) {
      if ((this.now - (b.stepAsideT ?? this.now)) < 3000) return;
      b.stepAside = undefined; a.cur = undefined;
    }
    if (!a.cur || Math.hypot(a.cur.x - want.x, a.cur.z - want.z) > 0.1) {
      a.cur = want; a.bestDist = Infinity; a.lastProgressT = this.now; a.retries = 0;
      b.agent?.requestMoveTarget(want);
    }
    const d = Math.hypot(b.pos.x - want.x, b.pos.z - want.z);
    if (d < a.bestDist - 0.05) { a.bestDist = d; a.lastProgressT = this.now; }
    // a place in line is a loose spot (people keep personal space); the use point itself must be reached exactly
    if (d <= (k === 0 ? ARRIVE_EPS : 0.4)) {
      b.agent?.resetMoveTarget();
      if (a.goalYaw !== undefined) b.yaw = a.goalYaw;
      if (k === 0) {
        this.queues.set(i.id, q.filter(x => x !== b.spec.id));
        this.reserve(i.id, b.spec.id);
        a.phase = 'perform'; a.until = this.now + between(this.rand, a.aff!.dur[0], a.aff!.dur[1]) * 1000;
        b.state = 'using'; b.anim = a.aff!.anim;
      } else { a.phase = 'queue'; b.state = 'standing'; b.anim = 'wait_queue'; a.lastProgressT = this.now; }
    } else {
      a.phase = 'walk'; b.state = 'walking'; b.anim = 'walk';
      const stuckFor = (this.now - a.lastProgressT) / 1000;
      if (stuckFor > GIVE_UP_S) return fail('NO_PATH', 'blocked for too long');
      if (stuckFor > 2.5) { this.askToYield(b, want); this.breakDeadlock(b); }
      if (stuckFor > STUCK_S * (a.retries + 1) && b.agent) { a.retries++; b.agent.requestMoveTarget(want); }
    }
    if ((this.now - (a.started ?? this.now)) / 1000 > 900) fail('BUSY', 'waited 15 minutes in line');
  }

  /** Hard non-penetration guarantee on top of crowd steering: separate any two floor bodies closer than 2R. */
  private resolveOverlaps(): void {
    const floor = [...this.bodies.values()].filter(b => b.agent);
    const minD = BODY_RADIUS * 2;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (let i = 0; i < floor.length; i++) for (let j = i + 1; j < floor.length; j++) {
        const A = floor[i]!, B = floor[j]!;
        let dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z;
        let d = Math.hypot(dx, dz);
        if (d >= minD - 0.01) continue;
        if (d < 1e-6) { dx = 1; dz = 0; d = 1e-6; }
        const push = (minD - d) / 2 + 0.005, ux = dx / Math.max(d, 1e-6), uz = dz / Math.max(d, 1e-6);
        // the one standing still yields less (people already moving absorb the correction)
        const aMoving = A.state === 'walking', bMoving = B.state === 'walking';
        const wa = aMoving === bMoving ? 0.5 : aMoving ? 0.8 : 0.2;
        this.nudge(A, -ux * push * 2 * wa, -uz * push * 2 * wa);
        this.nudge(B, ux * push * 2 * (1 - wa), uz * push * 2 * (1 - wa));
        moved = true;
      }
      if (!moved) break;
    }
  }

  private nudge(b: Body, dx: number, dz: number): void {
    if (!b.agent || (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4)) return;
    const s = snap(this.nav, { x: b.pos.x + dx, y: b.pos.y, z: b.pos.z + dz }, { x: 0.3, y: 1, z: 0.3 });
    if (!s) return;
    b.agent.teleport(s);
    b.pos = { x: s.x, y: s.y, z: s.z };
    const goal = b.active?.cur ?? b.active?.goal;
    if (goal && b.active && (b.active.phase === 'walk')) b.agent.requestMoveTarget(goal);
    else if (b.stepAside) b.agent.requestMoveTarget(b.stepAside);
  }

  private lastYieldAsk = new Map<string, number>();
  readonly lastFail = new Map<string, string>();
  /** "Excuse me": idle people standing in the way (within 1.3 m, ahead of us or on our goal) step aside. */
  private askToYield(b: Body, goal: Vec3): void {
    if ((this.now - (this.lastYieldAsk.get(b.spec.id) ?? 0)) < 2000) return;
    this.lastYieldAsk.set(b.spec.id, this.now);
    const dx = goal.x - b.pos.x, dz = goal.z - b.pos.z, L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;
    for (const o of this.bodies.values()) {
      if (o === b || !o.agent || o.state === 'walking') continue;
      const inLine = o.active?.verb === 'use' && o.active.phase === 'queue';
      if (o.active && !(inLine || o.active.verb === 'wait' || o.active.verb === 'go_to' || o.active.verb === 'consume')) continue; // people using a device stay
      const ox = o.pos.x - b.pos.x, oz = o.pos.z - b.pos.z, od = Math.hypot(ox, oz);
      const onGoal = Math.hypot(o.pos.x - goal.x, o.pos.z - goal.z) < 0.6;
      if (!onGoal && (od > 1.3 || (ox * ux + oz * uz) / (od || 1) < 0.3)) continue;
      // step perpendicular to our walking direction, to whichever side is free, far enough to clear a 0.5 m body
      for (const side of [1, -1]) {
        for (const dist of [0.8, 1.2]) {
          const p = snap(this.nav, { x: o.pos.x - uz * side * dist + ux * 0.3, y: 0, z: o.pos.z + ux * side * dist + uz * 0.3 }, { x: 0.2, y: 1, z: 0.2 });
          if (!p || Math.hypot(p.x - goal.x, p.z - goal.z) < 0.6) continue;
          o.stepAside = p; o.stepAsideT = this.now; o.agent.requestMoveTarget(p);
          this.emit({ t: this.now, type: 'yield', agent: o.spec.id, for: b.spec.id });
          return;
        }
      }
    }
  }

  /** Reflex after using a device: step 0.7 m back and 0.4 m aside so the next person in line can reach it. */
  private stepAsideFrom(b: Body): void {
    if (!b.agent) return;
    const back = { x: -Math.sin(b.yaw), z: -Math.cos(b.yaw) }, side = { x: Math.cos(b.yaw), z: -Math.sin(b.yaw) };
    const dir = this.rand() < 0.5 ? 1 : -1;
    const p = snap(this.nav, { x: b.pos.x + back.x * 0.7 + side.x * 0.4 * dir, y: 0, z: b.pos.z + back.z * 0.7 + side.z * 0.4 * dir });
    if (p) { b.stepAside = p; b.agent.requestMoveTarget(p); }
  }

  private advance(b: Body): void {
    const a = b.active;
    if (!a) { if (b.state === 'walking') b.state = 'standing'; return; }
    const fail = (code: RejectCode, msg: string) => {
      if (b.agent) { const v = b.agent.velocity(); this.lastFail.set(b.spec.id, `st=${b.agent.state()} tgt=${b.agent.target().x.toFixed(2)},${b.agent.target().z.toFixed(2)} next=${b.agent.nextTargetInPath().x.toFixed(2)},${b.agent.nextTargetInPath().z.toFixed(2)} dv=${Math.hypot(b.agent.desiredVelocity().x, b.agent.desiredVelocity().z).toFixed(2)} v=${Math.hypot(v.x, v.z).toFixed(2)} goal=${(a.cur ?? a.goal)?.x.toFixed(2)},${(a.cur ?? a.goal)?.z.toFixed(2)}`); }
      this.emit({ t: this.now, type: 'action_failed', agent: b.spec.id, actionId: a.id, verb: a.verb, code, msg });
      this.cancel(b);
      if (b.agent) b.agent.resetMoveTarget();
      if (b.state === 'walking') { b.state = 'standing'; b.anim = 'idle'; }
    };
    const done = (detail?: string) => {
      this.emit({ t: this.now, type: 'action_done', agent: b.spec.id, actionId: a.id, verb: a.verb, detail });
      b.active = null;
    };

    if (a.after === 'use' && (a.phase === 'walk' || a.phase === 'queue')) return this.advanceUse(b, a, fail);

    if (a.phase === 'walk' && a.goal && a.verb === 'go_to' && a.target && this.bodies.has(a.target) && this.now - (a.lastRetarget ?? 0) > 1000) {
      a.lastRetarget = this.now;
      const g = this.resolveTarget(b, a.target);
      if (!g) return fail('NOT_PRESENT', `${a.target} left`);
      const s2 = snap(this.nav, g.p);
      if (s2 && Math.hypot(s2.x - a.goal.x, s2.z - a.goal.z) > 0.3) { a.goal = s2; a.goalYaw = g.yaw; b.agent?.requestMoveTarget(s2); }
    }
    if (a.phase === 'walk' && a.goal && b.stepAside) {
      if (this.now - (b.stepAsideT ?? this.now) < 2500) { a.lastProgressT = this.now; return; }
      b.stepAside = undefined; b.agent?.requestMoveTarget(a.goal);
    }
    if (a.phase === 'walk' && a.goal) {
      const d = Math.hypot(b.pos.x - a.goal.x, b.pos.z - a.goal.z);
      if (d < a.bestDist - 0.05) { a.bestDist = d; a.lastProgressT = this.now; }
      if (d <= ARRIVE_EPS) {
        b.agent?.resetMoveTarget();
        if (a.goalYaw !== undefined) b.yaw = a.goalYaw;
        b.state = 'standing'; b.anim = 'idle';
        if (a.after === 'home') {
          this.despawnAgent(b); b.state = 'offsite'; b.anim = 'none';
          if (b.holding) { this.items.delete(b.holding); b.holding = null; } // takes it home (a personal item would be modelled later)
          this.emit({ t: this.now, type: 'left', agent: b.spec.id });
          return done();
        }
        if (a.after === 'sit') {
          const i = this.inst(a.target!)!;
          const seatName = this.seatName(i, a.slot ?? 0);
          const seat = this.anchorWorld(i, seatName)!;
          this.despawnAgent(b);
          b.seat = { inst: i.id, anchor: seatName };
          b.pos = { ...seat.p }; b.yaw = seat.yaw; b.state = 'sitting'; b.anim = 'sit_idle';
          return done(i.id);
        }
        return done(a.target);
      }
      const stuckFor = (this.now - a.lastProgressT) / 1000;
      // "go to the kitchen" is satisfied once inside the kitchen; "go to Leo" once within talking distance
      if (a.verb === 'go_to' && a.target && stuckFor > 2) {
        const z = this.layout.zones.find(z => z.id === a.target);
        const other = this.bodies.get(a.target);
        if ((z && pointInPolygon(b.pos, z.poly)) || (other && Math.hypot(other.pos.x - b.pos.x, other.pos.z - b.pos.z) < 1.6)) {
          b.agent?.resetMoveTarget(); b.state = 'standing'; b.anim = 'idle';
          return done(a.target);
        }
      }
      if (stuckFor > GIVE_UP_S) return fail('NO_PATH', 'blocked for too long');
      if (stuckFor > 2.5) { this.askToYield(b, a.goal); this.breakDeadlock(b); }
      if (stuckFor > STUCK_S * (a.retries + 1) && b.agent) { a.retries++; b.agent.requestMoveTarget(a.goal); }
      return;
    }

    if (a.phase === 'perform' && this.now >= a.until!) {
      this.release(a.target!, b.spec.id);
      if (a.slot !== undefined) this.freeSlot(`${a.target}#${a.slot}`);
      b.state = 'standing'; b.anim = 'idle';
      if ((this.queues.get(a.target!)?.length ?? 0) > 0) this.stepAsideFrom(b);
      if (a.aff?.yields) {
        const id = `${a.aff.yields}.${this.nextItem++}`;
        this.items.set(id, { id, def: a.aff.yields, at: { heldBy: b.spec.id }, fill: 1 });
        b.holding = id;
        return done(id);
      }
      return done(a.target);
    }

    if (a.phase === 'timer' && this.now >= a.until!) {
      if (a.verb === 'consume' && b.holding) { const it = this.items.get(b.holding); if (it) it.fill = 0; }
      return done();
    }
  }
}
