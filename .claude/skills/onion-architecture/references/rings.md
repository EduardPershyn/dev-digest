# Rings in detail

Palermo's tenets, applied to DevDigest:

1. The application is built around an independent domain model.
2. Inner layers define interfaces; outer layers implement them.
3. Coupling points toward the center.
4. The core compiles and runs without the infrastructure.

Graça's "Explicit Architecture" adds the ports & adapters vocabulary:
- **Driving (primary) adapters** call into the core: Fastify routes, job handlers, the CI runner.
- **Driven (secondary) adapters** are called by the core through ports: Drizzle repositories,
  `OctokitGitHubClient`, `SimpleGitClient`, LLM providers, `runBus`.

Drotbohm's "sliced onion" is why modules stay feature-first (`modules/<feature>/`), with rings
*inside* each slice rather than global `domain/`, `services/` folders.

## Ring by path

### Domain (center)
- `server/src/vendor/shared/contracts/*` — API/domain contracts (zod + inferred types).
  Zod is allowed in the core (team decision): contracts are both the domain vocabulary and
  the boundary parser.
- `server/src/vendor/shared/adapters.ts` — **port interfaces** (`LLMProvider`, `GitHubClient`,
  `GitClient`, `CodeIndex`, `Embedder`, `SecretsProvider`, `AuthProvider`). Interfaces are part
  of the core; their implementations are not.
- `modules/<f>/types.ts`, `constants.ts`, `helpers.ts`, and pure single-purpose files
  (`pulls/status.ts`, `pulls/findings-summary.ts`, `reviews/findings.ts` if pure).
- `reviewer-core/src/` — `prompt.ts`, `grounding.ts`, `review/*`, `output/*`, `llm/structured.ts`
  (pure helpers). The engine is a domain service: `reviewPullRequest(input, llm)` takes all data
  as arguments (Seemann's "impureim sandwich": the server reads, the engine decides, the server writes).
- `platform/errors.ts` — the `AppError` taxonomy (domain errors carry an HTTP status by
  convention here; acceptable because they are plain classes with no framework import).

### Application
- `modules/<f>/service.ts` — one class per feature; one public method per use case.
- `modules/<f>/ports.ts` — module-private ports (store interfaces, unit of work).
- Orchestrators: `reviews/run-executor.ts`, `repo-intel/pipeline/*` — they sequence
  ports and pure steps. Same rules as `service.ts`.
- `platform/model-router.ts`, `platform/price-book.ts` — application services shared across modules.

### Infrastructure
- `modules/<f>/repository.ts`, `modules/<f>/repository/*.repo.ts`.
- `src/db/**` — schema, client, migrations, seed, `rows.ts` (row types).
- `src/adapters/**` — one folder per technology.
- `platform/jobs.ts` (JobRunner on Postgres), `platform/sse.ts` (`runBus`), `platform/run-logger.ts`,
  `platform/config.ts`, `platform/contained-read.ts`.
- `reviewer-core/src/llm/openrouter.ts` — fenced adapter: may import `openai`; only `index.ts`
  may import it; consumers receive it as `LLMProvider`.

### Delivery
- `modules/<f>/routes.ts` — Fastify plugin = HTTP adapter + module-level wiring.
- `modules/_shared/context.ts`, `modules/_shared/schemas.ts` — request context + common params.
- `modules/index.ts` — module registry.

### Composition root
- `src/app.ts`, `src/server.ts`, `src/platform/container.ts`.

## Classifying a new file

Ask in order:
1. Does it import a DB/SDK/framework, touch the filesystem or network? → infrastructure
   (or delivery if it's an HTTP/SSE/job entry point).
2. Does it sequence calls to ports, own a transaction or decide what to persist? → application.
3. Otherwise (input → output, no side effects) → domain.

If a file is *both* (e.g. `reviews/diff-loader.ts` fetches a diff and parses it), split it:
the parser is domain, the fetch is an adapter call made from the service.

## Known misplacements (in the baseline — fix when touched)

| File | Problem | Target |
|---|---|---|
| `pulls/routes.ts`, `polling/routes.ts`, `workspace/routes.ts`, `settings/routes.ts` | Drizzle queries in routes | repository + service per module |
| `settings/feature-models.ts` | DB query + `Container` in a helper | `settings/repository.ts` + service |
| `repos/helpers.ts`, `agents/helpers.ts`, `reviews/helpers.ts` | import row types / repository | repository maps rows → domain types; helpers take domain types |
| `*/service.ts` (agents, repos, reviews, repo-intel) | take `Container`, `new XRepository(container.db)` | constructor `deps` of ports |
| `reviews/run-executor.ts`, `reviews/diff-loader.ts` | schema/rows/`Container` imports | ports; parsing moved to domain |
| `repo-intel/service.ts`, `repo-intel/pipeline/*` | import concrete `adapters/astgrep`, `adapters/codeindex/extract`, `adapters/tokenizer`; cycle through `container.ts` | inject ports (`DepGraph`, `Tokenizer`, an extractor port); pure extractors may move to domain |
| `reviews/diff-loader.ts` → `adapters/git/diff-parser.ts` | pure parser lives in adapters | move parser to a domain location (e.g. `@devdigest/shared` or `reviews/`) |
