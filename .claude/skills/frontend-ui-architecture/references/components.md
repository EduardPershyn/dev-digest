# Component design and organization (C1–C14)

Part of the `frontend-ui-architecture` skill. Covers how to structure, split and compose
components, where state and logic go inside and around them, and how to shape reusable
primitive APIs. For the server/client boundary, see server-client-boundaries.md.

## Contents
1. The react.dev model
2. When to split a component
3. Composition before context
4. Compound components
5. Container/presentational is retired; what replaced it
6. Custom hooks vs plain functions
7. Effects: only for external systems
8. State placement ladder
9. Reusable primitive API shape (shadcn/Radix, React 19)
10. Inside a component file
11. Rules C1–C14

---

## 1. The react.dev model

react.dev's Learn section adds up to one design model:

- **Components are pure.** "React assumes that every component you write is a pure
  function". Rendering must not mutate outside variables. Side effects belong in event
  handlers, and `useEffect` is a "last resort" (*Keeping Components Pure*).
- **Decompose by responsibility.** "a component should ideally only be concerned with one
  thing. If it ends up growing, it should be decomposed into smaller subcomponents".
  Component hierarchies tend to mirror the data model (*Thinking in React*).
- **State is minimal.** Anything that doesn't change over time, is passed via props, or
  can be computed from other state is **not** state. Each piece of state has one owner:
  the closest common parent of the components that use it (*Thinking in React*;
  *Sharing State Between Components*).
- **State structure** (*Choosing the State Structure*):
  - group related state;
  - avoid contradictions: replace `isSending` + `isSent` with
    `status: 'typing' | 'sending' | 'sent'`;
  - avoid redundant state that could be derived;
  - avoid duplication: store `selectedId`, not a copy of the selected object;
  - prefer flat, normalized shapes over deep nesting;
  - a prop that only seeds state is named `initialX` or `defaultX`, and the component
    never mirrors props into state.
- **Never define a component inside another component.** The inner function gets a new
  identity on every render, so React unmounts and remounts it and its state resets
  (*Your First Component*; *Preserving and Resetting State*).

## 2. When to split a component (C3)

**Split on responsibility, state ownership or reuse, not on line count.** No authoritative
source gives a numeric size limit, so any "max N lines" is a house convention.

- **react.dev** says to split once a component handles more than one concern.
- **Kent C. Dodds** pushes back: "Wait until you really need to reuse a block before
  breaking it out". Premature components create prop-drilling pain.
- **Reconciled:** a block earns its own component when it has its own state, its own
  concern or data-model entity, or a second consumer.

Dan Abramov's two structural moves (*Before You memo()*) are about clean data flow first
and performance second:

- **Move state down.** If only one subtree reads a piece of state, extract that subtree
  into its own component that owns the state.
- **Lift content up.** If a stateful wrapper re-renders static content, have the parent
  pass that content in as `children`.

**God-component signals.** These are a synthesis, not a named rule in the sources:
- state read by only one subtree;
- props received and forwarded without being read;
- several domain entities handled in one file;
- Effects whose job is to sync derived data;
- a `return` with deeply nested conditional JSX for several modes. Split it into one
  component per mode.

## 3. Composition before context (C8)

react.dev's order for deep data passing:

1. Pass props.
2. If props pass through layers that don't use them, **extract components and pass JSX
   as `children`**. "If you pass some data through many layers of intermediate components
   that don't use that data… this often means that you forgot to extract some components
   along the way."
3. Only then use context, for data "needed by distant components in different parts of
   the tree": theme, current account, routing, managed state.

```tsx
// ✗ prop drilling: Layout and Sidebar only forward `user`
<Layout user={user}><Sidebar user={user} /></Layout>

// ✓ composition: the owner places UserMenu where it belongs
<Layout sidebar={<Sidebar><UserMenu user={user} /></Sidebar>}>{page}</Layout>
```

**Context at scale** (*Scaling Up with Reducer and Context*): one file exports a
`Provider` component that owns a reducer and supplies two contexts (state and dispatch),
plus accessor hooks such as `useTasks()` and `useTasksDispatch()`. Use "many
context-reducer pairs" split by domain rather than one app-wide context. Dodds adds:
place providers **as low in the tree as possible**, and don't make context your first
tool.

**Inversion of control** (Dodds) replaces boolean-prop sprawl: "Make your abstraction do
less stuff, and make your users do that instead". Instead of `showHeader`, `closeOnEsc`,
`compact` and `renderFooter` flags, expose composable parts or callbacks. Render props are
"needed less often now", because hooks cover logic sharing.

## 4. Compound components (C9)

Parts share the parent's state through context, read with a **guarded hook** that throws
outside the parent:

```tsx
'use client';
import { createContext, use, useState, type ReactNode } from 'react';

type DisclosureCtx = { open: boolean; toggle: () => void };
const DisclosureContext = createContext<DisclosureCtx | null>(null);

function useDisclosure() {
  const ctx = use(DisclosureContext);
  if (!ctx) throw new Error('Disclosure parts must be used inside <Disclosure>');
  return ctx;
}

export function Disclosure({ children, defaultOpen = false }: { children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return <DisclosureContext value={{ open, toggle: () => setOpen((o) => !o) }}>{children}</DisclosureContext>;
}

export function DisclosureTrigger({ children }: { children: ReactNode }) {
  const { open, toggle } = useDisclosure();
  return <button type="button" aria-expanded={open} onClick={toggle}>{children}</button>;
}

export function DisclosurePanel({ children }: { children: ReactNode }) {
  return useDisclosure().open ? <div>{children}</div> : null;
}
```

- Avoid the `React.Children.map` + `cloneElement` variant. It breaks as soon as a child is
  wrapped in another element, and it can silently overwrite props (patterns.dev).
- **Use named exports (`DisclosureTrigger`), not static properties (`Disclosure.Trigger`).**
  When a Server Component imports a client module, it receives a client reference, and
  `Menu.Item` is `undefined` (Next.js *Server and Client Boundary*).

## 5. Container/presentational is retired (C12)

Dan Abramov's 2015 split ("smart" containers fetch, "dumb" components render) was
retracted by its author in 2019: "In particular, I don't suggest splitting your components
like this anymore." This is verified only through a LogRocket quotation; the original
Medium page was unreachable. A longer variant of the quote circulates, but it could not be
confirmed, so don't quote it. patterns.dev still teaches the pattern and concedes that
"Hooks achieve the same separation without the extra layer".

**What replaced it:**
- On the client, a **custom hook** holds the stateful or data logic, and the component
  renders.
- In the App Router, a **Server Component** reads data (through the DAL or API layer) and
  passes minimal props to prop-driven leaves. Calling RSC "the new container" is a common
  framing, but no primary source makes it.
- Leaf UI stays **prop-driven** and unaware of where data comes from.

Flag mandatory `XContainer` + `X` pairs, or wrappers whose only job is to fetch and pass
props, as outdated.

## 6. Custom hooks vs plain functions (C11)

From *Reusing Logic with Custom Hooks*:
- A hook name "must start with `use` followed by a capital letter".
- "Functions that don't *call* Hooks don't need to *be* Hooks." `useSorted(items)` with no
  hook calls inside should be `getSorted(items)`.
- Hooks share "*stateful logic* but not *state itself*". Each call gets its own state.
- Name hooks for "concrete high-level use cases": `useChatRoom`, `useOnlineStatus`,
  `useReviewFilters`. Don't write lifecycle wrappers like `useMount`, `useEffectOnce` or
  `useUpdateEffect`. They hide intent and fight React's model.
- Wrap callbacks a hook receives with `useEffectEvent` when an Effect must call the latest
  version without re-subscribing.

| Logic | Home |
|---|---|
| Uses state, effects, context, refs or other hooks | custom hook (`features/x/hooks/use-*.ts`, or `hooks/` if generic) |
| Pure computation or a business rule | plain function in a feature `utils/`/`model/` module (see L1) |
| Formatting for display | pure formatter (`utils/format.ts`) or the hook that feeds the view |
| Shared by several event handlers | plain function called from each handler |

## 7. Effects: only for external systems (C4, C7)

From *You Might Not Need an Effect*: use an Effect only for code that runs "*because* the
component was displayed", meaning synchronization with something outside React (network
subscription, DOM API, widget, timer). Everything else has a better home:

| Instead of an Effect that… | Do this |
|---|---|
| sets state from props/state (`setFullName(first + ' ' + last)`) | compute it during render |
| resets state when a prop changes | render with `key={id}` |
| runs logic because a button was clicked | put it in the event handler |
| notifies the parent (`useEffect(() => onChange(v), [v])`) | call `onChange` in the same handler that sets the state |
| chains Effects that set state that triggers more Effects | compute the next state in one handler or a reducer |
| subscribes to an external store | `useSyncExternalStore` |
| fetches data | in Next.js, fetch in a Server Component or use a server-cache library (see B11/B16). react.dev accepts Effect fetching with cleanup, but a framework or library solution is preferred |

## 8. State placement ladder (C6)

Go up a rung only when the one below doesn't fit:

1. **Derive** it during render (not state at all).
2. **Local state** in the component that uses it.
3. **Lift** to the closest common parent of the components that need it.
4. **Compose**: pass JSX as `children`/slots instead of threading props.
5. **Scoped reducer + context**, provided as low as possible and split by domain.
6. **External store** (Zustand, Redux, Jotai) for app-wide, client-owned state only.

Two categories sit outside the ladder:
- **Server data** is a cache, not state. It lives in RSC props or TanStack Query/SWR and
  is never copied into a store (L5).
- **Shareable UI state** (filters, tab, page, sort) belongs in the URL, so it survives
  reload and can be linked. Libraries like `nuqs` type it; their docs were seen only as
  search snippets. In the App Router, layouts cannot read `searchParams`, so URL state is
  read in pages or Client Components.

Bulletproof React's five state categories make a useful checklist: component state,
application state, server cache state, form state, and URL state.

## 9. Reusable primitive API shape (C13, C14)

**The shadcn/ui pattern for a primitive:**
- closed `variant` and `size` sets built with `cva`;
- `className` merged last with `cn` so callers can extend it;
- an exported `buttonVariants`, so other elements (links) can share the styles;
- `data-slot`/`data-variant`/`data-size` attributes for styling hooks;
- props typed by extending the native element's props and spreading the rest onto the
  element.

```tsx
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva('inline-flex items-center justify-center rounded-md text-sm font-medium', {
  variants: {
    variant: { default: 'bg-primary text-primary-foreground', outline: 'border', ghost: 'hover:bg-accent' },
    size: { sm: 'h-8 px-3', md: 'h-9 px-4', lg: 'h-10 px-6' },
  },
  defaultVariants: { variant: 'default', size: 'md' },
});

type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

// React 19: `ref` arrives as a normal prop through ...props; no forwardRef needed.
export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
```

**API conventions for reusable components:**
- Use a closed **variant** set instead of `isPrimary`/`isLarge` booleans.
- **Polymorphism** uses Radix `asChild` (the child must spread props and accept a ref, and
  it takes over accessibility responsibility if it changes the element) or Base UI's
  `render` prop. shadcn now documents both. Follow whichever primitive library the
  project uses, and don't mix them.
- **Controlled or uncontrolled** pairs use `value` + `onValueChange` and `defaultValue`.
- **Events** are `onX` callbacks. Expose state to CSS via `data-state` attributes.
- **Types:** use `ComponentProps<'button'>`, or `ComponentProps<typeof OtherComponent>` to
  wrap a third-party component (Matt Pocock).

**React 19 updates (C14):**
- `ref` is a regular prop, and `forwardRef` is on a deprecation path, so don't write new
  `forwardRef`. Radix's docs show `forwardRef` because they predate React 19.
- Render `<Context value={…}>` instead of `<Context.Provider value={…}>`.
- `use()` reads promises and context, and unlike hooks it may be called conditionally.
- **React Compiler** (stable): for new code, "rely on the compiler for memoization", and
  keep `useMemo`/`useCallback` only where you need precise control. Don't strip existing
  memoization without testing. Next.js supports the compiler from 15.3.1. Wrapping every
  handler in `useCallback` in new code is noise.

## 10. Inside a component file

No authoritative source prescribes an order within a file. This common convention follows
from the Rules of Hooks:

1. imports (external, then `@/` aliases, then relative);
2. types (`type Props = …`);
3. module-level constants and pure helpers that don't need props or state;
4. the exported component, in this order:
   1. hooks (state, context, queries, custom hooks), unconditionally at the top;
   2. derived values;
   3. event handlers;
   4. early returns (loading, empty, error);
   5. JSX;
5. private subcomponents used only by this file, at **top level** (never nested inside
   the component).

A component folder holds at most:
- `review-card.tsx`;
- `review-card.test.tsx`;
- `use-review-card.ts` (if the logic is big);
- `review-card.types.ts` (if the types are shared);
- an optional single-target `index.ts`.

## 11. Rules C1–C14

| ID | Rule | Checkable signal | Kind |
|---|---|---|---|
| C1 | Render is pure. Side effects go in event handlers. | Mutating module or outer variables during render. | must-fix |
| C2 | Never declare a component inside another component. | A JSX-returning function defined in a component body and rendered as `<X/>`. | must-fix |
| C3 | Split on concern, state ownership or reuse, not line count. Move state down / lift content up before `memo`. | State read by one subtree; props forwarded unread; several entities in one file. | should-fix |
| C4 | Compute derivable values during render. Never `useState` + `useEffect` to sync them. | An Effect whose only job is `setX(f(props, state))`. | should-fix |
| C5 | Status enum over contradictory booleans, IDs over objects, flat state, `initialX`/`defaultX` for seeds. | `isLoading && isError` pairs; `useState(props.x)`. | should-fix |
| C6 | Placement ladder: derived → local → lift → `children` → scoped reducer+context → external store. Server data in a cache, shareable UI state in the URL. | Root-level providers used by one page; one monolithic context. | should-fix |
| C7 | Effects only sync with external systems. Reset with `key`, share handler logic via plain functions, never notify parents from Effects. | Chains of Effects setting state; `onChange` called in an Effect. | should-fix |
| C8 | Composition (`children`, named slot props) before context. | Intermediate components that only forward props. | suggestion |
| C9 | Compound components use context plus a guarded `useXContext`, with named exports. No `Children.map` + `cloneElement`. | `cloneElement` in a component library; `Menu.Item` static parts. | should-fix |
| C10 | Prefer inversion of control (composition, callbacks, state reducers) over boolean/option prop sprawl. | Many `isX`/`showY`/`closeOnZ` flags on one component. | suggestion |
| C11 | Only functions that call hooks are hooks. Name them for a concrete purpose, never a lifecycle. | `useX` with no hook calls; `useMount`/`useEffectOnce`. | should-fix |
| C12 | No mandatory `XContainer` + `X` pairs. Use a hook (client) or a Server Component (data) and keep leaves prop-driven. | Container wrappers that only fetch and pass props. | suggestion |
| C13 | Primitive API: extend `ComponentProps<'el'>`, spread rest, `cn(className)`, `cva` variants, `asChild`/`render` polymorphism, `value`/`onValueChange` + `defaultValue`, `onX` callbacks, `data-*` state. | `isPrimary`/`isLarge` booleans; `className` dropped; no rest spread. | suggestion |
| C14 | React 19: `ref` as a prop (no new `forwardRef`), `<Context value>`. With the Compiler, no blanket memoization in new code; keep existing memo until tested. | New `forwardRef`/`.Provider`; `useCallback` on every handler. | suggestion |
