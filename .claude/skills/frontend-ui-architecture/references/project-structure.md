# Project structure and file organization (S1–S14)

Part of the `frontend-ui-architecture` skill. Covers where files live, which way imports
point, and how that is enforced.

## Contents
1. What the official docs do and don't say
2. The default layout, and how to grow into it
3. Colocation and promotion
4. Components: shared primitives vs feature components vs route glue
5. Constants, config and environment variables
6. `lib/` vs `utils/` vs `helpers/`, and when to extract
7. Types
8. Barrel files
9. Dependency direction and lint enforcement
10. Naming and nesting
11. Rules S1–S14

---

## 1. What the official docs do and don't say

- **React** has no current official stance. The archived legacy FAQ says "React doesn't
  have opinions on how you put files into folders". It lists grouping by feature or by
  file type, says to "keep files that often change together close to each other", warns
  against nesting deeper than about 3–4 levels, and tells you not to overthink it.
- **Next.js** says it is "unopinionated about how you organize and colocate your project
  files". It describes three valid strategies:
  1. project files outside `app/`, so `app/` is "purely for routing purposes";
  2. top-level folders inside `app/`;
  3. split by feature or route.

  Its only firm instruction is "choose a strategy that works for you and your team and be
  consistent across the project".
- Next.js gives you four tools:
  - **safe colocation**: a segment is public only when it contains `page` or `route`;
  - **`_private` folders**, which opt out of routing;
  - **`(route groups)`**, which organize routes without changing the URL;
  - **an optional `src/`**.
- `components/` and `lib/` are "generalized placeholders" with "no special framework
  significance".

So folder layout is a **convention** decision. Consistency (S1) matters more than which
convention you pick.

## 2. The default layout, and how to grow into it

```text
.env*                          # project root, even with src/
src/
  proxy.ts | middleware.ts     # 16 | 15 — beside app/, one per project
  app/                         # routing shell
    layout.tsx  providers.tsx  global-error.tsx  error.tsx  not-found.tsx
    (marketing)/  (dashboard)/
    reviews/
      page.tsx
      [id]/page.tsx
      _components/review-page-shell.tsx    # route-only composition
    api/webhooks/github/route.ts
  features/
    reviews/
      api/            # get-review.ts, review-queries.ts, review.schema.ts, mappers.ts
      components/     # review-card.tsx, findings-table.tsx
      hooks/          # use-review-filters.ts
      utils/          # severity.ts (pure domain rules)
      server/         # reviews-dal.ts, actions.ts   (server-only; full-stack apps)
      types.ts
      constants.ts
  components/
    ui/               # button.tsx, dialog.tsx (shadcn/Radix-style primitives)
    layouts/          # app-shell.tsx, sidebar.tsx
    errors/           # error-fallback.tsx
  hooks/              # use-media-query.ts, use-debounce.ts
  lib/                # api-client.ts, query-client.ts, auth.ts
  utils/              # cn.ts, format.ts
  config/             # env.client.ts, env.server.ts, paths.ts, flags.ts
  types/              # global, app-wide types only
  testing/            # test utils, MSW handlers (optional)
```

**How a project grows into it.** Robin Wieruch describes a progression: single file →
technical folders → feature folders → packages. Treat the layout as "a structural
guideline and not a naming convention". Josh W. Comeau groups by function instead
(`components/`, `hooks/`, `helpers/`). He argues feature boundaries drift away from the
product over time. That works well for small apps. Move to feature folders once several
independent domains exist.

**Production evidence.**
- Vercel's `vercel/shop` keeps routes in `app/` and shared UI in top-level `components/`.
- `nextjs/saas-starter` colocates `app/(login)/actions.ts` and keeps `components/ui`,
  `lib/auth` and `lib/db` outside `app/`.
- cal.com uses sibling `modules/`, `components/`, `lib/` and `server/` folders.
- dub uses `ui/` and `lib/`.

All of them keep `app/` mostly for routing.

**Feature-Sliced Design (FSD)** is the strict, formal version of the same idea.
- **Layers:** `app`, `pages`, `widgets`, `features`, `entities`, `shared`.
- **Slices:** one per domain.
- **Segments:** `ui`, `api`, `model`, `lib`, `config`.
- **Imports:** a layer may import "only from the layers strictly below".

With Next.js, FSD renames its layers to `_app`/`_pages`, and route files become one-line
re-exports. Adopt it only if the team wants that rigor. FSD itself says "If the current
architecture works, maybe it's not worth changing". Don't combine Bulletproof-style
`utils/`/`types/` folders with FSD's Steiger linter, which bans those "essence" folders
(`fsd/segments-by-purpose`).

## 3. Colocation and promotion (S3)

> "Place code as close to where it's relevant as possible." — Kent C. Dodds, *Colocation*

- Start code in the file or folder that uses it.
- **Promote on the second consumer.** Move feature-specific utils to the shared folder
  "when two or more features need them" (Wieruch). Comeau does the same with
  `src/helpers` and `src/hooks`.
- Why: a helper extracted early to a shared `utils/` folder outlives the component that
  used it. Engineers keep maintaining dead code and its tests because they can't tell it
  is dead.
- Colocate unit tests (`x.test.tsx` beside `x.tsx`) and feature READMEs. Keep E2E tests
  at the root.
- A shared `utils/` or `hooks/` module with exactly one importer is a smell. Move it back
  next to that importer.

## 4. Components: primitives vs feature components vs route glue (S2, S4)

| Kind | Test | Location |
|---|---|---|
| Primitive | Would work unchanged in another product. No domain imports. | `components/ui/` |
| Layout or chrome | App shell, nav, page frame | `components/layouts/` |
| Feature component | Imports a feature's API, store, hooks or domain types | `features/<x>/components/` |
| Route glue | Composes two or more features for one route only | `app/<route>/_components/` |
| Private subcomponent | Used by one component only | same file (below the main export) or the same folder |

- Bulletproof's App Router app shows the hybrid. `app/app/discussions/_components/discussions.tsx`
  imports from `@/features/discussions` and `@/features/comments`, while reusable domain
  code stays in `features/`.
- shadcn's `components.json` defaults its aliases to `"ui": "@/components/ui"`,
  `"utils": "@/lib/utils"` and `"hooks": "@/hooks"`, and the CLI writes components to
  those paths. Respect them when the project uses shadcn.
- `components/ui/**` must never import from `features/**` (S4). If a primitive needs
  domain data, it is not a primitive. Move it into the feature, or pass the data in as
  props or `children`.

## 5. Constants, config and environment variables (S7, S8)

**Where constants live.**
- **App-wide config** (environment, route paths, feature flags, app name) goes in
  `config/`. Bulletproof keeps `config/env.ts` and `config/paths.ts`.
- **Feature constants** (page sizes, status labels, default filters) go in
  `features/<x>/constants.ts`.
- **Component constants** go at module level at the top of the component file, outside
  the component body, so they aren't recreated on each render and are visibly static.
- A global `constants.ts` full of feature-only values is a smell. It couples unrelated
  features and turns into a junk drawer.

**Environment variables in Next.js.**
- `NEXT_PUBLIC_*` values are inlined at build time. Next.js does **not** inline dynamic
  lookups (`process.env[name]`, `const { X } = process.env`), so use literal property
  access.
- Variables without the prefix exist only in Node. On the client they silently become
  `undefined`/empty.
- `.env*` files stay at the project root even when you use `src/`.
- `import 'server-only'` at the top of a module turns an accidental client import into a
  build error. Use it for every module that reads secrets.

**Validated env modules.** Bulletproof's `config/env.ts` builds a Zod schema, maps each
variable, throws a readable error listing what is missing, and exports one `env` object.
Splitting it into server and client files follows from the `server-only` rule. That split
is an inference; no source names the pattern.

```ts
// src/config/env.client.ts — safe to import anywhere
import { z } from 'zod';

const ClientEnv = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
});

// Literal access is required so Next.js can inline the values at build time.
export const clientEnv = ClientEnv.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
});
```

```ts
// src/config/env.server.ts — importing this from a client module fails the build
import 'server-only';
import { z } from 'zod';

const ServerEnv = z.object({
  API_INTERNAL_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
});

export const serverEnv = ServerEnv.parse({
  API_INTERNAL_URL: process.env.API_INTERNAL_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
});
```

`@t3-oss/env-nextjs` packages the same idea. Its docs were not verified for this skill.

## 6. `lib/` vs `utils/` vs `helpers/`, and when to extract (S9, S10)

| Folder | Holds | Example | Not |
|---|---|---|---|
| `lib/` | Configured instances and integrations, often with side effects or state | `api-client.ts`, `query-client.ts`, `auth.ts`, `analytics.ts` | pure helpers |
| `utils/` | Tiny pure, domain-agnostic functions | `cn.ts`, `format-date.ts`, `invariant.ts` | stateful clients, domain rules |
| feature `utils/` or `model/` | Domain rules for that feature | `calculate-severity-score.ts`, `can-retry-review.ts` | generic helpers |
| `helpers/` (Comeau) | Project-specific helpers, as opposed to generic `utils/` | — | use only if the project already does |

- The `cn` helper's location conflicts between sources: shadcn uses `@/lib/utils` and
  Bulletproof uses `utils/cn.ts`. Follow shadcn's alias when the project uses shadcn.
- **Extract only on real reuse.** Dodds' AHA ("Avoid Hasty Abstractions") and Sandi Metz
  ("duplication is far cheaper than the wrong abstraction") agree. When a shared helper
  grows boolean flags or per-caller branches, inline it back into its callers and let
  each copy simplify.
- **Exception: domain rules.** Extract the same business rule appearing in two places
  immediately (see L1 in logic-and-state.md).
- Good candidates for `utils/`: formatting (dates, numbers, currency), `cn`, type guards,
  invariant/assert helpers, and generic collection helpers that aren't in the standard
  library.
- Bad candidates: anything that imports a feature, reads a store, calls an API, or
  encodes a product rule.

## 7. Types (S11)

Matt Pocock (Total TypeScript):
- "When a type is used in only one place, put it in the same file where it's used."
- Types shared by several files go in a `*.types.ts` (or `types.ts`) at the **narrowest
  scope that covers every consumer**: the component folder, then the feature, then
  `src/types`.
- Types shared across packages go in a shared package.
- Reserve `.d.ts` for ambient or global declarations (module augmentation, globals). Don't
  put application types there. This point was seen only in a search summary.
- When a Zod schema exists for a contract, derive the type with `z.infer<typeof Schema>`
  instead of hand-writing a parallel interface (see L4).
- A global `types/index.ts` full of single-use types is a smell.

## 8. Barrel files (S12)

Sources disagree, but less than it first appears:

| Position | Source | Argument |
|---|---|---|
| Against internal barrels | TkDodo (2024) | They enforce no boundaries, invite circular imports through editor auto-imports, and defeat `optimizePackageImports`. Removing them cut the modules loaded per page in a Next.js project from >11k to ~3.5k. Keep barrels only for library entry points. |
| Against | Marvin Hagemeister (2023) | Measured tooling and module-loading cost: "Get rid of all barrel files", with a few allowed. |
| Against (docs) | Bulletproof React | Avoid barrels; import files directly. Its own code still has per-component `index.ts` files. |
| Required, but lint-enforced | FSD Public API | Each slice exposes an `index.ts` public API with no wildcard re-exports. FSD admits the index does nothing without a linter, and recommends one index per component in `shared/ui`. |
| Neutral | Comeau | One forwarding `index.ts` per component folder; calls the perf concern "premature". |

**Resolution:**
- No aggregate `export * from` barrels in application code.
- A per-component single-target `index.ts` (`export { Button } from './button'`) is
  acceptable.
- A feature-level public API index is acceptable only when a linter enforces that nothing
  deep-imports past it.

## 9. Dependency direction and lint enforcement (S5, S6)

```text
shared (components/ui, hooks, lib, utils, types, config)
   ↑ may be imported by
features/<x>          ✗ may not import features/<y>
   ↑ may be imported by
app/                  (composes features)
```

Every layering model (Bulletproof, FSD, Clean Architecture, Qiu/Fowler) shares this
invariant: **imports flow one way**. If features need each other, compose them in the
route, or move the shared part down into an entity or the shared layer.

Bulletproof's App Router app enforces it with `eslint-plugin-import`. Here is the same
idea in ESLint flat config (Bulletproof itself still uses legacy `.eslintrc.cjs`):

```js
// eslint.config.mjs (excerpt)
import importPlugin from 'eslint-plugin-import';
import { readdirSync } from 'node:fs';

const features = readdirSync('./src/features', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { import: importPlugin },
    rules: {
      'import/no-cycle': 'error',
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            // 1. No cross-feature imports: each feature may import only itself.
            ...features.map((f) => ({
              target: `./src/features/${f}`,
              from: './src/features',
              except: [`./${f}`],
            })),
            // 2. Features never import the app layer.
            { target: './src/features', from: './src/app' },
            // 3. Shared code never imports features or app.
            {
              target: [
                './src/components',
                './src/hooks',
                './src/lib',
                './src/types',
                './src/utils',
                './src/config',
              ],
              from: ['./src/features', './src/app'],
            },
          ],
        },
      ],
    },
  },
];
```

Alternatives:
- **`eslint-plugin-boundaries`** describes element types by pattern. Check its current
  rule names in its docs (jsboundaries.dev): `boundaries/element-types` is the older name,
  and newer releases may differ.
- **Steiger** is FSD's linter (`forbidden-imports`, `no-public-api-sidestep`,
  `segments-by-purpose`). It is still beta.
- If a project already uses `dependency-cruiser` for backend layering, extend it to the
  frontend rather than adding a second tool.

## 10. Naming and nesting (S13, S14)

- **Files and folders use kebab-case** (`review-card.tsx`, `use-review-filters.ts`).
  Identifiers use PascalCase for components and camelCase for functions.
  - Bulletproof enforces this with `eslint-plugin-check-file`.
  - Wieruch's 2026 guide and the Next.js examples (`app/ui/like-button.tsx`) use it too.
  - Comeau uses PascalCase component files and calls "one component per file" a "silly
    rule".
  - Consistency beats the choice, so follow the existing convention if one exists.
- Use **one path alias** (`@/*` → `src/*`) rather than many `@x` aliases.
- Keep nesting **shallow**: about 3–4 levels overall, at most 2 inside a component folder.
  Deep relative imports (`../../../../`) mean either the alias is missing or the nesting
  is too deep.
- Suffix conventions worth keeping consistent: `*.schema.ts`, `*.types.ts`, `*.test.tsx`,
  `use-*.ts` for hooks, `*-queries.ts` for `queryOptions` factories, `actions.ts` for
  Server Actions, `*-dal.ts` or `dal/` for the data access layer.

## 11. Rules S1–S14

| ID | Rule | Checkable signal | Kind |
|---|---|---|---|
| S1 | Choose one organization strategy, write it down, apply it everywhere. | Equivalent code placed differently (some features under `app/`, others in `features/`). | convention |
| S2 | Keep `app/` a routing shell. Reusable domain code lives outside it; route-only glue may sit in `_components/`/`_lib/`. | Non-`_` component or data modules inside `app/`; one route importing another route's files. | convention |
| S3 | Colocate first, promote on the second consumer: file → feature → shared. | A shared `utils/`/`hooks/` module with exactly one importer. | convention |
| S4 | Domain-agnostic primitives go in `components/ui`. Anything importing a feature's API, store or types belongs to that feature. | `components/ui/**` importing `features/**`. | should-fix |
| S5 | Never import feature A from feature B. Compose at the route/app layer. | `@/features/a/**` imported inside `features/b/**`. | should-fix |
| S6 | Enforce boundaries mechanically (`import/no-restricted-paths` / boundaries / Steiger) plus `import/no-cycle`. | No boundary rules in the lint config. | should-fix |
| S7 | One Zod-validated env module with literal `process.env.NEXT_PUBLIC_X` access. Secrets only in `server-only` modules. `.env*` at the root. | `process.env[…]`, destructured `process.env`, a secret read in a file without `server-only`. | must-fix for secrets |
| S8 | App-wide config in `config/`. Feature and component constants stay with their owner. | Feature-only constants in a global `constants.ts`. | convention |
| S9 | `lib/` = configured instances and integrations. `utils/` = pure generic functions. Domain rules stay in the feature. | A stateful client in `utils/`; pricing or status rules in shared `utils/`. | convention |
| S10 | Extract only on real reuse. Inline back a helper that grows per-caller flags. | Helper with boolean params or `if (caller === …)` branches. | suggestion |
| S11 | Types beside their only consumer; narrowest shared `*.types.ts` when reused; `z.infer` from schemas; `.d.ts` only for ambient declarations. | App types in `.d.ts`; a global types file of single-use types. | convention |
| S12 | No aggregate `export *` barrels in app code. A per-component index is fine. A slice index only with lint enforcement. | `index.ts` re-exporting a whole folder or layer. | should-fix |
| S13 | Kebab-case files and folders, PascalCase/camelCase identifiers, one `@/*` alias. | Mixed casing; several aliases. | convention |
| S14 | Shallow nesting: about 3–4 levels, at most 2 inside a component folder. | `../../../../` imports. | convention |
