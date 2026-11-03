import { behaviour, type Feelings } from './emotion.js';
import { type Identity, SHARED_WORLDVIEW } from './identity.js';
import type { Memory } from './memory.js';

// Work brief — WORLD_PLAN §11.7, §12. The person who works (claude -p / FreeLLM work runner) is the same person who
// lives in the office: same identity, same feelings, same lessons. The office service writes this brief for every
// person; run_agent.sh prepends it to the agent's own task brief.

export function workBrief(p: Identity, f: Feelings, memories: readonly Memory[], now: number): string {
  const b = behaviour(p, f);
  const lessons = memories.filter(m => m.kind === 'lesson').slice(-8).map(m => `- ${m.text}`);
  const recent = memories.filter(m => m.at > now - 3 * 86_400_000 && m.importance >= 6).slice(-8).map(m => `- ${m.text}`);
  return [
    `# Who you are: ${p.name}, ${p.title} at Compound Chronicle`,
    '',
    p.character,
    `Values: ${p.values.join(', ')}.`,
    `How you write and speak: ${p.speech.rules.join(' ')}`,
    '',
    '## World',
    ...SHARED_WORLDVIEW.map(s => `- ${s}`),
    '',
    '## Right now',
    `- How I feel: ${b.selfReport}`,
    `- Work intensity: ${b.workIntensity.toFixed(2)} (never below your normal standard)`,
    '',
    '## Your playbook (verified lessons — follow them)',
    ...p.playbook.map(x => `- ${x}`),
    ...(lessons.length ? lessons : []),
    '',
    '## What happened recently (your own memories)',
    ...(recent.length ? recent : ['- nothing major']),
    '',
    '## After the task',
    '- If you learned something that would make your next result better (a QA reason, a view count, a fix), write ONE line to',
    `  ~/office/lessons/${p.id}.txt starting with "LESSON:" — it becomes part of your playbook after it is confirmed twice.`,
  ].join('\n');
}

/** Lessons written by the work runner: a line becomes a playbook rule once it has been seen twice (§11.2). */
export function confirmedLessons(lines: string[]): string[] {
  const count = new Map<string, number>();
  for (const l of lines) {
    const m = /^LESSON:\s*(.+)$/i.exec(l.trim());
    if (!m) continue;
    const k = m[1]!.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines) {
    const m = /^LESSON:\s*(.+)$/i.exec(l.trim());
    if (!m) continue;
    const k = m[1]!.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    if ((count.get(k) ?? 0) >= 2 && !seen.has(k)) { seen.add(k); out.push(m[1]!.trim()); }
  }
  return out;
}
