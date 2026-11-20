# Findings previews — PR list + Timeline
- **Status:** done — Part 1 (PR list) and Part 2 (Timeline rows, 2026-11-20)
- **Milestone:** — (extends the severity-filter homework) · **Packages:** server, client
- **Owner:** Eduard Pershyn

## Problem

The PR list (`/repos/:repoId/pulls`) shows a score ring per PR but nothing about *what* the
reviewers found. To see whether a PR has critical findings you have to open it. The mockup
(`homework/…image.png`) adds a **FINDINGS** column — `⊘2 ⚠2 💡2` — and a hover popover
listing the findings. **Part 2** brings the same treatment to the Timeline rows on the PR page's Agent runs tab
(mockup `homework/…image (1).png`): today a run row only says `3 finding(s) · 2 blockers`;
the mockup shows `⊘2 ⚠1 · 2 blockers` and a hover popover "2 FINDINGS IN THIS RUN".

The list endpoint carries no finding data today (`PrMeta` has only
`score` and `cost_usd`), and a comment in `pulls/routes.ts` records that this was
intentionally left out; this spec reverses that decision at the user's request.

## Scope / Non-goals

**In scope**
1. `GET /repos/:id/pulls` returns `findings` per PR: per-severity counts + a short preview list.
2. PR list: a `Findings` column after `Score` with SEV-coloured icon + count per non-zero level.
3. Hover / keyboard-focus popover on that cell: `N FINDINGS` header + top findings
   (severity, title, category, `file:line`, confidence, 2-line rationale) + "+N more".

4. **(Part 2)** Timeline run rows: the plain `N finding(s)` text becomes SEV icon + count per
   non-zero level (blockers suffix kept), with the same hover/focus popover titled
   "N findings in this run".

**Non-goals**
- The Review-runs accordion header (`3 findings · 2 blockers`) — unchanged, per the
  severity-filter brief; the mockup doesn't change it either.
- Commit rows, failed / cancelled / running run rows (they keep today's rendering).
- The per-row "Run Review" button from the mockup.
- Filtering/sorting the PR list by findings.
- Changing how `score` is chosen (still the latest review of any agent).
- Contract severity levels other than `CRITICAL | WARNING | SUGGESTION`.

## Decisions

| Question | Decision |
|---|---|
| Which reviews count | **Latest review per agent** for the PR (`reviews.kind = 'review'`, newest `created_at` per `agent_id`). Re-running an agent replaces its old findings; different agents add up. Reviews with `agent_id = null` (legacy) form one group of their own. |
| Dismissed findings | **Excluded** — the column means "open issues". Accepted findings stay counted. |
| Deleted run | Computed on read, so deleting an agent's latest review falls back to its previous one. |
| Never reviewed | `findings: null` → `—`. Reviewed with zero open findings → counts all `0`, cell shows muted `0`. |
| Preview size | Top **5** by severity, then confidence desc; `rationale` truncated server-side to 220 chars to keep the list payload small. `total` lets the popover say "+N more". |
| Popover placement | Portal to `document.body`, `position: fixed` from the cell's rect (the table card is `overflow: hidden`); flips above when there's no room below. |
| Click inside popover | Bubbles to the row → opens the PR (React events bubble through portals). Intended. |
| **(Part 2)** Data source for Timeline counts | **Client-only.** `FindingsTab` already gets every review with its `findings[]` (`usePrReviews`); join `review.run_id ↔ RunSummary.run_id`. No new request, no contract change. |
| **(Part 2)** What a Timeline row counts | **All findings of that run's review, dismissed included** — the Timeline is the historical record of what the run produced, and the number must agree with the same run's accordion header (`N findings`). This intentionally differs from the PR list, which shows *open* findings. |
| **(Part 2)** No matching review | Failed / cancelled runs, legacy runs without `reviews.run_id`, or reviews still loading → keep today's text `N finding(s)` from `RunSummary.findings_count`. A done run with 0 findings also keeps the text. |
| **(Part 2)** Blockers | Suffix ` · N blockers` stays as is, from `RunSummary.blockers` (the CI-gate count). |
| **(Part 2)** Popover footer | `+N more — see the run below`. Clicking the counts does nothing extra; the agent name already scrolls to the run. |
| **(Part 2)** Code sharing | Move `FindingsPopover`, the inline counts, the hover/focus logic and `popoverPosition` from `pulls/_components/FindingsCell/` to `client/src/components/findings-preview/` (same pattern as `components/run-cost-badge/`, which both routes already share). `FindingsCell` becomes a thin wrapper. |

## Design

### Contracts — BOTH `server/src/vendor/shared` and `client/src/vendor/shared` (`platform.ts`)

```ts
export const PrFindingPreview = z.object({
  id: z.string(), severity: Severity, category: z.string(), title: z.string(),
  file: z.string(), start_line: z.number().int(), end_line: z.number().int(),
  confidence: z.number(), rationale: z.string(),
});
export const PrFindingsSummary = z.object({
  counts: z.object({ CRITICAL: int, WARNING: int, SUGGESTION: int }),
  total: z.number().int(),
  top: z.array(PrFindingPreview),
});
// PrMeta
findings: PrFindingsSummary.nullish(),   // list endpoint only
```

### Server
- `src/modules/pulls/findings-summary.ts` — pure:
  `latestReviewIdsPerAgent(reviews)` and `summarizeFindings(rows, { topN, rationaleMax })`.
- `pulls/routes.ts` list handler — two queries after the score query: reviews
  `(id, prId, agentId)` newest-first for the listed PRs → pick per (pr, agent); then findings
  of those review ids with `dismissed_at IS NULL`. Group in JS (list is small, same pattern
  as `latestReviewByPr`). Workspace scoping comes from the PR ids already being scoped.
- `server/README.md`: document `findings` on the list response.

### Client — `app/repos/[repoId]/pulls/`
- `constants.ts`: `"findings"` in `COLUMN_KEYS` after `"score"`; widen `GRID`.
- `_components/FindingsCell/` (`FindingsCell.tsx`, `FindingsPopover.tsx`, `helpers.ts`,
  `styles.ts`, `index.ts`, `FindingsCell.test.tsx`).
  Cell: `Icon[SEV[sev].icon]` in `SEV[sev].c` + count for non-zero levels; `tabIndex=0`,
  `aria-label` "2 critical, 1 warning…"; opens on mouseenter/focus, closes on
  mouseleave (120 ms grace so the cursor can reach the popover)/blur/Escape.
- `messages/en/prReview.json` → `list.columns.findings`, `list.findings.*`.

### Part 2 — Timeline rows (client only)

**`client/src/components/findings-preview/`** (`index.ts`, `helpers.ts`, `styles.ts`,
`FindingsPreview.tsx`, `FindingsPopover.tsx`, `findings-preview.test.tsx`)
- `summarizeFindings(findings: FindingRecord[], topN = 5): PrFindingsSummary` — the client
  twin of the server helper (counts per `SEVERITY_LEVELS`, sort severity → confidence desc,
  top N). Rationale is not truncated here (the popover clamps to 2 lines).
- `popoverPosition` — moved as is.
- `<FindingsPreview summary title moreLabel ariaLabel />` — the focusable inline
  `⊘2 ⚠1` trigger + portalled popover (hover with 120 ms grace, focus, Escape,
  close on outside scroll/resize). `title` replaces the fixed `"N findings"` header so each
  surface can word it.
- `FindingsPopover` takes `title` and `moreLabel` props instead of reading
  `prReview.list.findings.*` itself.

**`pulls/_components/FindingsCell/FindingsCell.tsx`** — keeps `—` / `0` handling, renders
`<FindingsPreview>` with `list.findings.header` / `list.findings.more`. Behaviour unchanged;
its tests must pass untouched apart from import paths.

**`pulls/[number]/_components/FindingsTab/FindingsTab.tsx`**
```ts
const findingsByRun = React.useMemo(() => {
  const m: Record<string, FindingRecord[]> = {};
  for (const rv of runs) if (rv.run_id) m[rv.run_id] = rv.findings;
  return m;
}, [runs]);
<RunHistory … findingsByRun={findingsByRun} />
```

**`pulls/[number]/_components/RunHistory/RunHistory.tsx`**
- New optional prop `findingsByRun?: Record<string, FindingRecord[]>` (optional → existing
  callers/tests unaffected).
- In the `settled` line: if `findingsByRun?.[r.run_id]` has ≥ 1 finding → `<FindingsPreview
  summary={summarizeFindings(list)} title={t("timeline.findingsInRun", {count})} …/>` followed
  by the existing blockers suffix; otherwise today's `runStatus.findings` text.

**`messages/en/prReview.json`** → `timeline.findingsInRun`
(`"{count, plural, one {# finding} other {# findings}} in this run"`), `timeline.findingsMore`
(`"+{count} more — see the run below"`), `timeline.findingsLabel`
(`"Findings in this run: {summary}. Focus or hover for details."`).

## Acceptance criteria
- [x] List response has `findings` per PR; `null` for never-reviewed PRs.
- [x] Two runs of the same agent → only the newer one's findings count.
- [x] Two different agents → their findings add up.
- [x] Dismissed findings don't count; accepted ones do.
- [x] Column shows SEV icon + count per non-zero level; `—` when never reviewed.
- [x] Hover or focus shows the popover with header total, ≤5 previews, "+N more" when truncated.
- [x] Popover isn't clipped by the table card; Escape closes it.
- [x] `pnpm test` + `pnpm typecheck` green in `client/` and `server/`; both contract copies identical.

**Part 2 — Timeline rows**
- [x] A done run whose review has findings shows SEV icon + count per non-zero level, then
      ` · N blockers` when blockers > 0.
- [x] The counts equal that run's accordion header total (dismissed findings included).
- [x] Hover or focus shows the popover titled "N findings in this run", ≤5 previews, "+N more".
- [x] Failed / cancelled / running rows, runs without a review and 0-finding runs render as before.
- [x] PR-list `FindingsCell` behaves exactly as before after the move to `components/findings-preview/`.
- [x] No new request (data comes from `usePrReviews`); no server or contract change.

## Test plan
| Suite | File | Covers |
|---|---|---|
| server-unit | `test/pulls-findings-summary.test.ts` | latest-per-agent pick (incl. null agent), counts, dismissed excluded upstream, sort + top-N + truncation |
| server-integration | `test/reviews.it.test.ts` (extend) | seeded reviews/findings → list `findings`: newer run replaces older, two agents add, dismissed excluded, null for unreviewed |
| client | `FindingsCell.test.tsx` | `—` for null, icons+counts, popover on hover/focus, "+N more", Escape closes |
| client (Part 2) | `components/findings-preview/findings-preview.test.tsx` | `summarizeFindings` (counts incl. zeros, sort, top N); `popoverPosition` cases moved from `FindingsCell.test.tsx` |
| client (Part 2) | `RunHistory.test.tsx` (extend) | done run + `findingsByRun` → icon counts + blockers suffix, hover popover title "2 findings in this run"; run without an entry → old `N finding(s)` text; failed run unchanged |

Part 2 manual check: Agent runs tab on `hack0xield/trading#1` — the General Reviewer row reads
`⊘2 ⚠3 · 2 blockers` (same 5 as its accordion header), hover shows the popover above/below
without clipping, and the Security Reviewer row shows `⚠2`.

## Verification
- server: `pulls-findings-summary.test.ts` (5 unit), `reviews.it.test.ts` new case on real
  Postgres (newer run replaces older, agents add up, dismissed excluded, accepted counted,
  `null` when unreviewed); full unit suite 180/180; typecheck clean.
- client: `FindingsCell.test.tsx` (8); full suite 71/71; typecheck clean.
- Live API on `hack0xield/trading#1`: `{CRITICAL: 2, WARNING: 5, SUGGESTION: 0}`, total 7 —
  matches latest-per-agent by hand (the older General Reviewer run's 2W+1S excluded).
- Headless Chrome: column renders `⊘2 ⚠5`; hover opens the popover outside the
  `overflow:hidden` card, stays open while moving into it, closes on leave; zero API
  calls during hover. First render stacked badge/title/category and showed a horizontal
  scrollbar — fixed (title wrap container, `overflowX: hidden`).
- `SEVERITY_LEVELS` moved to `client/src/lib/severity.ts` (shared by FindingsPanel and
  FindingsCell; FindingsPanel/constants re-exports it).

**Part 2**
- `components/findings-preview/`: `FindingsPreview` (trigger + hover/focus/Escape/scroll logic),
  `FindingsPopover` (`title` / `moreLabel` props), `helpers.ts` (`popoverPosition`,
  `summarizeFindings`). `FindingsCell` is now a thin wrapper (empty states + PR-list wording).
  Deviation: `FindingsPreview` also takes `levelLabel` (the per-level spoken form, so each
  surface owns its i18n) and `clickThrough` — pointer cursor on the popover only where clicks
  bubble to a clickable row (PR list); the Timeline popover uses the default cursor.
- client: `findings-preview.test.tsx` (7 — 4 `summarizeFindings`, 3 `popoverPosition` moved),
  `RunHistory.test.tsx` +5, `FindingsCell.test.tsx` unchanged apart from dropping the moved
  `popoverPosition` block; full suite 80/80; typecheck clean.
- Headless Chrome on `hack0xield/trading#1` Agent runs: General Reviewer row `⊘2 ⚠3 · 2 blockers`
  (accordion header `5 findings · 2 blockers`), Security Reviewer `⚠2`, older General run
  `⚠2 💡1`; hover popover "2 findings in this run" portalled to `body`, no horizontal
  overflow, closes on leave, no API calls on hover. PR list re-checked after the move:
  `⊘2 ⚠5`, popover "7 findings", pointer cursor, unchanged.

## Open questions
- Should `score` also move to "latest per agent" (e.g. min across agents)? Out of scope.
