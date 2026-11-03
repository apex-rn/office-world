// Model access — WORLD_PLAN §11.6. One OpenAI-compatible client (FreeLLMAPI speaks it); the router picks a model per
// task kind and fails over from Claude to FreeLLM while Claude is limited, switching back automatically.

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface LLM { chat(messages: ChatMessage[], opts?: { model?: string; maxTokens?: number; temperature?: number; json?: boolean }): Promise<string> }

export class OpenAICompatClient implements LLM {
  constructor(private baseUrl: string, private apiKey: string, private defaultModel = 'auto') {}
  async chat(messages: ChatMessage[], opts: { model?: string; maxTokens?: number; temperature?: number; json?: boolean } = {}): Promise<string> {
    const r = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: opts.model ?? this.defaultModel, messages,
        max_tokens: opts.maxTokens ?? 400, temperature: opts.temperature ?? 0.8,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json() as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content ?? '';
  }
}

export type TaskKind = 'life' | 'dialogue' | 'reflection' | 'work_routine' | 'work_hard' | 'critical';

/** Which engine thinks for which kind of task; `critical` (e.g. approving an upload) never runs on the free tier. */
export class Router {
  /** epoch ms until which Claude is unavailable (usage limit); set from the work runner's limit message */
  claudeDownUntil = 0;
  constructor(private free: LLM, private claude: LLM | null, private models: { fast: string; strong: string; claude?: string }) {}

  pick(kind: TaskKind, now: number): { llm: LLM; model: string; engine: 'free' | 'claude' } | { deferred: true } {
    const claudeOk = !!this.claude && now >= this.claudeDownUntil;
    switch (kind) {
      case 'life': return { llm: this.free, model: this.models.fast, engine: 'free' };
      case 'dialogue': case 'reflection': case 'work_routine': return { llm: this.free, model: this.models.strong, engine: 'free' };
      case 'work_hard': return claudeOk ? { llm: this.claude!, model: this.models.claude ?? 'claude', engine: 'claude' } : { llm: this.free, model: this.models.strong, engine: 'free' };
      case 'critical': return claudeOk ? { llm: this.claude!, model: this.models.claude ?? 'claude', engine: 'claude' } : { deferred: true };
    }
  }

  /** Parse "resets 7:40am (Asia/Seoul)" from a Claude limit message into epoch ms (next occurrence). */
  static parseReset(msg: string, now: number): number | null {
    const m = /resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(msg);
    if (!m) return null;
    let h = Number(m[1]) % 12; const min = Number(m[2] ?? 0);
    if ((m[3] ?? '').toLowerCase() === 'pm') h += 12; else if (!m[3]) h = Number(m[1]);
    const seoulNow = new Date(now + 9 * 3600_000);
    const t = Date.UTC(seoulNow.getUTCFullYear(), seoulNow.getUTCMonth(), seoulNow.getUTCDate(), h, min) - 9 * 3600_000;
    return t > now ? t : t + 86_400_000;
  }
}
