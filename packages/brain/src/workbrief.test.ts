import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appraise, baseline } from './emotion.js';
import { STAFF_BY_ID } from './identity.js';
import { confirmedLessons, workBrief } from './workbrief.js';

test('the work brief carries the same person: identity, current feelings, playbook and recent memories', () => {
  const leo = STAFF_BY_ID.get('writer')!;
  const { feelings, memory } = appraise(leo, baseline(leo), { kind: 'bonus', usd: 1500, reason: 'a 1M-view Short' }, Date.now());
  const brief = workBrief(leo, feelings, [{ id: 1, kind: 'feeling', ...memory }], Date.now());
  assert.match(brief, /Leo Martin, Scriptwriter/);
  assert.match(brief, /fired up|great|proud/);
  assert.match(brief, /Frame zero must make a promise/);
  assert.match(brief, /\$1,500 bonus/);
});

test('a lesson joins the playbook only after it is confirmed twice', () => {
  const lines = ['LESSON: Hooks with a number in the first 3 words keep 12% more viewers', 'noise', 'LESSON: hooks with a number in the first 3 words keep 12% more viewers.', 'LESSON: once is not enough'];
  assert.deepEqual(confirmedLessons(lines), ['Hooks with a number in the first 3 words keep 12% more viewers']);
});
