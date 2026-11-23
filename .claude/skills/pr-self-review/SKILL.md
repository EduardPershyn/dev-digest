---
name: pr-self-review
description: "Manual pre-PR review of the current branch's pending changes (committed since the merge-base with main, plus uncommitted and untracked files). Routes each changed file to the project skills that govern it (frontend skills for client/, onion-architecture for server/ and reviewer-core/, security, zod, drizzle, …) via routing.json, runs one reviewer subagent per skill slice plus deterministic repo checks (lint:arch, typecheck, schema-without-migration, secrets, shared-contract drift), grounds every finding in the diff, re-checks CRITICALs, and prints a verdict: READY TO MERGE, or NOT READY if at least one CRITICAL finding remains. Advisory only: never pushes, posts, blocks or edits code."
disable-model-invocation: true
argument-hint: "[--base main] [--base-ref <ref>] [--skills a,b] [--force] [--max-parallel 6] [--slice-lines 800] [--max-lines 4000] [--model <name>]"
---

# PR self-review

Run only when the user invokes `/pr-self-review`. Spec: `specs/pr-self-review.md`.

The deterministic work is done by `scripts/gate.mjs` (routing, diff slices, repo checks,
grounding, verdict). Your job is orchestration: spawn the reviewer and verifier subagents
it plans, then show the report. Run every command from the repo root:

```sh
GATE=".claude/skills/pr-self-review/scripts/gate.mjs"
```

## Arguments
Pass `--base`, `--base-ref`, `--skills`, `--force`, `--no-fetch`, `--max-parallel`,
`--slice-lines`, `--max-lines`, `--max-recheck` straight through to `route`. `--model` is
yours: use it as the `model` of every subagent you spawn (otherwise leave `model` unset).

## Workflow

### 1. Plan
`node $GATE route <args>` → JSON.
- `"cached": true` → a report already exists for this exact diff. Print the file at
  `reportMd` and stop (tell the user `--force` reruns it).
- `overLimit: true` → **stop and ask the user** (AskUserQuestion) before any subagent:
  show `totals.routedLines` vs `limits.maxLines` and the `skills` table; offer to continue,
  to narrow with `--skills`, or to cancel. Continuing = rerun `route` with
  `--max-lines <bigger>` (same other args).
- `localBaseAhead > 0` → mention it in one line (the PR would also contain those
  commits); go on unless the user asks to rerun with `--base-ref main`.
- Keep `runDir`, `slices` (`id`, `skill`, `promptPath`, `findingsPath`) and `waves`.

### 2. Repo checks (start first, runs in parallel with step 3)
`node $GATE check-repo --run <runDir>` with `run_in_background: true`. It runs only the
checks for the touched packages (it can take a few minutes for `typecheck`).

### 3. Skill reviewers — one subagent per slice, wave by wave
For each wave in `waves`, spawn all of its slices **in one message** (Agent tool,
`subagent_type: "general-purpose"`, `description: "pr-self-review <slice id>"`), with this
prompt and nothing else:

> Read `<promptPath>` and follow it exactly. It tells you which skill to apply, the diff to
> review and where to write your findings JSON (`<findingsPath>`). Do not modify any other
> file.

Wait until every subagent of the wave has finished before starting the next wave. Don't
read the slice prompts or the findings yourself; the script does that.

If no slices were planned (docs-only change), skip to step 4.

### 4. Ground
When the reviewers and the background check are done: `node $GATE ground --run <runDir>`.
- `missingSlices` not empty → re-spawn just those slices once (same prompt), then run
  `ground` again. If still missing, carry on; the verdict will say INCOMPLETE.
- `checksRan: false` → the background check did not finish; wait for it, then rerun
  `ground`.

### 5. Re-check CRITICALs
For every entry in `recheck` (at most `limits.maxRecheck`), spawn one verifier subagent in
the same message (`general-purpose`, `description: "pr-self-review recheck <id>"`):

> Read `<promptPath>` and follow it exactly. Write your answer to `<resultPath>`. Do not
> modify any other file.

Wait for all of them. Skip this step when `recheck` is empty.

### 6. Report
`node $GATE report --run <runDir>` prints the Markdown report (also saved as
`<runDir>/report.md`, with full data in `report.json`). Show the user:
1. the verdict line and the notes under it, verbatim;
2. the coverage table and the repo-checks line;
3. every CRITICAL finding (file:line, skill, rule, fix), then WARNINGs; summarize
   SUGGESTIONs as a count unless there are only a few;
4. the report path.

### 7. Stop
- Do not fix anything, push, open a PR, post statuses or comments. The verdict is advice;
  the user decides. You may offer to fix the CRITICAL findings.
- If a finding looks wrong to the user, the lasting fix is in `routing.json` (narrower glob
  or content trigger) or `severity.md`, not a waiver.

## Files
| File | Purpose |
|---|---|
| `routing.json` | Skill ⇄ path globs / content regexes. Every `.claude/skills/*` dir must be listed (`review: false` for non-review skills). |
| `severity.md` | CRITICAL / WARNING / SUGGESTION rubric used by reviewers and verifiers. |
| `finding.schema.json` | What a reviewer writes. |
| `templates/reviewer.md`, `templates/verifier.md` | Subagent prompts; `route` / `ground` fill them in. |
| `scripts/gate.mjs`, `scripts/lib/*` | Deterministic CLI (Node ≥22, no deps). |
| `scripts/gate.test.mjs` | `node --test .claude/skills/pr-self-review/scripts/` |
| `evals/` | Behaviour cases for the whole skill. |

Run output lives in `.devdigest/self-review/<head12>-<diff fingerprint>/` (gitignored):
`plan.json`, `scope.json`, `slices/`, `findings/`, `checks.json`, `grounded.json`,
`recheck/`, `report.{json,md}`.

## Adding a skill
Add the skill directory, then an entry in `routing.json`: `paths` (whole files),
optional `content` regexes (only matching hunks, only in `codeFiles`), `exclude`, or
`"review": false`. Run the tests: they fail while any skill is unrouted.
