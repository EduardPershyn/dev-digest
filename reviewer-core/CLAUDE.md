# reviewer-core/ — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → grounded findings. Consumed as TypeScript
source by the server via a path alias. Root map: `../CLAUDE.md`.

## Stack
TypeScript 5.7 · zod 3 · openai SDK 4 (OpenRouter provider) · vitest 2.1

## Commands (npm)
- test `npm test` (stubbed LLM, no keys) · types `npm run typecheck`
- `build` is only a type-check — the package never emits JS.

## Conventions (non-default)
- Stays pure: no DB, filesystem, GitHub, or server imports. The only side effect is the
  injected `LLMProvider`. I/O belongs to the caller (`server/src/modules/reviews/run-executor.ts`).
- Imports only `@devdigest/shared`, which resolves to `../server/src/vendor/shared`.
- Public API is whatever `src/index.ts` exports; add new exports there.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`, `repoMap`) are omitted when
  empty — keep that "omit-when-empty" contract for new slots.

## Gotchas
- Never bypass `groundFindings` (`src/grounding.ts`) or trust the model's score — the score is
  recomputed from surviving findings.
- Prompt-injection defense is the shared `INJECTION_GUARD` in `src/prompt.ts`. Do not add
  keyword denylists over untrusted text.
- Untrusted content (diff, PR body, repo map) must go through `wrapUntrusted`.

## Read when
- Changing prompt assembly, strategy, structured output, or grounding → `README.md`
- Changing what the server feeds in → `../server/README.md` (Review context)
- Before starting → `INSIGHTS.md` · planned work → `specs/` · deeper docs → `docs/`
