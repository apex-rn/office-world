# Office World — session rules

- Read `docs/PROGRESS.md` first, then only the needed section of `docs/WORLD_PLAN.md`. On the server, query the graphify graph (`~/kb`) before opening many files.
- One concrete task per session. Run `npm test` and `npx tsc --noEmit` before committing. Update `docs/PROGRESS.md` before the session or limit ends.
- Invariants (never break): real dimensions from `packages/catalog` (validator must stay at 0 issues); the brain never moves bodies directly, only through the Body API in `packages/sim/src/world.ts`; identity lives outside the model; no scripted loops.
- Talk to the owner (Boss) in Uzbek. Code and identifiers in English.
- Never commit secrets (`.env`, keys, FreeLLM key, SSH keys).
