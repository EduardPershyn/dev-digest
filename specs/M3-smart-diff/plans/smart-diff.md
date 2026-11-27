# Development Plan — M3 Smart Diff (role-ordered Files changed tab with in-diff findings)
**Source:** `specs/M3-smart-diff.md` (status in-progress, owner decisions 2026-11-27) · **Modules:** server, client (+ both `@devdigest/shared` copies), e2e · **Status:** approved (owner, 2026-11-27)
**Save to:** `specs/M3-smart-diff/plans/smart-diff.md`

## 1. Goal & acceptance criteria
Sort a PR's changed files by role (core → tests → wiring → docs → boilerplate). Show review results in the diff: a counter per group, a dot per file, and the finding card under the line it anchors to. A pure server classifier (which L08 will reuse), plus a new LLM-free route `GET /pulls/:id/smart-diff`, feeds the grouping and counters. The client renders finding cards from `usePrReviews` using the same latest-review-per-agent rule. The Agent runs tab stays as it is.
- AC-P1-1 Groups render in role order, each with a role label and a file count.
- AC-P1-2 Lock file → `boilerplate`. `docs` and `boilerplate` groups start collapsed.
- AC-P1-3 After a review, the group header shows the number of files with ≥1 counted finding.
- AC-P1-4 A file card with ≥1 counted finding shows a dot next to its path.
- AC-P1-5 An expanded file shows the finding card (severity, title, rationale) under the line whose key is `RIGHT:${start_line}`.
- AC-P1-6 The "Original order" switch brings back the flat GitHub list.
- AC-P2-1 Patterns and role order live in one `constants.ts`. The `path → role` table test includes the 3 disputed cases, each with a comment.
- AC-P2-2 The route response passes `SmartDiffResponse.parse`. The enum is extended in both `brief.ts` copies, which stay byte-identical.
- AC-P2-3 The route makes zero model calls and works before the first review (all `finding_lines: []`).
- AC-P2-4 A finding line gets a coloured left strip and a right-aligned label (CRITICAL→blocker, WARNING→warning, SUGGESTION→suggestion, colours from `SEV`).
- AC-P2-5 Accept / Dismiss in the diff card update the finding state (and the counters).
- AC-P2-6 A finding whose line isn't in the patch renders in a block at the end of the file card.
- AC-P2-7 Finding cards hide and show with the same switch as GitHub comments.
- AC-P3-1 The group header stays sticky while scrolling.
- AC-P3-2 A finding card collapses to one line.
- AC-P3-3 Before any review there is an empty-state message ("review has not been run yet") instead of zero counters.
- AC-P3-4 Counters and dots update after Run review / accept / dismiss without a page reload.
- AC-P3-5 All group names, descriptions and labels come from `prReview.json → smartDiff` (`testsLabel` and `docsLabel` added).
- Owner decisions (binding): findings = latest `kind:'review'` review per agent by `created_at`, union of their findings, same rule on server and client. Dismissed findings are shown dimmed but are not counted (not in `finding_lines`, the group counter or the dot). `e2e/README.md` → `tests`.
- P1-7 and P2-8 (PR + demo video, PR description) are manual owner tasks and out of the implementer's scope.

## 2. Context read
- `specs/M3-smart-diff.md` — classifier rules, first-match order, display order, route semantics, client design, AC list.
- `server/src/vendor/shared/contracts/brief.ts:81` and `client/src/vendor/shared/contracts/brief.ts:81` — `SmartDiffRole = z.enum(['core','wiring','boilerplate'])`. The two files are identical today (`diff -q` checked).
- `server/src/vendor/shared/contracts/brief.ts:84-113` — `SmartDiffFile` (`path`, `pseudocode_summary` nullish, `additions`, `deletions`, `finding_lines`), `SmartDiffGroup`, `SmartDiff.split_suggestion`.
- `server/src/vendor/shared/contracts/review-api.ts:15-38,64` — `FindingRecord`, `ReviewRecord` (`agent_id`, `kind`, `created_at`, `findings`), `SmartDiffResponse = SmartDiff`.
- `server/src/modules/index.ts:22-37` — static module registry. The comment names `intent/smart-diff` as a future module.
- `server/src/modules/reviews/ports.ts:60-68` — `ReviewStore` already has `getPull(workspaceId, prId)`, `getPrFiles(prId)` and `reviewsForPull(prId)`, typed with records. `reviewsForPull` returns `{review, findings}[]` newest first (`server/src/modules/reviews/repository/review.repo.ts:58-72`).
- `server/src/modules/reviews/service.ts:168-171` — the 404 pattern is `NotFoundError('Pull request not found')` when `getPull` returns undefined.
- `server/src/modules/reviews/routes.ts:22-33,145-148` — `build<X>Service(c)` wiring and the `IdParams` + `getContext` read-route shape.
- `server/src/platform/container.ts:107-112` — shared `agentsRepo` / `reviewRepo` getters.
- `server/src/modules/_shared/records.ts:119-158` — `PrFileRecord`, `ReviewRecord` (`createdAt: Date`, `kind`), `FindingRecord` (`startLine`, `dismissedAt`).
- `server/src/modules/reviews/repository/pull.repo.ts:29-34` — `getPrFiles` has no `ORDER BY` (insertion order = GitHub order), same as the pulls module (`server/src/modules/pulls/repository.ts:169`).
- `server/src/modules/pulls/findings-summary.ts:20-35` — the existing latest-per-agent helper (null agent = one group). It relies on newest-first input and does not filter `kind`.
- `server/.dependency-cruiser.cjs:17-20,68-93` — `DOMAIN_FILES` = `constants|types|helpers.ts`, held pure by `domain-files-are-pure`. `no-reaching-into-other-modules` forbids importing another module's `service|routes|repository|ports`.
- `server/src/adapters/mocks.ts:58-108` — `MockLLMProvider.calls` records every call.
- `server/test/reviews.it.test.ts:90-126,268-312` — pattern: `startPg` + `seed` + `buildApp({ overrides: { llm: { openai: new MockLLMProvider(...) } } })`, seeding `reviews`/`findings` directly with explicit `createdAt`.
- `server/test/contracts.test.ts:107-118` — `SmartDiff` contract test (role `core`).
- `server/README.md:60-87,226-233` — API map mermaid and the PR-list findings section (the wording to mirror).
- `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx:18-64` — owns `showComments`. The toggle shows only when `commentCount > 0`, and its strings are hard-coded English.
- `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailView/PrDetailView.tsx:46,50,157-161,165-172` — `usePrReviews`, `usePrRunInvalidation`, `onRunDone` (refetches reviews), and how `DiffTab` is rendered.
- `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx:18-35` · `FileCard/FileCard.tsx:69-131` · `CodeLine/CodeLine.tsx:12-83` · `comments.ts:93-190` — `DiffCommentApi`, `keysForLine`, `partitionThreads`, the comment counter in the file header, outdated threads at the end of the body.
- `client/src/components/diff-viewer/constants.ts:4` — `AUTO_EXPAND_MAX_LINES = 200`.
- `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:26-117` — props `f, focused, defaultExpanded, onAction(action), pending, repoFullName, headSha`. A header click toggles collapse (one line). Accepted/dismissed cards are muted (`styles.ts:122-136`, opacity 0.6).
- `client/src/lib/hooks/reviews.ts:19-41,76-82,149-186` — `reviewKeys`, `usePrRunInvalidation`, `usePrReviews`, `useRunReview` and `useFindingAction` (which invalidate `reviewKeys.reviews`).
- `client/src/lib/providers.tsx:28` — `staleTime: 30_000`, so a new query must be invalidated explicitly to refresh (P3-4).
- `client/src/vendor/ui/primitives/tokens.ts:6-12`, `primitives/index.ts:2` — `SEV` (`c`, `bg`, `icon`, `label`) is exported through the `@devdigest/ui` barrel. There is no segmented control in `vendor/ui/kit` (only `Tabs`). `Button` has `active`.
- `client/src/lib/severity.ts:10` — `SEVERITY_LEVELS` in rank order.
- `client/messages/en/prReview.json` → `smartDiff` holds 8 keys today. `messages/en/shell.json` → `diffViewer.*` is what the diff-viewer uses.
- `client/src/test/architecture.test.ts:40-86` — B1, S4/L12, S5, L2, L6, S12 and S14 are enforced.
- `client/src/vendor/ui/shell/AppFrame.tsx:29` — `<main overflow:auto>` is the scroll container (relevant to sticky).
- `server/src/db/seed.ts:124-178` — seeded PR #482 has 4 `src/**` files (all core) with no patches, and one legacy review (agent null) with findings on `src/config.ts:12` and `src/api/users.ts:45`.
- `e2e/specs/05-pr-diff.flow.json`, `e2e/specs/README.md:8-17` — the existing diff flow and the flow catalogue.

## 3. Constraints
- **Architecture (server):** flat module, and the file name decides the ring (onion skill "Ring map", `server/CLAUDE.md` Conventions). Pure rules go in `helpers.ts`/`constants.ts`, so the domain ring is lint-checked by `domain-files-are-pure` (`server/.dependency-cruiser.cjs:69-82`). The service depends only on a port declared in its own `ports.ts`, gets it through its constructor and throws `AppError` subclasses (onion workflow steps 2-3). `routes.ts` holds `build<Feature>Service(c)`, a zod `schema: { params }` and one service call per handler (onion "Where does this code go?"). Don't import `reviews/repository|service|ports` (`no-reaching-into-other-modules`). Wire through the `c.reviewRepo` container getter instead, satisfying a port the smart-diff module owns (the same pattern as `AgentDirectory`, `server/src/modules/reviews/ports.ts:93-97`). Never add to `.dependency-cruiser-known-violations.json`.
- **Architecture (client):** data only through hooks in `src/lib/hooks/reviews.ts`, with keys from `reviewKeys` [L6], and invalidation lives in hooks. `src/components/diff-viewer` must not import from `src/app` [S4, L12], so the finding card is passed in as a component slot from `DiffTab`. Business rules (latest-per-agent selection, counted/dismissed, grouping) go in pure, tested helpers, not JSX [L1, L10]. Use no `'use client'` on page files [B1]. `'use client'` already sits on DiffTab/diff-viewer leaves. Use `@/` instead of 3+ `../` [S14]. Import UI from the `@devdigest/ui` barrel only. `src/vendor/ui/**` is read-only (`client/CLAUDE.md` Do not touch).
- **react-best-practices:** derive values in render, never `useState` + `useEffect` to sync them ("Derive, Don't Store"). No camelCase render factories ("Render Factories"), so the card slot is a PascalCase `ComponentType`. Keep collapse state in the group component ("Push State Down"). Components stay ≤200 lines, so split the header and group into nested `_components`.
- **From INSIGHTS:**
  - The two contract copies diverge, so edit both and keep `brief.ts` identical — `INSIGHTS.md:36-40`.
  - The pulls findings rule is open findings of the latest `reviews` row per `agent_id` (null = one legacy group), dismissed excluded. Don't "unify" it with score/cost — `server/INSIGHTS.md:184-189`. Smart Diff follows the same per-agent rule and adds the spec's `kind:'review'` filter.
  - Seed `reviews`/`findings` rows directly with an explicit `createdAt` for deterministic integration tests — `server/INSIGHTS.md:222-226`.
  - Run integration files on their own before trusting a "skipped" — `server/INSIGHTS.md:210-215`.
  - Component tests pass `NextIntlClientProvider` only the namespaces they import, so a component calling `useTranslations("shell")` and `("prReview")` needs both in its tests — `client/INSIGHTS.md:280-284`.
  - Callers pass all wording into shared components (the FindingsPreview pattern) — `client/INSIGHTS.md:291-298`. Use this for the diff-viewer finding labels.
  - FindingCard's borderColor/borderLeftColor warning fires when `focused` changes — `client/INSIGHTS.md:416-420`. Never pass `focused` from the diff. Draw the line strip with `boxShadow: inset 3px 0 0 <SEV.c>` or a dedicated longhand-only style, never `border` shorthand mixed with `borderLeft*`.
  - `vitest run "<path with [brackets]>"` finds nothing, so filter by name (`pnpm exec vitest run DiffTab`) — `client/INSIGHTS.md:322-325`.
  - Value imports from `@devdigest/shared` now work in `next dev` (extensionAlias) — `client/INSIGHTS.md:357-362`. Still prefer `import type` plus local tables in the client.
  - jsdom can't check layout (sticky) — `client/INSIGHTS.md:373-379`. Check P3-1 by screenshot (owner/manual).
- **Repo rules:** contract change ×2 (`CLAUDE.md` Gotchas). ESM relative imports end in `.js` (`server/CLAUDE.md`). New route → `server/README.md` (`CLAUDE.md` Read when). UI strings go in `messages/en/<ns>.json` (`client/CLAUDE.md`). Tests that import `test/helpers/pg.ts` must be named `*.it.test.ts` (`TESTING.md` Conventions). Hermetic mocks come from `src/adapters/mocks.ts`. E2E flows use only `--url/--text/find` locators on seeded data. No DB schema change, so no migration.

## 4. Skill map
| Path (glob) | Skills | Rules to apply |
|---|---|---|
| `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts` | zod | One schema per contract. Extend the enum only, with no refinements. Types via `z.infer` (already in place). |
| `server/src/modules/smart-diff/{constants,helpers}.ts` | onion-architecture | Domain ring: pure. Imports only `@devdigest/shared`, `zod`, `_shared/records.ts`. No I/O. |
| `server/src/modules/smart-diff/{ports,service}.ts` | onion-architecture | Port in domain language with records. Service gets ports through its constructor and throws `NotFoundError`. No Container or Drizzle. |
| `server/src/modules/smart-diff/routes.ts`, `server/src/modules/index.ts` | onion-architecture, fastify-best-practices, security | Zod `schema: { params: IdParams }`. `getContext` scopes the workspace (A01 access control: the PR lookup is workspace-scoped). One service call. `buildSmartDiffService(c)`. No `process.env`. |
| `server/test/*.test.ts`, `server/test/*.it.test.ts` | none (no routing entry for server tests) — follow `TESTING.md` + onion `references/testing.md` | DB-backed → `.it.test.ts`. Fakes for ports in unit tests. |
| `client/src/lib/hooks/reviews.ts` | frontend-ui-architecture, react-best-practices | [L6] key factory. Invalidation in hooks. "Data Fetching" in custom hooks. |
| `client/src/components/diff-viewer/**/*.{ts,tsx}` | frontend-ui-architecture, react-best-practices | [S4] no `app/` imports. Wording comes in from the caller. Pure `findings.ts` helpers [L1]. PascalCase slot, no render factory. |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/**` (+ nested `_components`) | frontend-ui-architecture, react-best-practices, next-best-practices (only because the files carry `'use client'`) | [S5] use only this section's own `_components` (`FindingCard` is in the same section). [L1/L10] rules in `helpers.ts`. [C6] local state for toggle/collapse. `'use client'` on leaves only [B1, B2]. |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailView/PrDetailView.tsx` | frontend-ui-architecture, react-best-practices, next-best-practices | Call the hook-provided invalidator only. No `useQueryClient` in the view. |
| `client/**/*.test.{ts,tsx}` | react-testing-library | Accessible queries first (`getByRole`, `getByText`), `within` for scoping, `vi.mock("@/lib/hooks/reviews")` as in the FindingsPanel test, user-centric scenarios. |
| `client/messages/en/prReview.json`, `server/README.md`, `e2e/specs/*` | none — data, docs and flow JSON are not code | — |
| (end of task) | engineering-insights | Append-only entries in `server/INSIGHTS.md` / `client/INSIGHTS.md` / root `INSIGHTS.md` Session Notes. |

## 5. Work items

### WI-1 Extend `SmartDiffRole` in both contract copies
- **Module / layer:** shared contracts (domain).
- **Files:** modify `server/src/vendor/shared/contracts/brief.ts` · modify `client/src/vendor/shared/contracts/brief.ts` · modify `server/test/contracts.test.ts`.
- **Change:** `SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate'])`, with the same order as the display order. Nothing else changes.
- **Contracts / DB / env:** contract only. No migration.
- **Skills:** zod · **Rules:** one schema per contract. Keep both copies byte-identical.
- **Tests:** in `contracts.test.ts`, add a `SmartDiff.parse` case with `tests` and `docs` groups, and assert that `SmartDiffRole.options` equals the 5-role list.
- **Done when:** `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` prints nothing, and the server unit tests pass.
- **Covers:** AC-P2-2 · **Depends on:** —

### WI-2 Classifier and Smart-Diff domain rules (pure)
- **Module / layer:** server · new module `server/src/modules/smart-diff/` · `constants.ts` + `helpers.ts` (domain ring).
- **Files:** create `server/src/modules/smart-diff/constants.ts` · create `server/src/modules/smart-diff/helpers.ts`.
- **Change:**
  - `constants.ts`:
    - `SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[] = ['core','tests','wiring','docs','boilerplate']`.
    - `ROLE_RULES: readonly { role: Exclude<SmartDiffRole,'core'>; patterns: readonly RegExp[] }[]` in evaluation order: boilerplate → tests → wiring → docs.
    - Each spec glob is one anchored RegExp, with a short comment naming the glob:
      - boilerplate: `*.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `dist/**`, `build/**`, `**/__snapshots__/**`, `*.snap`, `*.generated.*`, `*.min.js`;
      - tests: `*.test.ts(x)`, `*.it.test.ts`, `*.spec.ts`, `**/test/**`, `**/tests/**`, `**/__tests__/**`, `e2e/**`;
      - wiring: basename `index.ts|index.js`, `*.config.*`, `tsconfig*.json`, `.eslintrc*`, `.env*`, `docker-compose*.yml`, `.github/**`, `.claude/**`;
      - docs: `*.md`, `docs/**`, `README*`, `CHANGELOG*`, `LICENSE`.
    - Basename patterns (`*.lock`, `README*`, `.env*`, …) match the last path segment at any depth. Directory patterns (`dist/**`, `e2e/**`, `docs/**`, `.github/**`, `.claude/**`) match from the repo root. `**/x/**` matches at any depth.
    - Default role: `core`. No glob library — none is in `server/package.json`.
  - `helpers.ts`:
    - `classifyFile(path: string): SmartDiffRole` — normalise `\` → `/` and strip a leading `./`. First match wins, otherwise `core`.
    - `latestReviewFindings(rows: { review: ReviewRecord; findings: FindingRecord[] }[]): FindingRecord[]` — keep `kind === 'review'`, then the max `createdAt` per `agentId` (null = one group), then union their findings. Don't rely on input order.
    - `isCountedFinding(f): boolean` = `f.dismissedAt === null`.
    - `buildSmartDiff(files: PrFileRecord[], findings: FindingRecord[]): SmartDiff`:
      - groups in `SMART_DIFF_ROLE_ORDER`, empty groups omitted, files in input order;
      - `finding_lines` = sorted unique `startLine` of the counted findings where `file === path`;
      - `pseudocode_summary` omitted;
      - `split_suggestion = { too_big: false, total_lines: Σ(additions+deletions), proposed_splits: [] }`.
  - Imports: `@devdigest/shared` types and `../_shared/records.js` only. This is the HTTP-free import L08 will reuse.
- **Contracts / DB / env:** none.
- **Skills:** onion-architecture · **Rules:** domain ring is pure. File name = ring. ESM `.js` imports.
- **Tests:** add `server/test/smart-diff-helpers.test.ts`:
  1. `it.each` `path → role` table covering every spec pattern at least once: `pnpm-lock.yaml`, `server/pnpm-lock.yaml`, `Cargo.lock`, `dist/a.js`, `x.min.js`, `api.generated.ts`, `a.test.tsx`, `server/test/x.it.test.ts`, `e2e/specs/05.flow.json`, `src/index.ts`, `vitest.config.ts`, `tsconfig.build.json`, `.env.example`, `.github/workflows/ci.yml`, `docs/architecture.md`, `README.md`, `LICENSE`, `src/modules/reviews/service.ts` → core.
  2. The three disputed cases, each with a decision comment:
     - `src/__tests__/__snapshots__/x.snap` → boilerplate (the snapshot rule comes before the test rule);
     - `.claude/skills/security/SKILL.md` → wiring (`.claude/**` comes before docs, because it defines agent behaviour);
     - `e2e/README.md` → tests (owner 2026-11-27: spec order kept; docs inside `e2e/` travel with the flows).
  3. `latestReviewFindings`: an agent re-run replaces only that agent's findings, another agent's findings stay, the `summary` kind is ignored, and the null-agent group works.
  4. `buildSmartDiff`: role order, empty groups omitted, GitHub order inside a group, dismissed findings excluded from `finding_lines`, dedupe and sort, a finding on another file is ignored, `total_lines`, and no reviews → all `[]`.
- **Done when:** the unit test passes, and `pnpm lint:arch` stays green with the baseline unchanged.
- **Covers:** AC-P1-2, AC-P2-1, AC-P2-3 (logic), plus the server side of decisions 1/2/3 · **Depends on:** WI-1

### WI-3 Smart-Diff port, service, route and registration
- **Module / layer:** server · `ports.ts` + `service.ts` (application) · `routes.ts` (delivery) · `modules/index.ts`.
- **Files:** create `server/src/modules/smart-diff/ports.ts` · create `server/src/modules/smart-diff/service.ts` · create `server/src/modules/smart-diff/routes.ts` · modify `server/src/modules/index.ts`.
- **Change:**
  - `ports.ts`: `export interface SmartDiffSource { getPull(workspaceId: string, prId: string): Promise<PullRecord | undefined>; getPrFiles(prId: string): Promise<PrFileRecord[]>; reviewsForPull(prId: string): Promise<{ review: ReviewRecord; findings: FindingRecord[] }[]> }`, typed with records.
  - `service.ts`:
    - `export interface SmartDiffServiceDeps { source: SmartDiffSource }` and `class SmartDiffService`;
    - `forPull(workspaceId, prId): Promise<SmartDiffResponse>`: `getPull` → `NotFoundError('Pull request not found')` if missing, then `getPrFiles` + `reviewsForPull`, then `buildSmartDiff(files, latestReviewFindings(rows))`;
    - no LLM port at all, which makes AC-P2-3 structural.
  - `routes.ts`:
    - `buildSmartDiffService(c: Container) = new SmartDiffService({ source: c.reviewRepo })` — `ReviewRepository` already satisfies these three record-typed methods via `ReviewStore`;
    - `app.get('/pulls/:id/smart-diff', { schema: { params: IdParams } }, …)` calls `getContext` and then `service.forPull(workspaceId, req.params.id)`;
    - doc comment listing the route, as in `reviews/routes.ts:11-18`.
  - `modules/index.ts`: add `import smartDiff from './smart-diff/routes.js'` and a `smartDiff` entry.
- **Contracts / DB / env:** returns `SmartDiffResponse`. No env var, no DB change.
- **Skills:** onion-architecture, fastify-best-practices, security · **Rules:**
  - The port lives in the module's own `ports.ts`.
  - The service never sees `Container`.
  - Zod params on the route.
  - Workspace scoping through `getContext` + `getPull(workspaceId, …)` (A01).
  - No import from `reviews/{repository,service,ports}`.
- **Tests:**
  1. Unit `server/test/smart-diff-service.test.ts` with an in-memory fake `SmartDiffSource`: unknown PR → rejects with `NotFoundError`; known PR, no reviews → groups present, all `finding_lines: []`, and `SmartDiffResponse.parse` passes.
  2. Integration `server/test/smart-diff.it.test.ts`, modelled on `reviews.it.test.ts`:
     - seed a PR with mixed files (e.g. `src/a.ts` with a patch, `src/a.test.ts`, `src/index.ts`, `docs/x.md`, `pnpm-lock.yaml`);
     - GET before any review → 200, `SmartDiffResponse.parse` ok, role order `['core','tests','wiring','docs','boilerplate']`, every `finding_lines` empty;
     - seed agent A old/new reviews (one new finding dismissed) and agent B, plus a `summary`-kind review → `finding_lines` reflects only A-new (non-dismissed) ∪ B;
     - unknown UUID → 404;
     - non-UUID id → 4xx validation error;
     - the `MockLLMProvider` instance passed in `overrides.llm` has `calls.length === 0` after all requests.
- **Done when:** `pnpm typecheck`, `pnpm lint:arch` (baseline unchanged), the unit tests, and `pnpm exec vitest run smart-diff.it` all pass.
- **Covers:** AC-P2-2, AC-P2-3, AC-P1-3 (server counts), decisions 1/2 · **Depends on:** WI-2

### WI-4 Server docs
- **Module / layer:** server docs.
- **Files:** modify `server/README.md`.
- **Change:**
  - Add a `smartDiff["smart-diff (M3)<br/>/pulls/:id/smart-diff"]` node to the "Review & runs" subgraph (`server/README.md:71-73`).
  - Add a short "## Smart Diff (M3)" section after "PR-list findings":
    - the route and its no-LLM guarantee;
    - first-match classifier order and display order;
    - where the patterns live (`src/modules/smart-diff/constants.ts`);
    - findings = latest `kind:'review'` review per agent (union), dismissed excluded from `finding_lines`;
    - the minimal `split_suggestion`;
    - 404 for an unknown PR;
    - a link to `../specs/M3-smart-diff.md`.
- **Contracts / DB / env:** none.
- **Skills:** none — Markdown only.
- **Tests:** none.
- **Done when:** the README mentions the route and the rules above.
- **Covers:** repo rule (new route → README); supports AC-P2-3 · **Depends on:** WI-3

### WI-5 Client data hook + invalidation
- **Module / layer:** client · `src/lib/hooks/reviews.ts`.
- **Files:** modify `client/src/lib/hooks/reviews.ts` · modify `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailView/PrDetailView.tsx`.
- **Change:**
  - Add `reviewKeys.smartDiff = (prId) => ["pr-smart-diff", prId] as const`.
  - Add `useSmartDiff(prId)` → `api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`)`, `enabled: !!prId`, with `import type { SmartDiffResponse }`.
  - Invalidate `reviewKeys.smartDiff(prId)` next to every existing `reviewKeys.reviews(prId)` invalidation: `useDeleteRun`, `useDeleteReview`, `useRunReview`, `useFindingAction` (when `prId` is given).
  - Add `invalidateSmartDiff` to `usePrRunInvalidation`.
  - In `PrDetailView` `onRunDone`, also call `invalidateSmartDiff()`. This is needed because `staleTime` is 30 s (`providers.tsx:28`) and runs finish asynchronously.
- **Contracts / DB / env:** consumes `SmartDiffResponse` (type only).
- **Skills:** frontend-ui-architecture, react-best-practices · **Rules:** [L6] no inline keys. Invalidation lives in hooks. The view gets only a callback [L5].
- **Tests:** covered through the WI-7 mocks and `architecture.test.ts` (L6/L2). There is no existing hook test pattern, so don't add one.
- **Done when:** `pnpm typecheck` passes and `architecture.test.ts` is green.
- **Covers:** AC-P3-4, AC-P2-5 (counter refresh after an action) · **Depends on:** WI-1, WI-3 (route shape)

### WI-6 Diff-viewer: findings support (shared component, no `app/` imports)
- **Module / layer:** client · `src/components/diff-viewer` (shared UI).
- **Files:**
  - create `client/src/components/diff-viewer/findings.ts`;
  - modify `client/src/components/diff-viewer/{index.ts, DiffViewer/DiffViewer.tsx, FileCard/FileCard.tsx, CodeLine/CodeLine.tsx, styles.ts}`;
  - create `client/src/components/diff-viewer/OutOfPatchFindings/{OutOfPatchFindings.tsx,index.ts}`;
  - create `client/src/components/diff-viewer/findings.test.ts`.
- **Change:**
  - `findings.ts` (pure, plus the API type):
    - `DiffFindingCardProps = { f: FindingRecord; defaultExpanded?: boolean; pending?: boolean; onAction?: (action: FindingActionKind) => void }`. `FindingCard` is assignable to it.
    - `DiffFindingApi`:
      - `findings: FindingRecord[]` (already selected, dismissed included);
      - `show: boolean`;
      - `flaggedPaths: ReadonlySet<string>` (files that get the dot);
      - `Card: React.ComponentType<DiffFindingCardProps>`;
      - `onAction(f, action)`;
      - `pendingId: string | null`;
      - `labels: { severity: Record<Severity, string>; outOfPatch: string; findingDot: string }`.
    - `findingKey(f) = lineKey("RIGHT", f.start_line)`.
    - `partitionFindings(fileFindings, renderedKeys) → { matched: Map<string, FindingRecord[]>; outOfPatch: FindingRecord[] }`, mirroring `partitionThreads`.
    - `lineMark(findings) → Severity | null`: the highest severity among non-dismissed findings, ordered by `SEVERITY_LEVELS` from `@/lib/severity`. Returns null if all are dismissed.
  - `DiffViewer`: an optional `findings?: DiffFindingApi` prop, passed through to `FileCard`.
  - `FileCard`:
    - filter `findings.findings` by `file === path`;
    - compute rendered keys once (reuse the existing loop) and partition;
    - header: if `flaggedPaths.has(path)`, render a small `var(--crit)` dot after the path, with `aria-label`/`title` = `labels.findingDot`, separate from the comment counter;
    - pass `lineFindings` per `CodeLine`;
    - at the end of the body, when `findings.show && outOfPatch.length`, render `<OutOfPatchFindings>` (title = `labels.outOfPatch`, cards via `Card`);
    - this block must also render when `lines.length === 0` (seeded files have `patch: null`).
  - `CodeLine`: a new `lineFindings?: FindingRecord[]` plus a `findings?: DiffFindingApi` prop.
    - When `findings.show` and `lineMark` ≠ null: a left strip in `SEV[mark].c` (via `boxShadow: inset 3px 0 0 …` on the row, never `border` shorthand mixed with `borderLeft*`) and a right-aligned label `labels.severity[mark]` with the `SEV` icon/colour.
    - Under the row, one `<findings.Card f defaultExpanded pending={pendingId===f.id} onAction={(a)=>findings.onAction(f,a)} />` per finding, in the `cs.thread` rail.
    - Dismissed cards dim through FindingCard's `muted` style.
    - Never pass `focused`.
  - `index.ts`: also export `type DiffFindingApi, DiffFindingCardProps` (single-target exports, no `export *`).
  - The existing comment behaviour does not change.
- **Contracts / DB / env:** none.
- **Skills:** frontend-ui-architecture, react-best-practices · **Rules:**
  - [S4] no `@/app` import — the card comes in as a slot.
  - Wording comes from the caller (`client/INSIGHTS.md:291`).
  - [L1] partition and mark logic in `findings.ts`.
  - PascalCase slot, no render factory.
  - Components ≤200 lines (hence the `OutOfPatchFindings` split).
- **Tests:** `findings.test.ts` (pure):
  - a finding on a rendered `RIGHT:n` is matched, others go to `outOfPatch`;
  - a LEFT-only (deleted) line does not match;
  - `lineMark` picks CRITICAL over WARNING and returns null when only dismissed findings remain.
  - Component behaviour is covered in WI-7.
- **Done when:** typecheck passes, `architecture.test.ts` is green, and the existing diff behaviour is unchanged (`src/test/smoke.test.tsx` passes).
- **Covers:** AC-P1-4, AC-P1-5, AC-P2-4, AC-P2-6, AC-P2-7 (hook point), AC-P3-2 (FindingCard header collapse), dimmed dismissed · **Depends on:** —

### WI-7 Files changed tab: Smart order UI
- **Module / layer:** client · route `_components/DiffTab` (route-only glue).
- **Files:**
  - modify `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`;
  - create `.../DiffTab/{constants.ts, helpers.ts, styles.ts, helpers.test.ts, DiffTab.test.tsx}`;
  - create `.../DiffTab/_components/SmartDiffHeader/{SmartDiffHeader.tsx,index.ts}`;
  - create `.../DiffTab/_components/SmartDiffGroup/{SmartDiffGroup.tsx,index.ts}`;
  - modify `client/messages/en/prReview.json`.
- **Change:**
  - `constants.ts`: `ROLE_META = { core: { labelKey:'coreLabel', descKey:'coreDesc', color:'var(--accent)', defaultCollapsed:false }, tests:{…'var(--ok)'…}, wiring:{…'var(--warn)'…}, docs:{…'var(--info)', defaultCollapsed:true}, boilerplate:{…'var(--text-muted)', defaultCollapsed:true} } satisfies Record<SmartDiffRole, …>`. A future role addition then fails typecheck. `SEVERITY_LABEL_KEY = { CRITICAL:'blockerLabel', WARNING:'warningLabel', SUGGESTION:'suggestionLabel' } satisfies Record<Severity, …>`.
  - `helpers.ts` (pure, decision-1 client mirror):
    - `latestReviewFindings(reviews: ReviewRecord[]): FindingRecord[]` — kind `review`, max `created_at` per `agent_id` (null = one group), union;
    - `hasReviews(reviews)` (any `kind:'review'`);
    - `orderedGroups(smart: SmartDiffResponse, files: PrFile[]) → { role, files: PrFile[], flaggedCount }[]`: map paths to the `PrFile`s carrying patches; `flaggedCount` = files with `finding_lines.length > 0`; drop paths missing from `files`;
    - `flaggedPaths(smart) → Set<string>`;
    - `diffTotals(files) → { count, additions, deletions }`.
  - `DiffTab.tsx` (container):
    - `usePrComments`, `useCreatePrComment` (unchanged), `usePrReviews(prId)`, `useSmartDiff(prId)`, `useFindingAction()`;
    - local state `order: 'smart' | 'original'` (default `smart`) and the existing `showComments` (now also gates findings: `findings.show = showComments`);
    - builds `DiffFindingApi` with `Card = FindingCard` (imported from `../FindingCard`, same route section) and `onAction = (f, a) => action.mutate({ findingId: f.id, action: a, prId })`. Leave `repoFullName`/`headSha` unpassed; FindingCard tolerates no href;
    - the show/hide button renders when `commentCount > 0 || findingCount > 0`, and its label moves to `prReview.smartDiff` strings (counting comments + findings);
    - Smart order: render one `SmartDiffGroup` per ordered group. Original order: `<DiffViewer files={files} …/>` exactly as today;
    - while `useSmartDiff` is loading or has errored, fall back to the original flat list, so the tab never blanks.
  - `SmartDiffHeader`:
    - header "REVIEWER-ORDERED DIFF" with "N files · +A −D" (`diffTotals(files)`);
    - right-aligned segmented switch = two `Button`s with `active` and `aria-pressed` ("Smart order" / "Original order");
    - the comments/findings toggle.
  - `SmartDiffGroup`:
    - its own `collapsed` state, initialised from `ROLE_META[role].defaultCollapsed`;
    - a sticky header row (`position: sticky; top: 0; zIndex; background: var(--bg)`): chevron button (`aria-expanded`), colour square, bold label, muted description; on the right `● N` (red dot, only when `flaggedCount > 0` and reviews exist) and "N files";
    - when `!hasReviews`, show the empty-state text once in the header (P3-3) and no counters;
    - when expanded, render `<DiffViewer files={group.files} commenting findings />`. FileCard keeps the `AUTO_EXPAND_MAX_LINES` rule.
  - Strings: add to `prReview.json → smartDiff`:
    - labels: `testsLabel`, `docsLabel`;
    - role descriptions: `coreDesc` "The substance of the change — review closely", `testsDesc`, `wiringDesc` "Hooks the core into the app", `docsDesc`, `boilerplateDesc` "Generated / mechanical — skim";
    - header and switch: `title` "Reviewer-ordered diff", `totals` "{count} files · +{additions} −{deletions}", `smartOrder`, `originalOrder`;
    - empty state: `notReviewed` "Review has not been run yet";
    - severity line labels: `blockerLabel` "blocker", `warningLabel` "warning", `suggestionLabel` "suggestion";
    - finding blocks: `outOfPatchTitle` "{count} finding(s) outside this diff", `findingDot` "Has review findings";
    - toggle: `showComments` / `hideComments` (with count);
    - group counter: `flaggedFiles` "{count} files with findings" (aria-label).
  - Keep the existing keys.
- **Contracts / DB / env:** none (types only).
- **Skills:** frontend-ui-architecture, react-best-practices, next-best-practices (directive), react-testing-library (tests) · **Rules:**
  - [S5] only own-section imports.
  - [L1/L10] selection and grouping in `helpers.ts`, tested without `render()`.
  - [C6] local state for order/collapse (URL param not required by the spec).
  - Derive, don't store.
  - `'use client'` stays on `DiffTab.tsx` only, and nested files are leaves imported by it [B2].
  - All strings come from `messages/en/prReview.json`.
- **Tests:**
  1. `helpers.test.ts`: `latestReviewFindings` (re-run replaces one agent only, other agent kept, `summary` ignored, null agent); `orderedGroups` (order kept, `flaggedCount`, missing path dropped); `diffTotals`.
  2. `DiffTab.test.tsx` (RTL; `vi.mock("@/lib/hooks/reviews")` returning fixture data for `usePrComments`, `useCreatePrComment`, `usePrReviews`, `useSmartDiff`, `useFindingAction`; `NextIntlClientProvider` with `{ prReview, shell }`):
     - groups render in role order with label + "N files"; docs and boilerplate are collapsed (no file path visible), core and tests expanded;
     - clicking a collapsed group header expands it;
     - "Original order" shows the flat list in GitHub order; switching back restores the groups;
     - the group counter shows `● 1` only on the group with a flagged file;
     - the dot (by `aria-label` `findingDot`) is on the flagged file only;
     - with findings visible, a finding card title appears under its line together with the severity label ("warning") — the patch fixture contains the line;
     - a finding whose `start_line` isn't in the patch appears under the out-of-patch title;
     - a dismissed finding renders but is not counted (counter/dot unaffected), using a fixture whose `finding_lines` excludes it;
     - the show/hide toggle hides and shows finding cards;
     - no reviews → the "Review has not been run yet" text and no `●` counter;
     - clicking Accept calls `mutate` with `{ findingId, action: 'accept', prId }`.
- **Done when:** `pnpm test` (including `architecture.test.ts`) and `pnpm typecheck` are green.
- **Covers:** AC-P1-1, P1-2 (UI), P1-3, P1-4, P1-5, P1-6, P2-4, P2-5, P2-6, P2-7, P3-1, P3-2, P3-3, P3-5 · **Depends on:** WI-5, WI-6

### WI-8 Deterministic e2e flow
- **Module / layer:** e2e.
- **Files:** create `e2e/specs/10-smart-diff.flow.json` · modify `e2e/specs/README.md` (catalogue row).
- **Change:** on seeded PR #482 (all 4 files are `src/**` → core; the legacy review has findings on `src/config.ts` and `src/api/users.ts`; patches are null):
  - open the PR, then `find role button click --name "Files changed"`, then `wait --url tab=diff`;
  - `wait --text "Reviewer-ordered diff"` (or the final header string);
  - `wait --text "Core"` and `wait --text "4 files"`;
  - `find role button click --name "Original order"`, then `wait --text "src/config.ts"`.
  - Read-only, no model call, only `--url/--text/find` locators.
  - Leave `05-pr-diff.flow.json` unchanged: `src/config.ts` stays visible because Core is expanded.
- **Contracts / DB / env:** none (seed unchanged).
- **Skills:** none — flow JSON.
- **Tests:** the flow itself.
- **Done when:** `./scripts/e2e.sh` passes 05 and 10 (if agent-browser is available; otherwise report "not run").
- **Covers:** AC-P1-1, AC-P1-6 (end-to-end smoke) · **Depends on:** WI-3, WI-7

## 6. Verification plan
- server (`cd server`):
  - `pnpm typecheck` (needs `reviewer-core/node_modules`, `INSIGHTS.md:48-51`);
  - `pnpm lint:arch` (baseline file unchanged);
  - `pnpm exec vitest run --exclude '**/*.it.test.ts'`;
  - `pnpm exec vitest run smart-diff.it` alone, then `pnpm exec vitest run .it.test`.
- contracts: `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` prints nothing.
- client (`cd client`): `pnpm typecheck` · `pnpm test` (filter by name: `pnpm exec vitest run DiffTab`, `pnpm exec vitest run findings`).
- e2e: `./scripts/e2e.sh` (hermetic). If agent-browser is missing, report "not run".
- Manual / owner: sticky header (P3-1) and strip/label layout via a headless-Chrome screenshot (`client/INSIGHTS.md:335-342`). Demo video and PR text (P1-7, P2-8).

## 7. Out of scope
- Architecture and security review (separate agents).
- P1-7 (PR + 1–3 min demo video) and P2-8 (PR description naming subagents / plan-verifier checks) — manual owner tasks.
- `pseudocode_summary`, any LLM call, a real `split_suggestion`, and the `largeTitle`/`largeBody` split UI.
- Agent runs tab, `FindingCard` internals (including fixing its existing borderColor warning), `src/vendor/ui/**`.
- Unifying the pulls `latestReviewIdsPerAgent` with the new helper. No DB schema or migration change.

## 8. Risks & open questions
- Two copies of the "latest per agent" rule exist on the server (`pulls/findings-summary.ts` does not filter `kind`; the smart-diff helper does, per spec), plus a client mirror. Mitigation: each has a table test with the same scenarios. Don't change pulls (`server/INSIGHTS.md:184-189`).
- Group counters and dots come from the route (`finding_lines`), while cards come from `usePrReviews`, so the two can lag for one refetch. Mitigation: WI-5 invalidates both keys on every review/finding mutation and on run done.
- I chose that a line whose only findings are dismissed gets no strip or label, while the dimmed card still renders. The spec doesn't say; the owner can override this without blocking the work.
- The header count switches from `pr.files_count` (seed: 9) to the number of rendered files (seed: 4), so it matches the group counts. If the owner wants `files_count`, only `diffTotals` changes. Not blocking.
- *Unverified:* the sticky header could be clipped by an ancestor with `overflow` between `<main overflow:auto>` (`AppFrame.tsx:29`) and the group, or overlap a sticky `PrDetailHeader`. Check by screenshot and adjust `top`.
- *Unverified:* that `ReviewRepository`'s Drizzle row types are assignable to the record-typed `SmartDiffSource` without a cast. It should hold, because `ReviewRepository` already satisfies `ReviewStore` (`reviews/ports.ts:62-68`) and `db/rows.ts` asserts row ≡ record. If typecheck objects, put a thin mapper in `routes.ts`, never in the service.
- *Unverified:* the Button `active` prop's visual state as a segmented control, and whether `var(--bg)` is the right sticky background token (`--accent`, `--crit`, `--warn`, `--sugg`, `--info` and `--ok` exist in `client/src/vendor/ui/styles.css:20-34`).
- Hand-written glob → RegExp patterns can drift from the spec globs. Mitigation: the WI-2 table covers every pattern at least once.
- No ⛔ blocking questions.
