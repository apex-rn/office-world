import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appraise, baseline, behaviour, decay } from './emotion.js';
import { STAFF_BY_ID } from './identity.js';

const leo = STAFF_BY_ID.get('writer')!;

test('a public reprimand stings, but the work pace never drops and drive grows (growth rule)', () => {
  const f0 = baseline(leo);
  const pace0 = behaviour(leo, f0).workIntensity;
  const { feelings: f1, memory } = appraise(leo, f0, { kind: 'reprimand', reason: 'the hook was misleading', publicly: true }, 0);
  assert.ok(f1.sting > 0.3, 'it stings');
  assert.match(memory.text, /I'll come back sharper/);
  for (const h of [0, 0.5, 1, 2, 4, 8]) {
    const f = decay(leo, f1, h);
    assert.ok(behaviour(leo, f).workIntensity >= pace0, `pace at ${h} h is not below baseline`);
  }
  const later = decay(leo, f1, 4);
  assert.ok(later.sting < f1.sting / 3, 'the sting fades within hours');
  assert.ok(later.drive > f0.drive, 'and leaves more drive than before');
});

test('lower pay hurts and motivates; a bonus delights more than base pay', () => {
  const f0 = baseline(leo);
  const low = appraise(leo, f0, { kind: 'salary', usd: 3000, expectedUsd: 3400 }, 0).feelings;
  assert.ok(low.sting > 0 && low.drive > f0.drive);
  const pay = appraise(leo, f0, { kind: 'salary', usd: 3400, expectedUsd: 3400 }, 0).feelings;
  const bonus = appraise(leo, f0, { kind: 'bonus', usd: 1500, reason: 'a 1M-view Short', publicPraise: true }, 0).feelings;
  assert.ok(pay.joy > f0.joy, 'payday is a joy');
  assert.ok(bonus.joy > pay.joy && bonus.pride > pay.pride, 'a bonus is a bigger joy');
});

test('romance warms the specific person and lifts the mood', () => {
  const f0 = baseline(leo);
  const { feelings, memory } = appraise(leo, f0, { kind: 'romance', with: 'Aziza', moment: 'together' }, 0);
  assert.ok(feelings.affection['Aziza']! > (f0.affection['Aziza'] ?? 0));
  assert.ok(feelings.joy > f0.joy && feelings.stress < f0.stress);
  assert.ok(memory.importance >= 7);
});
