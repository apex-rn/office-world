import type { DayPlan } from '../../brain/src/calendar.js';

// What the office service must trigger right now, given today's plan and what already ran (pure, testable).
export type Due =
  | { kind: 'meeting'; type: 'morning_plan' | 'evening_review' | 'weekly_review'; key: string }
  | { kind: 'birthday'; person: string; giftUsdEach: number; key: string }
  | { kind: 'anniversary'; label: string; key: string }
  | { kind: 'new_year'; key: string }
  | { kind: 'payday'; key: string };

export function dueNow(plan: DayPlan, minuteOfDay: number, done: ReadonlySet<string>): Due[] {
  const out: Due[] = [];
  const day = plan.date;
  for (const e of plan.events) {
    if (e.kind === 'meeting' && minuteOfDay >= e.start && minuteOfDay < e.end) out.push({ kind: 'meeting', type: e.type, key: `${day}:meeting:${e.type}` });
    if (e.kind === 'birthday' && minuteOfDay >= e.surpriseAt && minuteOfDay < e.partyEnd) out.push({ kind: 'birthday', person: e.person, giftUsdEach: e.giftUsdEach, key: `${day}:birthday:${e.person}` });
    if (e.kind === 'anniversary' && minuteOfDay >= e.partyStart && minuteOfDay < e.partyEnd) out.push({ kind: 'anniversary', label: e.label, key: `${day}:anniversary` });
    if (e.kind === 'new_year' && minuteOfDay >= e.partyStart) out.push({ kind: 'new_year', key: `${day}:new_year` });
  }
  // payday: the 25th, right after the morning meeting
  if (day.endsWith('-25') && minuteOfDay >= 9 * 60 + 35) out.push({ kind: 'payday', key: `${day.slice(0, 7)}:payday` });
  return out.filter(d => !done.has(d.key));
}
