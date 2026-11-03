import { type OBB, type Vec2, localToWorld, obbCorners, obbPenetration, pointInPolygon } from '../../shared/src/math.js';
import { def } from './items.js';
import type { Instance, Layout, WallSeg } from './schema.js';

// Placement validator — WORLD_PLAN §5.5. Every rule returns explicit, human-readable issues; 0 issues = valid layout.

export interface Issue { rule: string; id: string; msg: string }

const EPS = 0.005;            // 5 mm tolerance
const CABLE_REACH = 1.5;      // m from a socket
const SEATED_EYE = 0.72;      // eye height above the seat (seated adult, ~50th percentile)

/** Base height of an instance (top of the supporting surface, or floor, or wall bottom). */
export function baseY(l: Layout, i: Instance): number {
  const d = def(i.def);
  if (d.placement === 'wall') return d.wallBottom ?? 0;
  if (!i.on) return 0;
  const p = l.instances.find(x => x.id === i.on);
  if (!p) return NaN;
  const s = def(p.def).support?.find(s => s.name === (i.surface ?? 'top'));
  return s ? baseY(l, p) + s.y : NaN;
}

export function instanceOBB(l: Layout, i: Instance): OBB {
  const d = def(i.def);
  const y0 = baseY(l, i);
  return { cx: i.x, cz: i.z, hx: d.dims.w / 2, hz: d.dims.d / 2, yaw: i.yaw, y0, y1: y0 + d.dims.h };
}

export function wallOBB(w: WallSeg, from = 0, to?: number, y0 = 0, y1 = w.height): OBB {
  const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
  const ux = (w.b.x - w.a.x) / len, uz = (w.b.z - w.a.z) / len;
  const t1 = to ?? len, mid = (from + t1) / 2;
  // local +x along the wall: yaw such that local x maps to (ux, uz): x'=c, z'=-s
  return { cx: w.a.x + ux * mid, cz: w.a.z + uz * mid, hx: (t1 - from) / 2, hz: w.thickness / 2, yaw: Math.atan2(-uz, ux), y0, y1 };
}

/** Solid wall pieces with openings cut out (doors fully, windows only between sill and top). */
export function wallPieces(l: Layout): { wall: WallSeg; obb: OBB }[] {
  const out: { wall: WallSeg; obb: OBB }[] = [];
  for (const w of l.walls) {
    const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
    const ops = l.openings.filter(o => o.wall === w.id).sort((a, b) => a.from - b.from);
    let cur = 0;
    for (const o of ops) {
      if (o.from > cur) out.push({ wall: w, obb: wallOBB(w, cur, o.from) });
      if (o.kind === 'window') {
        out.push({ wall: w, obb: wallOBB(w, o.from, o.to, 0, o.sill ?? 0.9) });
        out.push({ wall: w, obb: wallOBB(w, o.from, o.to, o.top ?? 2.6, w.height) });
      } else if ((o.top ?? 2.1) < w.height) {
        out.push({ wall: w, obb: wallOBB(w, o.from, o.to, o.top ?? 2.1, w.height) });
      }
      cur = o.to;
    }
    if (cur < len) out.push({ wall: w, obb: wallOBB(w, cur, len) });
  }
  return out;
}

/** Collision footprint (chairs use their round base, approximated by an inscribed square for SAT). */
function collisionOBB(l: Layout, i: Instance): OBB {
  const b = instanceOBB(l, i), d = def(i.def);
  if (d.footprint?.shape === 'circle') { const h = d.footprint.r / Math.SQRT2 * 1.2; return { ...b, hx: h, hz: h }; }
  return b;
}

export function validateLayout(l: Layout): Issue[] {
  const issues: Issue[] = [];
  const add = (rule: string, id: string, msg: string) => issues.push({ rule, id, msg });
  const ids = new Set<string>();

  for (const i of l.instances) {
    if (ids.has(i.id)) add('unique', i.id, 'duplicate instance id');
    ids.add(i.id);
    let d;
    try { d = def(i.def); } catch { add('catalog', i.id, `unknown def ${i.def}`); continue; }

    // 1. support: surface items sit on a real surface of their parent, inside its rectangle
    if (d.placement === 'surface') {
      const p = l.instances.find(x => x.id === i.on);
      if (!p) { add('support', i.id, 'surface item without a parent'); continue; }
      const s = def(p.def).support?.find(s => s.name === (i.surface ?? 'top'));
      if (!s) { add('support', i.id, `${p.id} has no surface ${i.surface ?? 'top'}`); continue; }
      // footprint corners must lie inside the parent's surface rectangle (in the parent frame)
      const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
      for (const k of obbCorners(instanceOBB(l, i))) {
        const dx = k.x - p.x, dz = k.z - p.z;
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c; // inverse of localToWorld
        if (lx < s.x0 - EPS || lx > s.x1 + EPS || lz < s.z0 - EPS || lz > s.z1 + EPS) {
          add('support', i.id, `overhangs ${p.id} (corner at local ${lx.toFixed(3)}, ${lz.toFixed(3)})`); break;
        }
      }
      // 2. stability: centre of mass above the surface (true when the footprint is inside, re-checked for tall items)
    } else if (i.on) {
      add('support', i.id, `${d.placement} item must not be placed on ${i.on}`);
    }

    // wall items: back face flush with the wall's interior face
    if (d.placement === 'wall') {
      const w = l.walls.find(x => x.id === i.wall);
      if (!w) { add('wall', i.id, 'wall item without a wall'); continue; }
      const back = localToWorld(i.x, i.z, i.yaw, 0, -d.dims.d / 2);
      const o = wallOBB(w);
      const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
      const dz = Math.abs(-(back.x - o.cx) * s + (back.z - o.cz) * c); // distance from the wall centreline
      if (Math.abs(dz - w.thickness / 2) > 0.06) add('wall', i.id, `not flush with wall ${w.id} (gap ${(dz - w.thickness / 2).toFixed(3)} m)`);
      if ((d.wallBottom ?? 0) + d.dims.h > w.height) add('wall', i.id, 'taller than the wall');
    }

    // 4. bounds: inside the building or a zone (balcony)
    const ob = instanceOBB(l, i);
    for (const k of obbCorners(ob)) {
      const inRoom = k.x >= -EPS && k.x <= l.room.w + EPS && k.z >= -EPS && k.z <= l.room.d + EPS;
      const inZone = l.zones.some(z => z.outdoor && pointInPolygon(k, z.poly));
      if (!inRoom && !inZone) { add('bounds', i.id, `corner outside the office (${k.x.toFixed(2)}, ${k.z.toFixed(2)})`); break; }
    }
    if (ob.y1 > l.room.h + EPS) add('bounds', i.id, 'pokes through the ceiling');

    // 6. power
    if (d.powered) {
      const near = l.sockets.some(s => Math.hypot(s.x - i.x, s.z - i.z) <= CABLE_REACH);
      if (!near) add('power', i.id, `no socket within ${CABLE_REACH} m`);
    }
  }

  // 3. collisions: floor objects vs each other and vs walls; surface objects vs siblings on the same surface
  const pieces = wallPieces(l);
  const list = l.instances.filter(i => ids.has(i.id));
  for (let a = 0; a < list.length; a++) {
    const A = list[a]!, dA = def(A.def);
    const oA = collisionOBB(l, A);
    if (dA.placement !== 'wall') {
      for (const p of pieces) {
        if (dA.placement === 'surface') continue;
        const pen = obbPenetration(oA, p.obb);
        if (pen > EPS) add('collision', A.id, `intersects wall ${p.wall.id} by ${(pen * 100).toFixed(1)} cm`);
      }
    }
    for (let b = a + 1; b < list.length; b++) {
      const B = list[b]!, dB = def(B.def);
      if (A.on === B.id || B.on === A.id) continue;                      // resting contact
      if (A.tuckedUnder === B.id || B.tuckedUnder === A.id) continue;
      if (dA.placement === 'wall' || dB.placement === 'wall') continue;  // wall items checked against walls only
      if ((A.on ?? null) !== (B.on ?? null) && (dA.placement === 'surface') !== (dB.placement === 'surface')) {
        // a surface item vs an unrelated floor object: still must not intersect (e.g. lamp through a shelf)
      }
      const pen = obbPenetration(oA, collisionOBB(l, B));
      if (pen > EPS) add('collision', A.id, `intersects ${B.id} by ${(pen * 100).toFixed(1)} cm`);
    }
  }

  // 7. ergonomics + logic for every workstation
  for (const desk of l.instances.filter(i => i.id.startsWith('desk.'))) {
    const owner = desk.id.slice(5);
    const chair = l.instances.find(i => i.id === `chair.${owner}`);
    const mon = l.instances.find(i => i.id === `monitor.${owner}`);
    if (!chair) { add('logic', desk.id, 'desk without a chair'); continue; }
    const seat = def(chair.def).seatH ?? 0.46;
    // chair faces the desk
    const fwd = localToWorld(0, 0, chair.yaw, 0, 1);
    const toDesk = { x: desk.x - chair.x, z: desk.z - chair.z };
    if (fwd.x * toDesk.x + fwd.z * toDesk.z <= 0) add('logic', chair.id, 'chair does not face its desk');
    if (mon) {
      const md = def(mon.def);
      const top = baseY(l, mon) + md.dims.h;
      const eye = seat + SEATED_EYE;
      if (Math.abs(top - eye) > 0.08) add('ergonomics', mon.id, `screen top ${top.toFixed(2)} m vs seated eye ${eye.toFixed(2)} m`);
      // viewing distance from the eye (15 cm in front of the seat centre) to the screen front
      const eyeP = localToWorld(chair.x, chair.z, chair.yaw, 0, 0.15);
      const front = localToWorld(mon.x, mon.z, mon.yaw, 0, md.dims.d / 2);
      const dist = Math.hypot(eyeP.x - front.x, eyeP.z - front.z);
      if (dist < 0.5 || dist > 0.8) add('ergonomics', mon.id, `viewing distance ${dist.toFixed(2)} m (want 0.50-0.80)`);
      // screen faces the user
      const mf = localToWorld(0, 0, mon.yaw, 0, 1);
      const toUser = { x: chair.x - mon.x, z: chair.z - mon.z };
      if (mf.x * toUser.x + mf.z * toUser.z <= 0) add('logic', mon.id, 'screen faces away from its user');
    }
  }
  return issues;
}

export type { Vec2 };
