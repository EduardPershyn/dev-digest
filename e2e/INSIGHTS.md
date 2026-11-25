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
- **2026-11-25** — `agent-browser find text X click` only considers **leaf** elements
  (`children.length === 0`) whose `textContent` includes X, so it cannot click a link or
  button that also holds an icon (`<a><svg/>Name</a>`): it fails with no match. Use
  `find role link|button click --name X` (accessibility tree; icons add nothing to the name).
  Ref: `e2e/specs/08-skills.flow.json`, agent-browser `handle_semantic_locator` (superseded 2026-11-25)
- **2026-11-25** — agent-browser clicks at screen coordinates and does not wait for the
  element to stop moving (unlike Playwright). An element inside the kit `Drawer` (200 ms
  `ddslidein`) clicked right after it appears gets a click that misses, so `✓ Done` is
  printed but nothing happens (here: no navigation, `wait --url tab=skills` timed out).
  Add `["wait", "500"]` before clicking inside a drawer, then assert with `wait --url`.
  Reproduced locally with agent-browser 0.44.0 + system Chrome; 3/3 passes with the wait.
  Ref: `e2e/specs/08-skills.flow.json`, `client/src/vendor/ui/kit/Drawer.tsx:37`

## Recurring Errors & Fixes

_None yet._

## Session Notes

_None yet._

## Open Questions

_None yet._
