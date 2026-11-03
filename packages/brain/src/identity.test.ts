import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OFFICE_V1 } from '../../catalog/src/layout.js';
import { STAFF, STAFF_BY_ID } from './identity.js';

test('every staff member is consistent with the office and with each other', () => {
  const ids = new Set(STAFF.map(s => s.id));
  assert.equal(ids.size, STAFF.length, 'unique ids');
  const birthdays = new Set(STAFF.map(s => s.birthday));
  assert.equal(birthdays.size, STAFF.length, 'unique birthdays (one party each)');
  for (const s of STAFF) {
    assert.match(s.birthday, /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, `${s.id} birthday`);
    if (s.role !== 'cleaner') assert.ok(OFFICE_V1.instances.some(i => i.id === `desk.${s.id}`), `${s.id} has a desk`);
    for (const r of Object.keys(s.relations)) assert.ok(STAFF_BY_ID.has(r), `${s.id} relation to unknown ${r}`);
    // dreams are big: a life dream worth at least $500k and a measurable career dream
    assert.ok(s.dreams.some(d => d.kind === 'life' && (d.costUsd ?? 0) >= 500_000), `${s.id} life dream`);
    assert.ok(s.dreams.some(d => d.kind === 'career' && d.measure), `${s.id} career dream`);
    assert.ok(s.speech.samples.some(x => /Boss,/.test(x)), `${s.id} has an Uzbek line for the Boss`);
  }
});
