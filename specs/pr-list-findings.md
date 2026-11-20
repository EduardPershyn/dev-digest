# PR-list Findings column
- **Status:** done
- **Milestone:** — (extends the severity-filter homework) · **Packages:** server, client
- **Owner:** Eduard Pershyn

## Problem

The PR list (`/repos/:repoId/pulls`) shows a score ring per PR but nothing about *what* the
reviewers found. To see whether a PR has critical findings you have to open it. The mockup
(`homework/…image.png`) adds a **FINDINGS** column — `⊘2 ⚠2 💡2` — and a hover popover
listing the findings. The list endpoint carries no finding data today (`PrMeta` has only
`score` and `cost_usd`), and a comment in `pulls/routes.ts` records that this was
intentionally left out; this spec reverses that decision at the user's request.

## Scope / Non-goals

**In scope**
1. `GET /repos/:id/pulls` returns `findings` per PR: per-severity counts + a short preview list.
2. PR list: a `Findings` column after `Score` with SEV-coloured icon + count per non-zero level.
3. Hover / keyboard-focus popover on that cell: `N FINDINGS` header + top findings
   (severity, title, category, `file:line`, confidence, 2-line rationale) + "+N more".

**Non-goals**
- The same popover on Timeline rows (`image (1).png`) — separate work.
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

## Acceptance criteria
- [x] List response has `findings` per PR; `null` for never-reviewed PRs.
- [x] Two runs of the same agent → only the newer one's findings count.
- [x] Two different agents → their findings add up.
- [x] Dismissed findings don't count; accepted ones do.
- [x] Column shows SEV icon + count per non-zero level; `—` when never reviewed.
- [x] Hover or focus shows the popover with header total, ≤5 previews, "+N more" when truncated.
- [x] Popover isn't clipped by the table card; Escape closes it.
- [x] `pnpm test` + `pnpm typecheck` green in `client/` and `server/`; both contract copies identical.

## Test plan
| Suite | File | Covers |
|---|---|---|
| server-unit | `test/pulls-findings-summary.test.ts` | latest-per-agent pick (incl. null agent), counts, dismissed excluded upstream, sort + top-N + truncation |
| server-integration | `test/reviews.it.test.ts` (extend) | seeded reviews/findings → list `findings`: newer run replaces older, two agents add, dismissed excluded, null for unreviewed |
| client | `FindingsCell.test.tsx` | `—` for null, icons+counts, popover on hover/focus, "+N more", Escape closes |

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

## Open questions
- Should `score` also move to "latest per agent" (e.g. min across agents)? Out of scope.
