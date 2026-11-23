---
tags: [pr-self-review]
max_turns: 60
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Bash, Write, Agent, AskUserQuestion]
---

Setup (this is a disposable clone): run
`.claude/skills/pr-self-review/evals/fixtures/make-fixture.sh ui-only` and note the SHA it prints.

Then do exactly what `/pr-self-review --base-ref <that sha> --no-fetch` does: read
`.claude/skills/pr-self-review/SKILL.md` and follow its workflow. Is this PR good to merge?
