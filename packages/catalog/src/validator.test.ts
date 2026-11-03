import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ITEMS, PANEL_24, def } from './items.js';
import { OFFICE_V1 } from './layout.js';
import { baseY, validateLayout } from './validator.js';

test('office_v1 has zero placement issues', () => {
  const issues = validateLayout(OFFICE_V1);
  assert.deepEqual(issues.map(i => `${i.rule} ${i.id}: ${i.msg}`), []);
});

test('every catalog item has positive real dimensions and a source', () => {
  for (const d of ITEMS) {
    assert.ok(d.dims.w > 0 && d.dims.d > 0 && d.dims.h > 0, d.id);
    assert.ok(d.source.length > 3, `${d.id} needs a source`);
  }
});

test('24" panel geometry is exact', () => {
  assert.equal(PANEL_24.w.toFixed(3), '0.531');
  assert.equal(PANEL_24.h.toFixed(3), '0.299');
});

test('items on a desk rest exactly on the desk top', () => {
  const lamp = OFFICE_V1.instances.find(i => i.id === 'lamp.writer')!;
  assert.equal(baseY(OFFICE_V1, lamp), def('desk_140').dims.h);
});

test('validator catches a floating, colliding and overhanging layout', () => {
  const broken = structuredClone(OFFICE_V1);
  const lamp = broken.instances.find(i => i.id === 'lamp.writer')!;
  lamp.x += 1.0;                                   // hangs off the desk
  const chair = broken.instances.find(i => i.id === 'chair.qa')!;
  chair.x = 8.4; chair.z = 6.6;                    // inside another desk
  const rules = new Set(validateLayout(broken).map(i => `${i.rule}:${i.id}`));
  assert.ok(rules.has('support:lamp.writer'));
  assert.ok([...rules].some(r => r.startsWith('collision:')));
});
