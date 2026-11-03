import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OFFICE_V1 } from '../../catalog/src/layout.js';
import { World } from '../../sim/src/world.js';
import { STAFF_BY_ID } from './identity.js';
import { type ChatMessage, type LLM, Router } from './llm.js';
import { Mind, parseDecision } from './mind.js';

class ScriptedLLM implements LLM {
  prompts: ChatMessage[][] = [];
  constructor(private replies: string[]) {}
  async chat(m: ChatMessage[]) { this.prompts.push(m); return this.replies.shift() ?? '{"thought":"ok","action":{"verb":"wait","seconds":30}}'; }
}

const T0 = Date.UTC(2026, 10, 3, 1, 0); // 10:00 Seoul

test('a mind perceives, decides in JSON, and its body carries it out', async () => {
  const w = await World.create(structuredClone(OFFICE_V1), T0, 3);
  for (const id of ['writer', 'shorts']) w.addBody({ id, name: id, heightM: 1.8, walkSpeed: 1.35 });
  w.command('writer', { verb: 'arrive' });
  w.command('writer', { verb: 'go_to', target: 'reception' });
  for (let i = 0; i < 80; i++) w.step(0.05);
  assert.ok(w.command('shorts', { verb: 'arrive' }).ok);
  const llm = new ScriptedLLM(['{"thought":"Coffee first, then the hook.","action":{"verb":"use","target":"kitchen.coffee","action":"brew_coffee"}}']);
  const leo = new Mind(STAFF_BY_ID.get('writer')!, { world: w, router: new Router(llm, null, { fast: 'f', strong: 's' }) });
  const cmd = await leo.think();
  assert.deepEqual(cmd, { verb: 'use', target: 'kitchen.coffee', action: 'brew_coffee' });
  const prompt = llm.prompts[0]!;
  assert.match(prompt[0]!.content, /You are Leo Martin/);
  assert.match(prompt[1]!.content, /I can see: Aziza Karimova/);
  for (let i = 0; i < 20 * 120 && !w.bodies.get('writer')!.holding; i++) w.step(0.05);
  assert.match(w.bodies.get('writer')!.holding ?? '', /^mug\./, 'Leo got his coffee');
  assert.ok(leo.memory.size >= 1);
});

test('garbage from the model never moves the body in a strange way', () => {
  assert.equal(parseDecision('I think I will dance'), null);
  assert.equal(parseDecision('{"action":{"verb":"fly","target":"moon"}}'), null);
  assert.deepEqual(parseDecision('{"thought":"x","action":{"verb":"wait","seconds":99999}}')!.command, { verb: 'wait', seconds: 600 });
});

test('router: critical work waits for Claude, life always runs free; limit reset is parsed', () => {
  const free = new ScriptedLLM([]), claude = new ScriptedLLM([]);
  const r = new Router(free, claude, { fast: 'f', strong: 's', claude: 'c' });
  const now = T0;
  r.claudeDownUntil = Router.parseReset("You've hit your session limit · resets 12:40pm (Asia/Seoul)", now)!;
  assert.ok(r.claudeDownUntil > now);
  assert.ok('deferred' in r.pick('critical', now));
  const life = r.pick('life', now); assert.ok(!('deferred' in life) && life.engine === 'free');
  const hard = r.pick('work_hard', now); assert.ok(!('deferred' in hard) && hard.engine === 'free');
  const later = r.pick('work_hard', r.claudeDownUntil + 1); assert.ok(!('deferred' in later) && later.engine === 'claude');
});

test('the parser survives reasoning prose, code fences, truncated drafts and verb synonyms', () => {
  const r1 = parseDecision('We need to produce JSON. Draft: {"thought":"x","action":{"verb":"go_to","targe\nFinal:\n```json\n{"thought":"coffee","action":{"verb":"get_to","target":"kitchen"}}\n```');
  assert.deepEqual(r1!.command, { verb: 'go_to', target: 'kitchen' });
  const r2 = parseDecision('{"thought":"hi","action":{"verb":"talk","to":"facts","text":"Elena, quick question about p8?"}}');
  assert.deepEqual(r2!.command, { verb: 'say', to: 'facts', text: 'Elena, quick question about p8?' });
  assert.equal(parseDecision('{"User Safety":"safe"}'), null);
  assert.equal(parseDecision('[]'), null);
});
