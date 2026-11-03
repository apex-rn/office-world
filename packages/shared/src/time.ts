// All in-world time is real Asia/Seoul time (UTC+9, no DST). The server clock is UTC.
export const SEOUL_OFFSET_MS = 9 * 3600 * 1000;

export interface SeoulTime {
  iso: string;        // 2026-11-03T12:42:00+09:00
  date: string;       // 2026-11-03
  hour: number; minute: number; second: number;
  weekday: number;    // 0 = Sunday ... 6 = Saturday
  minuteOfDay: number;
}

export function seoulTime(epochMs: number): SeoulTime {
  const d = new Date(epochMs + SEOUL_OFFSET_MS);
  const date = d.toISOString().slice(0, 10);
  const hour = d.getUTCHours(), minute = d.getUTCMinutes(), second = d.getUTCSeconds();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    iso: `${date}T${pad(hour)}:${pad(minute)}:${pad(second)}+09:00`,
    date, hour, minute, second,
    weekday: d.getUTCDay(),
    minuteOfDay: hour * 60 + minute,
  };
}

export const fmtClock = (t: SeoulTime): string => `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
