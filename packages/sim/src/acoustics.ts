import type { Layout } from '../../catalog/src/schema.js';
import { wallOBB, wallPieces } from '../../catalog/src/validator.js';
import { type Vec2, segmentsIntersect } from '../../shared/src/math.js';

// Line-of-sight and line-of-sound through the building — WORLD_PLAN §10.
// Solid walls block both; glass blocks sound only; a door blocks both while it is closed.

export const HEAD_Y = 1.5;
export const HEARING = { whisper: 1.5, normal: 5, loud: 10 } as const;
export const SIGHT_RANGE = 12;

interface Seg { a: Vec2; b: Vec2; sight: boolean; sound: boolean; door?: string }

function centreline(o: ReturnType<typeof wallOBB>): [Vec2, Vec2] {
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  return [{ x: o.cx - o.hx * c, z: o.cz + o.hx * s }, { x: o.cx + o.hx * c, z: o.cz - o.hx * s }];
}

export class Acoustics {
  private segs: Seg[] = [];
  /** door id -> open */
  readonly doorOpen = new Map<string, boolean>();
  readonly doorCentre = new Map<string, Vec2>();

  constructor(private l: Layout) {
    for (const p of wallPieces(l)) {
      if (p.obb.y0 > HEAD_Y || p.obb.y1 < HEAD_Y) continue;
      const [a, b] = centreline(p.obb);
      this.segs.push({ a, b, sight: p.wall.material === 'solid', sound: true });
    }
    for (const o of l.openings.filter(o => o.kind === 'door')) {
      const w = l.walls.find(w => w.id === o.wall)!;
      const [a, b] = centreline(wallOBB(w, o.from, o.to));
      this.segs.push({ a, b, sight: true, sound: true, door: o.id });
      this.doorOpen.set(o.id, false);
      this.doorCentre.set(o.id, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
    }
  }

  private clear(a: Vec2, b: Vec2, kind: 'sight' | 'sound'): boolean {
    for (const s of this.segs) {
      if (!s[kind]) continue;
      if (s.door && this.doorOpen.get(s.door)) continue;
      if (segmentsIntersect(a, b, s.a, s.b)) return false;
    }
    return true;
  }

  canSee(a: Vec2, b: Vec2): boolean {
    return Math.hypot(a.x - b.x, a.z - b.z) <= SIGHT_RANGE && this.clear(a, b, 'sight');
  }

  canHear(a: Vec2, b: Vec2, volume: keyof typeof HEARING = 'normal'): boolean {
    return Math.hypot(a.x - b.x, a.z - b.z) <= HEARING[volume] && this.clear(a, b, 'sound');
  }

  /** Doors open while any body is within 1.0 m of the door centre (auto doors / people holding them). */
  updateDoors(bodies: Vec2[]): void {
    for (const [id, c] of this.doorCentre) this.doorOpen.set(id, bodies.some(p => Math.hypot(p.x - c.x, p.z - c.z) < 1.0));
  }
}
