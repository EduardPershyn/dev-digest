# Insights — e2e

Findings specific to `e2e/`.
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

_None yet._

## Tool & Library Notes

- **2026-11-25** — `agent-browser wait --text X` polls `document.body.innerText.includes(X)`:
  case-sensitive, and `innerText` applies CSS, so text under `textTransform: "uppercase"`
  (section labels, `SectionLabel`, `SeverityBadge`) never matches its i18n string. `08-skills`
  timed out on `wait --text "Attached to"` (rendered "ATTACHED TO"). Wait for text that is not
  transformed. Ref: vercel-labs/agent-browser `cli/src/native/actions.rs` (~L9855)

## Recurring Errors & Fixes

_None yet._

## Session Notes

_None yet._

## Open Questions

_None yet._
