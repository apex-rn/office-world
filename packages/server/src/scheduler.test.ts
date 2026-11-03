import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayPlan } from '../../brain/src/calendar.js';
import { dueNow } from './scheduler.js';

test('the scheduler fires each event once, at its time', () => {
  const plan = dayPlan('2026-11-25');                     // a Wednesday, payday
  const done = new Set<string>();
  assert.deepEqual(dueNow(plan, 9 * 60 + 5, done), []);
  const at910 = dueNow(plan, 9 * 60 + 10, done);
  assert.deepEqual(at910.map(d => d.kind), ['meeting']);
  for (const d of at910) done.add(d.key);
  assert.deepEqual(dueNow(plan, 9 * 60 + 15, done), [], 'not twice');
  const pay = dueNow(plan, 9 * 60 + 40, done);
  assert.deepEqual(pay.map(d => d.kind), ['payday']);
  for (const d of pay) done.add(d.key);
  assert.deepEqual(dueNow(plan, 20 * 60 + 25, done).map(d => d.kind === 'meeting' && d.type), ['evening_review']);
});

test('31 December: anniversary and New Year both fire', () => {
  const kinds = dueNow(dayPlan('2026-12-31'), 18 * 60 + 1, new Set()).map(d => d.kind).sort();
  assert.deepEqual(kinds, ['anniversary', 'new_year']);
});
