# server/ — @devdigest/api

Fastify API + Postgres. Imports repos/PRs, indexes repos (repo-intel), stores agents,
runs reviews through `../reviewer-core`. Root map: `../CLAUDE.md`.

## Stack
Fastify 5.12 · fastify-type-provider-zod · drizzle-orm 0.45 / drizzle-kit 0.31 ·
postgres 3.4 · zod 3.25 · tsx · vitest 2.1 · testcontainers · pgvector (pg16)

## Commands (pnpm)
- dev `pnpm dev` (:3001) · types `pnpm typecheck` · build `pnpm build`
- architecture `pnpm lint:arch` (dependency-cruiser; legacy violations baselined — never grow the baseline)
- unit `pnpm exec vitest run --exclude '**/*.it.test.ts'` (no Docker)
- integration `pnpm exec vitest run .it.test` (needs Docker)
- DB: edit `src/db/schema/*` → `pnpm db:generate` → `pnpm db:migrate` · `pnpm db:seed` (idempotent)

## Conventions (non-default)
- Onion Architecture (skill `onion-architecture`): a feature is a FLAT
  `src/modules/<name>/{routes,service,ports,repository,helpers,types,constants}.ts`,
  registered once in `src/modules/index.ts`. File name = ring; `pnpm lint:arch` checks imports.
- Validate via zod `schema: { params, body }` on the route — never hand-parse `req.body`.
- Services receive narrow ports via constructor `deps`; `routes.ts` builds them from
  `app.container`. Services never see `Container`, Drizzle or SDKs, never `new` adapters.
  Route tests inject mocks through `ContainerOverrides` (`src/adapters/mocks.ts`).
- Services/helpers type persisted entities with records from `src/modules/_shared/records.ts`,
  never `db/rows.ts`/`$inferSelect`; `db/rows.ts` asserts row ≡ record, so a column change
  must update the record too.
- Throw `AppError` subclasses (`src/platform/errors.ts`); the global handler shapes the envelope.
- ESM: relative imports end in `.js`.

## Gotchas
- Any test importing `test/helpers/pg.ts` MUST be named `*.it.test.ts`, or the CI split breaks.
- The schema already holds every milestone's tables. Empty tables are planned, not dead code.
- Secrets go through `SecretsProvider` only — not `process.env` directly, never the DB.
- Reviews are fire-and-forget after `POST /pulls/:id/review`; progress flows over the SSE `runBus`.
- Boot reaps `running` agent_runs — assumes ONE API instance per DB.

## Do not touch
- Existing files in `src/db/migrations/**` — add new migrations, never edit old ones.

## Read when
- Adding/changing any module, route, service, repository, adapter or job → `onion-architecture` skill
- Adding/changing a route, env var, or prompt context → `README.md`
- Touching indexing, repo map, file rank, callers → `src/modules/repo-intel/README.md`
- Changing the engine call in `src/modules/reviews/run-executor.ts` → `../reviewer-core/README.md`
- Adding tests → `../TESTING.md`
- Before starting → `INSIGHTS.md` · planned work → `specs/` · deeper docs → `docs/`
