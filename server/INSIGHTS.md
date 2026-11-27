# Insights — server

Findings specific to `server/`, including `src/modules/repo-intel/`.
Cross-module lessons go in `../INSIGHTS.md`.

Written by the `engineering-insights` skill (`../.claude/skills/engineering-insights/`).
**Append-only:** add one bullet to the end of a section; never reword or delete. Pruning is
a human review step. Entry format:

```
- **YYYY-MM-DD** — <specific fact and what to do>. Why: <cause>. Ref: `path:line`
```

## What Works

- **2026-11-25** — Integration tests that need a stubbed repo-intel answer can pass
  `overrides.repoIntel: { getConventionSamples: async () => [...] } as unknown as RepoIntel`
  together with a temp-dir clone (`repos.clone_path`), because the conventions routes call
  only that method. A review run on the same DB needs a **second** `buildApp` without the
  stub, since the executor calls other `RepoIntel` methods. Ref: `server/test/conventions.it.test.ts`
- **2026-11-27** — To queue an exact N-agent batch in an integration test, set
  `agents.enabled = false` for the whole workspace, create the N agents via `POST /agents`, then
  `POST /pulls/:id/review { all: true }`. Why: `all` runs every enabled agent in the workspace,
  including the seeded ones on `openrouter`, which in `reviews-intent.it` is the intent-classifier
  mock, so they would add review calls to that mock and extra runs. `agentId` queues one agent per batch, so it
  cannot test shared pre-work. Ref: `server/test/reviews-intent.it.test.ts` (`setupTwoAgents`)

## What Doesn't Work

_None yet._

## Codebase Patterns

- **2026-11-19** — A "review batch" (one `POST /pulls/:id/review`) is only identifiable via
  `agent_runs.batch_id` (set by `ReviewService.runReview`); `ran_at` differs per row because
  each `createAgentRun` insert gets its own `defaultNow()`. Rows from before migration `0010`
  have `batch_id = null`. Group by `batch_id`, never by timestamp. Ref:
  `server/src/modules/reviews/service.ts` (`runReview`), `server/src/modules/pulls/routes.ts`
- **2026-11-20** — The PR-list `cost_usd` (`GET /repos/:id/pulls`) is the lifetime total over
  ALL of a PR's `agent_runs` (one `sum(cost_usd) … GROUP BY pr_id`), not the latest batch.
  `batch_id` is still written but nothing reads it any more, so don't reintroduce batch logic
  there. `null` means no run has cost data. Why: the user reads the column as "money spent on
  this PR". Ref: `server/src/modules/pulls/routes.ts`, `specs/M1-cost-badge.md` (Revised)
- **2026-11-20** — The PR-list `findings` (`GET /repos/:id/pulls`) uses a DIFFERENT selection
  rule from `score` and `cost_usd`: open findings of the LATEST `reviews` row per `agent_id`
  (null agent = one legacy group), `dismissed_at IS NULL`. `score` = latest review of any
  agent; `cost_usd` = all runs. Don't "unify" them without a spec change. Why: user decision —
  re-runs replace an agent's findings, different agents add up. Ref:
  `server/src/modules/pulls/findings-summary.ts`, `specs/pr-list-findings.md`

- **2026-11-23** — Onion records pattern: persisted-entity shapes for services/helpers live in
  `src/modules/_shared/records.ts`; repositories keep returning Drizzle rows (structurally equal)
  and `src/db/rows.ts` holds compile-time `Same<Row, Record>` assertions. After a migration that
  changes `repos`/`agents`/`agent_versions`/`pull_requests`/`pr_files`/`reviews`/`findings`,
  `pnpm typecheck` fails in `db/rows.ts` until the record is updated — that is intended.
  Ref: `server/src/db/rows.ts`
- **2026-11-24** — `runOneAgent` calls `completeAgentRun(status: 'done')` BEFORE
  `saveRunTrace`, so a test that waits with `waitForPrRuns` and then reads `run_traces`
  can find no row yet. Poll for the trace row after the run is done.
  Ref: `server/src/modules/reviews/run-executor.ts`, `server/test/skills.it.test.ts`
- **2026-11-27** — `Container.intentService` is ONE cached instance on purpose: the intent
  routes and the reviews pre-work (via the reviews-owned `IntentProvider` port) must share
  its per-PR in-flight promise map. Don't build a second `IntentService` in a `routes.ts`.
  The container has no logger, so the classification log line uses the per-call `log`
  (`req.log` / the run's logger). Ref: `server/src/platform/container.ts` (`intentService`),
  `server/src/modules/intent/service.ts`

## Tool & Library Notes

- **2026-11-23** — dependency-cruiser: listing `node_modules` in `options.exclude` drops
  those edges from the graph entirely, so `forbidden` rules with `to: node_modules/<sdk>/`
  silently never fire. Keep `node_modules` only in `options.doNotFollow`, and prove a new
  rule fires with a throwaway violating file before trusting a green run.
  Why: exclude removes modules from the cruise; doNotFollow only stops descent.
  Ref: `server/.dependency-cruiser.cjs`
- **2026-11-24** — In a full `pnpm test` run every `*.it.test.ts` was skipped with "Docker
  not available" although `docker info` worked in the shell; the same files passed when run
  alone (`pnpm exec vitest run skills.it`). Likely `dockerAvailable()`'s 5 s `docker info`
  timeout under parallel load (not proven). Run integration files on their own before
  trusting a "skipped". Ref: `server/test/helpers/pg.ts` (`dockerAvailable`)
- **2026-11-27** — From Claude Code's sandboxed Bash, `docker info` hangs, so every
  `*.it.test.ts` self-skips ("Docker not available") although Docker works. Run the
  integration files with the sandbox disabled; then `pnpm exec vitest run intent.it` etc. pass
  (Testcontainers starts fine). Why: the sandbox blocks `/var/run/docker.sock`.
  Ref: `server/test/helpers/pg.ts` (`dockerAvailable`)

## Recurring Errors & Fixes

_None yet._

## Session Notes

- **2026-11-20** — PR-list FINDINGS column: `PrMeta.findings` (`PrFindingsSummary`, both
  contract copies) built in the list handler from two IN-queries + pure helpers
  (`latestReviewIdsPerAgent`, `summarizeFindings`). Integration test seeds `reviews`/`findings`
  rows directly with explicit `createdAt` instead of running agents — faster and deterministic
  ordering (`reviews.agent_id` has no FK, so random UUIDs work). Ref: `server/test/reviews.it.test.ts`

- **2026-11-23** — Added the `onion-architecture` skill (`.claude/skills/onion-architecture/`)
  and its enforcement: `server/.dependency-cruiser.cjs` (cruises `src` + `../reviewer-core/src`),
  `pnpm lint:arch` / `lint:arch:baseline`, baseline of 40 legacy violations in
  `server/.dependency-cruiser-known-violations.json`. Decisions: flat modules (file name =
  ring), zod allowed in domain, keep hand-written Container but inject ports into services,
  `reviewer-core/src/llm/` is the fenced adapter area. Ref: `server/CLAUDE.md` Conventions

- **2026-11-23** — Applied the onion rules to all modules (lint:arch baseline 40 → 0, still
  210/210 server tests): every module has ports/repository/service with `build<X>Service(c)`
  wiring in routes.ts; job handlers registered + zod-parsed in routes (`CloneJobPayload`,
  `IndexJobPayload`); `diff-parser` moved to `platform/`; repo-intel owns `SourceParser`/
  `DepGraph`/`Tokenizer`/`RepoIntelStore` ports, wired by `container.repoIntelDeps()`;
  feature-models now take `container.settingsRepo`. Note: `vitest` does not type-check —
  `test/` has 15 pre-existing tsc errors (adapters, prompt-callers, facade-degraded,
  settings-test-connection, agents-versions) unrelated to this change. Ref: `server/src/modules/`
- **2026-11-24** — M2 skills backend (spec `specs/M2-skills.md`): `modules/skills`
  (CRUD + versions + stateless import preview), `adapters/archive/zip.ts` (fflate streaming:
  list headers, inflate only the core `.md`, byte-capped), migration `0011_m2_skills`
  (`agent_skills.enabled`, unique `(workspace_id, name)`, full-text snapshots), `PUT
  /agents/:id/skills` (transactional replace + agent version bump), executor feeds
  `SkillResolver.enabledForAgent` into the engine and adds tiktoken counts to
  `prompt_assembly.skill_blocks`. Seed adds Test Quality + API Contract reviewers and 4 skills.
- **2026-11-27** — M3 intent layer backend, WI-1..WI-10 of
  `specs/M3-intent-layer/plans/2026-11-27-intent-layer.md`: `modules/intent`
  (references / helpers / service / repository / routes), migration `0013_intent_layer`
  (ADD COLUMN only; drizzle-kit's random file name was renamed together with the journal
  `tag`), `GitHubClient.getFileContent`, reviews pre-work "Resolving PR intent" +
  `trace.intent` / `trace.scope_filter` / `prompt_assembly.intent_block`, seeded PR #482
  intent. Removed the dead `ReviewStore.upsertIntent/getIntent`. Verified: server 265 unit,
  every `*.it.test.ts` file alone (incl. new `intent.it`, `reviews-intent.it`), typecheck,
  lint:arch; reviewer-core 54; client typecheck. Not done here: client UI, e2e (WI-11..13),
  a live DeepSeek call with `require_parameters`.

## Open Questions

- **2026-11-19** — In `test/reviews.it.test.ts` "run all enabled agents…", calling
  `waitForPrRuns(db, prId)` (no `expected`) runs until its 10s timeout: the seeded agents
  runs never all reach a terminal status under the mocks. Cause not investigated; that test
  deliberately does not wait. Ref: `server/test/helpers/runs.ts`
- **2026-11-27** — Since M3 every review of a PR without a fresh intent asks the
  `review_intent` model (default **openrouter**) first. `loadConfig` loads `server/.env` via
  `dotenv`, and `LocalSecretsProvider` falls back to `process.env`, so an integration test that
  runs a review WITHOUT `overrides.llm.openrouter` would make a real, paid OpenRouter call when
  `server/.env` has a key. The M3 run executed the IT files with `OPENROUTER_API_KEY=` (intent
  then fails with ConfigError and the review proceeds). Decide whether the test config should
  blank provider keys. Ref: `server/src/platform/config.ts:1`, `server/test/skills.it.test.ts`
- **2026-11-27** — Answers the question above. Tests now build the app with `buildTestApp` from
  `test/helpers/app.ts`, never `buildApp` from `../src/app.js`. It defaults
  `overrides.secrets` to an empty `MockSecretsProvider`, so a provider or GitHub client a test
  didn't inject fails with `ConfigError`. Without it, the test would use the real key from
  `server/.env` or `~/.devdigest/secrets.json`. `test/hermetic-app.test.ts` fails if a test file
  imports the raw `buildApp`. Pass your own `secrets`/`llm` when a test needs a key or model.
  Still open: whether `loadConfig`/the container should refuse real keys when `NODE_ENV=test`.
  Ref: `server/test/helpers/app.ts`
- **2026-11-27** — `splitBlobRef` rejects only WHOLE `..` segments, but `classifyUrl` decodes
  each segment AFTER splitting on `/`, so `…/blob/main/docs%2F..%2F..%2Fsecret.md` yields path
  `docs/../../secret.md` (verified with a throwaway test). WHATWG `URL` already collapses
  `%2e%2e` segments, so the encoded slash is the only way in. Unfixed; the read stays in the same
  repo. Ref: `server/src/modules/intent/references.ts:102` (`safeDecode`), `:213`
