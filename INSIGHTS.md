# Insights — cross-module

Findings that span more than one package, or concern `scripts/`, `docs/`, `.github/` or
`docker-compose.yml`. Module-specific lessons go in `<module>/INSIGHTS.md`.

Written by the `engineering-insights` skill (`.claude/skills/engineering-insights/`).
**Append-only:** add one bullet to the end of a section; never reword or delete. Pruning is
a human review step. Entry format:

```
- **YYYY-MM-DD** — <specific fact and what to do>. Why: <cause>. Ref: `path:line`
```

## What Works

_None yet._

## What Doesn't Work

- **2026-11-19** — Don't reset with `docker compose down -v` for a clean test DB; it deletes
  the `devdigest_pgdata` volume with every imported repo. Use `./scripts/e2e.sh` (isolated
  Postgres). Why: README's reset advice predates people running the studio on real repos.
  Ref: `README.md` (Troubleshooting), `e2e/README.md` (promoted)

## Codebase Patterns

- **2026-11-19** — The two `@devdigest/shared` copies have diverged (`adapters.ts`,
  `contracts/eval-ci.ts`, `knowledge.ts`, `productionize.ts`, `trace.ts`); a contract change
  touches both, and reviewer-core reads the server copy. Why: contracts are vendored per
  package (no workspace), and edits landed in one copy only.
  Ref: `diff -rq client/src/vendor/shared server/src/vendor/shared` (promoted)

## Tool & Library Notes

- **2026-11-24** — `cd server && pnpm typecheck` also compiles `reviewer-core/src` through
  path aliases, so it needs `reviewer-core/node_modules` too. Without them it reports ~8
  false TS2307 errors ("Cannot find module 'openai' / 'zod'") in `reviewer-core/src/llm/*`.
  Why: no workspace, so deps resolve per package dir. Ref: `.claude/skills/pr-self-review/scripts/lib/checks.mjs` (`needs`)
- **2026-11-24** — Node 22's `node --test <directory>` fails with MODULE_NOT_FOUND. Pass the
  file (`node --test .claude/skills/pr-self-review/scripts/gate.test.mjs`) or a glob instead.

## Recurring Errors & Fixes

_None yet._

## Session Notes

- **2026-11-19** — M1 run cost badge shipped (spec `specs/M1-cost-badge.md`): the engine already
  returned `outcome.costUsd`, but `run-executor.ts` dropped it. It is now persisted as
  `agent_runs.cost_usd` + `trace.stats.cost_usd`, and shown in the PR-list Cost column (latest
  batch), on timeline rows and in the drawer Cost tile via `client/src/components/run-cost-badge`.
  Failed/cancelled runs stay `null` (partial spend is an open question in the spec). (superseded 2026-11-20)
- **2026-11-20** — PR-list Cost column changed from "latest review batch" to "sum of ALL review
  runs of the PR" (spec revised first, then `pulls/routes.ts` → SQL `GROUP BY pr_id`). Failed
  runs add nothing and no longer blank the column. The list badge has its own tooltip
  (`RunCostBadge` `tooltip` prop, `prReview.json` `list.costTooltip`). Timeline and drawer
  costs stay per run.

- **2026-11-24** — Added the manual `/pr-self-review` skill (spec `specs/pr-self-review.md`):
  `routing.json` maps skills to globs and content regexes, `scripts/gate.mjs` does scope,
  slices, repo checks, grounding and the verdict, and the agent only spawns reviewer and
  verifier subagents. Checked on fixtures: a docs-only diff is READY; a domain `helpers.ts`
  importing `db` is NOT READY via `lint:arch` and the onion reviewer. Local `main` here was
  10 commits ahead of `origin/main`, which inflates the default (origin) PR diff. The report
  notes this; use `--base-ref main` to review only the branch.

## Open Questions

_None yet._
