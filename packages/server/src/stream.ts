import { WebSocketServer, type WebSocket } from 'ws';
import { def } from '../../catalog/src/items.js';
import { baseY, wallPieces } from '../../catalog/src/validator.js';
import type { OfficeRuntime } from '../../brain/src/runtime.js';
import type { WorldEvent } from '../../sim/src/world.js';

// Live stream for renderers (Unreal Engine client, browser viewer) — WORLD_PLAN §15, docs/UNREAL_PLAN.md.
// Protocol (JSON text frames, server -> client):
//   {"t":"hello","v":1,"layout":{...}}                       once, on connect: real-dimension layout (metres, Y-up)
//   {"t":"snap","now":<ms>,"activity":"work","bodies":[{id,x,y,z,yaw,state,anim,holding,seat}],"doors":{id:0|1}}  10 Hz
//   {"t":"event","e":<WorldEvent|SocialEvent>}             speech, greetings, arrivals, action results
// Client -> server: {"t":"boss","cmd":<Command>} — the Boss's own body (only with the boss token).

export interface StreamOpts { port: number; hz?: number; bossToken?: string }

export function layoutPayload(rt: OfficeRuntime) {
  const L = rt.world.layout;
  return {
    room: L.room,
    instances: L.instances.map(i => { const d = def(i.def); return { id: i.id, def: i.def, x: i.x, z: i.z, yaw: i.yaw, y: baseY(L, i), dims: d.dims, seatH: d.seatH, kind: d.kind, owner: i.owner }; }),
    walls: wallPieces(L).map(p => ({ ...p.obb, material: p.wall.material })),
    openings: L.openings, zones: L.zones,
  };
}

export function startStream(rt: OfficeRuntime, o: StreamOpts): { close(): void; broadcastEvent(e: WorldEvent | object): void; broadcastBoard(): void } {
  const wss = new WebSocketServer({ port: o.port });
  const clients = new Set<WebSocket>();
  // the real board for the kanban on the wall: title, status, owner (no secrets live on the board)
  const boardMsg = () => JSON.stringify({ t: 'board', cards: rt.cards.map(c => ({ id: c.id, title: c.title, status: c.status, owner: c.owner, kind: c.kind })) });
  const hello = JSON.stringify({ t: 'hello', v: 1, layout: layoutPayload(rt) });
  wss.on('connection', (ws, req) => {
    clients.add(ws);
    ws.send(hello);
    ws.send(boardMsg());
    const isBoss = !!o.bossToken && new URL(req.url ?? '/', 'http://x').searchParams.get('token') === o.bossToken;
    ws.on('message', raw => {
      if (!isBoss) return;                               // viewers are read-only
      try {
        const m = JSON.parse(String(raw)) as { t?: string; cmd?: Parameters<typeof rt.world.command>[1] };
        if (m.t === 'boss' && m.cmd) ws.send(JSON.stringify({ t: 'ack', r: rt.world.command('boss', m.cmd) }));
      } catch { /* ignore malformed input */ }
    });
    ws.on('close', () => clients.delete(ws));
  });
  const send = (s: string) => { for (const c of clients) if (c.readyState === c.OPEN) c.send(s); };
  const timer = setInterval(() => {
    if (!clients.size) return;
    const w = rt.world;
    send(JSON.stringify({
      t: 'snap', now: w.now, activity: rt.activity,
      bodies: [...w.bodies.values()].map(b => ({ id: b.spec.id, x: +b.pos.x.toFixed(3), y: +b.pos.y.toFixed(3), z: +b.pos.z.toFixed(3), yaw: +b.yaw.toFixed(3), state: b.state, anim: b.anim, holding: b.holding, seat: b.seat?.inst ?? null })),
      doors: Object.fromEntries([...w.acoustics.doorOpen].map(([k, v]) => [k, v ? 1 : 0])),
    }));
  }, 1000 / (o.hz ?? 10));
  return {
    close() { clearInterval(timer); wss.close(); },
    broadcastEvent(e) { send(JSON.stringify({ t: 'event', e })); },
    broadcastBoard() { send(boardMsg()); },
  };
}
