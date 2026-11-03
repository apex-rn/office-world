import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayPlan } from './calendar.js';

test('two meetings a day, a big review on Mondays', () => {
  const tue = dayPlan('2026-11-03');
  assert.deepEqual(tue.events.filter(e => e.kind === 'meeting').map(e => e.kind === 'meeting' && e.type), ['morning_plan', 'evening_review']);
  const mon = dayPlan('2026-11-09');
  assert.ok(mon.events.some(e => e.kind === 'meeting' && e.type === 'weekly_review'));
});

test('every 31st is an anniversary party with a disco; work ends early, people stay late', () => {
  const dec = dayPlan('2026-12-31');
  const a = dec.events.find(e => e.kind === 'anniversary');
  assert.ok(a && a.kind === 'anniversary' && a.label === '2 months' && a.disco);
  assert.equal(dec.workEnds, 18 * 60);
  const year = dayPlan('2027-10-31').events.find(e => e.kind === 'anniversary');
  assert.ok(year && year.kind === 'anniversary' && year.label === '1 year');
  assert.equal(dayPlan('2026-10-31').events.some(e => e.kind === 'anniversary'), false, 'opening day itself is not an anniversary');
});

test('a birthday: colleagues come early to decorate, surprise, money gifts', () => {
  const p = dayPlan('2026-06-12'.replace('2026', '2027')); // Leo
  const b = p.events.find(e => e.kind === 'birthday');
  assert.ok(b && b.kind === 'birthday' && b.person === 'writer' && b.giftUsdEach > 0);
  assert.equal(p.earlyArrival, 7 * 60 + 30);
});

test('New Year: 10 hours of celebration in the office, no work', () => {
  const ny = dayPlan('2026-12-31').events.find(e => e.kind === 'new_year');
  assert.ok(ny && ny.kind === 'new_year' && ny.partyEnd - ny.partyStart === 600 && ny.noWork);
  assert.equal(dayPlan('2027-01-01').noWork, true);
});
