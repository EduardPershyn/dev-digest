---
name: frontend-ui-architecture
description: "Frontend UI architecture for React 19 + Next.js App Router: where code belongs and how it is organized. Use whenever you decide where to put a component, hook, constant, config/env value, type, util/helper, Zod schema, API call, query, store, Server Action, Route Handler or business rule; when you create or restructure folders (app/, features/, components/ui, lib/, utils/); when you draw the server/client boundary ('use client', 'use server', server-only, providers); when you design data access (Data Access Layer, DTOs, fetching in Server Components, TanStack Query alongside RSC) or mutations; when you add routes, layouts, route groups, parallel/intercepting routes, error/loading/not-found files or proxy/middleware; and when you review or refactor frontend code for separation of concerns, coupling, god components, prop drilling, duplicated business logic or folder sprawl — even if the user only asks 'where should this go?' or 'is this structured well?'. Not for performance tuning, styling or test-writing."
metadata:
  version: 1.0.0
  updated: 2026-11-23
  applies-to: "React 19.x, Next.js 15.x–16.x (App Router), TanStack Query v5, Zod 3/4"
  tags: react, nextjs, app-router, architecture, project-structure, rsc, server-components, data-access-layer, separation-of-concerns
---

# Frontend UI Architecture (v1.0.0)

Where frontend code lives, and why. This skill decides where things go and which way
dependencies point. It does not cover how to make code faster. For framework API details
see `next-best-practices`. For hook and anti-pattern minutiae see `react-best-practices`.
For schema syntax see `zod`. Every rule here has a stable ID (S, C, L, R, B), so a review
comment can cite it ("violates B12").

## Two kinds of rules, and why the difference matters

The research behind this skill (sources in [README.md](README.md)) found authority split
in two:

1. **Framework-enforced rules are hard rules.** These are module-graph boundaries,
   serialization, security, routing semantics and caching. React and Next.js document them
   precisely, and breaking them causes bugs, data leaks or build errors. Flag them as
   **must-fix**.
2. **Folder conventions are consensus, not law.** Next.js says it is "unopinionated" about
   project organization, and React has no official stance. The conventions below come from
   reference codebases (Bulletproof React, vercel/shop, nextjs/saas-starter, cal.com) and
   recognized practitioners. Flag deviations as **suggestions**. An existing, consistent
   house convention beats this skill's default (S1).

The one convention every layering model shares is the **dependency direction**:
`shared → features → app`. Check imports before you argue about folder names.

## Step 0: establish context before advising

Don't apply rules from memory to an unknown codebase. Real projects lag behind framework
releases, and several conventions are version-gated.

1. **Versions.** Read `package.json`: `next`, `react`, `@tanstack/react-query`, `zod`,
   `eslint`. Apply only the rules that match those versions (table below).
2. **Router.** Check for `app/` vs `pages/`, and whether there is a `src/`. Pages Router
   advice (`getServerSideProps`, `pages/api`) does not apply to App Router code.
3. **Existing structure.** Look for `features/` or `modules/`, `components/ui`,
   `components.json` (shadcn aliases), path aliases in `tsconfig.json`, and boundary lint
   rules in the ESLint config. Follow what exists if it is consistent.
4. **Data-access model.** Next.js names three and asks you to pick one per app (B8):
   - **HTTP API:** a Next.js frontend in front of a separately deployed backend (REST/GraphQL).
     Server Components act like untrusted clients that forward cookies.
   - **Data Access Layer (DAL):** Next.js talks to the DB directly through a `server-only`
     layer. Recommended for new full-stack apps.
   - **Component-level access:** prototypes only.

### Version-gated conventions

| Topic | Next.js 15.x | Next.js 16.x |
|---|---|---|
| Request interception file | `middleware.ts` (Node runtime stable since 15.5) | `proxy.ts` (Node). `middleware.ts` is deprecated, Edge only |
| `params`, `searchParams`, `cookies()`, `headers()` | async (`await`); sync access warns | async only; sync access removed |
| Caching model | `dynamic`/`revalidate` segment exports; `GET` handlers uncached by default | Cache Components (`'use cache'`, `cacheLife`, `cacheTag`) opt-in in 16, recommended and on in new apps since 16.4 |
| Tag revalidation | `revalidateTag(tag)` | `updateTag(tag)` (actions, read-your-writes) or `revalidateTag(tag, 'max')`; the 1-arg form is deprecated |
| Parallel-route slots | `default.js` recommended | `default.js` required (the build fails without it) |
| Typed routes / `PageProps<'/x'>` | stable since 15.5 (`next typegen`) | stable |

React 19: `ref` is a regular prop (no new `forwardRef`), `<Context value>` replaces
`<Context.Provider>`, and `use()` unwraps promises and context. With React Compiler, new
code relies on automatic memoization.

## Default project layout

Use this when starting fresh or when the existing structure is inconsistent. It reconciles
Bulletproof React, Next.js "project files outside `app/`", and the simplest subset of
Feature-Sliced Design.

```text
.env*                         # always at the project root, even with src/
src/
  proxy.ts                    # Next 16 (middleware.ts on 15), beside app/
  app/                        # ROUTING SHELL: page/layout/route + special files
    (marketing)/ (dashboard)/ # route groups by section/audience; each may own a layout
    reviews/[id]/
      page.tsx                # await+validate params, metadata, prefetch, compose features
      _components/            # route-only glue that composes several features
    api/webhooks/…/route.ts   # public HTTP endpoints only
    providers.tsx             # 'use client' providers wrapping {children}
  features/<domain>/          # MOST CODE. Create only the subfolders a feature needs
    api/                      # fetchers, Zod schemas, DTO→model mappers, queryOptions
    components/               # domain-aware UI
    hooks/  stores/  utils/  types/  constants.ts
    server/                   # server-only DAL / actions for this domain (if full-stack)
  components/ui/              # domain-agnostic primitives (shadcn alias @/components/ui)
  components/layouts/         # app shells, nav, page frames
  hooks/                      # generic hooks (useMediaQuery, useDebounce)
  lib/                        # configured infrastructure: api-client, query-client, auth
  utils/                      # tiny pure generic helpers (cn, formatDate)
  config/                     # env (validated), route paths, feature flags
  types/                      # truly app-wide types only
```

Keep nesting shallow: about 3–4 levels, at most 2 inside a component folder (S14). Grow
into this structure. A small app may start type-based (`components/`, `hooks/`,
`helpers/`) and move to feature folders once several independent domains exist.

## Placement map: "where does X go?"

| You have… | Put it in… | Rule |
|---|---|---|
| A primitive that would work unchanged in another product (Button, Dialog, Tabs) | `components/ui/` | S4, C13 |
| A component that imports a feature's API, store or domain types | `features/<domain>/components/` | S4 |
| Glue that composes two or more features for one route only | `app/<route>/_components/` | S2 |
| A component used by exactly one other component | the same file or folder as its user (colocate) | S3 |
| App-wide config (env, route paths, flags) | `config/` (env validated with Zod, literal `process.env.NEXT_PUBLIC_X` access) | S7, S8 |
| A constant used by one feature or component | beside its owner (`features/x/constants.ts` or top of the file) | S8 |
| A secret or server-only env var | only in `server-only` modules (DAL, `env.server.ts`) | S7, B9 |
| A configured client or integration with side effects (fetch wrapper, QueryClient, auth) | `lib/` | S9 |
| A tiny pure, domain-agnostic function | `utils/` (after its second consumer appears) | S3, S9 |
| A business rule (pricing, eligibility, status transitions, thresholds) | a plain TS module in the feature (`features/x/utils/` or `model/`), never inside JSX | L1, L10 |
| A type used once | the same file | S11 |
| A type shared within a feature | `features/x/types.ts` (or `z.infer` from its schema) | S11, L4 |
| Reusable stateful logic | a custom hook (`useX`) in the feature, or `hooks/` if generic | C11 |
| Non-stateful logic shared by handlers | a plain function, not a hook | C11 |
| An HTTP call | a fetcher in `features/x/api/` using the shared client; it parses and maps the response | L2, L3 |
| A query key + fetcher pair (TanStack v5) | a `queryOptions` factory in `features/x/api/` | L6 |
| A Zod schema for an API or form contract | one schema per contract in `features/x/api/` (or a shared contract package) | L4 |
| Server-side data reads (full-stack) | a `server-only` DAL that authorizes and returns DTOs | B9 |
| A mutation from your own UI | a Server Action (`'use server'`), thin, delegating to the DAL or API | B12, R11 |
| A webhook, public API, callback or feed | a Route Handler `app/api/…/route.ts` | R11 |
| Plain forwarding to another backend | `rewrites` in `next.config` | R11 |
| Context providers | a `'use client'` `providers.tsx` taking `children`, as deep as possible | B17 |
| App-wide client-only state (theme, session UI, wizard) | a small store (Zustand/Redux slice) exposed via hooks | L7 |
| Server data | RSC props, or a server cache (TanStack Query / SWR), never a client store | L5 |
| Shareable UI state (filters, tab, page) | URL search params (read in pages or client components, never layouts) | C6, R5 |
| Form or modal state | local component state | L8 |
| Metadata | `metadata` / `generateMetadata` in a server `page`/`layout` | R13 |
| Error UI | `global-error.tsx` + root `error.tsx` + `not-found.tsx`, plus `error.tsx` per major section | R14 |

## Extraction rules: what becomes a util, a hook or a component

- **Colocate first, promote on the second consumer.** The path is file → feature → shared.
  Code that starts in shared `utils/` outlives its only caller and becomes dead code that
  nobody dares delete (Kent C. Dodds, "Colocation"). (S3)
- **Duplication is cheaper than the wrong abstraction** (Sandi Metz; Dodds' AHA). A shared
  helper that keeps gaining boolean params or `if (caller === …)` branches should be
  inlined back into its callers. (S10)
- **Domain rules are the exception to "wait".** If the same business rule (rounding,
  thresholds, status mapping) appears in two components, extract it into one pure module
  now. Divergent copies of a business rule are bugs, not style. (L1)
- **Only functions that call hooks are hooks.** `useSorted` that calls no hooks should be
  `getSorted`. Name hooks for a concrete purpose (`useOnlineStatus`), never a lifecycle
  (`useMount`). (C11)
- **Split components on concern, state ownership or reuse, never on line count.** No
  source gives a numeric limit. Signals: state read by only one subtree (move it down),
  props forwarded unread (lift content up and pass `children`), several entities in one
  file. (C3)
- **Ceremony scales with size.** Don't add ports, adapters or use-case classes with one
  implementation and one caller unless they isolate an unstable external contract. (L11)

## Dependency direction (enforce mechanically)

```text
utils/ types/ config/ lib/ hooks/ components/ui   ← shared: imports nothing above it
              ↑
        features/<domain>                          ← never imports a sibling feature
              ↑
             app/                                  ← composes features
```

- Feature A never imports feature B. Compose them in the route (S5).
- Shared code never imports `features/` or `app/` (S4, L12).
- Enforce this with ESLint `import/no-restricted-paths` zones (or `eslint-plugin-boundaries`,
  or Steiger for FSD) plus `import/no-cycle`. A ready config is in
  [references/project-structure.md](references/project-structure.md). (S6)
- No aggregate `export *` barrels in app code. They hide boundaries, create cycles and get
  picked up by auto-import. A single-target `index.ts` per component is fine. (S12)

## Server/client boundary essentials

- Server Components are the default. Put `'use client'` on the **smallest interactive
  leaf**, never on `page.tsx` or `layout.tsx` (B1). The directive marks a module-graph
  entry: everything that file imports becomes client code, so you need it once per client
  entry, not on every file (B2).
- Nest server UI inside client wrappers by passing it as `children` or JSX props from a
  server owner. Never import a server module into a client file (B3).
- Only serializable data crosses. Function props must be Server Functions named `*Action`
  (B6). Serializable is not the same as safe: pass **minimal DTOs**, never whole ORM or
  domain records, tokens or PII (B7).
- Server Actions are **public POST endpoints**. Every action validates its input
  (`safeParse`), authenticates, authorizes ownership, delegates to the DAL or API,
  revalidates, and returns minimal data. `redirect()` comes last and outside `try/catch`
  (B12, B13). Don't fetch data through actions, because they run sequentially (B14).
- Layouts and `proxy.ts`/`middleware.ts` are **not** authorization boundaries. Authorize
  in the DAL, page, every action and handler, and each parallel slot (R6).
- Server Components read data directly (DAL or backend). They never `fetch` the app's own
  Route Handlers (R10).
- Read-once server data for a client component: pass an un-awaited promise and `use()` it
  under `<Suspense>` (B11). Reach for TanStack Query or SWR only for live, shared browser
  caches (polling, infinite lists, optimistic updates). The server then only prefetches
  into `HydrationBoundary` (B16).

## Routing essentials

- `page.tsx` owns routing concerns: it awaits and validates `params`/`searchParams`
  (`notFound()` on bad input), handles `metadata`, `generateStaticParams` and redirects,
  then delegates to feature modules (R2).
- Layouts are persistent chrome. They don't re-render on navigation, can't read
  `searchParams` or the pathname, and can't pass data to children (re-fetch and dedupe
  with `cache`). Uncached data in a layout needs its own `<Suspense>` (R5).
- `error.tsx` does not catch errors from its sibling `layout`. Cover layouts from the
  parent segment or with `global-error.tsx` (R14).
- Parallel and intercepting routes are thin adapters around a shared content component.
  Every slot has `default.tsx` (R9).
- Route groups `(name)` organize by section, audience or team without changing the URL.
  Use multiple root layouts only for truly separate experiences, because crossing them
  is a full reload (R7).

## Business logic and state essentials

- Components render and dispatch, hooks orchestrate state for a view, pure TS modules hold
  domain rules, and the API layer owns transport and mapping (L1). Test: if checking a
  business rule needs `render()` or a mocked `fetch`, the rule is in the wrong layer (L10).
- No `fetch`/axios or raw wire shapes (`response.data.data`, snake_case fields) in
  components (L2).
- **Parse, don't assert** external data at the boundary. Avoid `res.json() as T` and
  return-only generics like `get<T>()` (L3).
- One schema per contract, with types derived via `z.infer`. Server validation is
  authoritative; client validation is UX only. When client and server share contracts
  through copied files, those copies drifting apart is the failure to watch for (L4).
- Server data lives in RSC or a server cache, never copied into Redux or Zustand via
  `useEffect` + `dispatch` (L5).
- State placement ladder: derive in render → local state → lift to the closest common
  parent → compose with `children` → scoped reducer + context → external store (C6).

## How to answer or review

**Placement question** ("where should X go?"): give the location and the rule ID, add a
one-sentence reason, and say whether it is a hard rule or a convention. If the repo
already has a consistent convention that differs, recommend the repo's convention and
note the difference.

**Architecture review**: report findings in this shape and order them most severe first:

```markdown
### [must-fix | should-fix | suggestion] <short title> — <rule ID>
`path/to/file.tsx:42` — what is wrong, in one or two sentences.
Why: the consequence (leak, bug, coupling, build error, drift).
Fix: the concrete move (file path or code change).
```

- **must-fix**: framework or security rules (B1–B18, R4–R6, R10, L3–L5 when data crosses a
  trust boundary).
- **should-fix**: dependency-direction violations, duplicated business rules, god
  components (S5, S6, L1, L2, C3, C4).
- **suggestion**: folder and naming conventions (S1–S14 otherwise, C13).

Don't flag duplication blindly (S10), and don't recommend a restructure that the codebase's
size doesn't justify (L11).

## Reference files (read the one you need)

| File | Read when |
|---|---|
| [references/project-structure.md](references/project-structure.md) | Creating or reorganizing folders; constants, env, `lib/` vs `utils/`, types, barrels, naming, ESLint boundary config (S1–S14) |
| [references/components.md](references/components.md) | Designing, splitting or composing components; custom hooks; state placement; reusable primitive APIs (C1–C14) |
| [references/logic-and-state.md](references/logic-and-state.md) | Where business logic, API calls, validation, server vs client state, stores and error handling live (L1–L12) |
| [references/app-router.md](references/app-router.md) | Routes, special files, layouts, route groups, parallel/intercepting routes, Route Handlers vs Server Actions, proxy, metadata, Cache Components (R1–R16) |
| [references/server-client-boundaries.md](references/server-client-boundaries.md) | `'use client'`/`'use server'`, serialization, DAL and DTOs, auth placement, fetching, Server Action template, TanStack Query with RSC (B1–B18) |
| [references/legacy-and-disagreements.md](references/legacy-and-disagreements.md) | Spotting outdated advice in code or prompts, or when sources disagree and you need a tie-breaker |
