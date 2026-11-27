# Agents

Project subagents for Claude Code. Each `*.md` file here is one agent: YAML frontmatter
(name, description, tools, model, hooks) plus its system prompt. This README is a map of the
suite. The agent files are the source of truth, so read them for the full rules.

Agents load at session start. After adding or editing a file, restart the session or run
`/agents`.

## Catalog

| Agent | Role | Writes files? | Model · effort | Max turns |
|---|---|---|---|---|
| [researcher](researcher.md) | Answers one concrete question from the repo, external docs, or both | No | `sonnet` · default | — |
| [planner](planner.md) | Turns a request or spec into a Development Plan | No | `opus` · high | 60 |
| [implementer](implementer.md) | Executes an approved plan, then verifies its own changes | Yes | `inherit` · medium | 150 |
| [test-writer](test-writer.md) | Writes UI/backend tests and e2e flows; proves each test can fail | Test files only | `inherit` · medium | 100 |
| [plan-verifier](plan-verifier.md) | Checks the finished work against every plan item and requirement | No | `opus` · high | 60 |
| [architecture-reviewer](architecture-reviewer.md) | Reviews a change against the onion and frontend layering rules | No | `opus` · high | 40 |
| [doc-writer](doc-writer.md) | Documents implemented features, with Mermaid diagrams, in the right `docs/` section | Doc Markdown only | `sonnet` · medium | 60 |

A **security** reviewer agent is still planned. Until then, use the manual `/pr-self-review`
skill, which also routes the `security` skill.

## Workflow

```
request / spec ─► planner ─► Development Plan ─► user approves ─► main session saves it
                                                                        │
                    [test-writer, mode tests-first — optional] ◄────────┤
                                                                        ▼
                                    implementer ─► Implementation Report
                                                                        │
                                       test-writer (mode cover) ◄───────┘
                                                │
                     ┌──────────────────────────┴─────────────────────────┐
                     ▼                                                    ▼
          plan-verifier (does it match the plan?)        architecture-reviewer (are the boundaries kept?)
                     │                                                    │
                     └── DOES NOT MEET PLAN / FAIL ─► implementer with the failing rows or findings
                                                │
                                  MEETS PLAN + PASS
                                                ▼
                        doc-writer ─► /pr-self-review ─► user commits

researcher: on demand, at any step (e.g. "how does X work?" before planning)
```

The planner, implementer and test-writer share one rule source. All three map file paths to
skills through [`../skills/pr-self-review/routing.json`](../skills/pr-self-review/routing.json)
and read the same `SKILL.md` files. The plan therefore names the skills the implementer will
load. If a plan conflicts with a skill or a `CLAUDE.md` rule, the implementer stops that work
item and reports a **Deviation**.

The two checkers answer different questions and don't overlap:
- **plan-verifier** checks conformance. Is every AC, work item, verification command and
  checkable constraint in the plan actually met? It returns one row per requirement and no
  advice.
- **architecture-reviewer** checks quality against stated rules. Does the change keep the
  layering that `lint:arch`, `architecture.test.ts` and the two architecture skills define?

## Permissions

Tools are allowlisted in `tools`, and `disallowedTools` removes anything else. Hooks guard
what a tool allowlist can't, chiefly Bash and the write scope.

| | researcher | planner | implementer | test-writer | plan-verifier | architecture-reviewer | doc-writer |
|---|---|---|---|---|---|---|---|
| Read · Grep · Glob | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Bash | read-only by prompt only | `readonly-bash.sh` | `implementer-guard.sh` | `readonly-bash.sh --profile tests` | `readonly-bash.sh --profile checks` | `readonly-bash.sh --profile arch` | `readonly-bash.sh` |
| Edit · Write | — | denied | ✓ `implementer-guard.sh` | test paths only, `write-scope-guard.sh` | denied | denied | doc Markdown only, `write-scope-guard.sh` |
| Skill | — | denied | ✓ | ✓ | denied | denied (preloaded) | ✓ (`mermaid-diagram`, `engineering-insights`) |
| WebSearch · WebFetch | ✓ | denied | denied | denied | denied | denied | denied |
| Agent (spawn subagents) | — | denied | denied | denied | denied | denied | denied |
| AskUserQuestion | ✓ | — | — | — | — | — | — |
| Preloaded skills | — | `onion-architecture`, `frontend-ui-architecture` | — | — | — | `onion-architecture`, `frontend-ui-architecture` | — |
| `permissionMode` | inherits | inherits | `acceptEdits`* | `acceptEdits`* | inherits | inherits | `acceptEdits`* |

\* `permissionMode` is ignored when the parent session runs in auto, acceptEdits or
bypassPermissions mode. Safety therefore rests on the tool lists and the hooks, never on
the mode.

**Where hooks don't protect you.**
- Claude Code skips frontmatter hooks until you accept the workspace trust dialog for this
  folder. A `-p` (headless) session doesn't count as accepting it.
- A PreToolUse hook that times out lets the call through.
- So don't run the writer agents headless. If the hooks are skipped, only the tool lists
  still apply.
- The test-writer and plan-verifier also run repo code: test suites, which can execute
  anything a test file does. Both therefore compare `git status --short` before and after,
  and report any difference.

No agent sets `memory:`, because it silently enables Read, Write and Edit.
`.claude/scripts/agents.test.mjs` enforces this, together with the rest of the frontmatter
rules.

### Hooks and tools

| File | Used by | Allows | Blocks |
|---|---|---|---|
| [`readonly-bash.sh`](../hooks/readonly-bash.sh) (no profile) | planner, doc-writer (Bash) | `git log/show/diff/blame/status/merge-base/ls-files/…`, `ls`, `cat`, `head`, `tail`, `rg`, `grep`, `find`, `wc`, `jq`, `diff`, `sort`, … | Any other program; redirects to files; `$(…)` and backticks; `find -exec/-delete`; `--output`, `--pre`; `sort -o`; git global options |
| `readonly-bash.sh --profile arch` | architecture-reviewer | The default, plus exactly `pnpm lint:arch` and `pnpm exec vitest run src/test/architecture.test.ts` | Everything else, including `lint:arch:baseline` |
| `readonly-bash.sh --profile checks` | plan-verifier | `arch`, plus `pnpm typecheck`, `npm run typecheck`, `pnpm test`/`pnpm exec vitest run`/`npm test --` with plain name filters and `--exclude`/`-t`, `node --test .claude/**/*.test.mjs`, `./scripts/e2e.sh` | `-u`/`--update`, `--watch`, `--coverage`, `--outputFile`, `--config` and any other vitest option; installs; `db:*`; `npx`/`dlx`; other `node` calls; env-assignment prefixes; `$VAR` or backslashes in a check command |
| `readonly-bash.sh --profile tests` | test-writer | `checks`, plus `node .claude/scripts/mutation-probe.mjs …` | As for `checks` |
| [`write-scope-guard.sh`](../hooks/write-scope-guard.sh) `--profile test-writer` | test-writer (Edit, Write, MultiEdit, NotebookEdit) | `server/test/**/*.test.ts`, `server/src/**/*.test.ts`, `reviewer-core/{test,src}/**/*.test.ts`, `client/src/**/*.test.ts(x)`, test helpers and fixtures, `client/src/test/**`, `e2e/specs/NN-*.flow.json` and its README, append-only `INSIGHTS.md` | Production code, configs, `mocks.ts`, `client/src/test/{architecture.test.ts,setup.ts}`, snapshots, paths outside the repo; `.only/.skip/.fails/.todo`, `xit`/`fit` in new content |
| `write-scope-guard.sh --profile doc-writer` | doc-writer | Root `README.md` and `TESTING.md`, `docs/**/*.md`, `<module>/README.md`, `<module>/docs/**/*.md`, `<module>/src/**/README.md`, append-only `INSIGHTS.md` | `docs/skills/**` and `docs/skills-samples/**` (seed mirrors), `docs/agent-prompts/*-reviewer.md` (seeded prompts), `client/src/vendor/**`, every `CLAUDE.md`, `specs/**`, `.claude/**`, non-Markdown |
| [`implementer-guard.sh`](../hooks/implementer-guard.sh) | implementer (Edit, Write, Bash) | Everything else | Edits to existing `server/src/db/migrations/**`, `client/src/vendor/ui/**`, the dependency-cruiser baseline, `.claude/{agents,skills,hooks,scripts,settings}`, `.env`. Commands: `docker compose down -v`, `lint:arch:baseline`, `git commit/push/reset/checkout/stash/…`, `--no-verify` |
| [`../scripts/mutation-probe.mjs`](../scripts/mutation-probe.mjs) | test-writer (via Bash) | Runs the test unmutated (it must pass), makes one literal edit in one `{server,client,reviewer-core}/src/` file, re-runs the test, and restores the bytes (sha256-checked). Exit 0 = killed, 1 = survived, 2 = refused, 3 = restore failed | Test files, `vendor/`, paths outside `src/`, a `--find` that isn't unique, filters with quotes, globs or brackets |

All hooks exit 2 to block, and their stderr message is shown to the agent. They fail closed
when `jq` is missing or the profile is unknown. The Bash hooks are quote-aware, so
`rg 'a|b'` and `rg '=>'` are not mistaken for pipes or redirects. `readonly-bash.sh` checks
for substitution on the raw command, so a backtick is blocked even inside quotes.

Tests (Node built-ins, local only, no CI workflow):

```sh
node --test .claude/hooks/hooks.test.mjs .claude/scripts/agents.test.mjs .claude/scripts/mutation-probe.test.mjs
```

## Inputs and outputs

| Agent | Input | Output | Persisted where |
|---|---|---|---|
| researcher | One concrete question. Without one, it returns `## Clarification needed` | Research report: internal, external or mixed. Each finding has a citation, plus a *Not found / unverified* table | Conversation only |
| planner | Feature request and/or spec path (`specs/…`, `<module>/specs/…`) | **Development Plan** with 8 sections (see below), or `## Clarification needed` | The main session saves the approved plan to the path in its `Save to:` line: `specs/<spec>/plans/<slug>.md`, or `specs/plans/<date>-<slug>.md` without a spec |
| implementer | Approved plan, inline or as a path | Code and tests in the working tree, plus an **Implementation Report**. It returns `Plan rejected: <reasons>` if the plan fails its check | Working tree (uncommitted), `INSIGHTS.md` entries, report in the conversation |
| test-writer | Code, a plan or a request, plus mode `cover` (default) or `tests-first` | Tests in the working tree, plus a **Test Report**: tests written, skills loaded, runs, red proof per test, working tree before/after, *Needed production changes*, not verified | Working tree, `INSIGHTS.md` entries |
| plan-verifier | Plan path (required), optional spec, Implementation Report, base ref | **Plan Verification Report**: checks run, a traceability matrix with one row per spec AC / plan AC / WI files · tests · done-when / verification command / constraint / scope fence. Each row is met · partial · not met · unverifiable, with evidence. Overall MEETS PLAN · DOES NOT MEET PLAN · CANNOT CONFIRM. No recommendations | Conversation only |
| architecture-reviewer | Default: the branch diff vs the merge-base with local `main`. Or a module, path or base ref | **Architecture Review**: scope by ring, checks run, CRITICAL/WARNING findings (rule, `file:line`, verbatim evidence, import chain, source), unverified, verdict PASS · FAIL · UNKNOWN | Conversation only |
| doc-writer | A plan, spec, Implementation Report or topic | Docs in the working tree, plus a **Documentation Report**: files with Diátaxis type and placement rule, claims ↔ evidence, diagrams, not documented, proposed edits outside its scope, ADR candidates | Working tree, `INSIGHTS.md` entries |

**Development Plan sections:**
1. Goal & acceptance criteria (AC-n)
2. Context read
3. Constraints (architecture, INSIGHTS, repo rules)
4. Skill map
5. Work items (WI-n: files, layer, skills, tests, done-when, covers, depends-on)
6. Verification plan
7. Out of scope
8. Risks & open questions (⛔ = blocking)

**Implementation Report sections:**
- Work items (status, skills loaded, files)
- Changes (`git diff --stat`)
- Verification (command, exit code, output, PASS/FAIL/**SKIPPED**)
- Acceptance (AC-n met or not, with evidence)
- Deviations from plan
- Not verified
- Insights recorded
- For reviewers (pointers only, no verdicts)

## Where the agents' rules come from

### External best practices

| Practice | Applied in | Source |
|---|---|---|
| Enforce limits with `tools` / `disallowedTools`, not prompt text | Tool lists of every agent | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) · [Subagents](https://code.claude.com/docs/en/sub-agents) |
| Bash can write files even without Edit/Write, so guard it with a `PreToolUse` hook (exit 2) | `readonly-bash.sh` and its profiles | [Subagents](https://code.claude.com/docs/en/sub-agents) (read-only example with hook) |
| A `disallowedTools` entry with a specifier removes the whole tool, so fine-grained rules live in hooks | Bash profiles, `write-scope-guard.sh` | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| Unknown or misspelled frontmatter keys are silently ignored | `agents.test.mjs` key lint | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| `memory:` enables Read/Write/Edit | No agent sets it, and the lint enforces that | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| Frontmatter hooks are skipped without workspace trust and in `-p`; a timed-out PreToolUse hook fails open | "Where hooks don't protect you" above | [Hooks](https://code.claude.com/docs/en/hooks) · [Subagents](https://code.claude.com/docs/en/sub-agents) |
| `permissionMode` is overridden by the parent's auto, acceptEdits or bypassPermissions mode | Footnote above; hooks as the real guard | [Subagents](https://code.claude.com/docs/en/sub-agents) · [Permission modes](https://code.claude.com/docs/en/permission-modes) |
| Subagents can spawn subagents unless `Agent` is removed | `disallowedTools: Agent` | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| `skills:` preloads full content and costs tokens every turn; other skills stay loadable on demand | Planner and architecture-reviewer preload 2 skills; writers load per task | [Subagents](https://code.claude.com/docs/en/sub-agents) · [Skills](https://code.claude.com/docs/en/skills) |
| Descriptions route delegation: one agent per description, say when to use it, "use proactively" | `description` fields | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| Restate critical CLAUDE.md rules for subagents | Step 1 of each agent reads root and module `CLAUDE.md` | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| Subagents share no history, so hand off a self-contained, condensed result with file references | Plan cites `path:line` and must be executable without questions | [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) |
| Plan → validate → execute with a structured plan | Fixed plan sections; implementer Step 0 rejects incomplete plans | [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) |
| Give the agent a pass/fail check and ask for evidence, not "tests pass" | Command · exit · output tables in every report; SKIPPED ≠ PASS | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) ("Give Claude a check to run") |
| Review against the spec with a fresh-context subagent; "report gaps that affect correctness and skip style"; a reviewer asked to find problems always finds something | plan-verifier; architecture-reviewer reports CRITICAL/WARNING only | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) ("Review against your spec") |
| Claude can end a turn with a summary while items are still open | plan-verifier treats the Implementation Report as claims and re-runs checks | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) (`/goal`) |
| LLM graders need an "Unknown" option, one dimension per grade, outcome grading, deterministic checks first | `unverifiable` / UNKNOWN verdicts; one row per requirement; checks before inspection | [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) |
| LLM judges show position, verbosity and self-enhancement bias; models are sycophantic | "Verbosity never raises a verdict", "unsure → lower", independent re-runs | [Zheng et al. 2023, arXiv 2306.05685](https://arxiv.org/abs/2306.05685) · [Sharma et al. 2023, arXiv 2310.13548](https://arxiv.org/abs/2310.13548) |
| Requirements traceability matrix | plan-verifier matrix | [Requirements traceability matrix](https://en.wikipedia.org/wiki/Requirements_traceability_matrix) |
| Stopping conditions; ground truth from tool results at every step; evaluator–optimizer with clear criteria | `maxTurns`; stop after 3 failed attempts; verifier/reviewer → implementer loop | [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) |
| Orchestrator–workers for multi-file coding tasks | Main session orchestrates the suite | [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) |
| Rules that must hold every time belong in a hook or deny rule, not in CLAUDE.md | All guard hooks | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) |
| Query by role first; `userEvent.setup()` over `fireEvent` | test-writer quality rules | [Testing Library queries](https://testing-library.com/docs/queries/about/#priority) · [user-event](https://testing-library.com/docs/user-event/intro) |
| Test behaviour, not implementation details | test-writer quality rules | [Kent C. Dodds](https://kentcdodds.com/blog/testing-implementation-details) |
| Build the Fastify app separately and test with `inject` | test-writer skill pass 2 | [Fastify testing guide](https://fastify.dev/docs/latest/Guides/Testing/) |
| Vitest can't render async Server Components, so use e2e | test-writer quality rules | [Next.js + Vitest](https://nextjs.org/docs/app/guides/testing/vitest) |
| Snapshots are reviewed like code; restore mocks, timers, globals and env | No `-u`; determinism rules | [Vitest snapshot](https://vitest.dev/guide/snapshot) · [Vitest mocking](https://vitest.dev/guide/mocking) |
| Coverage ≠ fault detection; mutation score measures test strength | `mutation-probe.mjs` (a one-mutant probe; Stryker isn't installed) | [MutGen, arXiv 2506.02954](https://arxiv.org/abs/2506.02954) · [StrykerJS vitest-runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/) |
| The dependency rule (dependencies point inward) | architecture-reviewer | [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) · [Onion Architecture](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) · [Hexagonal](https://alistair.cockburn.us/hexagonal-architecture/) |
| Architecture rules as automated fitness functions; dependency-cruiser rule name + module pair as evidence | architecture-reviewer Step 2 | [Fitness-function driven development](https://www.thoughtworks.com/insights/articles/fitness-function-driven-development) · [dependency-cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) |
| Four documentation types, never mixed | doc-writer Step 2 | [Diátaxis](https://diataxis.fr/start-here/) · [Diátaxis compass](https://diataxis.fr/compass/) |
| C4 context and container diagrams suffice for most teams | doc-writer diagrams | [C4 model](https://c4model.com/diagrams) |
| GitHub renders ```` ```mermaid ```` blocks natively | doc-writer diagrams | [GitHub docs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams) |
| An ADR records one architecturally significant decision (context, decision, status, consequences) | doc-writer ADR candidates | [Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) |

These are project decisions, not sourced practices:
- the model per role;
- the verdict names (PASS/FAIL/UNKNOWN; MEETS PLAN/DOES NOT MEET PLAN/CANNOT CONFIRM; met/partial/not met/unverifiable), since no published taxonomy was found;
- leaving SUGGESTION findings out of the reviewer;
- the "red proof" convention;
- denying the doc-writer `.claude/**` and `CLAUDE.md`.

### Project sources

| Rule | Source in this repo |
|---|---|
| File path → skills mapping | [`../skills/pr-self-review/routing.json`](../skills/pr-self-review/routing.json) |
| Severity levels and finding fields (reused by architecture-reviewer) | [`../skills/pr-self-review/severity.md`](../skills/pr-self-review/severity.md) · [`finding.schema.json`](../skills/pr-self-review/finding.schema.json) |
| Backend layering (flat feature modules, rings, `lint:arch`) | [`onion-architecture`](../skills/onion-architecture/SKILL.md) · [`server/CLAUDE.md`](../../server/CLAUDE.md) · [`reviewer-core/CLAUDE.md`](../../reviewer-core/CLAUDE.md) · `server/.dependency-cruiser.cjs` |
| Client layering (hooks, query keys, `_components`, Server Component pages) | [`frontend-ui-architecture`](../skills/frontend-ui-architecture/SKILL.md) · [`client/CLAUDE.md`](../../client/CLAUDE.md) · `client/src/test/architecture.test.ts` |
| Shared contract ×2, migrations append-only, pnpm vs npm, no root package.json | [`CLAUDE.md`](../../CLAUDE.md) (Gotchas) · module `CLAUDE.md` "Do not touch" |
| Test placement and per-package commands (`*.it.test.ts`, mocks, deterministic e2e) | [`TESTING.md`](../../TESTING.md) · module `CLAUDE.md` Commands · [`onion-architecture` testing](../skills/onion-architecture/references/testing.md) |
| Docs describe how things are; placement of docs | [`docs/README.md`](../../docs/README.md) · module `docs/README.md` · [`specs/README.md`](../../specs/README.md) |
| Seeded files the doc-writer must not edit | `server/src/db/seed-skills.ts` (`docs/skills/`) · `server/src/db/seed-prompts.ts` (`docs/agent-prompts/*-reviewer.md`) |
| Spec structure, status and acceptance criteria | [`specs/README.md`](../../specs/README.md) |
| Lessons the agents must respect; session notes they write | `INSIGHTS.md` (root and per module) · [`engineering-insights`](../skills/engineering-insights/SKILL.md) |
| Clarify-before-work format | Shared with [researcher](researcher.md) Step 0 |
| The plan these four agents were built from | [`specs/plans/2026-11-27-reviewer-and-support-agents.md`](../../specs/plans/2026-11-27-reviewer-and-support-agents.md) |

## Adding or changing an agent

- Keep the tools least-privilege. If the agent has Bash and must not write, add a hook.
  Reuse `readonly-bash.sh` (add a profile if it needs exact check commands) and
  `write-scope-guard.sh` (add a profile for a new write scope).
- The `description` says *when* to delegate and how this agent differs from its neighbours.
  Keep it under ~1,000 characters. Don't write an unquoted `: ` or ` #` in it, because the
  frontmatter then fails to parse as YAML.
- Define a fixed output format, so the next agent or the main session can consume it.
- Run `node --test .claude/hooks/hooks.test.mjs .claude/scripts/agents.test.mjs .claude/scripts/mutation-probe.test.mjs`.
  `agents.test.mjs` lints every agent's frontmatter: known keys, name, description, no
  `memory`, a hook for Bash/Edit/Write, executable hook scripts, valid profiles and skills.
  Add `EXPECTED_AGENTS` there when you add an agent, and add hook cases to `hooks.test.mjs`
  when you change a hook.
- Update this README. Agents are not skills, so `routing.json` needs no entry.
