# client/ — @devdigest/web

Next.js studio: repos, PR list, diff viewer, findings, agent editor, settings.
Talks only to the Fastify API (`NEXT_PUBLIC_API_BASE`, default `http://localhost:3001`).
Root map: `../CLAUDE.md`.

## Stack
Next.js 15.5 (App Router) · React 19 · TanStack Query 5 · next-intl 3 · zod 3.25 ·
TypeScript 5.9 · vitest 2.1 + jsdom + React Testing Library

## Commands (pnpm)
- dev `pnpm dev` (:3000) · types `pnpm typecheck` · test `pnpm test` (fetch mocked, no API needed;
  includes `src/test/architecture.test.ts`, which enforces the layering rules below)

## Conventions (non-default)
- Architecture rules come from the `frontend-ui-architecture` skill; IDs like [B1] cite it.
- Data access only through hooks in `src/lib/hooks/<domain>.ts` → `src/lib/api.ts` (`apiFetch`,
  `ApiError`). Import the domain file (`@/lib/hooks/core`, `…/reviews`) — there is no barrel.
- Query keys come from the per-domain factories (`pullKeys`, `reviewKeys`, `agentKeys`, …) exported
  next to the hooks; never write an inline `queryKey: [...]` [L6]. Cache invalidation lives in hooks.
- `page.tsx`/`layout.tsx` are Server Components: a page renders one client
  `_components/<Name>View` and holds no `'use client'` [B1].
- Logic lives in colocated
  `_components/<Name>/{<Name>.tsx,index.ts,constants.ts,helpers.ts,styles.ts,<Name>.test.tsx}`.
  Business rules shared by several screens go in a pure, tested `src/lib/*.ts` (e.g. `pull-status.ts`) [L1].
- `src/lib` and `src/components` never import from `src/app`; a route section never imports a sibling
  section's `_components` [S4, S5]. Use `@/` instead of 3+ `../` [S14].
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
