---
name: engineering-insights
description: Records a confirmed, non-obvious engineering finding as an append-only entry in the INSIGHTS.md of the DevDigest module being worked on (server/, client/, reviewer-core/, e2e/, or the root INSIGHTS.md for cross-module findings). Use proactively, without being asked, as soon as something is confirmed that a future session would otherwise rediscover the hard way. That includes an approach that worked after others failed, a dead end or antipattern, an undocumented codebase convention or decision, a dependency or tooling quirk, an error that recurred and its verified fix, or a question left unresolved. Also use once at the end of any task that changed code, to add a dated session note, and when the user says "remember this", "note that", "add an insight" or "wrap up". Not for generic programming advice or anything a CLAUDE.md, README or the code already states.
---

# Engineering insights

Turns what this session learned into notes the next session reads before it starts
(every module `CLAUDE.md` says "Before starting → `INSIGHTS.md`").

## Category → section of INSIGHTS.md

| Section | Record it when you… |
|---|---|
| What Works | landed an approach that worked, especially after another failed |
| What Doesn't Work | hit a dead end or antipattern (the most skipped section, and the most valuable) |
| Codebase Patterns | found a convention or architectural decision the code doesn't explain itself |
| Tool & Library Notes | hit a quirk of a dependency, CLI, Docker, CI or the test runner |
| Recurring Errors & Fixes | saw an error (quote the exact message) and confirmed its fix |
| Session Notes | finished a task that took real work (skip typo and config-only edits) |
| Open Questions | left something unexplained or unverified |

## Steps

1. **Gate.** Write only what is confirmed (fix verified, behaviour reproduced) and passes the
   cold-read test: an agent that reads only this entry knows what to do. If it is obvious to
   anyone reading the code, or a `CLAUDE.md`/`README` already says it, skip it.
2. **Route** by the paths the finding is about: `server/**` (including
   `src/modules/repo-intel/`) goes to `server/INSIGHTS.md`. `client/**`, `reviewer-core/**`
   and `e2e/**` go to their own file. Findings spanning more than one module, or about
   `scripts/`, `docs/`, `.github/` or `docker-compose.yml`, go to the root `INSIGHTS.md`.
3. **Dedupe.** Read the target file first. If an entry already says it, add nothing. If the
   new finding corrects an old entry, add the new one and append ` (superseded YYYY-MM-DD)`
   to the old one.
4. **Append** one bullet at the end of its section, replacing `_None yet._` if it is there.
   Use today's date and real names (file, function, command, error text, number). Wrap long
   entries with a two-space indent:
   ```
   - **YYYY-MM-DD** — <specific fact and what to do>. Why: <cause>. Ref: `path:line`
   ```
5. **Never** reword, reorder or delete existing entries. Pruning is a human review step.
6. **Promote** when a finding bites a second time (the entry already exists): suggest a
   one-line Gotcha for that module's `CLAUDE.md` to the user. Only after they agree, add it
   and append ` (promoted)` to the entry.
7. **Report** to the user in one line which file and section you wrote to and what the entry
   says, so they can spot-check it. Then carry on with the task.

Not sure whether a finding clears the bar? See [examples.md](examples.md).
