# DevDigest — agent map

Local-first AI pull-request reviewer. This is the starter; it grows one feature per
milestone (README → Roadmap). This file is a map: follow the links, don't copy them.

## Stack
Node ≥22 · pnpm ≥10 · TypeScript 5.9 · Fastify 5 · Drizzle 0.45 · Postgres 16 + pgvector
(Docker) · Next.js 15 / React 19 · Zod 3 · Vitest 2

## Where things live
- `server/` — Fastify API, DB, background jobs, repo-intel indexer, review orchestration (:3001)
- `client/` — Next.js studio (:3000)
- `reviewer-core/` — pure review engine: diff → prompt → LLM → grounded findings
- `e2e/` — deterministic browser flows (agent-browser, no LLM)
- `docs/` · `specs/` · `INSIGHTS.md` — cross-module docs, specs, lessons.
  Every module has its own `CLAUDE.md`, `docs/`, `specs/`, `INSIGHTS.md`.

## Commands
- Whole stack from zero: `./scripts/dev.sh` (`--no-seed` · `--no-client` · `--db-only`)
- Per package: `cd <pkg>` first. There is NO root workspace and NO root package.json.
- Hermetic browser e2e (isolated ports + DB): `./scripts/e2e.sh`

## Gotchas
- `server/` and `client/` use **pnpm**; `reviewer-core/` and `e2e/` use **npm** (package-lock.json).
- Packages share code via tsconfig path aliases, not published packages.
- `@devdigest/shared` exists TWICE: `server/src/vendor/shared` (also what reviewer-core
  resolves to) and `client/src/vendor/shared`. They have already diverged — a contract
  change must update both.
- Migrations are not applied on boot: `cd server && pnpm db:migrate`.
- `docker compose down -v` deletes the dev DB volume with every imported repo and review.

## Read when
- Changing how packages talk to each other or the review flow → `docs/architecture.md`
- Any backend code in `server/` or `reviewer-core/` → `onion-architecture` skill (layering rules)
- Adding/changing an API route, env var, or what goes into the review prompt → `server/README.md`
- Adding any test or touching `.github/workflows/` → `TESTING.md`
- Starting a milestone feature → `specs/README.md`, then the module's `specs/`
- Before working in a module → that module's `INSIGHTS.md` (here: cross-module lessons)
- Editing the built-in reviewer prompts → `docs/agent-prompts/README.md`
- User asks whether a branch is ready to merge → `/pr-self-review` (manual only; adding a skill
  means adding it to `.claude/skills/pr-self-review/routing.json`)
- You confirmed something non-obvious, or are wrapping up a task → `engineering-insights`
  skill (`.claude/skills/engineering-insights/`): append-only entry in the nearest `INSIGHTS.md`
