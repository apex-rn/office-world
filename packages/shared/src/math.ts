// Shared geometry. World units: metres. Y is up. Floor is y = 0.
// Plan axes: x grows east (0..18), z grows south (0..13).

export interface Vec3 { x: number; y: number; z: number }
export interface Vec2 { x: number; z: number }

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const dist2 = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Oriented box on the floor plan: centre, half extents, yaw (radians, about +Y), vertical span. */
export interface OBB {
  cx: number; cz: number;
  hx: number; hz: number;
  yaw: number;
  y0: number; y1: number;
}

export function obbCorners(b: OBB): Vec2[] {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const lx = sx! * b.hx, lz = sz! * b.hz;
    return { x: b.cx + lx * c + lz * s, z: b.cz - lx * s + lz * c };
  });
}

/** Penetration depth along the best separating axis (<= 0 means no overlap). Uses SAT in 2D + vertical interval. */
export function obbPenetration(a: OBB, b: OBB): number {
  const vy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (vy <= 0) return vy;
  const ca = obbCorners(a), cb = obbCorners(b);
  let minOverlap = vy;
  for (const box of [a, b]) {
    const c = Math.cos(box.yaw), s = Math.sin(box.yaw);
    const axes: Vec2[] = [{ x: c, z: -s }, { x: s, z: c }];
    for (const ax of axes) {
      const pa = ca.map(p => p.x * ax.x + p.z * ax.z), pb = cb.map(p => p.x * ax.x + p.z * ax.z);
      const o = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (o <= 0) return o;
      minOverlap = Math.min(minOverlap, o);
    }
  }
  return minOverlap;
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Local offset (in the object's frame) to world plan coordinates. */
export function localToWorld(cx: number, cz: number, yaw: number, lx: number, lz: number): Vec2 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: cx + lx * c + lz * s, z: cz - lx * s + lz * c };
}

/** Do segments p1-p2 and q1-q2 properly intersect (2D)? */
export function segmentsIntersect(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): boolean {
  const d = (a: Vec2, b: Vec2, c: Vec2) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const d1 = d(q1, q2, p1), d2 = d(q1, q2, p2), d3 = d(p1, p2, q1), d4 = d(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export const deg = (d: number): number => (d * Math.PI) / 180;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
