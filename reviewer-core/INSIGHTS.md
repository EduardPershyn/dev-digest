# Insights — reviewer-core

Findings specific to `reviewer-core/`.
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

- **2026-11-27** — `assemblePrompt` adds `assembly.intent_block` only when the intent section
  is rendered (the key is absent, not `null`), so a review without intent yields an assembly
  `toEqual` to the pre-M3 one; `test/prompt-intent.test.ts` pins this. Keep new optional
  trace keys absent-when-empty the same way. Ref: `reviewer-core/src/prompt.ts` (`intent_block`)

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

_None yet._

## Session Notes

- **2026-11-27** — M3: hardened `wrapUntrusted` (case / whitespace closer variants, forged
  openers, label reduced to `[a-z0-9:_./#-]` ≤80 chars; the legacy `<\/untrusted>` escape is
  kept because server tests assert it), `## PR intent (derived)` slot, pure
  `applyIntentScope` (`review/scope.ts`) after grounding, OpenRouter
  `provider.require_parameters` on `requireParameters`. 54 tests green.

## Open Questions

_None yet._
