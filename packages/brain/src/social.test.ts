import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Society } from './social.js';

test('talking builds friendship; romance grows in stages only with mutual warmth; dates are off-screen memories', () => {
  const s = new Society(undefined, 9);
  for (let i = 0; i < 60; i++) s.talked('writer', 'shorts', i * 1000, 0.8);
  assert.equal(s.bond('writer', 'shorts').stage, 'close_friends');
  let together = false;
  for (let i = 0; i < 400 && !together; i++) together = s.romance('writer', 'shorts', i)?.stage === 'together';
  assert.ok(together, 'Leo and Aziza end up together after many good conversations');
  assert.equal(s.romance('writer', 'facts', 0), null, 'no romance without warmth');
  const ev = s.evening(0).concat(s.evening(1), s.evening(2));
  assert.ok(ev.length > 0 && ev.every(e => e.appraisal.kind === 'romance'));
  assert.match(s.describe('writer'), /Aziza \(together/);
});
