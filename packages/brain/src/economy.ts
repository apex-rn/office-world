import type { Identity } from './identity.js';

// Economy — WORLD_PLAN §13, §27, §29. USD, append-only ledger with a reason and evidence for every entry.
// The safe receives the payroll on the 25th of each month; Viktor hands every salary over in person.
// Bonuses and penalties come only from objective facts (cards, QA, views). Penalties are capped at 20% of base pay;
// owning a mistake early halves the penalty (honesty rule).

export type EntryKind = 'safe_deposit' | 'salary' | 'bonus' | 'penalty' | 'gift';
export interface Entry { seq: number; at: number; kind: EntryKind; from: string; to: string; usd: number; reason: string; evidence?: string }

export class Ledger {
  private entries: Entry[] = [];
  private seq = 1;
  readonly balances = new Map<string, number>();   // personal savings (USD), 'safe' for the office safe

  private post(e: Omit<Entry, 'seq'>): Entry {
    const x = { ...e, seq: this.seq++ };
    this.entries.push(x);
    this.balances.set(e.to, (this.balances.get(e.to) ?? 0) + e.usd);
    if (e.from !== 'company') this.balances.set(e.from, (this.balances.get(e.from) ?? 0) - e.usd);
    return x;
  }
  all(): readonly Entry[] { return this.entries; }
  toJSON() { return { seq: this.seq, entries: this.entries, balances: [...this.balances], pending: [...this.pending] }; }
  load(s: ReturnType<Ledger['toJSON']>): void {
    this.seq = s.seq; this.entries = s.entries;
    this.balances.clear(); for (const [k, v] of s.balances) this.balances.set(k, v);
    this.pending.clear(); for (const [k, v] of s.pending) this.pending.set(k, v);
  }
  balance(who: string): number { return this.balances.get(who) ?? 0; }

  /** Pending bonus/penalty for the current month, per person (paid on the 25th together with the salary). */
  private pending = new Map<string, { bonus: number; penalty: number; notes: string[] }>();
  private pend(who: string) { let p = this.pending.get(who); if (!p) this.pending.set(who, (p = { bonus: 0, penalty: 0, notes: [] })); return p; }

  awardBonus(who: string, usd: number, reason: string, evidence: string): void { const p = this.pend(who); p.bonus += usd; p.notes.push(`+$${usd} ${reason} (${evidence})`); }

  /** Penalty from an objective fact; `ownedUp` = the person reported it themselves first. */
  penalize(p0: Identity, usd: number, reason: string, evidence: string, ownedUp: boolean): number {
    const p = this.pend(p0.id);
    const amount = ownedUp ? usd / 2 : usd;
    const cap = 0.2 * p0.salaryUsd - p.penalty;
    const applied = Math.max(0, Math.min(amount, cap));
    p.penalty += applied; p.notes.push(`-$${applied} ${reason} (${evidence})${ownedUp ? ' — owned up, halved' : ''}`);
    return applied;
  }

  /** 25th: the safe fills with the month's payroll, then Viktor pays everyone. Returns what each person received. */
  payday(at: number, staff: Identity[]): { id: string; base: number; paid: number; bonus: number; penalty: number }[] {
    const net = (p: Identity) => { const pd = this.pending.get(p.id); return p.salaryUsd + (pd?.bonus ?? 0) - (pd?.penalty ?? 0); };
    const total = staff.reduce((s, p) => s + net(p), 0);
    this.post({ at, kind: 'safe_deposit', from: 'company', to: 'safe', usd: total, reason: 'monthly payroll appears in the safe' });
    const out = staff.map(p => {
      const pd = this.pending.get(p.id) ?? { bonus: 0, penalty: 0, notes: [] };
      const paid = p.salaryUsd + pd.bonus - pd.penalty;
      this.post({ at, kind: 'salary', from: 'safe', to: p.id, usd: paid, reason: `salary (base $${p.salaryUsd})`, evidence: pd.notes.join('; ') || undefined });
      return { id: p.id, base: p.salaryUsd, paid, bonus: pd.bonus, penalty: pd.penalty };
    });
    this.pending.clear();
    return out;
  }

  /** Birthday: every colleague gives cash to the birthday person. */
  birthdayGifts(at: number, person: string, givers: string[], usdEach: number): void {
    for (const g of givers) if (g !== person) this.post({ at, kind: 'gift', from: g, to: person, usd: usdEach, reason: 'birthday gift' });
  }

  /** Progress towards the person's big life dream (0..1). */
  dreamProgress(p: Identity): number {
    const d = p.dreams.find(x => x.kind === 'life' && x.costUsd);
    return d ? Math.max(0, Math.min(1, this.balance(p.id) / d.costUsd!)) : 0;
  }
}
