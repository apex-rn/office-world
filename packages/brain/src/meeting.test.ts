import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OFFICE_V1 } from '../../catalog/src/layout.js';
import { World } from '../../sim/src/world.js';
import { STAFF_BY_ID } from './identity.js';
import { type ChatMessage, type LLM, Router } from './llm.js';
import { runMeeting } from './meeting.js';
import { Mind } from './mind.js';

class EchoLLM implements LLM {
  async chat(m: ChatMessage[]) {
    const u = m.at(-1)!.content;
    if (u.includes('Close the meeting')) return '{"speech":"Good work. Leo, sharper hooks today.","decisions":[{"owner":"writer","title":"Two hook variants for p8"}],"praise":[{"who":"facts","reason":"caught the 2019 figure"}],"criticism":[{"who":"writer","reason":"yesterday\'s hook overpromised"}]}';
    const name = /You are ([A-Za-z ]+),/.exec(m[0]!.content)?.[1] ?? '?';
    return `${name}: update.`;
  }
}

test('a morning meeting: agenda, everyone reports, decisions, public praise and fair criticism', async () => {
  const w = await World.create(structuredClone(OFFICE_V1), Date.UTC(2026, 10, 4, 0, 10), 1);
  const ids = ['manager', 'writer', 'facts'];
  const router = new Router(new EchoLLM(), null, { fast: 'f', strong: 's' });
  const minds = new Map(ids.map(id => [id, new Mind(STAFF_BY_ID.get(id)!, { world: w, router })]));
  for (const id of ids) { w.addBody({ id, name: id, heightM: 1.8, walkSpeed: 1.3 }); }
  // put everyone in the meeting room
  for (const id of ids) { w.command(id, { verb: 'arrive' }); w.command(id, { verb: 'go_to', target: 'meeting' }); for (let i = 0; i < 60; i++) w.step(0.05); }
  for (let i = 0; i < 20 * 60; i++) w.step(0.05);
  const out = await runMeeting('morning_plan', w, router, minds, { cards: [{ id: 'J7', status: 'doing', owner: 'writer', kind: 'script', title: 'p8 script' }], metrics: 'views +38% d/d', bossPresent: false });
  assert.ok(out.transcript.length >= 4, 'manager opens, both report, manager closes');
  assert.deepEqual(out.decisions, [{ owner: 'writer', title: 'Two hook variants for p8' }]);
  const leo = minds.get('writer')!, elena = minds.get('facts')!;
  assert.ok(leo.feelings.sting > 0 && leo.feelings.drive > 0.7, 'Leo is stung and driven');
  assert.ok(elena.feelings.pride > 0.6, 'Elena is proud');
});
