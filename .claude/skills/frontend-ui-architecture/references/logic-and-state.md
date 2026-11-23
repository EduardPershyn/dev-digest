# Business logic, API layer, validation and state (L1–L12)

Part of the `frontend-ui-architecture` skill. Covers where business and domain logic
lives, how API access and data mapping are layered, where validation happens, and how
server state differs from client state.

## Contents
1. The logic-placement gradient
2. Four layering models, one invariant
3. The API layer: one client, per-endpoint fetchers, mapping
4. Parse, don't assert
5. One schema per contract
6. Server state vs client state
7. Query organization (TanStack Query v5)
8. Global stores
9. Forms
10. Error layers
11. Rules L1–L12

---

## 1. The logic-placement gradient (L1, L10)

Juntao Qiu's *Modularizing React Applications with Established UI Patterns*
(martinfowler.com) is the canonical worked example. Its principle is **"Separate view from
no-view logic"**, because "the React view is only one of the consumers of your non-view
code". An app climbs this gradient as it grows:

1. A single component does everything. "Packing all the code into components may work in
   small applications."
2. Hooks are extracted for state and side effects.
3. Domain models are extracted for business rules.
4. A layered app emerges: **view → hooks/state → domain models → data/network gateway**.
   The gateway "acts like an Anti-Corruption Layer".

Qiu: "it's not a set-in-stone rule". Climb only when the pain is real.

**Default responsibilities:**

| Layer | Owns | Must not |
|---|---|---|
| Component | Rendering, wiring events to handlers, UI-only state (open/closed, focus, local input) | Encode business rules; call `fetch`; read wire shapes |
| Hook | Orchestrating state, queries and mutations for one view or use case | Hold business rules that a non-React caller would also need |
| Domain module (pure TS) | Business rules: pricing, eligibility, thresholds, status transitions, scoring | Import React, the API client or stores |
| API module | Transport, auth headers, parsing, DTO → domain mapping | Know about components |
| Server (DAL / backend) | Authorization, persistence, anything security-sensitive | Trust client input |

**The shotgun-surgery smell.** In Qiu's example, country-specific rounding rules were
scattered across components, and every new country meant editing several files.
Consolidating them into one strategy object fixed it. Any business rule that appears in
two components should be extracted **now**. This is the exception to "wait for reuse"
(S10), because divergent copies of a rule are bugs.

**Testability check (L10).** If testing a business rule requires `render()` or mocking
`fetch`, the rule lives in the wrong layer. Domain modules are tested with plain unit
tests.

```ts
// features/reviews/utils/severity.ts — pure, no React, no fetch
export type Severity = 'critical' | 'major' | 'minor' | 'info';

const WEIGHT: Record<Severity, number> = { critical: 10, major: 5, minor: 2, info: 0 };

export function riskScore(findings: ReadonlyArray<{ severity: Severity }>): number {
  return findings.reduce((sum, f) => sum + WEIGHT[f.severity], 0);
}

export function isMergeBlocked(findings: ReadonlyArray<{ severity: Severity }>): boolean {
  return findings.some((f) => f.severity === 'critical');
}
```

## 2. Four layering models, one invariant (L11, L12)

| Model | Unit of organization | Domain logic lives in | Ceremony |
|---|---|---|---|
| Qiu / Fowler | Layers introduced gradually | Domain classes/functions | low → medium |
| Clean / hexagonal (Bespoyasov) | Concentric layers: domain, application (use cases + ports), adapters | Domain + use cases behind ports | high |
| Feature-Sliced Design | Layers × slices × segments (`api`, `model`, `ui`, `lib`, `config`) | `entities/*/model`, `features/*/model` | high (strict imports) |
| Bulletproof React | Feature folders | Feature-local modules, `lib/` | low |

- **The shared invariant: dependencies point one way.** Bespoyasov: "Only the outer layers
  can depend on the inner layers". FSD lets a layer import only from layers strictly
  below. Bulletproof uses shared → features → app.
- **The cost of ceremony.** Bespoyasov lists the costs of Clean Architecture himself: time,
  verbosity, onboarding and bundle size. He recommends keeping at least the extracted
  domain and the dependency direction. In React, hooks act as "crooked dependency
  injection".
- **Criticism of FSD** ("anti-KISS", friction with Next.js file routing) exists only in
  forum-grade posts.
- **Rule L11:** don't add a port, adapter or use-case layer with one implementation and
  one caller, unless it isolates an unstable external contract. Match ceremony to team
  and app size.

## 3. The API layer (L2)

Bulletproof: "use a single instance of the API client that has been pre-configured". Each
request declaration has three parts, all in `features/<x>/api/`:
- the types and validation schema;
- a fetcher that uses the client;
- a hook or `queryOptions` that consumes the fetcher.

Johannes Kettmann (profy.dev): UI code should not know that a `User` arrives as
`response.data`. Otherwise an API change ripples through "a dozen or more components".
Fetchers return domain objects and also own **input** mapping (domain → request body).
Qiu's gateway confines a contract change "to a single file".

**Two mapping steps, two homes:**
1. **DTO → domain model** (wire naming, envelopes, nullability, snake_case → camelCase,
   string dates → `Date`) belongs in the **API layer**.
2. **Domain model → view model** (labels, display formatting, grouping for a table)
   belongs in **pure formatters** or the **hook feeding the view**.

```ts
// lib/api-client.ts — one configured client (base URL, credentials, error normalization)
import { clientEnv } from '@/config/env.client';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function apiGet(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${clientEnv.NEXT_PUBLIC_API_URL}${path}`, { credentials: 'include', ...init });
  if (!res.ok) throw new ApiError(res.status, `GET ${path} failed: ${res.status}`);
  return res.json(); // unknown on purpose: callers must parse
}
```

```ts
// features/reviews/api/get-review.ts — parse + map at the boundary
import { z } from 'zod';
import { apiGet } from '@/lib/api-client';

const ReviewDto = z.object({
  id: z.string(),
  pr_number: z.number(),
  created_at: z.string(),
  findings: z.array(z.object({ id: z.string(), severity: z.enum(['critical', 'major', 'minor', 'info']), message: z.string() })),
});

export type Review = { id: string; prNumber: number; createdAt: Date; findings: z.infer<typeof ReviewDto>['findings'] };

export async function getReview(id: string): Promise<Review> {
  const dto = ReviewDto.parse(await apiGet(`/reviews/${id}`));
  return { id: dto.id, prNumber: dto.pr_number, createdAt: new Date(dto.created_at), findings: dto.findings };
}
```

Components then call `getReview` (through a Server Component or `queryOptions`) and never
see `pr_number`.

## 4. Parse, don't assert (L3)

Alexis King's *Parse, don't validate*: parse "at the boundary of your system, before
*any* of the data is acted upon". Checks scattered across the code ("shotgun parsing")
are the anti-pattern.

- TkDodo (*Type-safe React Query*): return-only generics like `axios.get<Todo>()` are
  "nothing more than a type assertion in disguise". Call `schema.parse` inside the
  fetcher or `queryFn`. A failed parse then puts the query in `error` state, like a
  network failure.
- `res.json() as Review` is the same disguised assertion. Type the raw response as
  `unknown` and parse it.
- The same applies to `localStorage`, `searchParams`, `postMessage` and any other input
  from outside the process.
- On the server, Next.js requires it: "always validate input from client… form data, URL
  parameters, headers, and searchParams".

## 5. One schema per contract (L4)

- Define each contract (API resource, form, action input) as **one** Zod schema and derive
  its TypeScript type with `z.infer`. Don't hand-write a parallel interface beside it.
- **Server validation is authoritative.** Client validation (for example a React Hook Form
  resolver using the same schema) is UX only. Every Server Action re-validates with
  `safeParse`, re-checks authentication "even if the form is only rendered on an
  authenticated page", and returns field errors.
- Reusing one schema in both the client form and the server action is an inference from
  the sources, not a quote. When client and server live in separate packages and share
  contracts through **copied/vendored files**, the two copies drifting apart is exactly
  the failure this rule prevents. Treat a contract change as incomplete until every copy
  is updated, or generate both from one source.
- Zod version note: Zod 3 exposes `error.flatten().fieldErrors`. In Zod 4 the standalone
  helpers (`z.flattenError(error)`, `z.treeifyError(error)`) are preferred. Check the
  installed version before copying either form.

## 6. Server state vs client state (L5, L8)

- TkDodo calls React Query "an async state manager", and says to "resist the urge to sync
  server data to a different state manager".
- TanStack's docs: once async data moves out, the truly global client state left is
  "usually very tiny".
- The Redux Style Guide recommends "RTK Query as the default approach for data fetching
  and caching". The Redux maintainers are "*against* writing data fetching logic by hand
  in almost all cases".
- In the App Router, much server data never reaches client state at all. It is read in
  Server Components and passed down as props (see B10/B11).

**The outdated pattern to flag:**

```ts
// ✗ server data copied into a client store
useEffect(() => { api.getReviews().then((r) => dispatch(setReviews(r))); }, []);
```

**What remains client state:** theme, sidebar open, a multi-step wizard, unsaved editor
drafts, a selection that spans pages. **Form and modal state stay local** (L8). The Redux
guide says "Most form state shouldn't go in Redux", and keystrokes or `isModalOpen` in a
global store is a smell.

## 7. Query organization (TanStack Query v5) (L6)

- **2021 advice (TkDodo, *Effective React Query Keys*):** one query-key factory **per
  feature**, never a single global `queryKeys.ts`.
- **2024 update (TkDodo, *The Query Options API*):** "Separating QueryKey from
  QueryFunction was a mistake". Use **`queryOptions` factories** that bundle the key and
  the fetcher. Thin custom hooks that only wrap `useQuery` are no longer his first choice.

```ts
// features/reviews/api/review-queries.ts
import { queryOptions } from '@tanstack/react-query';
import { getReview } from './get-review';
import { listReviews, type ReviewFilters } from './list-reviews';

export const reviewQueries = {
  all: () => ['reviews'] as const,
  lists: () => [...reviewQueries.all(), 'list'] as const,
  list: (filters: ReviewFilters) =>
    queryOptions({ queryKey: [...reviewQueries.lists(), filters], queryFn: () => listReviews(filters) }),
  detail: (id: string) =>
    queryOptions({ queryKey: [...reviewQueries.all(), 'detail', id], queryFn: () => getReview(id) }),
};

// usage: useQuery(reviewQueries.detail(id)), queryClient.prefetchQuery(reviewQueries.detail(id)),
//        queryClient.invalidateQueries({ queryKey: reviewQueries.lists() })
```

Smells: key arrays typed inline and duplicated across files; hand-typed keys in
`invalidateQueries`; `useReview` hooks that only call `useQuery` with no added logic.

## 8. Global stores (L7)

- Use a global store only for **app-wide, client-owned, synchronous** state.
- **Redux Style Guide:**
  - "local" values stay in the nearest component;
  - one slice file per feature folder;
  - actions are modeled as **events** (`reviewDismissed`, not `setReviewStatus`);
  - state calculation goes in reducers rather than click handlers;
  - stored values must be serializable.
- **Zustand docs** recommend a single store split into slices. **TkDodo** prefers
  "multiple, small stores", exports **only custom hooks** so "no one can subscribe to the
  entire store", uses atomic selectors, and keeps actions as events "to keep your business
  logic inside your store". Either shape works. The non-negotiables are hook-only access
  and keeping server data out.

```ts
// features/editor/stores/draft-store.ts
import { create } from 'zustand';

type DraftState = { body: string; dirty: boolean; actions: { edited: (b: string) => void; saved: () => void } };

const useDraftStore = create<DraftState>()((set) => ({
  body: '',
  dirty: false,
  actions: { edited: (body) => set({ body, dirty: true }), saved: () => set({ dirty: false }) },
}));

// Export hooks only — never the store itself.
export const useDraftBody = () => useDraftStore((s) => s.body);
export const useDraftDirty = () => useDraftStore((s) => s.dirty);
export const useDraftActions = () => useDraftStore((s) => s.actions);
```

In the App Router, a store module is shared across requests on the server. Create
request-scoped stores via a provider, or keep stores strictly client-side. Never put
per-user data in a module-level store that the server also evaluates.

## 9. Forms

- Form state stays local, or lives in a form library (React Hook Form). Bulletproof pairs
  React Hook Form with Zod. Its `zodResolver` docs were not verified for this skill.
- With Server Actions: `useActionState` holds the result and pending state, `useFormStatus`
  goes in a **child** of the `<form>`, and `useOptimistic` rolls back on failure (B18).
- The schema lives with the contract (the feature `api/` or the action's module). The
  action re-validates it.

## 10. Error layers (L9)

Bulletproof's three layers:
1. **API client interceptor:** global concerns such as toasts, logout on 401 and token
   refresh.
2. **Query or request error state:** parse and network failures surface as `error` on the
   query.
3. **Granular error boundaries:** several per app (per section or widget) rather than one
   global boundary. In the App Router these are `error.tsx` files (see R14).

Next.js: "model expected errors as return values". Validation failures and "not allowed"
are returned as data (`{ errors }`, `{ ok: false, reason }`). Exceptions are for the
unexpected, and they bubble to "the nearest parent error boundary". No authoritative
source recommends full Result/Either types at the service layer. Returning
discriminated-union results from actions and DAL mutations is a reasonable house
convention.

## 11. Rules L1–L12

| ID | Rule | Checkable signal | Kind |
|---|---|---|---|
| L1 | Components render and dispatch, hooks orchestrate, and domain rules are defined once in pure TS modules. | The same rule (rounding, thresholds, status mapping) in two components. | should-fix |
| L2 | No `fetch`/axios or raw wire shapes in components. One client plus per-endpoint fetchers returning mapped models. | `fetch(` in `components/`; `response.data.data`; snake_case wire fields in JSX. | should-fix |
| L3 | Parse external data at the boundary. Never `as T` or a return-only generic on fetched JSON. | `.json() as`; `get<T>()` without a parse; validation scattered across components. | must-fix at trust boundaries |
| L4 | One schema per contract, types via `z.infer`. Server validation is authoritative; client validation is UX only. | Hand-written interfaces beside a schema; an action without `safeParse`; diverged copies of a shared contract. | must-fix for actions |
| L5 | Server data lives in a server cache (TanStack Query, SWR, RTK Query) or RSC, never copied into a client store. | `useEffect` → `dispatch(setItems(data))`; store fields that mirror API responses. | should-fix |
| L6 | Per-feature `queryOptions` factories own keys and fetchers. No global `queryKeys.ts`, no wrapper hooks that add nothing. | Duplicated inline key arrays; hand-typed `invalidateQueries` keys. | suggestion |
| L7 | Global stores only for app-wide client state. Expose hooks/selectors, not the store. Actions are events that hold the logic. State is serializable. | An exported raw store; next state computed in a component; class instances in Redux. | should-fix |
| L8 | Form and modal state stays local. | Keystrokes or `isModalOpen` in a global store. | suggestion |
| L9 | Three error layers (interceptor, query error state, granular boundaries). Expected errors are returned as values. | A single app-wide boundary; validation errors thrown. | should-fix |
| L10 | A business rule must be testable without `render()` or mocking `fetch`. | Unit tests for rules that need a DOM or network mocks. | should-fix |
| L11 | Ceremony scales with size. No port/adapter/use-case layer with one implementation and one caller unless it isolates an unstable contract. | Interfaces with a single implementation and a single caller. | suggestion |
| L12 | Imports flow one way: domain and shared never import UI or features, and features never import siblings. | Upward or sibling import paths. | should-fix |
