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
- **2026-11-20** — A findings hover preview (`⊘2 ⚠1` + popover) is
  `@/components/findings-preview` → `<FindingsPreview>`; it owns the portal, hover grace,
  focus/Escape and scroll-close. Callers pass the summary and all wording (`title`,
  `moreLabel`, `ariaLabel`, `levelLabel`) and `clickThrough` only where clicks should reach a
  clickable row. The two surfaces count differently on purpose: PR list = OPEN findings of
  each agent's latest review (server), Timeline row = ALL of that run's findings incl.
  dismissed (client `summarizeFindings`), so it equals the run's accordion header. Ref:
  `client/src/components/findings-preview/FindingsPreview.tsx`

- **2026-11-23** — `src/test/architecture.test.ts` enforces the client layering rules (B1, S4,
  S5, L2, L6, S12, S14) by scanning `src/` minus `vendor/` and `*.test.*`. Tests still import
  `messages/en/*.json` through long `../../…` paths on purpose: `messages/` is outside `src/`, so
  `@/` can't reach it and the S14 check exempts targets outside `src/`. When adding a rule, prove
  it fires with a throwaway violating file whose import really resolves inside `src/` — a planted
  `../../../lib/api` from `app/settings/` resolves to `client/lib/` and passes silently.
  Ref: `client/src/test/architecture.test.ts`
- **2026-11-24** — The `Markdown` primitive renders headings and lists unstyled (no size, no
  bullets/numbers): Tailwind preflight resets them and `vendor/ui` adds nothing back. For
  document-like Markdown (skill bodies) wrap it in `className="skill-md"`; the rules live in
  `client/src/app/globals.css`. Other surfaces were left compact on purpose.
  Ref: `client/src/app/skills/_components/SkillPreviewTab/SkillPreviewTab.tsx`
- **2026-11-24** — Native form-control theming lives in `src/app/globals.css`, not in the
  kit: `color-scheme` per `[data-theme]`, `select option` colours, and an accent border on
  focus via `div:has(> input:focus)` / `div:has(> select:focus)` with `!important` (the kit's
  `TextInput`/`SelectInput` draw the border on a wrapper div with inline styles and set
  `outline: none` on the control). Without `color-scheme`, Chrome draws an open `<select>`
  list in its light theme while options inherit `--text-primary` → white on white. Ref:
  `client/src/app/globals.css`

## Tool & Library Notes

- **2026-11-20** — `pnpm exec vitest run "src/app/repos/[repoId]/..."` reports `No test files
  found`: the positional filter mangles the `[repoId]`/`[number]` brackets. Filter by a plain
  name fragment instead (`pnpm exec vitest run FindingsPanel`). Why: Vitest treats the
  argument as a pattern, not a literal path. Ref: `client/vitest.config.ts`
- **2026-11-20** — After `git mv` of components while `next dev` is running, fresh page
  loads still log `Failed to read source code from …/<old path>` console errors for the old
  paths, yet the page renders and works (seen in headless Chrome on the PR page, Agent runs
  tab). Don't chase them when checking a refactor; judge by the rendered page.
  Whether a dev-server restart clears them was not verified. Ref: `client/src/components/findings-preview/`
- **2026-11-24** — jsdom's `File`/`Blob` has no `arrayBuffer()` (`TypeError:
  file.arrayBuffer is not a function` in tests). Read uploads with
  `FileReader.readAsDataURL` instead; it works in jsdom and every browser.
  Ref: `client/src/lib/skills.ts` (`fileToBase64`)
- **2026-11-24** — UI checks that need a click (open a diff, press Delete) work without
  Playwright: start `google-chrome --headless=new --remote-debugging-port=9333
  --user-data-dir=<scratch>` and drive it from a Node 22 script over CDP (global
  `WebSocket`; `Page.navigate` → `Runtime.evaluate` → `Page.captureScreenshot`). Call
  `Emulation.setFocusEmulationEnabled {enabled:true}` first, or `:focus` styles never match in
  a headless page (the window has no focus). Stub `window.confirm = () => true` in the
  evaluated JS for confirm dialogs. Stop Chrome with `pgrep`/`kill <pid>`, not
  `pkill -f <pattern>`, which also matches and kills the calling shell (exit 144).
- **2026-11-25** — Vendored kit quirks: `useToast()` takes a plain string (no link/action),
  so "saved → open it" flows need an inline banner with a `next/link`. `IconName` has no
  `"Pencil"` (TS2322); use the `"Edit"` alias. `Skeleton` takes `height`/`width`, not `h`.
  Ref: `client/src/app/repos/[repoId]/conventions/_components/ConventionsView/ConventionsView.tsx`

## Recurring Errors & Fixes

- **2026-11-20** — Importing a VALUE from `@devdigest/shared` (e.g. `Severity.options`) makes
  the page 500 in `next dev` with `Module not found: Can't resolve './contracts/findings.js'`,
  while `pnpm test` and `pnpm typecheck` stay green. Fix: client code imports the barrel with
  `import type` only; mirror any needed enum as a local `as const` tuple guarded by a type
  check + a Vitest test against the contract value (Vitest CAN import it). Why: the barrel
  uses NodeNext `.js` specifiers; Vite maps them to `.ts`, Next's webpack has no
  `extensionAlias`. Ref: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/constants.ts` (superseded 2026-11-24)
- **2026-11-24** — Same `Module not found: Can't resolve './contracts/findings.js'` (500 on
  `/skills` in `next dev`) when M2 imported `SKILL_NAME_PATTERN` from `@devdigest/shared`.
  Root-cause fix now in place: `client/next.config.mjs` `webpack()` sets
  `resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] }`, so value imports from the
  barrel work in `next dev` and `next build` (both verified). The local-mirror workaround
  is no longer needed. Ref: `client/next.config.mjs`

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
- **2026-11-20** — Timeline run rows got the findings preview (`specs/pr-list-findings.md`
  Part 2): `FindingsTab` builds `findingsByRun` from `usePrReviews` (`review.run_id` join),
  `RunHistory` renders `<FindingsPreview>` for done runs with ≥1 finding, otherwise the old
  `N finding(s)` text. `FindingsCell` became a thin wrapper over the extracted
  `components/findings-preview/`. 80/80 tests, typecheck clean, headless-Chrome check on
  `hack0xield/trading#1` matched the spec's expected rows. Ref:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`

- **2026-11-23** — Applied the `frontend-ui-architecture` skill. Five `'use client'` pages became
  thin server `page.tsx` + client `_components/<Name>View` (HomeView, AgentEditorView,
  PullsListView, PrDetailView; onboarding only lost the directive); per-domain query-key
  factories + `usePrRunInvalidation` (the PR view no longer touches the QueryClient); the
  `@/lib/hooks` barrel removed; PR-status rules moved to `src/lib/pull-status.ts` and
  `filterAndSortPulls` (both tested); React 19 `<Ctx value>`; root `error.tsx`,
  `global-error.tsx`, `not-found.tsx`; deep imports → `@/`. Verified: typecheck, 95/95 tests,
  `next build` route table unchanged (same 8 routes, same ○/ƒ split), headless-Chrome pass over
  12 routes against the live API with no new console errors. Deliberately not done: a
  `features/` restructure (house layout is consistent) and Zod parsing in `apiFetch` (blocked by
  the shared-barrel runtime import issue above). Ref:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailView/PrDetailView.tsx`
- **2026-11-24** — M2 Skills UI (spec `specs/M2-skills.md`): `/skills` grid + side drawer +
  import modal, `/skills/:id|new` editor (Config / Preview / Versions), agent editor Skills
  tab (attach, per-agent enable, drag + ↑/↓ reorder, optimistic PUT), per-skill blocks with
  token counts in the trace drawer. Sidebar "SKILLS LAB" group needed a data edit in
  `src/vendor/ui/nav.ts` (Sidebar reads `NAV` directly). Verified with headless Chrome
  screenshots against the real API; `08-skills.flow.json` not run (no agent-browser).
- **2026-11-24** — M2 skills follow-up from owner review: Versions tab **Changes** toggle with
  an inline diff (LCS line diff + word-level metadata diff, any snapshot as base,
  `SkillVersionsTab/helpers.ts`), a **Delete** button in the editor header (shared
  `_components/DeleteSkillButton`, also used by the drawer), dark-theme fix for native selects
  plus focus borders for all kit inputs, and the skill form's double spacing removed.
  130/130 tests, typecheck clean; verified over CDP against the live API (diff open,
  `color-scheme: dark`, focus border, delete → `/skills` + 404).

## Open Questions

- **2026-11-20** — `FindingCard` logs a React warning ("Updating a style property during
  rerender (borderColor) when a conflicting property is set (borderLeftColor)") every time
  the focused card changes — reproduced with a bare `j` keypress. Likely fix: replace
  `borderColor` with per-side `borderTop/Right/BottomColor`. Not fixed (out of scope of
  `specs/severity-filter.md`). Ref: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:10`
