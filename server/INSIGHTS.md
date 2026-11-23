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

_None yet._

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

## Tool & Library Notes

- **2026-11-23** — dependency-cruiser: listing `node_modules` in `options.exclude` drops
  those edges from the graph entirely, so `forbidden` rules with `to: node_modules/<sdk>/`
  silently never fire. Keep `node_modules` only in `options.doNotFollow`, and prove a new
  rule fires with a throwaway violating file before trusting a green run.
  Why: exclude removes modules from the cruise; doNotFollow only stops descent.
  Ref: `server/.dependency-cruiser.cjs`

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

## Open Questions

- **2026-11-19** — In `test/reviews.it.test.ts` "run all enabled agents…", calling
  `waitForPrRuns(db, prId)` (no `expected`) runs until its 10s timeout: the seeded agents
  runs never all reach a terminal status under the mocks. Cause not investigated; that test
  deliberately does not wait. Ref: `server/test/helpers/runs.ts`
