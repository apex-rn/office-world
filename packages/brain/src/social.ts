import type { Appraisal } from './emotion.js';
import { type Identity, STAFF } from './identity.js';
import { rng } from '../../shared/src/rng.js';

// Relationships — WORLD_PLAN §11.5, §25 (romance on; intimacy only outside the office, as memories).
// Every real conversation moves two people closer (familiarity) and, depending on how it went and on character fit,
// changes how much they like each other (warmth). Romance grows in stages only when warmth is mutual and high;
// dates happen after work, off-screen, and come back as first-person memories the next morning.

export type Stage = 'colleagues' | 'friends' | 'close_friends' | 'crush' | 'dating' | 'together';
export interface Bond { familiarity: number; warmth: number; stage: Stage; talks: number; lastTalk: number }

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export class Society {
  readonly bonds = new Map<string, Bond>();
  private rand: () => number;
  constructor(private staff: Identity[] = STAFF, seed = 3) {
    this.rand = rng(seed);
    for (const p of staff) for (const [other, w] of Object.entries(p.relations)) {
      const b = this.bond(p.id, other);
      b.warmth = Math.max(b.warmth, w); b.familiarity = Math.max(b.familiarity, 0.3);
    }
  }

  bond(a: string, b: string): Bond {
    let x = this.bonds.get(key(a, b));
    if (!x) this.bonds.set(key(a, b), (x = { familiarity: 0.1, warmth: 0.2, stage: 'colleagues', talks: 0, lastTalk: 0 }));
    return x;
  }

  /** Character fit 0..1: similar openness/agreeableness and complementary extraversion make easy company. */
  fit(a: Identity, b: Identity): number {
    const d = Math.abs(a.bigFive.openness - b.bigFive.openness) + Math.abs(a.bigFive.agreeableness - b.bigFive.agreeableness);
    return Math.max(0, Math.min(1, 1 - d / 2 + 0.15 * (1 - Math.abs(a.bigFive.extraversion - b.bigFive.extraversion))));
  }

  /** A conversation happened. `tone` -1..1 (praise/help/laughter positive; criticism slightly negative but respected). */
  talked(a: string, b: string, at: number, tone = 0.3): Bond {
    const x = this.bond(a, b);
    const pa = this.staff.find(s => s.id === a), pb = this.staff.find(s => s.id === b);
    const f = pa && pb ? this.fit(pa, pb) : 0.5;
    x.talks++; x.lastTalk = at;
    x.familiarity = Math.min(1, x.familiarity + 0.04 * (1 - x.familiarity));
    x.warmth = Math.max(-1, Math.min(1, x.warmth + 0.03 * tone * (0.5 + f)));
    this.advance(x);
    return x;
  }

  private advance(x: Bond): void {
    if (x.stage === 'colleagues' && x.familiarity > 0.45 && x.warmth > 0.45) x.stage = 'friends';
    else if (x.stage === 'friends' && x.familiarity > 0.7 && x.warmth > 0.65) x.stage = 'close_friends';
  }

  /** Romance needs mutual warmth; both must be single. Returns the stage move (if any) and the feelings it brings. */
  romance(a: string, b: string, at: number): { stage: Stage; feelings: { who: string; appraisal: Appraisal }[] } | null {
    const x = this.bond(a, b);
    if (!['close_friends', 'crush', 'dating'].includes(x.stage) || x.warmth < 0.7) return null;
    const busy = (id: string) => [...this.bonds.entries()].some(([k, v]) => v.stage === 'together' && k.split('|').includes(id) && k !== key(a, b));
    if (busy(a) || busy(b)) return null;
    const next: Record<string, Stage> = { close_friends: 'crush', crush: 'dating', dating: 'together' };
    const p = { close_friends: 0.08, crush: 0.15, dating: 0.1 }[x.stage as 'close_friends' | 'crush' | 'dating'];
    if (this.rand() > p) return null;
    x.stage = next[x.stage]!;
    x.lastTalk = at;
    const moment = x.stage === 'crush' ? 'conversation' : x.stage === 'dating' ? 'date' : 'together';
    const name = (id: string) => this.staff.find(s => s.id === id)?.name.split(' ')[0] ?? id;
    return { stage: x.stage, feelings: [
      { who: a, appraisal: { kind: 'romance', with: name(b), moment } },
      { who: b, appraisal: { kind: 'romance', with: name(a), moment } },
    ] };
  }

  /** After work: couples may spend the evening together (off-screen); remembered the next morning. */
  evening(at: number): { who: string; appraisal: Appraisal }[] {
    const out: { who: string; appraisal: Appraisal }[] = [];
    for (const [k, v] of this.bonds) {
      if (v.stage !== 'dating' && v.stage !== 'together') continue;
      const [a, b] = k.split('|') as [string, string];
      if (this.rand() > (v.stage === 'together' ? 0.5 : 0.25)) continue;
      const name = (id: string) => this.staff.find(s => s.id === id)?.name.split(' ')[0] ?? id;
      const moment = v.stage === 'together' && this.rand() < 0.5 ? 'intimacy_offsite' : 'date';
      out.push({ who: a, appraisal: { kind: 'romance', with: name(b), moment } }, { who: b, appraisal: { kind: 'romance', with: name(a), moment } });
      v.lastTalk = at;
    }
    return out;
  }

  /** One line per person for the decision prompt: who I like, who I'm close to. */
  describe(id: string): string {
    const name = (x: string) => this.staff.find(s => s.id === x)?.name.split(' ')[0] ?? x;
    const mine = [...this.bonds.entries()].filter(([k]) => k.split('|').includes(id))
      .map(([k, v]) => ({ other: k.split('|').find(x => x !== id)!, v })).sort((p, q) => q.v.warmth - p.v.warmth).slice(0, 4);
    if (!mine.length) return '';
    return 'People to me: ' + mine.map(({ other, v }) => `${name(other)} (${v.stage.replace('_', ' ')}${v.warmth > 0.6 ? ', I like them a lot' : ''})`).join('; ') + '.';
  }

  toJSON() { return [...this.bonds]; }
  load(s: [string, Bond][]): void { this.bonds.clear(); for (const [k, v] of s) this.bonds.set(k, v); }
}
