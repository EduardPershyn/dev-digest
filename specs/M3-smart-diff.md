# Smart Diff
- **Status:** in-progress
- **Milestone:** M3 · **Packages:** server, client (+ both `@devdigest/shared` copies)
- **Owner:** Eduard Pershyn

## Problem

What order does a reviewer read changes in, and where do they see the review results?

The **Files changed** tab shows files in GitHub order, so a lock file sits next to business
logic. Agent findings live on the **Agent runs** tab only, so matching a finding to its code
means switching tabs.

Smart Diff does two things:
1. **Sorts PR files by role:** core → tests → wiring → docs → boilerplate.
2. **Shows review results in the diff:** a per-group counter, a per-file dot, and the finding
   card under the line it anchors to.

The Agent runs tab stays unchanged.

## What exists on `main` (do not rebuild)

| Piece | State today |
|---|---|
| PR files | `GET /pulls/:id` → `files[]: PrFile` (`path`, `additions`, `deletions`, `patch` nullable) |
| Findings | `GET /pulls/:id/reviews` → `ReviewRecord[]` (one per agent per run; `agent_id`, `run_id`, `created_at`, `findings[]: FindingRecord` with `file`, `start_line`, `end_line`, `severity`, `title`, `rationale`, `suggestion`, `confidence`, `accepted_at`, `dismissed_at`). No `line` field — anchor on `start_line`. |
| Client hooks | `usePrReviews(prId)`, `useFindingAction()` in `client/src/lib/hooks/reviews.ts` (cached; already used by `FindingsTab`) |
| Contract | `SmartDiff` / `SmartDiffRole` / `SmartDiffGroup` / `SmartDiffFile` in `contracts/brief.ts` (both copies, identical); `SmartDiffResponse` in `contracts/review-api.ts`. `SmartDiffRole` has only `core`, `wiring`, `boilerplate`. No route returns it yet. |
| Diff UI | `DiffTab` → `DiffViewer` → `FileCard` (collapse, auto-expand ≤ `AUTO_EXPAND_MAX_LINES` = 200, GitHub comment counter) → `CodeLine`. `parsePatch` (`helpers.ts`) gives `oldNo/newNo`; `keysForLine` / `partitionThreads` (`comments.ts`) anchor threads under lines by `RIGHT:<n>` / `LEFT:<n>`; GitHub comments toggle via `showComments`. |
| Finding card | `FindingCard` in `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/` (Agent runs tab) |
| Severity look | `SEV` and `SeverityBadge` in `client/src/vendor/ui/primitives/Badge.tsx` — the only palette |
| Strings | `client/messages/en/prReview.json` → `smartDiff`: `coreLabel`, `wiringLabel`, `boilerplateLabel`, `groupedByRole`, `filesCount`, `findingLines`, … |

## Scope / Non-goals

In scope: P1, P2 and P3 below.

Non-goals:
- No LLM call anywhere in Smart Diff (`pseudocode_summary` stays unset; no "What this does").
- `split_suggestion` is minimal: `too_big: false`, `total_lines = Σ(additions + deletions)`,
  `proposed_splits: []`.
- Agent runs tab unchanged.

## Design

### Classifier (server)
- Pure function `classifyFile(path: string): SmartDiffRole`, importable without HTTP (L08 will
  reuse it as a prompt pre-filter). Location: `server/src/modules/reviews/smart-diff/` (or a
  dedicated `smart-diff/` module — planner's call per the onion skill).
- Patterns **and** role display order live in one `constants.ts`.
- Rules are evaluated top to bottom; **first match wins**:
  1. **boilerplate** — `*.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `dist/**`,
     `build/**`, `**/__snapshots__/**`, `*.snap`, `*.generated.*`, `*.min.js`
  2. **tests** — `**/*.test.ts(x)`, `**/*.it.test.ts`, `**/*.spec.ts`, `**/test/**`,
     `**/tests/**`, `**/__tests__/**`, `e2e/**`
  3. **wiring** — barrel `index.ts` / `index.js`, `*.config.*`, `tsconfig*.json`, `.eslintrc*`,
     `.env*`, `docker-compose*.yml`, `.github/**`, `.claude/**`
  4. **docs** — `**/*.md`, `docs/**`, `README*`, `CHANGELOG*`, `LICENSE`
  5. **core** — everything else
- Display order: `core → tests → wiring → docs → boilerplate`.
- The unit test is a `path → role` table and **must** include the three disputed cases, each
  with a comment stating the decision:
  1. `src/__tests__/__snapshots__/x.snap` → `boilerplate` (snapshot rule precedes test rule)
  2. `.claude/skills/security/SKILL.md` → `wiring` (Markdown under `.claude/` defines agent
     behaviour, so `.claude/**` precedes docs)
  3. `e2e/README.md` → `tests` — **decision (owner, 2026-11-27): keep the spec order**; docs
     inside `e2e/` travel with the flows they describe.

### Contract (both `@devdigest/shared` copies, kept identical)
- `SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate'])`.

### Route `GET /pulls/:id/smart-diff` → `SmartDiffResponse`
- Reads PR files and persisted reviews; **no model call**; works before the first review
  (all `finding_lines: []`).
- **Findings source — decision (owner):** the *latest review per agent* (by `created_at`,
  `kind: 'review'`), union of their findings. Re-running one agent does not hide another
  agent's findings.
- **Dismissed findings — decision (owner):** excluded from `finding_lines` (so not counted).
- `finding_lines` = sorted unique `start_line` values of the counted findings for that file.
- Groups in fixed role order; empty groups omitted. Files inside a group keep GitHub order.
- Response validates against `SmartDiffResponse`. 404 for an unknown PR, as sibling routes do.

### Client — Files changed tab
- Header: "N files · +A −D" and a **Smart order / Original order** segmented switch
  (default Smart order). Original order = today's flat GitHub list.
- Smart order: one section per non-empty group, header = role color square + role label +
  short role description + (right) finding-file counter + "N files". Labels come from
  `prReview.json → smartDiff` (add `testsLabel`, `docsLabel`, and any new strings).
- Group collapse: `docs` and `boilerplate` collapsed by default; others expanded. Files inside
  keep the `AUTO_EXPAND_MAX_LINES` rule.
- Group header counter = number of files in the group with ≥1 counted finding, shown as
  `● N` before "N files", only when N > 0.
- File card: a dot next to the path when the file has ≥1 counted finding (no number), distinct
  from the existing GitHub comment counter.
- Code line: under the line whose `RIGHT:<new line>` key equals `RIGHT:${finding.start_line}`
  (same mechanism as `keysForLine` / `partitionThreads`), render the finding card (severity,
  title, rationale, suggestion, Accept / Dismiss) reusing `FindingCard` or a thin copy. The line
  gets a colored left strip and a right-aligned label: `CRITICAL → blocker`,
  `WARNING → warning`, `SUGGESTION → suggestion`, colors from `SEV`.
- **Dismissed** findings render dimmed under their line, not counted (decision above).
- Findings whose line is absent from the patch render in a block at the end of the file card.
- Finding cards hide/show with the same switch as GitHub comments. **Decision (owner,
  2026-11-27):** the switch starts ON, so an expanded file shows its finding cards at once.
- Findings for the diff come from `usePrReviews(prId)` with the same latest-per-agent rule;
  accept / dismiss via `useFindingAction()`.

## Acceptance criteria

### P1 — blocks submission
- [ ] **P1-1** An open PR shows groups on Files changed in the order core → tests → wiring →
  docs → boilerplate, each with role label and file count.
- [ ] **P1-2** A lock file is classified `boilerplate`; docs and boilerplate groups are
  collapsed by default.
- [ ] **P1-3** After Run review, the group header shows the count of files with findings.
- [ ] **P1-4** A file card with findings shows a dot indicator.
- [ ] **P1-5** An expanded file shows a finding comment under the relevant line with severity,
  title and explanation.
- [ ] **P1-6** The Original order switch restores GitHub order.
- [ ] **P1-7** Open PR with implementation description and 1–3 min demo video *(owner, manual)*.

### P2
- [ ] **P2-1** Patterns and role order in one constants file; unit test validates
  `path → role` table incl. the three disputed cases.
- [ ] **P2-2** Route response passes `SmartDiffResponse` validation; enum extended in both
  `brief.ts` copies, which stay identical.
- [ ] **P2-3** Viewing Smart Diff makes no model call; grouping works before the first review.
- [ ] **P2-4** Finding line marked with a colored strip and severity label.
- [ ] **P2-5** Accept / Dismiss in the diff comment work and update finding state.
- [ ] **P2-6** A finding whose line isn't in the patch shows in a block at the end of the file.
- [ ] **P2-7** Finding comments hide with the same switch as GitHub comments.
- [ ] **P2-8** PR description names the subagents used and what plan-verifier checked
  *(owner, manual)*.

### P3
- [ ] **P3-1** Group header is sticky while scrolling.
- [ ] **P3-2** A finding comment can be collapsed to one line.
- [ ] **P3-3** Empty state ("review has not been run yet") instead of zero counters.
- [ ] **P3-4** Counters and indicators update after Run review without a page reload.
- [ ] **P3-5** Group names and labels come from `prReview.json → smartDiff`
  (`testsLabel`, `docsLabel` added).

## How to verify (demo video)
Open a PR → Files changed: groups core → tests → wiring → docs → boilerplate, docs and
boilerplate collapsed, lock file in boilerplate → Run review → counters in group headers and
dots on cards → expand a file: finding card under its line → Accept or Dismiss → switch to
Original order.

## Open questions
- None blocking. Decisions taken 2026-11-27: findings = latest review per agent; dismissed =
  shown dimmed, not counted; `e2e/README.md` → tests; scope = P1 + P2 + P3; header file count =
  rendered files; dismissed-only lines get no strip; comments/findings switch starts ON.
