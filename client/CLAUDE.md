# client/ — @devdigest/web

Next.js studio: repos, PR list, diff viewer, findings, agent editor, settings.
Talks only to the Fastify API (`NEXT_PUBLIC_API_BASE`, default `http://localhost:3001`).
Root map: `../CLAUDE.md`.

## Stack
Next.js 15.5 (App Router) · React 19 · TanStack Query 5 · next-intl 3 · zod 3.25 ·
TypeScript 5.9 · vitest 2.1 + jsdom + React Testing Library

## Commands (pnpm)
- dev `pnpm dev` (:3000) · types `pnpm typecheck` · test `pnpm test` (fetch mocked, no API needed)

## Conventions (non-default)
- Data access only through hooks in `src/lib/hooks/*` → `src/lib/api.ts` (`apiFetch`, `ApiError`).
- Pages (`src/app/**/page.tsx`) stay thin; logic lives in colocated
  `_components/<Name>/{<Name>.tsx,index.ts,constants.ts,helpers.ts,styles.ts,<Name>.test.tsx}`.
- UI strings go in `messages/en/<namespace>.json` (auto-loaded per file by `src/i18n/request.ts`).
- Import UI from the `@devdigest/ui` barrel, never from a layer file inside it.
- Path aliases: `@/*` → `src/*`, `@devdigest/shared`, `@devdigest/ui`.

## Gotchas
- `src/vendor/shared` is this package's OWN copy of the contracts and has diverged from
  `server/src/vendor/shared` — a contract change must update both.
- Some `messages/en/*.json` namespaces (blast, eval, memory, …) are for later milestones; keep them.

## Do not touch
- `src/vendor/ui/**` (vendored design system) — extend via new components, read its README first.

## Read when
- Adding a route or a data hook → `README.md` (UI route map)
- Changing or adding UI components → `src/vendor/ui/README.md`
- Writing component tests → `../TESTING.md`
- Needing an endpoint's shape → `../server/README.md`
- Before starting → `INSIGHTS.md` · planned work → `specs/` · deeper docs → `docs/`
