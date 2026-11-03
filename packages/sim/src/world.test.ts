import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OFFICE_V1 } from '../../catalog/src/layout.js';
import { World } from './world.js';
import { runStress } from './stress.js';

const T0 = Date.UTC(2026, 10, 3, 0, 30); // 09:30 Seoul
const spec = (id: string) => ({ id, name: id, heightM: 1.75, walkSpeed: 1.35 });

async function world(ids: string[]) {
  const w = await World.create(structuredClone(OFFICE_V1), T0, 7);
  for (const id of ids) w.addBody(spec(id));
  return w;
}

function runUntil(w: World, pred: () => boolean, maxS = 300) {
  for (let t = 0; t < maxS * 20; t++) { w.step(0.05); if (pred()) return true; }
  return false;
}

test('arrive, walk to the coffee machine, queue, brew, hold the mug', async () => {
  const w = await world(['leo', 'mia']);
  assert.ok(w.command('leo', { verb: 'arrive' }).ok);
  assert.ok(w.command('leo', { verb: 'use', target: 'kitchen.coffee', action: 'brew_coffee' }).ok);
  const r0 = w.command('mia', { verb: 'arrive' });
  assert.ok(!r0.ok && r0.code === 'BUSY', 'cannot walk in while someone stands in the doorway');
  runUntil(w, () => false, 3);
  assert.ok(w.command('mia', { verb: 'arrive' }).ok);
  assert.ok(w.command('mia', { verb: 'use', target: 'kitchen.coffee', action: 'brew_coffee' }).ok);
  const ok = runUntil(w, () => !!w.bodies.get('leo')!.holding && !!w.bodies.get('mia')!.holding, 400);
  assert.ok(ok, 'both get coffee');
  const ev = w.drainEvents().filter(e => e.type === 'action_done' && e.verb === 'use');
  assert.equal(ev.length, 2);
  assert.match(w.bodies.get('leo')!.holding!, /^mug\./);
});

test('sitting puts the body exactly on the seat anchor', async () => {
  const w = await world(['elena']);
  w.command('elena', { verb: 'arrive' });
  assert.ok(w.command('elena', { verb: 'sit', target: 'chair.facts' }).ok);
  assert.ok(runUntil(w, () => w.bodies.get('elena')!.state === 'sitting', 120));
  const b = w.bodies.get('elena')!, c = w.inst('chair.facts')!;
  assert.ok(Math.hypot(b.pos.x - c.x, b.pos.z - c.z) < 0.02);
  assert.equal(b.pos.y, 0.46);
  // the chair is now taken
  w.addBody(spec('sara')); w.command('sara', { verb: 'arrive' });
  const r = w.command('sara', { verb: 'sit', target: 'chair.facts' });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.code === 'OCCUPIED');
  assert.ok(w.command('elena', { verb: 'stand' }).ok);
  assert.equal(w.bodies.get('elena')!.state, 'standing');
});

test('nobody can talk to someone who is not there or cannot hear', async () => {
  const w = await world(['viktor', 'daniel']);
  w.command('viktor', { verb: 'arrive' });
  const r1 = w.command('viktor', { verb: 'say', to: 'daniel', text: 'Morning, boss' });
  assert.ok(!r1.ok && r1.code === 'NOT_PRESENT');
  // Viktor sits at reception; Daniel sits in the closed meeting room — glass + a closed door block the voice
  w.command('viktor', { verb: 'sit', target: 'chair.guard' });
  runUntil(w, () => false, 3);
  assert.ok(w.command('daniel', { verb: 'arrive' }).ok);
  w.command('daniel', { verb: 'sit', target: 'meeting.chairW0' });
  assert.ok(runUntil(w, () => w.bodies.get('daniel')!.state === 'sitting' && w.bodies.get('viktor')!.state === 'sitting', 200));
  const r2 = w.command('viktor', { verb: 'say', to: 'daniel', text: 'Courier is here' });
  assert.ok(!r2.ok && r2.code === 'OUT_OF_EARSHOT');
});

test('12 bodies, 30 simulated minutes of random errands: no overlaps, nobody inside furniture', async () => {
  const r = await runStress({ bodies: 12, minutes: 30, seed: 11 });
  assert.equal(r.overlaps, 0, `overlaps: ${JSON.stringify(r.worstOverlap)}`);
  assert.equal(r.offMesh, 0);
  assert.ok(r.completed > 60, `completed ${r.completed} errands`);
});

test('the Boss steers directly and still cannot walk through walls', async () => {
  const w = await world(['boss', 'leo']);
  w.command('boss', { verb: 'arrive' });
  const r = w.command('leo', { verb: 'steer', vx: 1, vz: 0 });
  assert.ok(!r.ok && r.code === 'OFFSITE' || !r.ok);
  const x0 = w.bodies.get('boss')!.pos.x;
  for (let i = 0; i < 40; i++) { w.command('boss', { verb: 'steer', vx: 1.2, vz: 0 }); w.step(0.05); }
  assert.ok(w.bodies.get('boss')!.pos.x > x0 + 1, 'he walks east');
  for (let i = 0; i < 200; i++) { w.command('boss', { verb: 'steer', vx: -1.6, vz: 0 }); w.step(0.05); }
  assert.ok(w.bodies.get('boss')!.pos.x > -0.3, 'he never leaves the building slab (the entrance door is right there)');
});
