---
tags: [pr-self-review]
max_turns: 60
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Bash, Write, Agent, AskUserQuestion]
---

Setup (this is a disposable clone with server dependencies installed): run
`.claude/skills/pr-self-review/evals/fixtures/make-fixture.sh backend-critical` and note the SHA it prints.

Then do exactly what `/pr-self-review --base-ref <that sha> --no-fetch` does: read
`.claude/skills/pr-self-review/SKILL.md` and follow its workflow. Can I merge this?
