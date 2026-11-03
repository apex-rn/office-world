import { Crowd, type CrowdAgent, type NavMesh, NavMeshQuery, type TileCache, init } from 'recast-navigation';
import { generateTileCache, tileCacheGeneratorConfigDefaults } from 'recast-navigation/generators';
import { def } from '../../catalog/src/items.js';
import type { Layout } from '../../catalog/src/schema.js';
import { instanceOBB, wallPieces } from '../../catalog/src/validator.js';
import { type OBB, type Vec3, obbCorners } from '../../shared/src/math.js';

// Navigation — WORLD_PLAN §7. Navmesh is baked from the layout itself (walls with openings cut out + static furniture);
// chairs are dynamic tile-cache obstacles; DetourCrowd steers every body (agents and the Boss) around each other.

export const BODY_RADIUS = 0.25;
export const BODY_HEIGHT = 1.8;
const CS = 0.05, CH = 0.05;

export interface NavGeometry { positions: Float32Array; indices: Uint32Array }

export function buildNavGeometry(l: Layout): NavGeometry {
  const P: number[] = [], I: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    const o = P.length / 3; P.push(...a, ...b, ...c, ...d); I.push(o, o + 2, o + 1, o, o + 3, o + 2);
  };
  const floor = (x0: number, z0: number, x1: number, z1: number) => quad([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]);
  const box = (b: OBB) => {
    const c = obbCorners(b), y0 = Math.max(0, b.y0), y1 = b.y1;
    const v = (k: number, y: number) => [c[k]!.x, y, c[k]!.z];
    quad(v(0, y1), v(1, y1), v(2, y1), v(3, y1));
    for (let k = 0; k < 4; k++) { const n = (k + 1) % 4; quad(v(k, y0), v(n, y0), v(n, y1), v(k, y1)); }
  };
  // building slab including wall footprints (so door thresholds are walkable), plus outdoor zones
  floor(-0.2, -0.2, l.room.w + 0.2, l.room.d + 0.2);
  for (const z of l.zones.filter(z => z.outdoor)) {
    const xs = z.poly.map(p => p.x), zs = z.poly.map(p => p.z);
    floor(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs));
  }
  for (const p of wallPieces(l)) if (p.obb.y0 < 0.3) box(p.obb);
  for (const i of l.instances) {
    const d = def(i.def);
    if (d.nav !== 'static' || d.placement !== 'floor') continue;
    box(instanceOBB(l, i));
  }
  return { positions: new Float32Array(P), indices: new Uint32Array(I) };
}

export interface Nav {
  navMesh: NavMesh;
  tileCache: TileCache;
  query: NavMeshQuery;
  crowd: Crowd;
  /** chair id -> obstacle handle */
  obstacles: Map<string, unknown>;
}

let wasmReady: Promise<void> | null = null;
export const initNav = () => (wasmReady ??= init());

export async function buildNav(l: Layout, maxAgents = 32): Promise<Nav> {
  await initNav();
  const g = buildNavGeometry(l);
  const cfg = {
    ...tileCacheGeneratorConfigDefaults,
    cs: CS, ch: CH, tileSize: 64,
    walkableRadius: Math.ceil(BODY_RADIUS / CS), walkableHeight: Math.ceil(BODY_HEIGHT / CH),
    walkableClimb: Math.floor(0.3 / CH), walkableSlopeAngle: 30,
    maxSimplificationError: 0.6, expectedLayersPerTile: 4, maxObstacles: 256,
  };
  const r = generateTileCache(g.positions, g.indices, cfg as never);
  if (!r.success) throw new Error(`navmesh generation failed: ${(r as { error?: string }).error}`);
  const { navMesh, tileCache } = r;
  const obstacles = new Map<string, unknown>();
  for (const i of l.instances) {
    const d = def(i.def);
    if (d.nav !== 'dynamic') continue;
    const rad = d.footprint?.shape === 'circle' ? d.footprint.r : Math.max(d.dims.w, d.dims.d) / 2;
    const res = tileCache.addCylinderObstacle({ x: i.x, y: 0, z: i.z }, rad, d.dims.h);
    obstacles.set(i.id, (res as { obstacle?: unknown }).obstacle ?? res);
  }
  for (let k = 0; k < 64; k++) { const u = tileCache.update(navMesh); if ((u as { upToDate?: boolean }).upToDate) break; }
  const query = new NavMeshQuery(navMesh);
  const crowd = new Crowd(navMesh, { maxAgents, maxAgentRadius: 0.4 });
  return { navMesh, tileCache, query, crowd, obstacles };
}

export const AGENT_PARAMS = {
  radius: BODY_RADIUS, height: BODY_HEIGHT,
  maxAcceleration: 2.0, maxSpeed: 1.35,   // ~2 m/s²: people ease into and out of walking
  // separation acts over the whole query range in Detour, so keep both modest: people only adjust when close
  collisionQueryRange: BODY_RADIUS * 6, pathOptimizationRange: BODY_RADIUS * 30,
  separationWeight: 0.4,
  // anticipate turns | obstacle avoidance | separation | optimise visibility | optimise topology
  updateFlags: 1 | 2 | 4 | 8 | 16,
};

/** Nearest point on the navmesh (or null when nothing is within the search box). */
export function snap(nav: Nav, p: Vec3, half = { x: 0.6, y: 1, z: 0.6 }): Vec3 | null {
  const r = nav.query.findClosestPoint(p, { halfExtents: half }) as { success: boolean; point: Vec3 };
  return r.success ? r.point : null;
}

/** Full path (corner points) between two points, or null. */
export function path(nav: Nav, a: Vec3, b: Vec3): Vec3[] | null {
  const r = nav.query.computePath(a, b) as { success: boolean; path: Vec3[] };
  return r.success && r.path.length ? r.path : null;
}

export type { CrowdAgent };
