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

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

_None yet._

## Session Notes

_None yet._

## Open Questions

- **2026-11-19** — In `test/reviews.it.test.ts` "run all enabled agents…", calling
  `waitForPrRuns(db, prId)` (no `expected`) runs until its 10s timeout: the seeded agents
  runs never all reach a terminal status under the mocks. Cause not investigated; that test
  deliberately does not wait. Ref: `server/test/helpers/runs.ts`
