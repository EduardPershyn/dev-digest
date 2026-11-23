---
tags: [frontend-ui-architecture]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Our client is Next.js 15.5 (App Router, React 19, zod 3, TanStack Query v5). It does NOT own a database — all data comes from a separate Fastify REST API at API_INTERNAL_URL, which authenticates via the session cookie. I need a "dismiss finding" feature: a button with a reason textarea in the review page; after dismissing, the review page and the findings list (which is rendered client-side with useQuery for polling) must update. Show me the files I need (paths + code) and where each piece lives.
