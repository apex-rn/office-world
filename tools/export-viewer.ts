// Export the office (real-dimension layout) and a recorded motion demo for the 3D viewer.
//   npx tsx tools/export-viewer.ts [minutes=20] > /tmp/viewer-data.json
// Demo motion uses habit-weighted errands (no AI yet): desks, coffee, water, WC, balcony, colleagues, the board.
import { def } from '../packages/catalog/src/items.js';
import { OFFICE_V1 } from '../packages/catalog/src/layout.js';
import { baseY, wallPieces } from '../packages/catalog/src/validator.js';
import { STAFF } from '../packages/brain/src/identity.js';
import { rng } from '../packages/shared/src/rng.js';
import { type Command, World } from '../packages/sim/src/world.js';

const minutes = Number(process.argv[2] ?? 20);
const L = OFFICE_V1;
const r2 = (v: number) => Math.round(v * 100) / 100;

const defs: Record<string, { w: number; d: number; h: number; seatH?: number; wallBottom?: number; kind: string }> = {};
for (const i of L.instances) { const d = def(i.def); defs[i.def] = { ...d.dims, seatH: d.seatH, wallBottom: d.wallBottom, kind: d.kind }; }
const instances = L.instances.map(i => ({ id: i.id, def: i.def, x: r2(i.x), z: r2(i.z), yaw: r2(i.yaw), y: r2(baseY(L, i)), owner: i.owner }));
const walls = wallPieces(L).map(p => ({ cx: r2(p.obb.cx), cz: r2(p.obb.cz), hx: r2(p.obb.hx), hz: r2(p.obb.hz), yaw: r2(p.obb.yaw), y0: r2(p.obb.y0), y1: r2(p.obb.y1), glass: p.wall.material === 'glass', h: p.wall.height }));
const openings = L.openings.map(o => {
  const w = L.walls.find(x => x.id === o.wall)!;
  const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z), ux = (w.b.x - w.a.x) / len, uz = (w.b.z - w.a.z) / len, m = (o.from + o.to) / 2;
  return { id: o.id, kind: o.kind, cx: r2(w.a.x + ux * m), cz: r2(w.a.z + uz * m), width: r2(o.to - o.from), yaw: r2(Math.atan2(-uz, ux)), t: w.thickness, sill: o.sill ?? 0, top: o.top ?? (o.kind === 'door' ? 2.1 : 2.6), exterior: !!o.exterior };
});
const zones = L.zones.map(z => ({ id: z.id, name: z.name, poly: z.poly.map(p => [r2(p.x), r2(p.z)]) }));

// ---- demo motion ----
const start = Date.UTC(2026, 10, 4, 0, 5); // 09:05 Seoul
const w = await World.create(structuredClone(L), start, 21);
const rand = rng(77);
const people = STAFF.map(p => ({ id: p.id, name: p.name, title: p.title, heightM: p.heightM, gender: p.gender, look: p.look }));
for (const p of STAFF) w.addBody({ id: p.id, name: p.name, heightM: p.heightM, walkSpeed: 1.25 + 0.1 * p.bigFive.conscientiousness });
const pick = <T>(xs: [T, number][]): T => { let s = xs.reduce((a, x) => a + x[1], 0) * rand(); for (const [v, wt] of xs) { s -= wt; if (s <= 0) return v; } return xs[0]![0]; };
const plan = new Map<string, Command[]>();
const errand = (id: string): Command[] => {
  const p = STAFF.find(s => s.id === id)!;
  if (id === 'cleaner') { const z = ['kitchen', 'work', 'reception', 'lounge', 'print', 'meeting', 'wc'][Math.floor(rand() * 7)]!; return [{ verb: 'go_to', target: z }, { verb: 'wait', seconds: 25 + rand() * 40 }]; }
  const own: Command = w.inst(`chair.${id}`) ? { verb: 'sit', target: `chair.${id}` } : { verb: 'go_to', target: 'lounge' };
  const other = STAFF[Math.floor(rand() * STAFF.length)]!.id;
  const choice = pick<string>([
    ['desk', 26], ['coffee', 6 + 3 * p.habits.coffeePerDay], ['water', 5], ['wc', 5], ['smoke', p.habits.smoker ? 8 : 0],
    ['talk', 8], ['board', 4], ['print', 3], ['lounge', 3], ['fridge', 3],
  ]);
  switch (choice) {
    case 'coffee': return [{ verb: 'use', target: 'kitchen.coffee', action: 'brew_coffee' }, own, { verb: 'consume' }];
    case 'water': return [{ verb: 'use', target: 'kitchen.water', action: 'fill_water' }, own];
    case 'wc': return [{ verb: 'use', target: 'wc.toilet1', action: 'use_toilet' }, { verb: 'use', target: 'wc.sink', action: 'wash' }, own];
    case 'smoke': return [{ verb: 'use', target: 'balcony.ashtray', action: 'smoke' }, own];
    case 'talk': return other !== id ? [{ verb: 'go_to', target: other }, { verb: 'wait', seconds: 30 + rand() * 60 }, own] : [own];
    case 'board': return [{ verb: 'use', target: 'reception.board', action: 'move_card' }, own];
    case 'print': return [{ verb: 'use', target: 'print.printer', action: 'print' }, own];
    case 'lounge': return [{ verb: 'sit', target: 'lounge.sofa' }, { verb: 'wait', seconds: 120 }, { verb: 'stand' }, own];
    case 'fridge': return [{ verb: 'use', target: 'kitchen.fridge', action: 'take_drink' }, own];
    default: return [own, { verb: 'wait', seconds: 45 + rand() * 120 }];
  }
};
const STATE: Record<string, number> = { offsite: 0, standing: 1, walking: 2, sitting: 3, using: 4 };
const HZ = 4, dt = 0.05, perFrame = Math.round(1 / HZ / dt);
const track: Record<string, number[]> = Object.fromEntries(STAFF.map(p => [p.id, []]));
const doorIds = [...w.acoustics.doorOpen.keys()];
const doorTrack: number[] = [];
const arrivals = new Map(STAFF.map((p, i) => [p.id, i * 25 * 20]));
const steps = minutes * 60 / dt;
for (let s = 0; s < steps; s++) {
  for (const p of STAFF) {
    const b = w.bodies.get(p.id)!;
    if (b.state === 'offsite') { if (s >= arrivals.get(p.id)!) w.command(p.id, { verb: 'arrive' }); continue; }
    if (b.active) continue;
    let q = plan.get(p.id);
    if (!q?.length) { q = errand(p.id); plan.set(p.id, q); }
    if (b.state === 'sitting' && q[0]!.verb !== 'stand' && q[0]!.verb !== 'wait' && !(q[0]!.verb === 'sit' && (q[0] as { target: string }).target === b.seat?.inst)) { w.command(p.id, { verb: 'stand' }); continue; }
    const c = q.shift()!;
    if (c.verb === 'sit' && b.seat?.inst === c.target) continue;
    const res = w.command(p.id, c);
    if (!res.ok && b.holding && c.verb === 'consume') { /* fine */ }
    if (!res.ok && (res.code === 'HANDS_FULL')) { w.items.delete(b.holding!); b.holding = null; }
  }
  w.step(dt);
  w.drainEvents();
  if (s % perFrame === 0) {
    for (const p of STAFF) {
      const b = w.bodies.get(p.id)!;
      track[p.id]!.push(r2(b.pos.x), r2(b.pos.z), r2(b.yaw), STATE[b.state] ?? 1, b.holding ? 1 : 0, r2(b.pos.y));
    }
    let bits = 0; doorIds.forEach((d, k) => { if (w.acoustics.doorOpen.get(d)) bits |= 1 << k; }); doorTrack.push(bits);
  }
}
process.stdout.write(JSON.stringify({ room: L.room, defs, instances, walls, openings, zones, people, start, hz: HZ, stride: 6, track, doors: doorIds, doorTrack }));
