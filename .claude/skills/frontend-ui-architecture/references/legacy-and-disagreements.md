# Outdated advice, source disagreements and open questions

Part of the `frontend-ui-architecture` skill. Use this file to:
- recognize advice, code or tutorials that were correct once but no longer are;
- break ties where reputable sources disagree;
- know what the evidence does **not** settle, so you don't present a house convention as
  fact.

## 1. Outdated advice and its current replacement

When you meet one of these in code, a prompt or a tutorial, label it as version-bound
instead of repeating it. If the project is still on the older version, the older form
may be correct for that project (R16).

| Outdated advice or pattern | Current replacement | Changed in |
|---|---|---|
| Pages Router data APIs (`getServerSideProps`, `getStaticProps`, `pages/api`) in App Router code | Server Components for reads, Server Actions for mutations, Route Handlers for HTTP APIs | App Router (13+) |
| `middleware.ts`; "middleware runs on Edge"; "do auth in middleware" | `proxy.ts` on Node, optimistic checks only; auth in the DAL and every action | renamed/deprecated in 16 |
| Sync `params`, `searchParams`, `cookies()`, `headers()` | `await` (server) / `use()` (client) | async in 15, sync removed in 16 |
| Implicit fetch caching; `export const dynamic` / `revalidate`; `experimental.ppr` / `dynamicIO` | Cache Components: `'use cache'`, `cacheLife`, `cacheTag`, deliberate Suspense | 16 opt-in → 16.4 recommended → 17 default |
| "`GET` Route Handlers are cached by default" (Vercel's 2024 mistakes article) | Uncached by default | 15 |
| Single-argument `revalidateTag(tag)` | `revalidateTag(tag, 'max')` or `updateTag(tag)` | 16 |
| Parallel slots without `default.js` | An explicit `default.js` per slot | build fails in 16 |
| `unstable_rootParams()` | `next/root-params` | removed in 16, replaced in 16.3 |
| A `loading.tsx` per route as the only loading strategy | Inline Suspense or `'use cache'` in components | shift in 16.3 |
| `next lint` | The ESLint CLI directly | deprecated in 15.5 |
| Hand-written `{ params: { id: string } }` route prop types | Generated `PageProps<'/x/[id]'>` / `LayoutProps` / `RouteContext` | 15.5 |
| Markbåge's 2023 security post details (sync `cookies()`, `middleware.tsx`) | The current Next.js data-security guide (same principles, current APIs) | docs updated 2026-11 |
| Container/presentational split as a default | Custom hooks; Server Components for data; prop-driven leaves | author's retraction, 2019 |
| Server data in Redux via `useEffect` + `dispatch` | TanStack Query / SWR / RTK Query / RSC | Redux style guide; TkDodo 2021 |
| A global `queryKeys.ts`; key arrays kept apart from fetchers; a hook wrapping every `useQuery` | Per-feature `queryOptions` factories | TanStack Query v5 (2024) |
| `forwardRef`; `<Context.Provider>`; Radix's `forwardRef` instructions | `ref` as a prop; `<Context value>` | React 19 (2024-12-05) |
| Blanket `useMemo`/`useCallback`/`memo` | React Compiler for new code; keep existing memo until tested | Compiler stable; Next 15.3.1+ |
| `Children.map` + `cloneElement` compound components; render props/HOCs for logic sharing; `useMount` lifecycle hooks | Context compound components; custom hooks; purpose-named hooks | hooks era |
| Reference repos `shadcn-ui/taxonomy` and `vercel/commerce` | `vercel/shop`, `nextjs/saas-starter` | archived; taxonomy says it "does not reflect current best practices" |
| Wieruch 2019: PascalCase component files, kebab-case elsewhere | Kebab-case everywhere (Wieruch 2026) | 2026 guide |
| Zod 3 `error.flatten()` / `error.format()` | Zod 4 `z.flattenError()` / `z.treeifyError()` (check the installed version) | Zod 4 |

## 2. Disagreements and tie-breakers

Most disagreements resolve once you scope the advice by project size, or by whether a
linter enforces it.

| Topic | Position A | Position B | Use this |
|---|---|---|---|
| Top-level organization | Feature folders (Bulletproof, Wieruch, FSD) | Function/type folders (Comeau) | Type-based while small; feature folders once several independent domains exist. Follow the repo if it is consistent. |
| Code inside `app/` | `_components` colocation is safe and documented (Next.js, saas-starter) | Keep feature code out of `app/` (Wieruch) | Only route-only glue in `_components`; reusable domain code outside (Bulletproof hybrid). |
| How thin a route file is | Pure re-export of `_pages` (FSD + Next.js) | Prefetch + compose (Bulletproof); split by route (Next strategy 3) | Prefetch + compose: metadata and params handling belong in `page.tsx`. |
| Barrel files | Against (TkDodo, Hagemeister, Bulletproof docs) | Slice public API required (FSD); per-component index (Comeau, Bulletproof code) | No aggregate barrels; a per-component index is fine; a slice index only with lint enforcement. |
| Where `cn`/utils live | `@/lib/utils` (shadcn) | `src/utils/cn.ts` (Bulletproof); no essence folders at all (Steiger) | Follow shadcn's alias when using shadcn. Never adopt Bulletproof's layout and Steiger together. |
| File naming | Kebab-case (Bulletproof, Wieruch, Next.js examples) | PascalCase component files (Comeau) | Kebab-case, lint-enforced. Consistency beats choice. |
| When to split components | Early, one concern each (Thinking in React) | Wait for reuse (Dodds) | Split on state ownership, concern or reuse, never on line count. |
| Container/presentational | Still valid (patterns.dev) | Retracted as a default (Abramov) | Flag mandatory pairs as outdated. |
| Zustand shape | One store with slices (Zustand docs) | Many small stores (TkDodo) | Either; always export hooks and keep server data out. |
| Client data fetching | Effects are valid with cleanup (react.dev) | A server-cache library (Dodds, TkDodo); RSC + `use()` first (Next.js, TanStack) | In Next.js: RSC or `use()` first, a library for live shared caches, raw Effects last. |
| Polymorphism | Radix `asChild` | Base UI `render` (now also in shadcn docs) | Follow the project's primitive library; don't mix. |
| DTO style | Classes block serialization (Markbåge) | Plain-object DTO functions (Next.js auth guide) | Complementary: classes for internal records, plain DTOs for what crosses. |
| Server Action location | Colocated per route (`app/(login)/actions.ts`) | Centralized (`app/lib/actions.ts`, Next.js docs example) | No official rule. Keep actions thin with logic in the DAL; location is a team choice. |
| Layout components location | `components/layouts` | `app/**/_components/dashboard-layout.tsx` | Unresolved (Bulletproof does both). Reusable shells go in `components/layouts`, route-specific ones in `_components`. |
| Layering ceremony | Gradual or light (Qiu, Bulletproof) | Strict (Clean/hexagonal, FSD) | Match ceremony to team and app size (L11). |

## 3. What the evidence does not settle

Say "house convention" rather than "best practice" when you rely on any of these:
- **No study or metric** compares folder structures. All structure advice is
  practitioner consensus.
- **No numeric thresholds** exist for component size, hook size or when to extract. "Max
  N lines" is a team rule.
- **Ordering within a component file** is unsourced (the convention in components.md §10
  follows from the Rules of Hooks).
- **URL-as-state** guidance rests on search snippets (nuqs, Wieruch); it follows from
  react.dev's single-owner principle.
- **Unverified for this version of the skill:**
  - Zod 4 error helpers vs the Zod 3 `.flatten()` shown in the Next.js docs;
  - React Hook Form `zodResolver` details;
  - the Jotai and `@t3-oss/env-nextjs` docs;
  - the current `eslint-plugin-boundaries` rule names;
  - whether Bulletproof moved to ESLint flat config;
  - the `global-not-found.js` convention;
  - the Next.js 17 date;
  - whether `useFormState` was formally removed in favor of `useActionState`.

  The taint APIs remain experimental.
- **Server Components as "the new container"** is a popular framing without a primary
  source.
- **Result/Either types at the service layer**: no authoritative frontend source
  recommends them. Discriminated-union return values from actions are a reasonable
  convention.
