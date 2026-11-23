# frontend-ui-architecture

**Version 1.0.0**: released 2026-11-23. Targets React 19.x, Next.js 15.x–16.x (App
Router), TanStack Query v5 and Zod 3/4.

A Claude skill that answers architecture questions for React + Next.js frontends:
- where components, hooks, constants, config, types and utilities live;
- how components are split and composed;
- where business logic, API access and validation belong;
- how App Router routes, layouts and special files are organized;
- where the server/client boundary goes;
- how data access and mutations are structured.

It is about **organization and separation of concerns, not performance tuning.**

## What it does

| Situation | What the skill makes Claude do |
|---|---|
| "Where should this go?" | Answer with a location and a rule ID, say whether it is a framework rule or a convention, and defer to the repo's existing consistent convention |
| Creating a feature or folder | Apply the default layout (`app/` as a routing shell, `features/<domain>/`, a shared layer) and one-way imports |
| Drawing the server/client boundary | Keep `'use client'` on leaves, send only minimal DTOs across, use the DAL or HTTP-API model, write Server Actions from the template |
| Adding routes | Use the App Router special files, layout limits, route groups, parallel/intercepting routes, and the choice between Route Handlers, actions and `rewrites` |
| Reviewing frontend code | Report must-fix / should-fix / suggestion findings, each citing a rule ID |
| Spotting outdated advice | Flag version-bound patterns (`middleware.ts` → `proxy.ts`, sync `params`, container/presentational, server data in Redux…) |

**Out of scope:**
- performance optimization (bundle size, memoization tuning, image and font loading);
- styling systems;
- test writing.

Use the neighbouring skills for those.

## How the skill is organized

```text
frontend-ui-architecture/
├── SKILL.md                              # workflow, placement map, core rules, review format (loaded on trigger)
├── README.md                             # this file: purpose, versioning, every source used
└── references/                           # loaded on demand, one topic each
    ├── project-structure.md              # S1–S14  folders, colocation, constants/env, lib vs utils, types, barrels, lint boundaries, naming
    ├── components.md                     # C1–C14  component design, splitting, composition, hooks, state placement, primitive APIs
    ├── logic-and-state.md                # L1–L12  business logic layering, API layer, parsing, schemas, server vs client state, stores, errors
    ├── app-router.md                     # R1–R16  special files, pages, layouts, route groups, parallel/intercepting, handlers vs actions, proxy, metadata, Cache Components
    ├── server-client-boundaries.md       # B1–B18  'use client'/'use server', serialization, DAL/DTO, HTTP-API model, auth placement, fetching, action template, TanStack + RSC
    └── legacy-and-disagreements.md       # outdated advice → replacement, source conflicts → tie-breakers, open questions
└── evals/                                # test cases (claude plugin eval format): prompt.md + case.yaml + graders/
    ├── places-risk-score-logic/          # placement question: domain rule, constants, feature vs ui component
    ├── reviews-client-page-boundaries/   # review: 'use client' page, unsafe action, redirect in try, sync params, middleware auth
    └── designs-action-for-external-api/  # design: Server Action in the HTTP-API model on Next 15 + TanStack invalidation
```

Run the test cases from this directory with `claude plugin eval . --allow-tools Write,Edit,Bash`.
Each case runs with and without the skill. These are real, billed model runs.

The skill uses progressive disclosure:
- `SKILL.md` stays short and always applies.
- Each reference file is read only when the task touches its topic.
- All guidance is self-contained in these files. No external document is needed at
  runtime.

### Rule IDs and severities

Every rule has a stable ID with a prefix per topic:
- **S**: structure;
- **C**: components;
- **L**: logic and state;
- **R**: routing;
- **B**: boundaries and data.

Each rule is tagged with one of these kinds:
- **must-fix**: framework or security rules, where breaking them causes leaks, bugs or
  build errors.
- **should-fix**: coupling and dependency-direction problems, duplicated business rules,
  god components.
- **suggestion / convention**: folder and naming consensus. A project's own consistent
  convention wins over these.

The split follows the research's main finding:
- The frameworks are **prescriptive** about boundaries, security, routing and caching.
- They are deliberately **unopinionated** about folder layout ("Next.js is unopinionated…").

Folder rules therefore come from reference codebases and recognized practitioners. They
are never presented as framework law.

### Version tags

Version-sensitive rules carry tags: `[13+]`, `[15]`, `[15.5]`, `[16]`, `[16.3]`, `[16.4]`
and `[R19]`. The skill tells Claude to read the installed `next`/`react` versions first,
because real codebases lag the framework (dub still ships `middleware.ts`; cal.com mixes
`pages/` and `app/`).

## Relationship to other skills in this repo

| Skill | Division of labour |
|---|---|
| `next-best-practices` | Next.js API-level details (async APIs, image/font, bundling, hydration errors). This skill decides *where* code goes; that one covers *how* a given API works |
| `react-best-practices` | React anti-pattern catalog and hook usage. This skill covers placement, decomposition and layering |
| `zod` | Schema syntax and error handling. This skill decides *where* schemas live and where parsing happens |
| `security` | OWASP-level review. This skill covers the Next.js-specific structure that makes security enforceable (DAL, DTOs, action template) |
| `onion-architecture` | The same "dependencies point inward" idea, applied to the DevDigest backend |

## Versioning

The skill follows [Semantic Versioning](https://semver.org/). The version lives in
`SKILL.md` frontmatter (`metadata.version`), in the `SKILL.md` title and in this README.
Bump all three together.

- **MAJOR**: a rule ID is removed or renumbered, or guidance reverses. Example: Next.js 17
  makes Cache Components the default and R15 changes meaning.
- **MINOR**: new rules, new reference sections, or support for a new framework minor
  version.
- **PATCH**: wording, examples, link fixes, or newly verified facts that don't change a
  rule.

### Maintenance checklist

Re-check these when bumping the version. They are the parts most likely to drift:
1. The Next.js blog for new releases (proxy, caching, typed routes, error APIs). Update the
   version table in `SKILL.md` and `legacy-and-disagreements.md`.
2. react.dev release notes (`forwardRef` removal, Compiler guidance, `use()`).
3. TanStack Query's Advanced Server Rendering guide.
4. Zod major version (the error-helper names in the action template).
5. `eslint-plugin-boundaries` rule names and Bulletproof's lint config, in the project-structure example.
6. Items listed as unverified in `legacy-and-disagreements.md` §3.

## Changelog

### 1.0.0 — 2026-11-23
- First release. The research was carried out on 2026-11-23 in five parallel tracks:
  1. project structure;
  2. component design;
  3. logic layering;
  4. App Router conventions;
  5. server/client boundaries and data access.
- 74 rules (S1–S14, C1–C14, L1–L12, R1–R16, B1–B18).
- A table of 21 outdated patterns, 15 disagreements with tie-breakers, and a list of open
  questions.

---

## Sources

These are all the sources consulted while building this skill, deduplicated across the five
research tracks. Dates are as observed on 2026-11-23: `lastUpdated` for Next.js docs
pages, last commit for GitHub docs, and publication or update date for posts.

**Status markers:**

| Marker | Meaning |
|---|---|
| *fetched* | read directly |
| *summarized fetch* | content returned by a summarizing fetcher, not verbatim |
| *snippet only* | seen only through search results or summaries |
| *mirror* | read through a mirror because the original was unreachable |
| *403 / 404* | the fetch failed |
| *archived* | the repository or page is marked archived or legacy |

Claims that rest only on snippet-only, mirror or failed sources are flagged as such in the
reference files.

### Official documentation: Next.js (Vercel)

| Title | Author / Org | URL | Date | Coverage and authority | Status |
|---|---|---|---|---|---|
| Project structure and organization | Vercel / Next.js | https://nextjs.org/docs/app/getting-started/project-structure | lastUpdated 2026-07-21 | File conventions, render hierarchy, safe colocation, `_private`, `(groups)`, `src/`, three strategies, "unopinionated". Primary. | fetched |
| How to use environment variables | Vercel / Next.js | https://nextjs.org/docs/app/guides/environment-variables | 2026-08-25 | `NEXT_PUBLIC_` build-time inlining, dynamic-lookup caveat, `.env` at root with `src/`. Primary. | fetched |
| Server and Client Components | Vercel / Next.js | https://nextjs.org/docs/app/getting-started/server-and-client-components | 2026-10-05 | When to use each, leaf placement, interleaving, providers, third-party wrappers, `server-only`/`client-only`, environment poisoning. Primary. | fetched |
| The Server and Client Boundary | Vercel / Next.js | https://nextjs.org/docs/app/guides/server-and-client-boundary | 2026-10-05 | Module graphs, owner vs parent, code-via-imports/data-via-props, compound pitfall, `*Action` prop naming, native interactivity. Primary. | fetched |
| Fetching Data | Vercel / Next.js | https://nextjs.org/docs/app/getting-started/fetching-data | 2026-09-01 | Fetch memoization, `React.cache`, Promise + `use()`, preload, parallel vs sequential, layout blocking. Primary. | fetched |
| Mutating Data | Vercel / Next.js | https://nextjs.org/docs/app/getting-started/mutating-data | 2026-10-15 | Server Functions/Actions, inline vs file-level `'use server'`, POST-only, sequential, action placement examples. Primary. Old URL `/docs/app/getting-started/updating-data` returns **404**. | fetched |
| Server Actions and Mutations | Vercel / Next.js | https://nextjs.org/docs/app/guides/server-actions | 2026-11-18 | Sequential dispatch, single-roundtrip response, CSRF/body limit/encrypted IDs, ID-not-object inputs, revalidation API choice. Primary. | fetched |
| How to create forms with Server Actions | Vercel / Next.js | https://nextjs.org/docs/app/guides/forms | 2026-10-06 | Zod `safeParse`, field errors, `useActionState`, `useFormStatus`, `useOptimistic`, `.bind`, auth in every action. Primary. | fetched |
| How to think about data security in Next.js | Vercel / Next.js | https://nextjs.org/docs/app/guides/data-security | 2026-11-18 | Three data models, DAL/DTO, `server-only`, taint, actions as public endpoints, IDOR, audit checklist. Primary; current restatement of the 2023 blog. | fetched |
| How to implement authentication | Vercel / Next.js | https://nextjs.org/docs/app/guides/authentication | 2026-09-16 | Optimistic Proxy checks vs DAL checks, `verifySession` + `cache()`, layout auth caveat, `return null` anti-pattern, DTO columns. Primary. | fetched |
| Client-side data fetching | Vercel / Next.js | https://nextjs.org/docs/app/guides/client-side-data-fetching | 2026-10-15 | When to use SWR/TanStack vs `use()`, three patterns, three cache layers, mutation coordination. Primary. | fetched |
| updateTag (API reference) | Vercel / Next.js | https://nextjs.org/docs/app/api-reference/functions/updateTag | 2026-11-18 | Read-your-own-writes, actions only; `revalidateTag(tag,'max')`; single-arg form deprecated. Primary. | fetched |
| layout.js | Vercel / Next.js | https://nextjs.org/docs/app/api-reference/file-conventions/layout | 2026-11-18 | Root/multiple root layouts, no re-render, no searchParams/pathname, no data to children, Suspense vs loading, `LayoutProps`, root params. Primary. | fetched |
| Parallel Routes | Vercel / Next.js | https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes | 2026-10-15 | Slots, `default.js`, soft/hard navigation, role-conditional auth caveat, tabs, modal recipe. Primary. | fetched |
| Intercepting Routes | Vercel / Next.js | https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes | 2026-10-15 | `(.)`/`(..)`/`(...)` semantics by route segment, modal benefits. Primary. | fetched |
| template.js | Vercel / Next.js | https://nextjs.org/docs/app/api-reference/file-conventions/template | 2026-03-05 | Template vs layout, remount rules, use cases. Primary. | fetched |
| Dynamic Route Segments | Vercel / Next.js | https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes | 2026-06-09 | Params typing and validation, `generateStaticParams` with Cache Components, params-promise passing in layouts. Primary. | fetched |
| How to use Next.js as a backend for your frontend | Vercel / Next.js | https://nextjs.org/docs/app/guides/backend-for-frontend | 2026-11-06 | Route Handlers as public endpoints, no self-fetching from RSC, rewrites vs proxy handlers, serverless caveats. Primary. | fetched |
| Error Handling | Vercel / Next.js | https://nextjs.org/docs/app/getting-started/error-handling | 2026-10-15 | Expected errors as values, nested boundaries, `catchError`, `global-error`, `notFound`. Primary. | fetched |
| error.js | Vercel / Next.js | https://nextjs.org/docs/app/api-reference/file-conventions/error | 2026-10-15 | What `error.js` wraps (not its sibling layout), `retry`/`reset`, `global-error` requirements. Primary. | fetched |
| proxy.js | Vercel / Next.js | https://nextjs.org/docs/app/api-reference/file-conventions/proxy | 2026-11-18 | Location, one per project, Node runtime, execution order, rename rationale, codemod, version history. Primary. | fetched |
| Metadata and OG images | Vercel / Next.js | https://nextjs.org/docs/app/getting-started/metadata-and-og-images | 2026-08-25 | Metadata only in Server Component layout/page, streaming metadata, file-based metadata precedence. Primary. | fetched |
| Next.js docs index (llms.txt) | Vercel / Next.js | https://nextjs.org/docs/llms.txt | retrieved 2026-11-23 | Used to locate current URLs; confirms doc version 16.4.6. | fetched |

### Official release notes and posts: Next.js blog and Vercel blog

| Title | Author / Org | URL | Date | Coverage and authority | Status |
|---|---|---|---|---|---|
| Next.js 15 | Delba de Oliveira, Jimmy Lai, Rich Haines (Vercel) | https://nextjs.org/blog/next-15 | 2024-10-21 | Async request APIs, uncached GET handlers/fetch by default, `instrumentation` stable, `next/form`, Server Action security. Primary. | fetched |
| Next.js 15.5 | Ben Gubler, Luke Sandberg (Vercel) | https://nextjs.org/blog/next-15-5 | 2025-08-18 | Typed routes stable, `PageProps`/`LayoutProps`/`RouteContext`, `next typegen`, Node middleware stable, `next lint` deprecated. Primary. | fetched |
| Next.js 16 | Jimmy Lai, Josh Story, Sebastian Markbåge, Tim Neutkens (Vercel) | https://nextjs.org/blog/next-16 | 2025-10-21 | Cache Components, `proxy.ts`, sync APIs removed, `default.js` required, new cache APIs, React 19.2. Primary. | fetched |
| Next.js 16.3 | Next.js team (Vercel) | https://nextjs.org/blog/next-16-3 | 2026-08-03 | Instant Navigations, root params, `catchError`, `retry` stable, inline loading states, AGENTS.md. Primary. | fetched |
| Next.js 16.4 | Next.js team (Vercel) | https://nextjs.org/blog/next-16-4 | 2026-10-06 | Cache Components recommended for all apps, on by default in new apps, default in Next 17; `ensureStatic`. Primary. | fetched |
| Building APIs with Next.js | Lee Robinson (Vercel) | https://nextjs.org/blog/building-apis-with-nextjs | 2025-02-28 | When to build APIs, BFF, Server Actions as auto POST routes, shared DAL. Primary/expert. | fetched |
| How to Think About Security in Next.js | Sebastian Markbåge (Vercel; React core) | https://nextjs.org/blog/security-nextjs-server-components-actions | 2023-10-23 | Origin of three-model, DAL/DTO, taint, closure-encryption and audit guidance. Some API details (sync `cookies()`, `middleware.tsx`) dated; superseded by the data-security guide. | fetched |
| The latest Next.js news (blog index) | Vercel / Next.js | https://nextjs.org/blog | accessed 2026-11-23 | Release timeline 15.3 to 16.4, monthly security program, no Next.js 17 yet. | fetched |
| Security Advisory: CVE-2025-66478 | Vercel / Next.js | https://nextjs.org/blog/CVE-2025-66478 | 2025-12-03 | Critical RSC protocol vulnerability. | title and summary only, via blog index |
| Common mistakes with the Next.js App Router and how to fix them | Lee Robinson (Vercel) | https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them | 2024-01-08 | Ten anti-patterns (self-fetching handlers, unnecessary `'use client'`, redirect in try/catch, missing revalidation, provider placement). Vendor guidance; its "GET handlers cached by default" claim is Next 14-era and outdated. | fetched |

### Official documentation: React (react.dev and legacy)

| Title | Author / Org | URL | Date | Coverage and authority | Status |
|---|---|---|---|---|---|
| Thinking in React | React team | https://react.dev/learn/thinking-in-react | Living doc | Decomposition by concern, minimal state, state placement, inverse data flow. Primary. | fetched |
| Keeping Components Pure | React team | https://react.dev/learn/keeping-components-pure | Living doc | Purity, side effects in handlers, Strict Mode double render. Primary. | fetched |
| Choosing the State Structure | React team | https://react.dev/learn/choosing-the-state-structure | Living doc | Five state principles, status enums, IDs over objects, `initialX`. Primary. | fetched |
| Sharing State Between Components | React team | https://react.dev/learn/sharing-state-between-components | Living doc | Lifting state, single owner, controlled vs uncontrolled. Primary. | fetched |
| You Might Not Need an Effect | React team | https://react.dev/learn/you-might-not-need-an-effect | Living doc | Effect anti-patterns, decision test, `key` reset, `useSyncExternalStore`. Primary. | fetched |
| Reusing Logic with Custom Hooks | React team | https://react.dev/learn/reusing-logic-with-custom-hooks | Living doc | Hook naming, logic not state, no lifecycle hooks, `useEffectEvent`. Primary. | fetched |
| Passing Data Deeply with Context | React team | https://react.dev/learn/passing-data-deeply-with-context | Living doc | Props → `children` → context; context use cases. Primary. | fetched |
| Scaling Up with Reducer and Context | React team | https://react.dev/learn/scaling-up-with-reducer-and-context | Living doc (React 19 syntax) | Provider module + accessor hooks; many context-reducer pairs. Primary. | fetched |
| Your First Component | React team | https://react.dev/learn/your-first-component | Living doc | Never nest component definitions. Primary. | fetched |
| Preserving and Resetting State | React team | https://react.dev/learn/preserving-and-resetting-state | Living doc | Why nested definitions reset state; `key` reset. Primary. | fetched |
| React 19 | React team | https://react.dev/blog/2024/12/05/react-19 | 2024-12-05 | `ref` as prop, `forwardRef` deprecation path, `<Context value>`, `use()`, Actions. Primary. | fetched |
| React Compiler: Introduction | React team | https://react.dev/learn/react-compiler/introduction | Living doc | Memoization guidance for new vs existing code; Next.js 15.3.1+ support. Primary. | fetched |
| 'use client' (reference) | React team | https://react.dev/reference/rsc/use-client | Current React 19 docs | Directive semantics, usage-vs-definition, serializable props list. Authoritative spec. | fetched |
| 'use server' (reference) | React team | https://react.dev/reference/rsc/use-server | Current React 19 docs | Server Function semantics, argument/return serialization, untrusted input, not for data fetching. Authoritative spec. | fetched |
| FAQ: File Structure | React team (legacy docs) | https://legacy.reactjs.org/docs/faq-structure.html | Pre-2023 | No official opinion; feature vs type; colocate; avoid deep nesting. Only React-team statement on structure. | **archived/legacy**, fetched |

### Official documentation: libraries, methodologies and tools

| Title | Author / Org | URL | Date | Coverage and authority | Status |
|---|---|---|---|---|---|
| Does TanStack Query replace Redux/MobX/other global state managers? | TanStack | https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state | Living docs (fetched 2026-11-23) | Remaining global client state "usually very tiny". Official. | fetched |
| Advanced Server Rendering | TanStack Query | https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr | Current (v5) | App Router `providers.tsx`, per-request client, prefetch + `HydrationBoundary`, streaming, "Server Components only prefetch", "start without React Query". Official. | fetched |
| Redux Style Guide | Redux maintainers | https://redux.js.org/style-guide/ | last updated 2026-09-23 | Feature folders/ducks, logic in reducers, event actions, no form state, RTK Query default, serializability. Official. | fetched |
| Zustand: Flux inspired practice | pmndrs | https://github.com/pmndrs/zustand/blob/main/docs/learn/guides/flux-inspired-practice.md | Living docs | Single store, colocated actions. Official. | fetched |
| Zustand: Slices Pattern | pmndrs | https://github.com/pmndrs/zustand/blob/main/docs/learn/guides/slices-pattern.md | Living docs | Slices combined into one bounded store. Official. | fetched |
| Feature-Sliced Design: Overview (v2.1) | FSD core team | https://feature-sliced.design/docs/get-started/overview | © 2018–2025 | Layers/slices/segments, import rule, fit and incremental adoption. Formal methodology. | fetched |
| FSD Reference: Public API | FSD core team | https://feature-sliced.design/docs/reference/public-api | © 2018–2025 | Index-file public API, no wildcard re-exports, per-component shared indexes, `@x` cross-imports. | fetched |
| FSD Guide: Usage with Next.js | FSD core team | https://feature-sliced.design/docs/guides/tech/with-nextjs | © 2018–2025 | `_app`/`_pages` renaming, root `app/`, re-export pattern, `index.server.ts`. | fetched |
| Steiger README | feature-sliced org | https://github.com/feature-sliced/steiger | Beta (≥ v0.5.0) | FSD architecture linter rules (`forbidden-imports`, `no-public-api-sidestep`, `segments-by-purpose`…). Beta status. | fetched |
| eslint-plugin-boundaries README | Javier Brea | https://github.com/javierbrea/eslint-plugin-boundaries | Active, undated | Pattern-based architecture boundary lint (docs at jsboundaries.dev). Current rule names unconfirmed. | summarized fetch |
| components.json | shadcn/ui | https://ui.shadcn.com/docs/components-json | Current | Alias system placing `ui`, `utils`, `hooks`. Official tool docs. | fetched |
| shadcn-ui/ui repository (`apps/v4/components.json`, init changelog `2024-08-npx-shadcn-init.mdx`, `lib/format-code.ts`) | shadcn | https://github.com/shadcn-ui/ui | Inspected 2026-11-23 | Default aliases `@/components/ui`, `@/lib/utils`, `@/hooks`. | via GitHub code search |
| Button | shadcn/ui | https://ui.shadcn.com/docs/components/button | Living doc | `variant`/`size` API, `buttonVariants`, Base UI `render` note. | fetched |
| button.tsx (new-york-v4 registry) | shadcn-ui/ui | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/button.tsx | main, fetched 2026-11-23 | `cva` + `Slot` + `data-slot` implementation. | summarized fetch (not verbatim) |
| Composition guide (`asChild`) | Radix UI (WorkOS) | https://www.radix-ui.com/primitives/docs/guides/composition | Undated | `asChild` contract (spread props, accept ref, accessibility). `forwardRef` advice predates React 19. | fetched |
| nuqs | 47ng (François Best) | https://github.com/47ng/nuqs | n/d | Type-safe search-params state library. | **snippet only** |

### Framework authors and library maintainers

| Title | Author / Org | URL | Date | Coverage and authority | Status |
|---|---|---|---|---|---|
| What Does "use client" Do? | Dan Abramov (overreacted.io) | https://overreacted.io/what-does-use-client-do/ | 2025-04-25 | Directives as typed `<script>`/`fetch()`; module-system doors. React core contributor. | fetched |
| Before You memo() | Dan Abramov | https://overreacted.io/before-you-memo/ | 2021-02-23 | Move state down, lift content up. | fetched |
| react-file-structure.surge.sh | Dan Abramov | https://react-file-structure.surge.sh/ | ~2018 | "Move files around until it feels right." Influential one-liner. | fetched (older) |
| Presentational and Container Components (+2019 note) | Dan Abramov (Medium) | https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0 | 2015 (unverified), note 2019 | Original pattern and retraction. | **403, not fetched** |
| Please Stop Using Barrel Files | Dominik Dorfmeister (TkDodo) | https://tkdodo.eu/blog/please-stop-using-barrel-files | 2024-07-26 | Architecture, cycle, auto-import and perf case against barrels; library-entry exception. TanStack Query maintainer. | fetched |
| React Query as a State Manager | TkDodo | https://tkdodo.eu/blog/react-query-as-a-state-manager | 2021-08-20 | Server state as cache; don't sync to other stores; `staleTime`. | fetched |
| Effective React Query Keys | TkDodo | https://tkdodo.eu/blog/effective-react-query-keys | 2021-06-13, upd. 2022-04-23 | Per-feature key factories, no global keys file. Partly superseded by the Query Options post. | fetched |
| The Query Options API | TkDodo | https://tkdodo.eu/blog/the-query-options-api | 2024-01-17 | v5 `queryOptions`; keys + fns together; de-emphasizes thin hooks. Current. | fetched |
| Type-safe React Query | TkDodo | https://tkdodo.eu/blog/type-safe-react-query | 2023-01-07, upd. 2023-10-21 | Zod parse in `queryFn`; return-only generics as disguised assertions. | fetched |
| Working with Zustand | TkDodo | https://tkdodo.eu/blog/working-with-zustand | 2022-11-20 | Hook-only exports, atomic selectors, event actions, small stores. | fetched |
| You Might Not Need React Query | TkDodo | https://tkdodo.eu/blog/you-might-not-need-react-query | 2023-05-20 | When RSC frameworks replace React Query and when hybrid use remains. | fetched |
| Speeding up the JavaScript ecosystem: The barrel file debacle | Marvin Hagemeister | https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/ | 2023-10-08 | Measured module-loading and tooling cost of barrels. Preact core / tooling perf expert. | fetched |

### Recognized community experts and educators

| Title | Author / Org | URL | Date | Coverage and authority | Status |
|---|---|---|---|---|---|
| Colocation | Kent C. Dodds | https://kentcdodds.com/blog/colocation | 2019-06-17 | Colocation principle, `utils/` pitfall, test/state/doc colocation. Canonical. | fetched (older) |
| AHA Programming | Kent C. Dodds | https://kentcdodds.com/blog/aha-programming | 2020-06-22 | Avoid Hasty Abstractions; optimize for change. | fetched (older) |
| Prop Drilling | Kent C. Dodds | https://kentcdodds.com/blog/prop-drilling | 2018-05-21 | Explicit data flow; against premature splitting. | fetched (older) |
| Inversion of Control | Kent C. Dodds | https://kentcdodds.com/blog/inversion-of-control | 2019-11-18 | Prop sprawl, compound components, state reducers. | fetched |
| Compound Components with React Hooks | Kent C. Dodds | https://kentcdodds.com/blog/compound-components-with-react-hooks | 2019-02-18 | Context-based compound components with a guarded hook. | fetched |
| Application State Management with React | Kent C. Dodds | https://kentcdodds.com/blog/application-state-management-with-react | 2020-07-21 | Colocate state, context by domain, server cache vs UI state. | fetched |
| Delightful React File/Directory Structure | Josh W. Comeau | https://www.joshwcomeau.com/react/file-structure/ | 2022-03-15, upd. 2025-12-03 | Function-based structure, forwarding index, helpers vs utils, constants; dissents on features, barrels, naming. | fetched |
| Making Sense of React Server Components | Josh W. Comeau | https://www.joshwcomeau.com/react/server-components/ | 2023-09-06, upd. 2025-05-09 | Client Components also SSR; "lifting boundaries down". | fetched |
| React Folder Structure in 5 Steps | Robin Wieruch | https://www.robinwieruch.de/react-folder-structure/ | upd. 2026-05-05 | Progressive structure, feature folders, kebab-case, promotion rule, component folder layout, Next.js notes. | fetched |
| JavaScript Naming Conventions | Robin Wieruch | https://www.robinwieruch.de/javascript-naming-conventions/ | 2019-10-06 | Kebab-case file-name rationale; superseded split rule. | fetched (older) |
| React Router Search Params | Robin Wieruch | https://www.robinwieruch.de/react-router-search-params/ | n/d | URL as source of truth. | **snippet only** |
| Wieruch posts on kebab-case vs PascalCase and on thin vs colocated `app/` | Robin Wieruch | URLs not recorded by researchers | n/a | Attempted for naming rationale and App Router placement. | **404** |
| Where To Put Your Types in Application Code | Matt Pocock (Total TypeScript) | https://www.totaltypescript.com/where-to-put-your-types-in-application-code | Undated | Colocate single-use types; `*.types.ts` at narrowest shared scope; shared package. | fetched |
| Should you use declaration files to store your types | Matt Pocock (Total TypeScript workshop) | https://www.totaltypescript.com/workshops/typescript-pro-essentials/types-you-don't-control/should-you-use-declaration-files-to-store-your-types | n/d | `.d.ts` only for ambient/global declarations. | **search summary only** |
| React.ComponentProps type helper | Matt Pocock (Total TypeScript) | https://www.totaltypescript.com/react-component-props-type-helper | Undated | Typing wrapper props from native and third-party components. | fetched |
| Modularizing React Applications with Established UI Patterns | Juntao Qiu (martinfowler.com) | https://martinfowler.com/articles/modularizing-react-apps.html | 2023-02-16 | View/hooks/domain/gateway layers, ACL, shotgun-surgery example. High authority (Fowler-edited). | fetched |
| Clean Architecture on Frontend | Alex Bespoyasov | https://bespoyasov.me/blog/clean-architecture-on-frontend/ | 2021-09-02 | Domain/application/adapters, hooks as DI, explicit costs. | fetched |
| Path to a Clean(er) React Architecture, Part 3: API Layer & Data Transformations (series index) | Johannes Kettmann (profy.dev) | https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-api-layer-data-transformations-1go0 | 2024-05-10 (series 2024-04-12 → 2024-07-19) | API client → fetchers → DTO mapping → domain → DI → React Query. | **mirror** (profy.dev unreachable, DNS failure) |
| Path to a Clean(er) React Architecture, Part 6: Business Logic Separation | Johannes Kettmann | https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-6-business-logic-separation-221g | 2024 | Application layer / use cases. | **snippet only** |
| Path to a Clean(er) React Architecture, Part 7: Domain Logic | Johannes Kettmann | https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-7-domain-logic-lg | 2024 | Domain entities; testability motivation. | **snippet only** |
| The Wrong Abstraction | Sandi Metz | https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction | 2016-01-20 | "duplication is far cheaper than the wrong abstraction". Canonical. | fetched |
| Parse, don't validate | Alexis King | https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/ | 2019-11-05 | Parse at boundaries; illegal states unrepresentable; shotgun parsing. | fetched |
| Container/Presentational Pattern | patterns.dev (Lydia Hallie & Addy Osmani project) | https://www.patterns.dev/react/presentational-container-pattern | Undated | Pattern plus "hooks replace it" note. Secondary. | fetched |
| Compound Pattern | patterns.dev | https://www.patterns.dev/react/compound-pattern | Undated | Context vs `cloneElement` implementations and cons. Secondary. | fetched |

### Reference codebases

| Title | Author / Org | URL | Date | Coverage and authority | Status |
|---|---|---|---|---|---|
| Bulletproof React: docs/project-structure.md | Alan Alickovic | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md | last commit 2024-11-12 | Feature folders, shared → features → app, cross-feature ban, barrel stance. Widely referenced (~30k+ stars, unverified count). | fetched |
| Bulletproof React: docs/project-standards.md | Alan Alickovic | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md | n/d | Kebab-case via eslint-plugin-check-file, single `@/*` alias. | fetched |
| Bulletproof React: docs/api-layer.md | Alan Alickovic | https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md | last commit 2024-07-20 | Single API client; request declaration = schema + fetcher + hook. | fetched |
| Bulletproof React: docs/state-management.md | Alan Alickovic | https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md | last commit 2024-07-20 | Five state categories, library choices, RHF + Zod. | fetched |
| Bulletproof React: docs/error-handling.md | Alan Alickovic | https://github.com/alan2207/bulletproof-react/blob/master/docs/error-handling.md | fetched 2026-11-23 | Interceptors, multiple error boundaries, Sentry. | fetched |
| Bulletproof React `apps/nextjs-app` (tree, `.eslintrc.cjs`, `config/env.ts`, `discussions/page.tsx`, `_components/discussions.tsx`) | Alan Alickovic | https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app | inspected 2026-11-23 | Real App Router implementation: ESLint zones, Zod env, thin pages, route-level composition. Lint config is legacy `.eslintrc.cjs`. | fetched via `gh api` |
| vercel/shop | Vercel | https://github.com/vercel/shop | pushed 2026-11-21 | Current Vercel storefront; route groups, error placement, agent-facing Route Handlers, top-level `components/`. | fetched (tree) |
| vercel/commerce | Vercel | https://github.com/vercel/commerce | last push 2026-10-19 | Flat `app/`, `components/<feature>`, `lib/shopify`. README points to vercel/shop. | **archived** |
| shadcn-ui/taxonomy | shadcn | https://github.com/shadcn-ui/taxonomy | last push 2026-04-20 | Next 13 route-group example; self-declared "Does not reflect current best practices". | **archived** |
| nextjs/saas-starter | Next.js org / Lee Robinson | https://github.com/nextjs/saas-starter | pushed 2025-12-11 | Route groups with colocated actions; `components/ui`, `lib/auth`, `lib/db`. Official starter. | fetched (tree) |
| calcom/cal.com | Cal.com | https://github.com/calcom/cal.com | pushed 2026-11-13 | Route groups, private `_trpc`, `modules/`, `proxy.ts`, mixed `pages/` + `app/`. | fetched (tree) |
| dubinc/dub | Dub | https://github.com/dubinc/dub | pushed 2026-10-27 | Hostname-based route trees, large `app/api`, `ui/` + `lib/`, still `middleware.ts`. | fetched (tree) |
| nextjs/nextgram | Next.js org | https://github.com/nextjs/nextgram | n/a | Official parallel + intercepting modal example linked from docs. | linked, **not inspected** |

**Specific files inspected inside the reference codebases.** The rows above cover each
repository as a whole. These are the exact files the rules cite:

| File | What it evidences | Used in |
|---|---|---|
| https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app/src | `src/` layout of a real App Router app (`app`, `components`, `config`, `features`, `hooks`, `lib`, `utils`, `types`…) | S2, S9 |
| https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app/src/app | Thin route folders, `_components` route glue | S2, R2 |
| https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app/src/components | Shared `ui/`, `layouts/`, `errors/` split | S4 |
| https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app/src/utils | `cn.ts`, `format.ts` as pure utils | S9 |
| https://github.com/alan2207/bulletproof-react/blob/master/apps/nextjs-app/.eslintrc.cjs | `import/no-restricted-paths` zones + `import/no-cycle` | S5, S6 |
| https://github.com/alan2207/bulletproof-react/blob/master/apps/nextjs-app/src/config/env.ts | Zod-validated env module | S7 |
| https://github.com/alan2207/bulletproof-react/blob/master/apps/nextjs-app/src/app/app/discussions/page.tsx | Page = metadata + prefetch via `queryOptions` + `HydrationBoundary` | R2, B16 |
| https://github.com/alan2207/bulletproof-react/blob/master/apps/nextjs-app/src/app/app/discussions/_components/discussions.tsx | Route-only component composing two features | S2, S5 |
| https://github.com/shadcn-ui/ui/blob/main/apps/v4/components.json | Default aliases `@/components/ui`, `@/lib/utils`, `@/hooks` | S4, S9 |

### Lower-authority and secondary sources

| Title | Author / Org | URL | Date | Coverage and authority | Status |
|---|---|---|---|---|---|
| How to convert your existing Redux containers to Hooks | LogRocket blog | https://blog.logrocket.com/how-to-convert-your-existing-redux-containers-to-hooks | Not captured | Verbatim quote of one sentence of Abramov's 2019 retraction. Secondary. | fetched |
| URL-driven state in React | kexizeroing (personal blog) | https://kexizeroing.github.io/post/url-driven-state-in-react | n/d | Don't mirror URL params into state. Low authority. | **snippet only** |
| How to structure your Next.js App Router project for scale | Mahdi Benrhouma (DEV Community) | https://dev.to/mahdi_benrhouma_fe1c6005/how-to-structure-your-nextjs-app-router-project-for-scale-4e3o | Unknown | "`app/` for routing only" opinion. Low authority. | **snippet only** |
| Reusable architecture for large Next.js applications | freeCodeCamp | https://www.freecodecamp.org/news/reusable-architecture-for-large-nextjs-applications/ | Unknown | Route colocation as an App Router capability. Low authority. | **snippet only** |
| FSD criticism (Russian) | Habr, T1 Holding author | https://habr.com/ru/post/890652 | ~2024–2025 (unverified) | "Anti-KISS"; lack of segment-interaction rules. Forum-grade. | **snippet only** |
| Why are we talking about architecture again? | ITNEXT | https://itnext.io/why-are-we-talking-about-architecture-again-9810accf3852 | ~2024–2025 (unverified) | FSD "puts the UI front and center". Low authority. | **snippet only** |
| Feature-Sliced Design review | algoorgoal (dev.to) | https://dev.to/algoorgoal/feature-sliced-design-review-22k0 | ~2024–2025 (unverified) | FSD conflicts with Next.js file routing. Low authority. | **snippet only** |
| "RSC and the echo of presentational and container components" | dev.to post (author not recorded) | URL not recorded | n/d | Server Components as the new container framing. | appeared in search, **not read** |

### Identified but not consulted

The researchers flagged these as relevant but did not fetch them, and no rule in this skill depends on them. Dan Abramov's "The Two Reacts", "Impossible Components" and "Functional HTML". The react.dev reference pages for `cache`, `use`, Server Functions and the taint APIs (`experimental_taintObjectReference`, `experimental_taintUniqueValue`). The `server-only` npm page. The `@t3-oss/env-nextjs` docs. zod.dev (Zod 4 error helpers). The React Hook Form docs (`zodResolver`, `useActionState` integration). The Jotai docs. The Next.js `optimizePackageImports`, `generateStaticParams`/`dynamicParams`, `generateMetadata`, `instrumentation-client`, `loading.js`/`not-found.js` and "Layouts and Pages" reference pages. The per-library client-fetching subpages (`/client-side-data-fetching/tanstack-query`, `/swr`). The Next.js 16.1 and 16.2 release posts. The `vercel/next.js` `examples/` directory. Juntao Qiu's book *Maintainable React*. The `global-not-found.js` convention (reportedly around 15.4) was not verified.
