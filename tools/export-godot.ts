// Export the office for the Godot client (same axes as ours: metres, Y up, x east, z south; yaw = rotation.y).
//   npx tsx tools/export-godot.ts > godot/layout.json
import { def } from '../packages/catalog/src/items.js';
import { OFFICE } from '../packages/catalog/src/layout.js';
import { baseY, wallPieces } from '../packages/catalog/src/validator.js';
const L = OFFICE, r = (v: number) => Math.round(v * 1000) / 1000;
process.stdout.write(JSON.stringify({
  room: L.room, entrance: L.entrance,
  walls: wallPieces(L).map(p => ({ cx: r(p.obb.cx), cz: r(p.obb.cz), hx: r(p.obb.hx), hz: r(p.obb.hz), yaw: r(p.obb.yaw), y0: r(p.obb.y0), y1: r(p.obb.y1), glass: p.wall.material === 'glass' })),
  doors: L.openings.filter(o => o.kind === 'door').map(o => {
    const w = L.walls.find(x => x.id === o.wall)!, len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z), ux = (w.b.x - w.a.x) / len, uz = (w.b.z - w.a.z) / len, m = (o.from + o.to) / 2;
    return { id: o.id, cx: r(w.a.x + ux * m), cz: r(w.a.z + uz * m), yaw: r(Math.atan2(-uz, ux)), width: r(o.to - o.from), top: o.top ?? 2.1, exterior: !!o.exterior };
  }),
  windows: L.openings.filter(o => o.kind === 'window').map(o => {
    const w = L.walls.find(x => x.id === o.wall)!, len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z), ux = (w.b.x - w.a.x) / len, uz = (w.b.z - w.a.z) / len, m = (o.from + o.to) / 2;
    return { cx: r(w.a.x + ux * m), cz: r(w.a.z + uz * m), yaw: r(Math.atan2(-uz, ux)), width: r(o.to - o.from), sill: o.sill ?? 0.9, top: o.top ?? 2.8 };
  }),
  zones: L.zones.map(z => ({ id: z.id, poly: z.poly.map(p => [p.x, p.z]), outdoor: !!z.outdoor })),
  instances: L.instances.map(i => { const d = def(i.def); return { id: i.id, def: i.def, kind: d.kind, x: r(i.x), z: r(i.z), y: r(baseY(L, i)), yaw: r(i.yaw), w: d.dims.w, d: d.dims.d, h: d.dims.h, seat: d.seatH ?? null }; }),
}));
