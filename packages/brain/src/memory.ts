// Memory stream — WORLD_PLAN §11.2. Every observation, conversation, feeling and work outcome is remembered with an
// importance score; recall ranks by recency + importance + relevance (embeddings when available, keywords otherwise).

export type MemoryKind = 'observation' | 'conversation' | 'feeling' | 'work' | 'reflection' | 'lesson' | 'plan';

export interface Memory { id: number; at: number; kind: MemoryKind; text: string; importance: number; embedding?: number[] }

export interface Embedder { embed(texts: string[]): Promise<number[][]> }

const STOP = new Set('the a an and or but to of in on at for with is are was were i me my you your he she it we they this that be have has had do did not so just'.split(' '));
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));

export class MemoryStream {
  private items: Memory[] = [];
  private next = 1;
  constructor(private embedder?: Embedder) {}

  async add(kind: MemoryKind, text: string, importance: number, at: number): Promise<Memory> {
    const m: Memory = { id: this.next++, at, kind, text, importance: Math.max(1, Math.min(10, importance)) };
    if (this.embedder) { try { m.embedding = (await this.embedder.embed([text]))[0]; } catch { /* keyword fallback */ } }
    this.items.push(m);
    return m;
  }

  get size(): number { return this.items.length; }
  toJSON(): { next: number; items: Memory[] } { return { next: this.next, items: this.items.map(({ embedding: _e, ...m }) => m) }; }
  load(s: { next: number; items: Memory[] }): void { this.items = s.items; this.next = s.next; }
  all(): readonly Memory[] { return this.items; }
  /** Forget small things: older than `days`, importance below `minImportance` (lessons and reflections stay). */
  prune(now: number, days = 7, minImportance = 4): number {
    const before = this.items.length;
    this.items = this.items.filter(m => m.kind === 'lesson' || m.kind === 'reflection' || m.importance >= minImportance || now - m.at < days * 86_400_000);
    return before - this.items.length;
  }

  /** Top-k memories for a situation. recency half-life 24 h; weights follow Generative Agents (equal). */
  async recall(query: string, now: number, k = 6): Promise<Memory[]> {
    let qe: number[] | undefined;
    if (this.embedder && this.items.some(m => m.embedding)) { try { qe = (await this.embedder.embed([query]))[0]; } catch { qe = undefined; } }
    const qw = words(query);
    const scored = this.items.map(m => {
      const recency = Math.pow(0.5, (now - m.at) / 3_600_000 / 24);
      const importance = m.importance / 10;
      let relevance: number;
      if (qe && m.embedding) relevance = cosine(qe, m.embedding);
      else { const mw = words(m.text); let inter = 0; for (const w of qw) if (mw.has(w)) inter++; relevance = qw.size ? inter / Math.sqrt(qw.size * Math.max(1, mw.size)) : 0; }
      return { m, s: recency + importance + relevance };
    });
    return scored.sort((a, b) => b.s - a.s).slice(0, k).map(x => x.m);
  }

  /** Sum of importance since a time — triggers a reflection when it crosses a threshold (§11.2). */
  importanceSince(t: number): number { return this.items.filter(m => m.at >= t).reduce((s, m) => s + m.importance, 0); }
}

function cosine(a: number[], b: number[]): number {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { d += a[i]! * b[i]!; na += a[i]! ** 2; nb += b[i]! ** 2; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}
