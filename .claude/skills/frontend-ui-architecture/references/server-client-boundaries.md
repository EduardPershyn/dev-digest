# Server/client boundaries, data access and mutations (B1–B18)

Part of the `frontend-ui-architecture` skill. Covers where to draw the `'use client'`
boundary, what may cross it, how to structure data access (the Data Access Layer or an
HTTP API), where auth checks live, how to fetch, how to write Server Actions, and when to
add TanStack Query or SWR. React 19.x and Next.js 15/16. Most of these are
**framework-enforced or security rules**, so treat violations as must-fix.

## Contents
1. What the directives actually mean
2. Placing the boundary
3. Interleaving: ownership, not position
4. What may cross the boundary
5. Choosing a data-access model
6. The Data Access Layer (full-stack apps)
7. The HTTP-API model (Next.js in front of a separate backend)
8. Where auth checks live
9. Fetching: where and how
10. Server Actions template
11. Client-side fetching libraries with RSC
12. Providers
13. Anti-patterns
14. Rules B1–B18

---

## 1. What the directives actually mean (B2)

- **`'use client'` marks an entry into the client module graph.** It is not a "render on
  the client" label.
  - A `'use client'` file pulls "all of its imports and the components it directly
    renders" into the client bundle.
  - It's needed "at the entry to a client subtree, not on every file inside it" (Next.js,
    *Server and Client Boundary*).
- React defines "server" and "client" by **usage**, not by definition. The same module is
  evaluated on the server when server code imports it, and on the client when client code
  imports it (react.dev, `'use client'`).
- Dan Abramov: "'use client' is a typed `<script>`" and "'use server' is a typed
  `fetch()`". Reading them as "this runs on the client/server" labels is "not what they
  do".
- **Client Components still render to HTML on the server.** They fall under "the same
  security policy as the browser client" (Markbåge), so never hand them privileged data.
- `'use server'` marks **Server Functions**, callable from the client as RPC endpoints.
  It is *not* a marker for Server Components. Server Components need no directive.

## 2. Placing the boundary (B1, B4, B5)

- "By default, layouts and pages are Server Components."
- **Client Components** are for state, event handlers, Effects, browser APIs and custom
  hooks that use them.
- **Server Components** fetch near the source and keep secrets.
- Put `'use client'` on the **smallest interactive leaf**. Josh Comeau calls this
  "lifting boundaries down". Lee Robinson lists "Adding `"use client"` unnecessarily"
  among the top App Router mistakes.

```tsx
// ✗ the whole page becomes client code, and its data fetching must move to the browser
'use client';
export default function ReviewPage() { /* … */ }

// ✓ the page stays on the server; only the interactive bit is client code
// app/reviews/[id]/page.tsx (server)
export default async function ReviewPage(props: PageProps<'/reviews/[id]'>) {
  const { id } = await props.params;
  const review = await getReviewForViewer(id);
  if (!review) notFound();
  return (
    <article>
      <ReviewHeader review={review} />          {/* server */}
      <FindingsFilter findings={review.findings} /> {/* 'use client' leaf */}
    </article>
  );
}
```

- **Third-party client widgets** without the directive: wrap them in a local
  `'use client'` re-export, `export { Carousel } from 'some-lib'`, instead of marking a
  large parent (B4).
- **Compound components** consumed from Server Components need named exports. A Server
  Component receives a client reference, so `Menu.Item` is `undefined` (B4).
- **Native interactivity first** (B5): `<details>`/`<summary>`, `<form action={serverFn}>`
  and `<video controls>` need no client JS.

## 3. Interleaving: ownership, not position (B3)

What matters is who **wrote** the JSX (the owner), not where it ends up in the tree:

> "Because `Cart`'s owner is a Server Component, `Cart` renders on the server. `Modal` is
> only the parent." — Next.js, *Server and Client Boundary*

- Pass server UI into client wrappers through `children` or other JSX props, from a
  server owner.
- **Never import a Server Component (or any server-only module) into a `'use client'`
  file.** Once imported there, it becomes client code. If it uses `server-only`, the build
  fails, which is the point of `server-only`.

```tsx
// app/dashboard/page.tsx (server owner)
<Tabs /* 'use client' */ panels={{ activity: <ActivityFeed /> /* server */, settings: <SettingsForm /> }} />
```

## 4. What may cross the boundary (B6, B7)

**Server → Client props** may be:
- primitives, plain objects and arrays;
- `Map`, `Set`, `Date`, typed arrays;
- **Promises**;
- **JSX elements**;
- **Server Functions**.

They may **not** be class instances, ordinary functions or non-global symbols
(react.dev).

**Server Function arguments** also accept `FormData`, but reject JSX and events.

**Function props** to client components must be Server Functions. The Next.js TypeScript
plugin accepts a function-typed client prop only when it's named `action` or ends in
`Action`.

**Serializable is not the same as safe.** ORM rows are plain objects, so the serializer
offers **no protection against over-sharing**. The Next.js data-security guide marks
`{ user: User }` on a client component as "BAD… accepts way more data than the Client
Component needs". Pass **minimal DTOs** with only the fields that client renders, and
never tokens, password hashes, internal flags or unneeded PII (B7).

Markbåge suggests using classes for internal records, since classes can't be serialized,
so an accidental pass fails loudly. This complements plain-object DTOs: classes for
internal records, plain DTOs for what crosses.

Taint APIs (`experimental_taintObjectReference`, `experimental_taintUniqueValue`, behind
`experimental.taint`) are an extra safety net, not a substitute. They don't block values
**derived** from tainted data.

## 5. Choosing a data-access model (B8)

Next.js names three models and warns against mixing them in one app, because
"Exceptions pop out as suspicious":

| Model | When | Shape |
|---|---|---|
| **HTTP APIs** | "recommended for existing large projects / orgs", and any Next.js frontend in front of a separately deployed backend | Server Components act like untrusted clients: they `fetch()` the backend "just like if it was executing on the client", forwarding cookies. The backend enforces auth |
| **Data Access Layer** | "recommended for new projects" where Next.js owns the database | A `server-only` layer that authorizes and returns DTOs; the only code touching the DB and secrets |
| **Component-level access** | "for prototyping and learning" | Queries inline in Server Components. Don't ship it |

Detect the model in Step 0. If both DB queries in components **and** a DAL exist, flag
the mix.

## 6. The Data Access Layer (full-stack apps) (B9)

From the Next.js data-security and authentication guides, a DAL should:
- "Only run on the server": it starts with `import 'server-only'`.
- "Perform authorization checks" on **every** call.
- "Return safe, minimal Data Transfer Objects (DTOs)".
- Be the only code that touches `process.env` secrets and the DB client.
- Wrap reads in `cache()` keyed by primitives, so many components can call it in one
  render without refetching.

```ts
// src/features/reviews/server/reviews-dal.ts
import 'server-only';
import { cache } from 'react';
import { db } from '@/lib/db';                    // DB client imported ONLY by DAL modules
import { verifySession } from '@/lib/auth/session';

export type ReviewDTO = { id: string; prNumber: number; title: string; findingCount: number };

export const getReviewForViewer = cache(async (id: string): Promise<ReviewDTO | null> => {
  const session = await verifySession();         // cache()-wrapped; redirects if no session
  const row = await db.query.reviews.findFirst({
    where: (r, { eq, and }) => and(eq(r.id, id), eq(r.ownerId, session.userId)), // ownership
    columns: { id: true, prNumber: true, title: true },                          // explicit columns
    with: { findings: { columns: { id: true } } },
  });
  if (!row) return null;
  return { id: row.id, prNumber: row.prNumber, title: row.title, findingCount: row.findings.length };
});
```

```ts
// src/lib/auth/session.ts
import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decrypt } from '@/lib/auth/jwt';

export const verifySession = cache(async () => {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await decrypt(token) : null;
  if (!session?.userId) redirect('/login');
  return { userId: session.userId as string };
});
```

**`cache()` caveat:** it dedupes only within one render pass. It does **nothing** across
Server Action or Route Handler invocations, so each action re-verifies.

## 7. The HTTP-API model (B8)

When Next.js is a frontend for a separate API (REST/GraphQL, a different service), there
is no DB in Next.js and the backend owns authorization. The structure becomes:
- **Server-side fetchers** in `features/x/api/` or `features/x/server/`. They are
  `server-only` when they forward cookies or use internal URLs or secrets. They parse the
  response with Zod and map it to DTOs or domain models (L2, L3).
- **Server Components** call those fetchers directly. There is no self-fetching through
  the app's own Route Handlers (R10).
- **Server Actions** forward mutations to the backend after validating input. The backend
  re-checks permissions.
- **Route Handlers or `rewrites`** exist only where the **browser** must reach the backend
  (for client-side TanStack Query, SSE or uploads).

```ts
// src/features/reviews/server/reviews-api.ts
import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { serverEnv } from '@/config/env.server';
import { ReviewSchema, type Review } from '@/features/reviews/api/review.schema';

export const fetchReview = cache(async (id: string): Promise<Review | null> => {
  const res = await fetch(`${serverEnv.API_INTERNAL_URL}/reviews/${encodeURIComponent(id)}`, {
    headers: { cookie: (await cookies()).toString() },  // act as the user; backend authorizes
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`reviews API ${res.status}`);
  return ReviewSchema.parse(await res.json());          // parse, don't assert
});
```

## 8. Where auth checks live (R6, B12)

| Place | What it may do |
|---|---|
| `proxy.ts` / `middleware.ts` | **Optimistic** checks only (is a session cookie present?), redirecting early. A matcher that skips a path also skips Server Functions on it |
| Layout | Nothing security-relevant. It doesn't re-run on navigation, and returning `null` doesn't protect children or actions |
| Page / Server Component | Calls the DAL, which authorizes, or the backend, which authorizes |
| DAL function | **The real check**: session + ownership/role, per call |
| Every Server Action | Re-verifies session and ownership, "even if the form is only rendered on an authenticated page" |
| Every Route Handler | Verifies auth itself (it's a public endpoint) |
| Each parallel slot | Authorizes itself |

## 9. Fetching: where and how (B10, B11)

- **Fetch in the component that needs the data.** "Identical `fetch` requests in a React
  component tree are memoized by default, so you can fetch data in the component that
  needs it instead of drilling props." Wrap ORM and SDK calls in `React.cache` (scoped
  per request) to get the same dedupe.
- **Parallelize independent reads** with `Promise.all` rather than sequential `await`s.
  Keep preload functions "next to the component that consumes the data".
- **Suspense goes above the async component**, not inside it.
- **Read-once server data for a Client Component (B11):** start the request on the server
  **without awaiting**, pass the promise as a prop, and unwrap it with `use()` under
  `<Suspense>`. Then "the Client Component does not need to fetch the same data after
  mount".

```tsx
// server
export default function Page() {
  const statsPromise = getRepoStats();               // not awaited
  return <Suspense fallback={<StatsSkeleton />}><StatsChart statsPromise={statsPromise} /></Suspense>;
}

// client
'use client';
import { use } from 'react';
export function StatsChart({ statsPromise }: { statsPromise: Promise<RepoStatsDTO> }) {
  const stats = use(statsPromise);
  /* interactive chart */
}
```

## 10. Server Actions template (B12–B15, B18)

Server Actions compile to "an action ID plus a dispatcher that POSTs back to the server".
They are **public endpoints**, dispatched **one at a time per client** (`Promise.all`
doesn't parallelize them), and "not recommended for data fetching" (react.dev).

**Template:** module-level `'use server'` → verify session → `safeParse` (return field
errors) → DAL/API call with an ownership check → revalidate → return minimal data →
`redirect()` last, outside `try/catch`.

```ts
// src/features/reviews/server/actions.ts
'use server';
import { z } from 'zod';
import { updateTag } from 'next/cache';                // Next 16; on 15 use revalidateTag(tag)
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth/session';
import { dismissFinding } from './reviews-dal';

const DismissInput = z.object({
  reviewId: z.string().uuid(),
  findingId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export type DismissState = { fieldErrors?: Record<string, string[] | undefined>; message?: string } | undefined;

export async function dismissFindingAction(_prev: DismissState, formData: FormData): Promise<DismissState> {
  const session = await verifySession();                       // 1. authenticate — every time
  const parsed = DismissInput.safeParse(Object.fromEntries(formData)); // 2. validate (TS types aren't enforced at runtime)
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors }; // Zod 3; Zod 4: z.flattenError(parsed.error)
  }
  const result = await dismissFinding(session.userId, parsed.data); // 3. DAL re-reads + checks ownership
  if (!result.ok) return { message: result.reason };           // expected failure → value, not throw
  updateTag(`review:${parsed.data.reviewId}`);                 // 4. revalidate (read-your-own-writes)
  redirect(`/reviews/${parsed.data.reviewId}`);                // 5. last, outside try/catch (it throws)
}
```

```tsx
// client form
'use client';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { dismissFindingAction } from '@/features/reviews/server/actions';

function SubmitButton() {                       // useFormStatus must be in a CHILD of <form>
  const { pending } = useFormStatus();
  return <button disabled={pending}>Dismiss</button>;
}

export function DismissForm({ reviewId, findingId }: { reviewId: string; findingId: string }) {
  const [state, formAction] = useActionState(dismissFindingAction, undefined);
  return (
    <form action={formAction}>
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="findingId" value={findingId} />
      <textarea name="reason" aria-invalid={!!state?.fieldErrors?.reason} />
      {state?.message && <p role="alert">{state.message}</p>}
      <SubmitButton />
    </form>
  );
}
```

**Input rules (B13):**
- Validate the "integrity of each argument", because "TypeScript annotations are not
  enforced".
- Accept **IDs plus the user's change**, and re-read everything else under the session.
  "A well-formed `Item` object can still refer to a row the caller does not own".
- `.bind` arguments "are NOT encrypted". Closure-captured values are encrypted but still
  shouldn't carry secrets.
- Shape return values "to what the UI renders, not raw database records".

**Revalidation APIs [16]:**
- `updateTag(tag)`: read-your-own-writes, actions only.
- `revalidateTag(tag, 'max')`: stale-while-revalidate. The single-argument form is
  deprecated.
- `revalidatePath(path)`.
- `refresh()`: re-render without invalidating caches.

"Unlike `redirect`, none of these throw." On **[15]**, use `revalidateTag(tag)` and
`revalidatePath(path)`. Always revalidate after a write, or lists show stale data (B15).

**No mutations during render (B15).** Don't set cookies, revalidate or log out because a
`searchParams` value says so in a page body. Mutations happen only in actions or handlers.

**Form UX (B18):**
- `useActionState` for the result and pending state;
- `useFormStatus` in a child component of the `<form>`;
- `useOptimistic` for optimistic UI that rolls back on failure.

## 11. Client-side fetching libraries with RSC (B16)

The Next.js client-side data fetching guide:
- "If a Client Component only needs to read server data once, pass it a Promise and unwrap
  it with React's `use()`."
- Use SWR or TanStack Query "when Client Components need a shared browser cache": focus
  revalidation, polling, infinite lists, deduplication across many components, optimistic
  updates, offline.
- Three caches then coexist: the server cache, the client RSC cache and the library
  cache. Each has its own freshness policy, so **mutations must invalidate all of them**.
  For example, a Server Action calls `updateTag`/`revalidatePath`, and the client calls
  `queryClient.invalidateQueries`.

**TanStack's App Router recipe** (*Advanced Server Rendering*):
- a `'use client'` `app/providers.tsx` that creates the `QueryClient`. Create a new one
  per request on the server and a singleton in the browser;
- `staleTime: 60 * 1000`, so hydrated data isn't refetched immediately;
- Server Components **prefetch** into a `QueryClient` and pass `dehydrate(qc)` to
  `<HydrationBoundary>`;
- **Ownership rule:** "treat Server Components as a place to prefetch data, nothing
  more". Don't render the same query in an RSC **and** in `useQuery`, because the two
  drift;
- "avoid bringing in React Query until you actually need it… might be never". TkDodo: on a
  mature framework you "probably don't need React Query", except for hybrid setups,
  infinite lists, offline support or polling.

```tsx
// app/reviews/page.tsx (server) — prefetch only
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { reviewQueries } from '@/features/reviews/api/review-queries';
import { ReviewList } from '@/features/reviews/components/review-list'; // 'use client', uses useQuery

export default async function ReviewsPage() {
  const qc = new QueryClient();
  await qc.prefetchQuery(reviewQueries.list({ status: 'open' }));
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <ReviewList />
    </HydrationBoundary>
  );
}
```

## 12. Providers (B17)

Context isn't available in Server Components. Put providers in a `'use client'` component
that accepts `children`, and render it **as deep as possible**:

```tsx
// app/providers.tsx
'use client';
import { QueryClient, QueryClientProvider, isServer } from '@tanstack/react-query';
import type { ReactNode } from 'react';

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 60 * 1000 } } });
}
let browserClient: QueryClient | undefined;
function getQueryClient() {
  if (isServer) return makeQueryClient();           // new client per server request
  return (browserClient ??= makeQueryClient());     // one client in the browser
}

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// app/layout.tsx (server)
// <html><body><Providers>{children}</Providers></body></html>   ← wrap {children}, not <html>
```

Providers used by only one section go in that section's `layout.tsx` (inside a route
group), not the root.

## 13. Anti-patterns

| Anti-pattern | Why it hurts | Fix | Rule |
|---|---|---|---|
| `'use client'` on `page.tsx`/`layout.tsx` | The whole subtree's imports ship to the browser, and data fetching moves client-side | Push the directive to leaves | B1 |
| Server module imported into a client file | Leaks server code into the bundle, or fails the build | Pass as `children`/props from a server owner | B3 |
| `fetch('/api/…')` from a Server Component | Extra hop, and it fails at prerender | Call the DAL or backend fetcher directly | R10 |
| Passing a full DB row/`User` to a client component | Over-shares fields into HTML/RSC payload | A DTO with the rendered fields only | B7 |
| Server Action without auth or validation | Anyone can POST to it | The template above | B12 |
| Action that takes a whole entity object | Caller controls fields and ownership | Accept an ID plus the change, re-read server-side | B13 |
| `getX` Server Actions used for reads | Sequential, uncached, wrong tool | Server Component reads or a Route Handler | B14 |
| `redirect()` inside `try/catch` | `redirect` throws, so the catch swallows it | Call it after the try/catch | B12 |
| Auth only in middleware/proxy or a layout | Bypassable (matchers, actions, nested segments) | Check in the DAL and every action/handler | R6 |
| Same data rendered by an RSC and by `useQuery` | Two sources of truth drift | RSC prefetches only, client owns rendering | B16 |
| Provider wrapping `<html>` at the root for one page's needs | Forces client context everywhere | Wrap `{children}`, place it deep | B17 |

## 14. Rules B1–B18

| ID | Rule | Checkable signal | Applies to | Kind |
|---|---|---|---|---|
| B1 | No `'use client'` on `page.tsx`/`layout.tsx`. Put it on the smallest leaf needing state, handlers, Effects or browser APIs. | Directive in a route file or on large containers. | [13+] | must-fix |
| B2 | One directive per client entry. Everything it imports becomes client code. | Directive repeated on every file of a subtree; server modules imported into it. | [13+] | should-fix |
| B3 | Nest server UI in client wrappers via `children`/JSX props from a server owner. Never import server modules into client files. | Server-only module imported from a `'use client'` file. | [13+] | must-fix |
| B4 | Local `'use client'` re-exports for third-party widgets. Compound parts as named exports, not static properties. | `Menu.Item`-style APIs consumed from Server Components. | [13+] | should-fix |
| B5 | Native interactivity (`<details>`, `<form action>`, `<video controls>`) before client JS. | Client components that only toggle a disclosure. | [13+] | suggestion |
| B6 | Only serializable props cross. Function props must be Server Functions named `*Action`. | Plain function or class-instance props to client components. | [13+] | must-fix |
| B7 | Client props are minimal DTOs, never whole ORM or domain records, tokens or PII. | Client prop typed as `User` or a DB row; props named `token`. | [13+] | must-fix |
| B8 | One data-access model per app (HTTP API, DAL, component-level). DAL for new full-stack projects. | DB queries both in components and in a DAL. | [13+] | should-fix |
| B9 | DAL modules: `import 'server-only'`, the only importers of the DB client and secrets, authorize every call, explicit columns, reads wrapped in `cache()`. | DB or secret `process.env` imports outside the DAL. | [13+] | must-fix |
| B10 | Fetch in the component that needs the data. `React.cache` for ORM calls, `Promise.all` for independent reads, Suspense above the async component. | Data drilled through several server layers; sequential independent `await`s. | [13+] | should-fix |
| B11 | Read-once server data → an un-awaited promise + `use()` under Suspense. | A client `useEffect` fetch for data the server already has. | [R19] | should-fix |
| B12 | Action template: `'use server'` → verify session → `safeParse` → DAL/API with ownership check → revalidate → minimal result. `redirect()` last, outside `try/catch`. | An action with no auth call or schema parse; `redirect(` inside `try {`. | [13+]; cache APIs [16] | must-fix |
| B13 | Action inputs are IDs plus the change, re-read server-side. Don't rely on `.bind`/closures for secrets. | An action accepting a full entity object. | [13+] | must-fix |
| B14 | Never fetch data through Server Actions. | Actions named `get…`/`fetch…`; `Promise.all` over actions. | [13+] | should-fix |
| B15 | No mutations during render. Always revalidate after a write. | Side effects in a page body; lists not refreshing after a mutation. | [13+] | must-fix |
| B16 | TanStack Query/SWR only for shared live browser caches. RSC prefetches into `HydrationBoundary` and never renders the same query. | Same data in an RSC and `useQuery`; React Query for read-once data. | TanStack v5 | should-fix |
| B17 | Providers in a `'use client'` `providers.tsx` wrapping `{children}`, as deep as possible. Section-specific providers in that section's layout. | Provider wrapping `<html>`; context created in a Server Component. | [13+] | should-fix |
| B18 | Form UX: `useActionState`, `useFormStatus` in a child of `<form>`, `useOptimistic` with rollback. | `useFormStatus` in the component that renders the `<form>`. | [R19] | should-fix |
