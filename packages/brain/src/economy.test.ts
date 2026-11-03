import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Ledger } from './economy.js';
import { STAFF, STAFF_BY_ID } from './identity.js';

test('payday: the safe fills on the 25th and empties into salaries with bonuses and capped penalties', () => {
  const l = new Ledger();
  const leo = STAFF_BY_ID.get('writer')!, aziza = STAFF_BY_ID.get('shorts')!;
  l.awardBonus('shorts', 1500, 'Reel above 1M views', 'p7 IG 1.2M');
  assert.equal(l.penalize(leo, 300, 'QA rejected twice', 'J0101', false), 300);
  assert.equal(l.penalize(leo, 2000, 'missed upload slot', 'J0102', true), 0.2 * leo.salaryUsd - 300, 'capped at 20% of base');
  const pay = l.payday(Date.UTC(2026, 10, 25), STAFF);
  assert.equal(l.balance('safe'), 0, 'the safe is emptied by the payroll');
  assert.equal(pay.find(p => p.id === 'shorts')!.paid, aziza.salaryUsd + 1500);
  assert.equal(pay.find(p => p.id === 'writer')!.paid, leo.salaryUsd * 0.8);
  assert.ok(l.all().every(e => e.reason.length > 0), 'every entry has a reason');
});

test('owning up halves the penalty; birthday gifts move cash between colleagues', () => {
  const l = new Ledger();
  const elena = STAFF_BY_ID.get('facts')!;
  assert.equal(l.penalize(elena, 200, 'wrong figure published', 'p6', true), 100);
  l.birthdayGifts(0, 'writer', STAFF.map(s => s.id), 200);
  assert.equal(l.balance('writer'), 200 * (STAFF.length - 1));
  assert.equal(l.balance('facts'), -200);
});
