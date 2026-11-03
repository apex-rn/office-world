import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OFFICE_V1 } from '../../catalog/src/layout.js';
import { World } from '../../sim/src/world.js';
import { STAFF_BY_ID } from './identity.js';
import { describe, freshNeeds, satisfy, tick, urgency } from './needs.js';

test('needs rise with time by person and fall when met', () => {
  const aziza = STAFF_BY_ID.get('shorts')!;
  let n = tick(aziza, freshNeeds(), 4, true);
  assert.ok(n.hunger > 0.6 && n.caffeine > 0.4, 'four hours of work make you hungry and want coffee');
  assert.ok(describe(n, aziza.habits.smoker).some(l => /hungry/.test(l)));
  n = satisfy(n, { verb: 'use', target: 'kitchen.fridge', action: 'take_food' as never });
  assert.equal(n.hunger, 0);
  n = satisfy({ ...n, bladder: 0.9 }, { verb: 'use', target: 'wc.toilet1', action: 'use_toilet' as never });
  assert.equal(n.bladder, 0);
  assert.ok(urgency({ ...freshNeeds(), bladder: 0.95 }, false) >= 0.9);
});

test('work at your desk is done sitting, hands typing; elsewhere it is refused', async () => {
  const w = await World.create(structuredClone(OFFICE_V1), Date.parse('2026-11-04T09:00:00+09:00'), 5);
  w.addBody({ id: 'writer', name: 'Leo', heightM: 1.8, walkSpeed: 1.35 });
  w.command('writer', { verb: 'arrive' });
  assert.equal(w.command('writer', { verb: 'use', target: 'desk.writer', action: 'work' as never }).ok, false, 'not seated yet');
  w.command('writer', { verb: 'sit', target: 'chair.writer' });
  for (let i = 0; i < 20 * 90 && w.bodies.get('writer')!.state !== 'sitting'; i++) w.step(0.05);
  assert.equal(w.bodies.get('writer')!.state, 'sitting');
  for (let i = 0; i < 20 * 3; i++) w.step(0.05);
  assert.ok(w.command('writer', { verb: 'use', target: 'desk.writer', action: 'work' as never }).ok);
  w.step(0.05);
  const b = w.bodies.get('writer')!;
  assert.equal(b.state, 'sitting'); assert.equal(b.anim, 'typing');
});
