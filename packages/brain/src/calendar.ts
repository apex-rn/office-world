import { OFFICE_FOUNDED, type Identity, STAFF } from './identity.js';

// Office calendar — WORLD_PLAN §29. Meetings, birthdays, monthly "31st" anniversaries, the yearly 31 October and
// New Year. All times are Seoul time (minutes of day). The Manager decides when a party is over; the times here are
// the plan he starts from.

export const FOUNDED_DATE = `2026-${OFFICE_FOUNDED}`;  // 2026-10-31

export type OfficeEvent =
  | { kind: 'meeting'; type: 'morning_plan' | 'evening_review' | 'weekly_review'; start: number; end: number; room: 'meeting'; chair: 'manager' }
  | { kind: 'birthday'; person: string; decorateFrom: number; surpriseAt: number; partyEnd: number; giftUsdEach: number }
  | { kind: 'anniversary'; label: string; months: number; workEnds: number; partyStart: number; partyEnd: number; disco: true }
  | { kind: 'new_year'; partyStart: number; partyEnd: number; countdownAt: number; noWork: true };

export interface DayPlan {
  date: string;
  events: OfficeEvent[];
  /** staff (except the birthday person) come in early to decorate */
  earlyArrival: number | null;
  workEnds: number;      // minute of day work stops (party days end earlier)
  leaveFrom: number;     // people start going home (party days later)
  noWork: boolean;
}

const hm = (h: number, m = 0) => h * 60 + m;

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number) as [number, number];
  const [by, bm] = b.split('-').map(Number) as [number, number];
  return (by - ay) * 12 + (bm - am);
}

export function dayPlan(date: string, staff: Identity[] = STAFF): DayPlan {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = d.getUTCDay();                      // 1 = Monday
  const md = date.slice(5);
  const events: OfficeEvent[] = [];
  let workEnds = hm(21), leaveFrom = hm(21), earlyArrival: number | null = null, noWork = false;

  // two meetings every working day; the big weekly review every Monday (last week's analysis)
  events.push({ kind: 'meeting', type: 'morning_plan', start: hm(9, 10), end: hm(9, 30), room: 'meeting', chair: 'manager' });
  if (weekday === 1) events.push({ kind: 'meeting', type: 'weekly_review', start: hm(10, 0), end: hm(11, 30), room: 'meeting', chair: 'manager' });
  events.push({ kind: 'meeting', type: 'evening_review', start: hm(20, 20), end: hm(20, 50), room: 'meeting', chair: 'manager' });

  // birthdays: colleagues arrive at 07:30 to decorate (HBD), surprise when the person walks in, song, applause,
  // party, everyone gives money (no other gifts), then back to work
  for (const p of staff) if (p.birthday === md) {
    events.push({ kind: 'birthday', person: p.id, decorateFrom: hm(7, 30), surpriseAt: hm(8, 55), partyEnd: hm(9, 45), giftUsdEach: 200 });
    earlyArrival = hm(7, 30);
  }

  // every 31st: "the office is N months old" — work ends at 18:00, party with a disco, home late (23:30)
  if (md.endsWith('-31') && date > FOUNDED_DATE) {
    const months = monthsBetween(FOUNDED_DATE, date);
    const years = months % 12 === 0 ? months / 12 : 0;
    events.push({ kind: 'anniversary', label: years ? `${years} year${years > 1 ? 's' : ''}` : `${months} month${months > 1 ? 's' : ''}`, months, workEnds: hm(18), partyStart: hm(18), partyEnd: hm(23, 30), disco: true });
    workEnds = hm(18); leaveFrom = hm(23, 30);
  }

  // New Year: 10 hours together in the office, no work — 31 Dec 18:00 to 1 Jan 04:00, countdown at midnight
  if (md === '12-31') {
    events.push({ kind: 'new_year', partyStart: hm(18), partyEnd: hm(24) + hm(4), countdownAt: hm(24), noWork: true });
    workEnds = hm(18); leaveFrom = hm(24) + hm(4);
  }
  if (md === '01-01') noWork = true;                    // the party ends at 04:00; nobody works on New Year's Day

  return { date, events, earlyArrival, workEnds, leaveFrom, noWork };
}
