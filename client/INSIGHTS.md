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
- **2026-11-20** — Anything floating over the PR list (popover, menu) must be portalled to
  `document.body` with `position: fixed` from the trigger's rect: the table card
  (`tableCard` in `pulls/styles.ts`) is `overflow: hidden` and clips it. Clicks inside the
  portal still bubble to `PRRow`'s `onClick` (React events follow the component tree, not
  the DOM) and open the PR — intended here, `stopPropagation` if not. Ref:
  `client/src/app/repos/[repoId]/pulls/_components/FindingsCell/FindingsCell.tsx`

## Tool & Library Notes

- **2026-11-20** — `pnpm exec vitest run "src/app/repos/[repoId]/..."` reports `No test files
  found`: the positional filter mangles the `[repoId]`/`[number]` brackets. Filter by a plain
  name fragment instead (`pnpm exec vitest run FindingsPanel`). Why: Vitest treats the
  argument as a pattern, not a literal path. Ref: `client/vitest.config.ts`

## Recurring Errors & Fixes

- **2026-11-20** — Importing a VALUE from `@devdigest/shared` (e.g. `Severity.options`) makes
  the page 500 in `next dev` with `Module not found: Can't resolve './contracts/findings.js'`,
  while `pnpm test` and `pnpm typecheck` stay green. Fix: client code imports the barrel with
  `import type` only; mirror any needed enum as a local `as const` tuple guarded by a type
  check + a Vitest test against the contract value (Vitest CAN import it). Why: the barrel
  uses NodeNext `.js` specifiers; Vite maps them to `.ts`, Next's webpack has no
  `extensionAlias`. Ref: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/constants.ts`

## Session Notes

- **2026-11-20** — Severity counters + single-select filter in each review run's
  `FindingsPanel` (`specs/severity-filter.md`). Counters follow *Hide low confidence* so
  "click N → see N"; zero levels render disabled; filter state is per panel (resets on
  collapse). Verified by 12 new tests and a headless-Chrome pass over CDP on a real run (no
  API calls on click). Headless check recipe: `google-chrome --headless=new
  --remote-debugging-port=…` + Node 22's built-in `WebSocket` — no extra deps needed.
  Ref: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/`
- **2026-11-20** — PR-list FINDINGS column + hover/focus popover (`specs/pr-list-findings.md`).
  `SEVERITY_LEVELS` now lives in `client/src/lib/severity.ts` (FindingsPanel re-exports it).
  Headless-Chrome hover check caught two layout bugs jsdom can't (stacked badge/title, a
  horizontal scrollbar) — screenshot popovers, don't trust RTL alone for layout. The PR list
  defaults to `?status=needs_review`, so reviewed PRs are hidden: open
  `/repos/<id>/pulls?status=all` (or click "All") when checking a reviewed PR. Ref:
  `client/src/app/repos/[repoId]/pulls/_components/FindingsCell/`

## Open Questions

- **2026-11-20** — `FindingCard` logs a React warning ("Updating a style property during
  rerender (borderColor) when a conflicting property is set (borderLeftColor)") every time
  the focused card changes — reproduced with a bare `j` keypress. Likely fix: replace
  `borderColor` with per-side `borderTop/Right/BottomColor`. Not fixed (out of scope of
  `specs/severity-filter.md`). Ref: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:10`
