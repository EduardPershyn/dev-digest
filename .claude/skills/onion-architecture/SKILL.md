---
name: onion-architecture
description: "Enforces Onion Architecture (dependencies point inward: domain → application → infrastructure/delivery) in the DevDigest backend — server/src and reviewer-core/src. Use whenever you add or change a backend feature module, Fastify route, service/use case, Drizzle repository or query, adapter for an external service (LLM, GitHub, git, ripgrep, embeddings), background job, SSE event, or anything in reviewer-core; when deciding where a piece of backend code belongs; when a `pnpm lint:arch` (dependency-cruiser) check fails; and when reviewing or refactoring backend code for layering, coupling, testability or 'clean/hexagonal/ports-and-adapters' concerns — even if the user never says 'onion'."
metadata:
  tags: architecture, onion, hexagonal, ports-and-adapters, clean-architecture, fastify, drizzle, zod, dependency-cruiser
---

# Onion Architecture — DevDigest backend

## The one rule

**Source-code dependencies point inward only.** Inner rings define what they need as
interfaces (ports); outer rings implement them (adapters) and are wired together in one
place (the composition root). The core must compile and be testable with no Postgres,
no Fastify, no network.

Why it matters here: DevDigest swaps LLM vendors, runs the same engine in the studio and
in CI, and tests reviews without keys or Docker. That only works while business logic
doesn't know which database, HTTP framework or SDK sits around it.

## Ring map (flat module layout)

Modules stay **flat** — `src/modules/<feature>/*.ts`, no ring sub-folders. The *file
name* says which ring a file is in, and `pnpm lint:arch` checks imports by file name.

| Ring (inner → outer) | Files | May import | Must not import |
|---|---|---|---|
| **Domain** — types, invariants, pure rules | `types.ts`, `constants.ts`, `helpers.ts`, other pure files (`status.ts`, `findings-summary.ts`); `modules/_shared/records.ts` (entity records); `@devdigest/shared` contracts; all of `reviewer-core/src` except `llm/` | other domain files, `@devdigest/shared`, `zod`, `platform/errors.ts` | `service`/`repository`/`routes`, `db/`, `adapters/`, `container`, Fastify, Drizzle, SDKs, `node:fs`/network |
| **Application** — use cases, ports, transaction boundary | `service.ts`, `ports.ts`, `modules/_shared/ports.ts` (`JobQueue`, `WarnLogger`), orchestrators like `run-executor.ts`, `repo-intel/pipeline/*` | domain, own `ports.ts`, port interfaces from `@devdigest/shared` | `db/` (schema, rows, client), `drizzle-orm`, Fastify, `container`, concrete `adapters/*`, SDKs |
| **Infrastructure** — persistence & vendor adapters | `repository.ts`, `repository/*.repo.ts`; `src/adapters/**`; `src/db/**`; `reviewer-core/src/llm/` (fenced) | anything inward + its own tech (Drizzle, SDK) | `routes.ts`, other modules' internals |
| **Delivery** — driving adapters + module wiring | `routes.ts` (HTTP, SSE endpoints, job-handler registration) | application, domain, `container`, `_shared/context.ts` | `db/`, `drizzle-orm`, SDKs |
| **Composition root** | `src/app.ts`, `src/platform/container.ts` | everything | — (no business logic here) |

`src/platform/` is the shared kernel: `errors.ts` is usable everywhere; `jobs.ts`,
`sse.ts`, `run-logger.ts` are infrastructure — inner rings use them only through a type
(`Pick<JobRunner, 'enqueue'>`) or a port. Full classification of every existing odd file:
`references/rings.md`.

## Where does this code go?

| You are writing… | Put it in | Notes |
|---|---|---|
| A SQL / Drizzle query, `$inferSelect` row type, pgvector search | `repository.ts` behind a port in `ports.ts` | the port speaks records (`_shared/records.ts`) / plain types, never row types |
| A business rule, status calculation, score, filter | `helpers.ts` / a pure domain file | pure function; input → output |
| "Load X, decide, save Y, call GitHub" | a method on `service.ts` | depends only on ports passed to its constructor |
| A call to GitHub / git / an LLM / embeddings / ripgrep | adapter in `src/adapters/<tech>/`, port in `@devdigest/shared/adapters.ts` (or module `ports.ts` if private to one module) | services never import an SDK |
| Request parsing, status codes, SSE streaming | `routes.ts` | zod `schema:` on the route; one service call per handler |
| A background job body | service method; registration + payload parsing in `routes.ts` | payload is `unknown` → parse with zod first |
| Constructing a repository/adapter/service | `build<Feature>Service(c)` in `routes.ts`; a `Container` getter if shared (`agentsRepo`, `reviewRepo`, `settingsRepo`, `repoIntelDeps()`) | never inside a service |
| A new review-engine step | `reviewer-core/src/**` as a pure function | the only side effect is the injected `LLMProvider` |

## Workflow for a new or changed backend feature

1. **Domain first.** Write or reuse the types (API shapes: `@devdigest/shared` contracts;
   persisted entities: `modules/_shared/records.ts`; module-internal: `types.ts`) and the
   pure rules in `helpers.ts`. Unit-test them directly. A new table that services read
   gets a record + a drift assertion in `db/rows.ts`.
2. **Ports next.** In `ports.ts`, declare the interface the use case needs, in domain
   language (`findOpenByRepo(workspaceId, repoId): Promise<PullRequest[]>`, not
   `select().from(pullRequests)`). External-service ports shared across modules go in
   `@devdigest/shared/adapters.ts` — **both copies** (`server/src/vendor/shared` and
   `client/src/vendor/shared`) if the contract is client-visible.
3. **Use case.** `service.ts` gets a `<Feature>ServiceDeps` object of ports in its
   constructor. It owns the transaction boundary and throws `AppError` subclasses.
4. **Adapters.** `repository.ts` implements the store port with Drizzle and maps rows to
   domain types; vendor adapters go in `src/adapters/`. → `references/drizzle-postgres.md`,
   `references/external-adapters.md`
5. **Delivery + wiring.** `routes.ts` builds the service from `app.container` in one
   `build<Feature>Service()` function, validates with zod, calls the service, maps the
   result. → `references/fastify.md`, `references/jobs-and-sse.md`
6. **Tests.** Service tests use in-memory fakes of the ports (no Docker). Repository
   tests are `*.it.test.ts` against real Postgres. → `references/testing.md`
7. **Check.** `cd server && pnpm lint:arch && pnpm typecheck`. A new violation means the
   code is in the wrong ring — move it, don't baseline it. → `references/enforcement.md`

Steps 1–3 come before 4–5 on purpose: writing the adapter first is how DB shapes leak
into business code.

## The baseline

`server/.dependency-cruiser-known-violations.json` is **empty** — every module was brought
to the standard on 2026-11-23. Keep it that way:

- **Never add to it.** Don't run `pnpm lint:arch:baseline` to make your own change pass;
  move the code to the right ring instead.
- If a rule genuinely blocks a correct design, change the rule (with a reason in its
  `comment`) and say so to the user — don't baseline around it.
- Reference implementations: `repos` (small, jobs), `pulls` (GitHub + read aggregates),
  `reviews` (cross-module port `AgentDirectory`, executor), `repo-intel` (adapter ports).

## Review checklist

When reviewing or finishing backend work, check:

- [ ] No `drizzle-orm`, `src/db/*` or row types outside `repository*` files.
- [ ] No Fastify types outside `routes.ts` / `_shared/context.ts`.
- [ ] Services receive ports via constructor; no `Container`, no `new SomeAdapter()`, no SDK imports.
- [ ] Repositories return domain types; `$inferSelect` rows don't escape.
- [ ] Every boundary input is parsed with zod: route `schema`, job payload, LLM output, env.
- [ ] Business invariants live in domain code, not in zod refinements or SQL constraints only.
- [ ] Multi-write use cases run in one transaction owned by the service (unit of work).
- [ ] reviewer-core: no server imports except `@devdigest/shared`; `openai` only in `src/llm/`; no I/O.
- [ ] New port has a fake for unit tests; new adapter has an integration/contract test.
- [ ] `pnpm lint:arch` green without growing the baseline.

## Related skills (don't duplicate them)

- `fastify-best-practices` — plugin, hook, schema and error-handler mechanics.
- `drizzle-orm-patterns` / `postgresql-table-design` — how to write the query/schema *inside* the repository.
- `zod` — schema authoring details.
- `typescript-expert` — type-level tricks for ports and mappers.
- `engineering-insights` — record a confirmed layering finding in the module's `INSIGHTS.md`.

## Reference files (read when relevant)

| File | Read when |
|---|---|
| `examples.md` | Writing a route/service/repository — good vs. bad, from real DevDigest code |
| `references/rings.md` | Unsure which ring an existing or new file belongs to |
| `references/fastify.md` | Touching `routes.ts`, plugins, decorators, error mapping, module wiring |
| `references/drizzle-postgres.md` | Writing a repository, mapper, transaction or pgvector query |
| `references/zod-boundaries.md` | Parsing input/output at any boundary; contract vs. invariant |
| `references/external-adapters.md` | LLM, GitHub, git, codeindex, embeddings, tokenizer; reviewer-core purity |
| `references/jobs-and-sse.md` | Background jobs, `runBus`, progress events |
| `references/testing.md` | Writing unit/integration tests for any ring |
| `references/enforcement.md` | A `lint:arch` rule fails, or you change the rules |
| `sources.md` | Need the rationale/source behind a rule |
