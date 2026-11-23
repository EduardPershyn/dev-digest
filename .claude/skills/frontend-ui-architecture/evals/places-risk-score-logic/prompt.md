---
tags: [frontend-ui-architecture]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

We have a Next.js 15 App Router app (src/app, src/components/ui from shadcn, src/lib). I'm adding a "risk score" for each pull request review: critical findings weigh 10, major 5, minor 2, info 0, and a PR is merge-blocked if any finding is critical. The score has to show up as a colored badge both on the PR list page and inside the review drawer, and the drawer also shows the merge-blocked state. Where exactly should the score calculation, the weight constants, and the badge component live, and why? Just tell me the plan with file paths, don't write the whole implementation.
