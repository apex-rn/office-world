// Export the office layout in Unreal units for unreal/LevelBuilder.py (docs/UNREAL_PLAN.md, coordinate table).
//   npx tsx tools/export-unreal.ts > unreal/layout_ue.json
// UE: centimetres, X = x*100 (east), Y = z*100 (south), Z = y*100 (up); Yaw° = 90 - yaw(rad)*180/pi (forward +X).
import { def } from '../packages/catalog/src/items.js';
import { OFFICE_V1 } from '../packages/catalog/src/layout.js';
import { baseY, wallPieces } from '../packages/catalog/src/validator.js';

const cm = (m: number) => Math.round(m * 1000) / 10;
const yawUE = (yaw: number) => Math.round((90 - (yaw * 180) / Math.PI) * 100) / 100;
const L = OFFICE_V1;
// Box sizes: our local frame has width along x, depth along z (front +z). In UE the actor's forward is +X, so a box
// rotated by yawUE has depth along its local X and width along its local Y.
const out = {
  units: 'cm', axes: 'X=east(x), Y=south(z), Z=up(y)',
  room: { w: cm(L.room.w), d: cm(L.room.d), h: cm(L.room.h) },
  walls: wallPieces(L).map(p => ({
    // wallOBB: hx along the wall's local x (length), hz thickness; local x maps to UE local Y after the yaw convention
    loc: [cm(p.obb.cx), cm(p.obb.cz), cm((p.obb.y0 + p.obb.y1) / 2)], yaw: yawUE(p.obb.yaw),
    size: [cm(p.obb.hz * 2), cm(p.obb.hx * 2), cm(p.obb.y1 - p.obb.y0)], glass: p.wall.material === 'glass',
  })),
  openings: L.openings.filter(o => o.kind === 'door').map(o => {
    const w = L.walls.find(x => x.id === o.wall)!, len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
    const ux = (w.b.x - w.a.x) / len, uz = (w.b.z - w.a.z) / len, m = (o.from + o.to) / 2;
    return { id: o.id, loc: [cm(w.a.x + ux * m), cm(w.a.z + uz * m), 0], yaw: yawUE(Math.atan2(-uz, ux)), width: cm(o.to - o.from), height: cm(o.top ?? 2.1), exterior: !!o.exterior };
  }),
  zones: L.zones.map(z => ({ id: z.id, name: z.name, poly: z.poly.map(p => [cm(p.x), cm(p.z)]), outdoor: !!z.outdoor })),
  instances: L.instances.map(i => {
    const d = def(i.def);
    return { id: i.id, def: i.def, kind: d.kind, loc: [cm(i.x), cm(i.z), cm(baseY(L, i))], yaw: yawUE(i.yaw), size: [cm(d.dims.d), cm(d.dims.w), cm(d.dims.h)], seat: d.seatH ? cm(d.seatH) : null, owner: i.owner ?? null };
  }),
};
process.stdout.write(JSON.stringify(out, null, 1));
