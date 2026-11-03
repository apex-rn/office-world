import type { Identity } from './identity.js';

// Emotional core — WORLD_PLAN §11.4, §26, §28. Appraisal -> feeling (first person) -> memory -> behaviour.
// Feelings are the person's own inner state: they are written to memory in the first person and drive pace,
// talk and work quality. Growth rule (§28): a sting never lowers the work pace; it decays into drive.

export interface Feelings {
  joy: number;        // happiness, delight
  pride: number;      // earned self-respect
  gratitude: number;  // thankful for the job, the office, people
  sting: number;      // hurt from criticism, a warning or lower pay (short-lived)
  drive: number;      // hunger to do better and earn more
  stress: number;     // pressure (bounded, never toxic)
  affection: Record<string, number>; // warmth towards specific colleagues (romance and friendship)
}

export type Appraisal =
  | { kind: 'salary'; usd: number; expectedUsd: number }
  | { kind: 'bonus'; usd: number; reason: string; publicPraise?: boolean }
  | { kind: 'penalty'; usd: number; reason: string }
  | { kind: 'reprimand'; reason: string; publicly: boolean }
  | { kind: 'praise'; by: string; reason: string; publicly: boolean }
  | { kind: 'qa'; passed: boolean; firstTry: boolean }
  | { kind: 'result'; what: string; views?: number }
  | { kind: 'romance'; with: string; moment: 'smile' | 'conversation' | 'date' | 'together' | 'intimacy_offsite' }
  | { kind: 'celebration'; what: 'birthday' | 'own_birthday' | 'office_anniversary' | 'monthly_31' }
  | { kind: 'boss_attention'; words: string };

export interface FeelingMemory { text: string; importance: number; at: number }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function baseline(p: Identity): Feelings {
  return {
    joy: 0.55 + 0.15 * p.bigFive.extraversion,
    pride: 0.6,
    gratitude: 0.75,
    sting: 0,
    drive: 0.55 + 0.35 * p.bigFive.conscientiousness,
    stress: 0.15 + 0.15 * p.bigFive.neuroticism,
    affection: { ...p.relations },
  };
}

/** Apply one event. Returns the new feelings and a first-person memory of how it felt. */
export function appraise(p: Identity, f: Feelings, e: Appraisal, now: number): { feelings: Feelings; memory: FeelingMemory } {
  const n: Feelings = { ...f, affection: { ...f.affection } };
  const sensitivity = 0.7 + 0.6 * p.bigFive.neuroticism;   // how strongly a sting lands (it never lands on the pace)
  let text = '', importance = 3;
  switch (e.kind) {
    case 'salary': {
      const ratio = e.usd / Math.max(1, e.expectedUsd);
      if (ratio >= 1) {
        n.joy = clamp01(n.joy + 0.25 + 0.15 * (ratio - 1) * 4); n.gratitude = clamp01(n.gratitude + 0.15); n.drive = clamp01(n.drive + 0.1);
        text = `Payday. Viktor handed me $${e.usd.toLocaleString('en-US')}${ratio > 1 ? ' — more than my base' : ''}. I feel great, and grateful to be here.${ratio > 1 ? ' I want that feeling every month.' : ''}`;
        importance = ratio > 1.1 ? 7 : 5;
      } else {
        n.sting = clamp01(n.sting + 0.35 * sensitivity * (1 - ratio) * 3); n.drive = clamp01(n.drive + 0.25);
        text = `Payday, but $${e.usd.toLocaleString('en-US')} — less than I earn when I'm at my best. It stings. Next month I'll earn the full amount and the bonus on top.`;
        importance = 7;
      }
      break;
    }
    case 'bonus':
      n.joy = clamp01(n.joy + 0.3 + Math.min(0.3, e.usd / 5000)); n.pride = clamp01(n.pride + 0.25); n.drive = clamp01(n.drive + 0.15); n.gratitude = clamp01(n.gratitude + 0.1);
      text = `A $${e.usd.toLocaleString('en-US')} bonus for ${e.reason}${e.publicPraise ? ', in front of everyone' : ''}. I'm thrilled — this is why I push. More of this.`;
      importance = 8; break;
    case 'penalty':
      n.sting = clamp01(n.sting + 0.4 * sensitivity); n.drive = clamp01(n.drive + 0.3); n.stress = clamp01(n.stress + 0.05);
      text = `$${e.usd.toLocaleString('en-US')} held back for ${e.reason}. That hurts. I know exactly what to fix, and I'm going to earn it back with a bonus.`;
      importance = 8; break;
    case 'reprimand':
      n.sting = clamp01(n.sting + (e.publicly ? 0.45 : 0.3) * sensitivity); n.drive = clamp01(n.drive + (e.publicly ? 0.3 : 0.2)); n.stress = clamp01(n.stress + 0.05);
      text = `The Manager called out my mistake${e.publicly ? ' in the meeting' : ''}: ${e.reason}. It burned for a moment. He's right — I'll come back sharper and prove it.`;
      importance = 7; break;
    case 'praise':
      n.pride = clamp01(n.pride + (e.publicly ? 0.3 : 0.2)); n.joy = clamp01(n.joy + 0.2); n.drive = clamp01(n.drive + 0.1);
      n.affection[e.by] = clamp01((n.affection[e.by] ?? 0) + 0.05);
      text = `${e.by === 'manager' ? 'The Manager' : e.by} praised me${e.publicly ? ' in front of everyone' : ''} for ${e.reason}. I'm proud of that.`;
      importance = 6; break;
    case 'qa':
      if (e.passed) { n.pride = clamp01(n.pride + (e.firstTry ? 0.12 : 0.05)); n.joy = clamp01(n.joy + 0.05); text = e.firstTry ? 'Passed QA on the first try. Clean work.' : 'Passed QA after a fix. Next time, first try.'; importance = e.firstTry ? 4 : 3; }
      else { n.sting = clamp01(n.sting + 0.15 * sensitivity); n.drive = clamp01(n.drive + 0.12); text = 'QA sent it back. Fair — I see the problem and I\'m fixing it now.'; importance = 5; }
      break;
    case 'result': {
      const big = (e.views ?? 0) >= 1_000_000;
      n.joy = clamp01(n.joy + (big ? 0.4 : 0.15)); n.pride = clamp01(n.pride + (big ? 0.35 : 0.1)); n.drive = clamp01(n.drive + 0.1);
      text = big ? `${e.what} crossed ${(e.views! / 1e6).toFixed(1)}M views. I helped make that. This is the best feeling in the world.` : `${e.what} is doing well${e.views ? ` (${e.views.toLocaleString('en-US')} views)` : ''}. Good.`;
      importance = big ? 9 : 4; break;
    }
    case 'romance': {
      const lift = { smile: 0.05, conversation: 0.08, date: 0.2, together: 0.3, intimacy_offsite: 0.35 }[e.moment];
      n.affection[e.with] = clamp01((n.affection[e.with] ?? 0) + lift); n.joy = clamp01(n.joy + lift);
      n.stress = clamp01(n.stress - lift / 2);
      text = {
        smile: `${e.with} smiled at me. I noticed.`,
        conversation: `Talked with ${e.with} longer than we needed to. I liked it.`,
        date: `Dinner with ${e.with} after work. I didn't want the evening to end.`,
        together: `${e.with} and I are together now. I feel lighter than I have in years.`,
        intimacy_offsite: `Last night with ${e.with} — close, warm, ours. I came in today smiling.`,
      }[e.moment];
      importance = { smile: 2, conversation: 3, date: 6, together: 8, intimacy_offsite: 7 }[e.moment]; break;
    }
    case 'celebration':
      n.joy = clamp01(n.joy + (e.what === 'own_birthday' ? 0.4 : 0.2)); n.gratitude = clamp01(n.gratitude + 0.1); n.stress = clamp01(n.stress - 0.1);
      text = { birthday: 'Birthday cake in the office today. Good people.', own_birthday: 'They threw me a birthday party — cake, everyone singing. I love this place.', office_anniversary: 'Office anniversary, 31 October. Proud to be part of this from the start.', monthly_31: 'The 31st — our little office celebration. Nice break, back to work.' }[e.what];
      importance = e.what === 'own_birthday' ? 8 : 4; break;
    case 'boss_attention':
      n.pride = clamp01(n.pride + 0.2); n.drive = clamp01(n.drive + 0.15); n.joy = clamp01(n.joy + 0.1);
      text = `The Boss spoke to me: "${e.words}". I won't let him down.`;
      importance = 8; break;
  }
  return { feelings: n, memory: { text, importance, at: now } };
}

/** Time passes: feelings drift back towards the person's baseline. A sting fades within hours and turns into drive. */
export function decay(p: Identity, f: Feelings, hours: number): Feelings {
  const b = baseline(p);
  const toward = (v: number, t: number, halfLifeH: number) => t + (v - t) * Math.pow(0.5, hours / halfLifeH);
  const stingLeft = toward(f.sting, 0, 2);               // half-life 2 h
  const converted = f.sting - stingLeft;                  // what fades becomes fuel
  return {
    joy: toward(f.joy, b.joy, 12),
    pride: toward(f.pride, b.pride, 48),
    gratitude: toward(f.gratitude, b.gratitude, 72),
    sting: stingLeft,
    drive: clamp01(toward(f.drive, b.drive, 36) + converted * 0.5),
    stress: toward(f.stress, b.stress, 6),
    affection: f.affection,                               // relationships change only through memories, not time
  };
}

/** Behaviour modifiers. Work pace and quality never fall below the person's own baseline (growth rule). */
export function behaviour(p: Identity, f: Feelings) {
  const base = 0.75 + 0.25 * p.bigFive.conscientiousness;
  const workIntensity = Math.max(base, Math.min(1.25, base + 0.35 * (f.drive - baseline(p).drive) + 0.1 * (f.pride - 0.6)));
  const mood = f.joy - 0.6 * f.sting - 0.3 * f.stress;
  return {
    workIntensity,                                        // multiplies effort/attention on real work; >= base always
    walkSpeedFactor: 1 + 0.08 * (f.drive - 0.6) + 0.05 * (f.joy - 0.6),
    talkativeness: Math.max(0.2, p.bigFive.extraversion + 0.3 * (f.joy - 0.6) - 0.4 * f.sting),
    idleAnim: f.sting > 0.35 ? 'reflective_idle' : mood > 0.75 ? 'happy_idle' : 'idle',
    /** short first-person line for the decision prompt */
    selfReport: describe(f),
  };
}

function describe(f: Feelings): string {
  const parts: string[] = [];
  if (f.joy > 0.8) parts.push('I feel great');
  else if (f.joy > 0.6) parts.push('I feel good');
  if (f.pride > 0.8) parts.push('proud of my work');
  if (f.sting > 0.3) parts.push('still a little stung, and determined to prove myself');
  if (f.drive > 0.85) parts.push('fired up to do my best work and earn a bonus');
  if (f.gratitude > 0.85) parts.push('grateful to be here');
  if (f.stress > 0.5) parts.push('under some pressure, but steady');
  return parts.length ? parts.join(', ') + '.' : 'I feel calm and focused.';
}
