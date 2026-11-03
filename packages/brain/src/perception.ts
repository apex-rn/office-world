import { def } from '../../catalog/src/items.js';
import { fmtClock, seoulTime } from '../../shared/src/time.js';
import type { World, WorldEvent } from '../../sim/src/world.js';
import { BOSS, STAFF_BY_ID } from './identity.js';

// Perception — WORLD_PLAN §10. A person knows only what they can see or hear right now, plus what they remember.
// Output is a compact first-person observation (target ≤ ~300 tokens) for the decision prompt.

export const nameOf = (id: string): string => id === BOSS.id ? 'the Boss' : STAFF_BY_ID.get(id)?.name ?? id;

const doing = (w: World, id: string): string => {
  const b = w.bodies.get(id)!;
  const a = b.active;
  if (b.state === 'sitting' && b.seat) return `sitting at ${label(w, b.seat.inst)}`;
  if (b.state === 'using' && a?.target) return `using the ${label(w, a.target)}`;
  if (a?.verb === 'use' && a.phase === 'queue' && a.target) return `waiting in line for the ${label(w, a.target)}`;
  if (b.state === 'walking') return a?.target ? `walking to ${label(w, a.target)}` : 'walking';
  if (b.holding) return `standing, holding a ${def(w.items.get(b.holding)?.def ?? 'item').name.toLowerCase()}`;
  return 'standing';
};

function label(w: World, target: string): string {
  if (w.bodies.has(target)) return nameOf(target);
  const z = w.layout.zones.find(z => z.id === target);
  if (z) return `the ${z.name.toLowerCase()}`;
  const i = w.inst(target);
  if (!i) return target;
  if (i.owner && (i.id.startsWith('desk.') || i.id.startsWith('chair.'))) return `${nameOf(i.owner)}'s desk`;
  return def(i.def).name.toLowerCase();
}

export interface PerceptionCtx {
  /** speech this person heard since the last decision */
  heard: Extract<WorldEvent, { type: 'speech' }>[];
  /** their own card on the board, if any */
  card?: { id: string; title: string; status: string };
  /** first-person feeling line from the emotion core */
  feeling: string;
  /** things they did recently (anti-repetition) */
  recent: string[];
}

export function perceive(w: World, me: string, ctx: PerceptionCtx): string {
  const b = w.bodies.get(me)!;
  const t = seoulTime(w.now);
  const zone = w.zoneOf(b.pos);
  const zoneName = zone ? w.layout.zones.find(z => z.id === zone)!.name : 'the office';
  const lines: string[] = [];
  lines.push(`It is ${fmtClock(t)} (Seoul). I am in the ${zoneName.toLowerCase()}, ${doing(w, me)}.`);
  if (b.holding) lines.push(`In my hand: ${def(w.items.get(b.holding)?.def ?? 'mug').name.toLowerCase()}.`);
  lines.push(`Inside: ${ctx.feeling}`);
  if (ctx.card) lines.push(`My card: ${ctx.card.id} "${ctx.card.title}" (${ctx.card.status}).`);

  const seen: string[] = [];
  for (const o of w.bodies.values()) {
    if (o.spec.id === me || o.state === 'offsite') continue;
    if (!w.acoustics.canSee(b.pos, o.pos)) continue;
    const d = Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z);
    seen.push(`${nameOf(o.spec.id)} (${d < 2 ? 'right next to me' : `${d.toFixed(0)} m away`}), ${doing(w, o.spec.id)}`);
  }
  lines.push(seen.length ? `I can see: ${seen.slice(0, 8).join('; ')}.` : 'Nobody else is in sight.');
  if (seen.some(s => s.startsWith('the Boss'))) lines.push('The Boss is here — I greet him with a 45° bow and speak Uzbek near him.');

  // devices within sight: busy or free, line length
  const dev: string[] = [];
  for (const i of w.layout.instances) {
    const aff = def(i.def).affordances?.filter(a => a.verb !== 'sit' && a.verb !== 'work');
    if (!aff?.length) continue;
    if (Math.hypot(i.x - b.pos.x, i.z - b.pos.z) > 8 || !w.acoustics.canSee(b.pos, { x: i.x, z: i.z })) continue;
    const users = w.occupancy.get(i.id)?.size ?? 0, line = w.queues.get(i.id)?.length ?? 0;
    if (users || line) dev.push(`${def(i.def).name.toLowerCase()}: in use${line ? `, ${line} waiting` : ''}`);
  }
  if (dev.length) lines.push(`Busy nearby: ${dev.slice(0, 4).join('; ')}.`);

  for (const h of ctx.heard.slice(-5)) {
    const to = h.to === me ? 'to me' : h.to ? `to ${nameOf(h.to)}` : 'aloud';
    lines.push(`${nameOf(h.from)} said ${to}: "${h.text}"`);
  }
  if (ctx.recent.length) lines.push(`I recently: ${ctx.recent.slice(-4).join('; ')}.`);
  return lines.join('\n');
}
