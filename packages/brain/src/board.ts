import type { Command } from '../../sim/src/world.js';

// Board adapter — WORLD_PLAN §12. The real job board (office.py / board.json) drives what happens in the world:
// a new card is carried by Viktor from the Manager's desk to the NAVBAT board, the owner sits down to work it,
// finished work is handed to the Manager, QA verdicts land in feelings. Field names are read tolerantly because the
// board file is written by another program.

export type CardStatus = 'todo' | 'doing' | 'review' | 'approved' | 'done' | 'blocked' | 'rejected';
export interface Card { id: string; status: CardStatus; owner: string; kind: string; title: string }

export type BoardChange =
  | { type: 'created'; card: Card }
  | { type: 'status'; card: Card; from: CardStatus };

export function parseBoard(json: unknown): Card[] {
  const root = json as Record<string, unknown>;
  const list = (Array.isArray(root) ? root : (root.jobs ?? root.cards ?? root.board ?? [])) as Record<string, unknown>[];
  const s = (o: Record<string, unknown>, ...k: string[]) => { for (const x of k) if (typeof o[x] === 'string') return o[x] as string; return ''; };
  return list.map(o => ({
    id: s(o, 'id', 'job', 'card'),
    status: (s(o, 'status', 'state') || 'todo') as CardStatus,
    owner: s(o, 'agent', 'owner', 'assignee', 'who'),
    kind: s(o, 'kind', 'type', 'lane'),
    title: s(o, 'title', 'name', 'task'),
  })).filter(c => c.id);
}

export function diffBoard(prev: Card[], next: Card[]): BoardChange[] {
  const before = new Map(prev.map(c => [c.id, c]));
  const out: BoardChange[] = [];
  for (const c of next) {
    const p = before.get(c.id);
    if (!p) out.push({ type: 'created', card: c });
    else if (p.status !== c.status) out.push({ type: 'status', card: c, from: p.status });
  }
  return out;
}

/** A short chain of body commands carried out as a habit (no model call). */
export interface Errand { who: string; why: string; steps: Command[] }

/** What each board change means for the people in the office. */
export function errandsFor(ch: BoardChange): Errand[] {
  const c = ch.card;
  if (ch.type === 'created') {
    return [{
      who: 'guard', why: `card ${c.id} for ${c.owner}`,
      steps: [
        { verb: 'go_to', target: 'manager.guest1' },
        { verb: 'use', target: 'reception.board', action: 'move_card' },
        ...(c.owner && c.owner !== 'guard' ? [{ verb: 'go_to', target: c.owner } as Command, { verb: 'say', to: c.owner, text: `New card for you on the board: ${c.id}.` } as Command] : []),
      ],
    }];
  }
  if (c.status === 'doing' && c.owner) return [{ who: c.owner, why: `work on ${c.id}`, steps: [{ verb: 'sit', target: `chair.${c.owner}` }] }];
  if (c.status === 'review' && c.owner && c.owner !== 'manager') {
    return [{ who: c.owner, why: `hand in ${c.id}`, steps: [{ verb: 'go_to', target: 'manager' }, { verb: 'say', to: 'manager', text: `${c.id} is ready for review.` }, { verb: 'sit', target: `chair.${c.owner}` }] }];
  }
  return [];
}

/** Executes errands step by step; a refused step is retried a few times, then dropped (and remembered by the mind). */
export class ErrandRunner {
  private queue = new Map<string, { e: Errand; i: number; tries: number; busyUntil: number }[]>();
  add(e: Errand): void { const q = this.queue.get(e.who) ?? []; q.push({ e, i: 0, tries: 0, busyUntil: 0 }); this.queue.set(e.who, q); }
  /** drop queued errands of one kind (e.g. a self-made plan when someone needs the person) */
  drop(who: string, why: string): void { const q = this.queue.get(who); if (q) this.queue.set(who, q.filter(x => x.e.why !== why)); }
  has(who: string): boolean { return (this.queue.get(who)?.length ?? 0) > 0; }
  peek(who: string): Command | undefined { const c = this.queue.get(who)?.[0]; return c?.e.steps[c.i]; }

  /** Call when the person is idle; returns the command issued (if any). */
  next(who: string, now: number, issue: (c: Command) => { ok: boolean }): Command | null {
    const q = this.queue.get(who);
    const cur = q?.[0];
    if (!cur || now < cur.busyUntil) return null;
    const step = cur.e.steps[cur.i];
    if (!step) { q!.shift(); return null; }
    if (step.verb === 'sit' && cur.i > 0) { /* fine */ }
    const r = issue(step);
    if (r.ok) { cur.i++; if (cur.i >= cur.e.steps.length) q!.shift(); }
    // a self-made plan step that fails is simply dropped (the mind re-thinks); board errands get a few retries
    else if (cur.e.why === 'plan' || ++cur.tries > 3) q!.shift();
    else cur.busyUntil = now + 15_000;
    return step;
  }
}
