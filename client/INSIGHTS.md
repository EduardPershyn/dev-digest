# Insights — client

Findings specific to `client/`.
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

- **2026-11-19** — Component tests pass `NextIntlClientProvider` ONLY the namespaces they
  import (e.g. `messages={{ prReview: messages }}`). A shared component calling
  `useTranslations("<other ns>")` (like `RunCostBadge` → `common`) needs that namespace added
  to every consumer test too. Why: there is no global i18n test wrapper; messages are imported
  per test file. Ref: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx`

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

_None yet._

## Session Notes

_None yet._

## Open Questions

_None yet._
