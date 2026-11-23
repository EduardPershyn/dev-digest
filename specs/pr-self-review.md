# PR Self Review — skill-routed review of local changes
- **Status:** done
- **Milestone:** — (dev tooling) · **Packages:** `.claude/` (no app code)
- **Owner:** <name>

## Problem
We keep project rules in skills under `.claude/skills/`: `onion-architecture`,
`frontend-ui-architecture`, `security`, and others. Nothing applies them to a branch before
it becomes a PR. Rule breaks show up in human review or after merge. We need a review of
local changes that:
1. picks the skills that apply to each changed file (UI skills for `client/`, backend
   architecture skills for `server/` and `reviewer-core/`, and so on),
2. runs **only when the developer asks for it** (`/pr-self-review`),
3. gives a clear verdict: **READY TO MERGE**, or **NOT READY** when at least one CRITICAL
   finding exists.

## Scope / Non-goals
**In scope (v1)**
- New project skill `.claude/skills/pr-self-review/` with a routing manifest, a severity
  rubric and a small deterministic Node helper (`scripts/gate.mjs` + `scripts/lib/`).
- Manual run only. The verdict is advice; nothing is blocked.
- Evals for routing and the verdict, following the `frontend-ui-architecture/evals/` format.

**Non-goals (v1, see "Future: enforcement")**
- Running automatically, or being loaded by the agent without being asked.
- Blocking `gh pr create` or `gh pr merge` (no Claude Code hook, no git hook).
- A GitHub commit status, branch protection or a CI job.
- Editing third-party skills. They are pinned in `skills-lock.json` (`computedHash`) and an
  update would overwrite our edits, so routing data lives only in our skill.
- Replacing DevDigest's own reviewer. We reuse its vocabulary (CRITICAL / WARNING /
  SUGGESTION, `ci_fail_on: critical`) but not its runtime.
- Fixing findings automatically. The skill reports; the developer or agent fixes.

## Design

### 1. File layout
```
.claude/skills/pr-self-review/
  SKILL.md                         # workflow the agent follows
  routing.json                     # skill ⇄ glob / content-trigger map (source of truth)
  severity.md                      # CRITICAL / WARNING / SUGGESTION rubric
  finding.schema.json              # shape every reviewer subagent must return
  templates/{reviewer,verifier}.md # subagent prompts, filled in by gate.mjs
  scripts/gate.mjs                 # deterministic CLI: scope | route | check-repo | ground | report
  scripts/lib/*.mjs                # glob, diff, scope, route, checks, ground, report
  scripts/gate.test.mjs            # node --test, fixture diffs + temp git repos
  evals/<case>/{case.yaml,prompt.md,graders/*.md}, evals/fixtures/make-fixture.sh
.devdigest/self-review/<head12>-<fingerprint8>/   # gitignored run dir: plan, slices,
                                                  # findings, checks, report.{json,md}
```
`gate.mjs` uses only Node built-ins (Node ≥22 is already required); the manifest is JSON,
not YAML, to stay dependency-free. No root `package.json` is added, which keeps the
CLAUDE.md rule "NO root workspace".

### 2. Diff scope ("pending changes")
`gate.mjs scope [--base main] [--base-ref <ref>] [--no-fetch]`:
- base = `git merge-base origin/<base> HEAD` (fetch first; fall back to the local `<base>`).
  `--base-ref` diffs against an exact ref instead. When local `<base>` is ahead of
  `origin/<base>`, the report notes it: those unpushed commits would be in the PR too.
- Reviewed set = `git diff --name-status <base>...HEAD` plus staged, unstaged and untracked
  files. These are labelled `committed` or `uncommitted`.
- Outputs JSON `{ baseSha, headSha, dirty, files: [{ path, status, origin, hunks }] }`.
- Drops lockfiles, `dist/`, `.next/`, `agent-runner/dist/`, binaries and generated
  `server/src/db/migrations/meta/*` from per-skill review. They still count for the
  repo-rule checks in §5.
- If the tree is dirty, the report says so next to the verdict: "includes N uncommitted
  files — commit them or the PR will differ from what was reviewed".
- The run dir is keyed by HEAD plus a fingerprint of the whole diff (incl. untracked
  contents), so a rerun on an unchanged diff reuses the report, and any edit makes a new
  run.

### 3. Skill routing (`routing.json`)
One entry per skill. Each entry has `paths` (globs), optional `content` (regex on added
lines) and `review: true|false`. A skill matches a file if any glob matches **or** any
content regex hits an added line. Starting map for the current catalog:

| Skill | Paths | Content triggers |
|---|---|---|
| `frontend-ui-architecture` | `client/src/**/*.{ts,tsx}` (not `vendor/**`) | — |
| `react-best-practices` | `client/src/**/*.tsx`, `client/src/lib/hooks/**` | — |
| `next-best-practices` | `client/src/app/**`, `client/next.config.*`, `client/src/middleware.ts` | `'use (client\|server)'` |
| `react-testing-library` | `client/**/*.test.{ts,tsx}`, `client/src/test/**` | — |
| `onion-architecture` | `server/src/**`, `reviewer-core/src/**`, `server/.dependency-cruiser*` | — |
| `fastify-best-practices` | `server/src/modules/*/routes.ts`, `server/src/app.ts`, `server/src/server.ts`, `server/src/platform/**` | `fastify\.(register\|addHook\|decorate)` |
| `drizzle-orm-patterns` | `server/src/db/**`, `server/src/modules/*/repository.ts`, `server/drizzle.config.ts` | `from 'drizzle-orm` |
| `postgresql-table-design` | `server/src/db/schema/**`, `server/src/db/schema.ts`, `server/src/db/migrations/*.sql` | — |
| `zod` | `**/vendor/shared/contracts/**` | `from 'zod'` |
| `security` | `server/src/modules/*/routes.ts`, `server/src/adapters/**`, `scripts/**`, `.github/workflows/**`, `**/*.env*` | `process\.env`, `child_process`, `exec(`/`spawn(` (not `re.exec(`), `sql\.raw`, `dangerouslySetInnerHTML`, `\bfetch\(` (not `refetch(`) |
| `typescript-expert` | `**/tsconfig*.json` | `as any`, `@ts-(ignore\|expect-error)` |
| `mermaid-diagram`, `engineering-insights`, `pr-self-review` | — | `review: false` (these skills don't review code) |

Content triggers only apply to code files (`codeFiles` in `routing.json`), so prose in
Markdown never pulls in a reviewer. Client tests are excluded from the UI-architecture
skills and routed to `react-testing-library`; backend tests are excluded from
`onion-architecture`.

Guard against drift: `gate.mjs route` reads every `.claude/skills/*/SKILL.md`. Any skill
missing from `routing.json` triggers a **warning** in the report ("unrouted skill: X") and
makes `gate.test.mjs` fail, so a new skill can't be skipped without anyone noticing.

Output: `{ skill → [files + only the hunks that matched] }`. Each reviewer sees only its
own slice, which keeps context small.

### 4. Review execution (the part that needs judgment)
`SKILL.md` steps:
1. `node .claude/skills/pr-self-review/scripts/gate.mjs scope` → `route`.
2. **Deterministic checks first** (§5). They are cheap, and a failure is already CRITICAL.
3. For each routed skill, **one subagent in parallel**. Its prompt holds: the skill's
   `SKILL.md` (and the reference files that SKILL.md links for the matched area),
   `severity.md`, `finding.schema.json` and the diff slice. Instruction: report only
   violations of rules *stated in that skill*, cite the rule, and quote the offending
   line.
4. **Grounding pass** (same idea as `reviewer-core/src/grounding.ts`). Drop findings whose
   `file:line` is outside the diff or whose quoted `evidence` isn't in the hunk. Merge
   duplicates that two skills raised for the same `file:line`, keeping the highest
   severity and listing both skills.
5. **CRITICAL re-check.** Each surviving CRITICAL goes to one extra verifier subagent:
   "Is this a real violation of <rule>? Answer CONFIRMED or DOWNGRADE with a reason." This
   keeps false alarms out of the verdict.
6. `gate.mjs report` writes `<runDir>/report.{json,md}`.
7. Print the verdict (§6).

Who does what: `gate.mjs` does every deterministic step (scope, routing, slice prompts,
repo checks, grounding, dedup, verifier prompts, verdict). The agent only spawns the
subagents `route` and `ground` planned and shows the report.

Finding shape (`finding.schema.json`), matching DevDigest's own contract:
`{ id, skill, rule, severity: CRITICAL|WARNING|SUGGESTION, file, line, evidence, message, fix }`.
`id` = hash(skill, rule, file, evidence), so it stays stable across reruns.

### 5. Deterministic repo-rule checks (no LLM)
These run inside `gate.mjs check-repo`. Only the ones whose packages are touched run:
| Check | When | Failure severity |
|---|---|---|
| `cd server && pnpm lint:arch` | `server/src/**` or `reviewer-core/src/**` changed | CRITICAL |
| `pnpm typecheck` / `npm run typecheck` per touched package (`reviewer-core` change also typechecks `server`) | package changed | CRITICAL |
| `@devdigest/shared` drift: a change under `server/src/vendor/shared/**` with no matching change in `client/src/vendor/shared/**`, or the reverse (CLAUDE.md gotcha) | either side changed | WARNING (the copies have already diverged by design) |
| Schema without migration: `server/src/db/schema*` changed and no new `server/src/db/migrations/*.sql` | schema changed | CRITICAL |
| Secrets: added lines matching key patterns, or a committed `.env*` | always | CRITICAL |

A command check whose `node_modules` are missing is **skipped** and noted under the
verdict, never reported as findings. Tests are **not** run here because CI already runs
them per package. A `--with-tests` flag
can be added later.

### 6. Verdict
- `critical === 0` → **READY TO MERGE** (warnings and suggestions are listed but don't
  change the verdict).
- `critical ≥ 1` → **NOT READY**, followed by the full CRITICAL list, each with
  `file:line`, skill, rule and a suggested fix.
- No CRITICAL but a reviewer slice produced no output even after one retry →
  **INCOMPLETE** (the review can't vouch for that slice).
- Terminal output order: verdict line → a skill → files → C/W/S counts table → CRITICALs
  → WARNINGs → SUGGESTIONs (collapsed when there are many) → path to the saved report.
- Dirty tree note and "unrouted skill" warnings go directly under the verdict.
- The verdict is advice only. Nothing is pushed, posted or blocked.

### 7. Invocation
- Manual only: `/pr-self-review [--base main] [--base-ref <ref>] [--skills a,b] [--force] [--no-fetch]`, plus the
  limit flags under "Decisions" (`--max-parallel`, `--slice-lines`, `--max-lines`,
  `--model`).
- `SKILL.md` frontmatter sets `disable-model-invocation: true`, so the agent never loads it
  on its own (for example while opening a PR). Its `description` only says what it does
  when called.
- Rerunning on an unchanged diff reuses the cached report unless `--force` is passed.
  A `--skills` run gets its own run dir and its report says it is partial.

### 8. Docs and housekeeping
- `.claude/skills/README.md`: add a catalog row (scope: Shared).
- Root `CLAUDE.md` → "Read when": *"Before opening or merging a PR, if asked →
  `/pr-self-review` (manual)"*.
- `.gitignore`: add `.devdigest/self-review/`.
- `TESTING.md`: mention how to run `node --test .claude/skills/pr-self-review/scripts/gate.test.mjs`
  (local only for now, no CI workflow).
- After the first real run: an `engineering-insights` entry in the root `INSIGHTS.md`
  (routing false positives, noisy rules).

### 9. Implementation order
1. `routing.json`, `severity.md`, `finding.schema.json`.
2. `gate.mjs scope|route` with `gate.test.mjs` fixtures: client-only diff, server-only
   diff, mixed diff, docs-only diff, unrouted new skill.
3. `SKILL.md` workflow (steps 1–7), then try it by hand on `refactor/client-frontend-architecture`.
4. `gate.mjs check-repo` (deterministic checks).
5. Evals, docs, `.gitignore`, catalog row, CLAUDE.md line.

## Acceptance criteria
- [ ] `/pr-self-review` on a diff that touches only `client/` runs only frontend-routed
      skills; on a diff that touches only `server/` it runs only backend-routed skills;
      a docs-only diff runs no LLM reviewers and is READY TO MERGE.
- [ ] Every skill in `.claude/skills/` is either routed or marked `review: false`, and the
      test fails otherwise.
- [ ] Each finding names its skill and rule and is grounded in a changed line. Ungrounded
      findings never reach the report.
- [ ] A seeded onion-architecture violation (domain importing `drizzle-orm`) or a
      `lint:arch` failure gives CRITICAL → NOT READY.
- [ ] The skill never runs unless invoked with `/pr-self-review`, and it never pushes,
      posts or blocks anything.
- [ ] A dirty working tree is reported next to the verdict.
- [ ] Evals exist for: UI-only routing, backend CRITICAL → NOT READY, docs-only → READY.

## Decisions
- **No waivers.** The verdict is advice, so when a finding is a false positive the
  developer just goes ahead with the PR. If the same false positive keeps coming up, fix
  its source: narrow the glob or content trigger in `routing.json`, or tighten
  `severity.md`. Record it with `engineering-insights`.
- **Cost limits.** Defaults are below. Each can be overridden with a flag.

| Limit | Default | When exceeded |
|---|---|---|
| Parallel reviewer subagents | 6 (`--max-parallel`) | Remaining skills run in the next wave |
| Changed lines per skill slice | 800 (`--slice-lines`) | Slice is split by file into several subagents for that skill. A single file over the limit is reviewed alone. |
| Total changed lines in files routed to at least one skill | 4000 (`--max-lines`) | Stop before any LLM call, print the size and the per-skill breakdown, and ask the user to confirm or narrow with `--skills` |
| CRITICAL re-check subagents | 10 | Further CRITICALs stay CRITICAL with a `not re-checked` note |
| Deterministic checks (§5) | always run, no cap | — |
| Reviewer model | inherits the session model (`--model` to override, e.g. a cheaper one for big diffs) | — |

## Future: enforcement (not in v1)
Kept here so v1 doesn't paint us into a corner. Report files are keyed by `headSha`, and
finding ids are stable, so we can add these later:
- **Auto-run before a PR:** a Claude Code `PreToolUse` hook on `gh pr create|ready|merge`
  that blocks (exit 2) when there's no READY report for HEAD.
- **Merge gate:** `gate.mjs publish` posts a `devdigest/self-review` commit status; branch
  protection on `main` requires it. Trust-based (anyone with write access can post
  `success`); a CI-run review would close that gap.
- Decisions to make then: which repo (fork or course org), drafts with CRITICALs allowed
  or not, and CI cost.
