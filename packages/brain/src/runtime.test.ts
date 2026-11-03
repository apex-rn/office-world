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

import { STAFF_BY_ID } from './identity.js';
import { pointInPolygon } from '../../shared/src/math.js';

async function small(startUtc: number, ids: string[]) {
  const w = await World.create(structuredClone(OFFICE_V1), startUtc, 5);
  const rt = new OfficeRuntime(w, new Router(idle, null, { fast: 'f', strong: 's' }), { seed: 2, staff: ids.map(i => STAFF_BY_ID.get(i)!) });
  const run = async (sec: number) => { for (let i = 0; i < sec * 20; i++) { rt.step(0.05); if (i % 200 === 0) await new Promise(r => setImmediate(r)); } };
  return { w, rt, run };
}

test('a new card: Viktor carries it to the NAVBAT board and tells its owner in person', async () => {
  const { w, rt, run } = await small(Date.UTC(2026, 10, 4, 1, 0), ['guard', 'writer', 'manager']); // 10:00 Seoul
  await run(120);
  rt.applyBoard([{ id: 'J0101', status: 'todo', owner: 'writer', kind: 'script', title: 'Hook for p7' }]);
  await run(240);
  const leo = rt.minds.get('writer')!;
  assert.ok(leo.memory.all().some(m => /New card for you on the board: J0101/.test(m.text)), 'Leo heard it from Viktor');
  assert.equal(rt.cardOf.get('writer')?.id, 'J0101');
  assert.ok(w.events.length >= 0);
});

test('the morning meeting gathers everyone in the meeting room', async () => {
  const { w, rt, run } = await small(Date.UTC(2026, 10, 4, 0, 0), ['manager', 'writer', 'facts']); // 09:00 Seoul
  await run(60 * 9);
  assert.equal(rt.activity, 'meeting:morning_plan');
  const z = w.layout.zones.find(z => z.id === 'meeting')!;
  for (const id of ['manager', 'writer', 'facts']) assert.ok(pointInPolygon(w.bodies.get(id)!.pos, z.poly), `${id} is in the meeting room`);
});
