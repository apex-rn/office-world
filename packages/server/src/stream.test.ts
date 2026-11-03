import assert from 'node:assert/strict';
import { test } from 'node:test';
import WebSocket from 'ws';
import { OFFICE_V1 } from '../../catalog/src/layout.js';
import { STAFF_BY_ID } from '../../brain/src/identity.js';
import { type LLM, Router } from '../../brain/src/llm.js';
import { OfficeRuntime } from '../../brain/src/runtime.js';
import { World } from '../../sim/src/world.js';
import { startStream } from './stream.js';

const idle: LLM = { async chat() { return '{"thought":"ok","action":{"verb":"wait","seconds":60}}'; } };

test('a renderer connects, gets the real-dimension layout, then 10 Hz snapshots', async () => {
  const w = await World.create(structuredClone(OFFICE_V1), Date.UTC(2026, 10, 4, 1, 0), 3);
  const rt = new OfficeRuntime(w, new Router(idle, null, { fast: 'f', strong: 's' }), { staff: [STAFF_BY_ID.get('writer')!] });
  const s = startStream(rt, { port: 18765 });
  const tick = setInterval(() => rt.step(0.05), 5);
  const ws = new WebSocket('ws://127.0.0.1:18765');
  const msgs: { t: string; layout?: { instances: unknown[] }; bodies?: { id: string }[] }[] = [];
  await new Promise<void>((res, rej) => { ws.on('message', d => { msgs.push(JSON.parse(String(d))); if (msgs.filter(m => m.t === 'snap').length >= 3) res(); }); ws.on('error', rej); setTimeout(() => rej(new Error('timeout')), 5000); });
  ws.close(); clearInterval(tick); s.close();
  assert.equal(msgs[0]!.t, 'hello');
  assert.ok(msgs[0]!.layout!.instances.length > 100);
  assert.ok(msgs.find(m => m.t === 'snap')!.bodies!.some(b => b.id === 'writer'));
});
