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

_None yet._

## Recurring Errors & Fixes

_None yet._

## Session Notes

_None yet._

## Open Questions

_None yet._
