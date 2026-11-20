# e2e/ — @devdigest/e2e

Deterministic browser flows driven by the agent-browser CLI against the real stack on
seeded, read-only data. No Playwright, no LLM, no API key. Root map: `../CLAUDE.md`.

## Stack
agent-browser CLI (global) · TypeScript 5.7 · tsx

## Commands (npm)
- one-time: `npm i -g agent-browser && agent-browser install`
- hermetic, recommended: `../scripts/e2e.sh` (Postgres :5433, API :3101, web :3100)
- raw runner against an already-running stack: `npm test` · types `npm run typecheck`

## Conventions (non-default)
- A flow is `specs/NN-name.flow.json`; `run.ts` picks up only `*.flow.json` files.
- `wait --text` / `wait --url` ARE the assertions; optional `assert.stdoutIncludes`.
- Deterministic locators only (`--url`, `--text`, `find role|text|label`). Never the AI `chat` command.
- Flows target seeded data: repo `acme/payments-api`, PR #482, the built-in agents.

## Gotchas
- `npm test` against your dev DB fails flows 02/04/05 when other repos exist — use `../scripts/e2e.sh`.
- Never `docker compose down -v` to reset; it deletes the dev DB volume.

## Read when
- Writing or changing a flow → `README.md`
- Changing seed data the flows depend on → `../server/src/db/seed.ts` + `../TESTING.md`
- Before starting → `INSIGHTS.md` · flow catalogue → `specs/README.md` · deeper docs → `docs/`
