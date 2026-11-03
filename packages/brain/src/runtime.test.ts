import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OFFICE_V1 } from '../../catalog/src/layout.js';
import { World } from '../../sim/src/world.js';
import { type LLM, Router } from './llm.js';
import { OfficeRuntime } from './runtime.js';

const idle: LLM = { async chat() { return '{"thought":"settle in","action":{"verb":"wait","seconds":60}}'; } };

test('a morning: everyone arrives around their habit time and greets with Korean bows', async () => {
  const start = Date.UTC(2026, 10, 3, 23, 35); // 08:35 Seoul next day
  const w = await World.create(structuredClone(OFFICE_V1), start, 9);
  const rt = new OfficeRuntime(w, new Router(idle, null, { fast: 'f', strong: 's' }), { seed: 4 });
  for (let i = 0; i < 20 * 60 * 40; i++) { rt.step(0.05); if (i % 200 === 0) await new Promise(r => setImmediate(r)); }
  const inside = [...w.bodies.values()].filter(b => b.state !== 'offsite').length;
  assert.equal(inside, rt.minds.size, 'everyone is in by 09:15');
  const toManager = rt.social.filter(s => s.to === 'manager');
  assert.ok(toManager.length > 0 && toManager.every(s => s.bowDeg === 30), 'staff bow 30° to the Manager');
  assert.ok(rt.social.some(s => s.bowDeg === 15), 'peers bow 15°');
  assert.ok(rt.social.some(s => s.handshake), 'some add a handshake');
});
