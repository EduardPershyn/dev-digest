# Examples: does it clear the bar?

These show the shape of good and bad entries. **They are not facts about this repo.**
Paths and numbers are made up.

## Too vague → specific

The first two pairs come from the MindStudio Learnings.md guide (24.03.2026).

❌ "Promises can be tricky."
```
- **2026-03-24** — `Promise.all()` in the ingest pipeline times out after ~30 items; use
  `Promise.allSettled()` in batches of 10. Why: upstream rejects bursts of concurrent calls.
  Ref: `src/ingest/run.ts:42`
```

❌ "Be careful with async state."
```
- **2026-03-24** — Checkout state lives only in the Zustand `cartStore.ts`; local component
  state breaks it. Why: three components share the cart. Ref: `src/stores/cartStore.ts:1`
```

❌ "The review prompt can get too big."
```
- **2026-11-19** — Repo maps over ~40k tokens push the diff out of the window and the model
  returns zero findings; cap `repoMap` before `buildPrompt`. Why: the diff is assembled after
  the repo map. Ref: `src/prompt.ts:88`
```

## Skip these

- "Validate request bodies with zod." This is generic, and `server/CLAUDE.md` already says it.
- "Tests that import `test/helpers/pg.ts` must be named `*.it.test.ts`." This is already in
  `server/CLAUDE.md` under Gotchas. If it bit you anyway, that is a reason to **promote** it,
  not to duplicate it.
- "Fixed a typo in the PR list header." This is trivial, so it gets no Session Note.
- "I think the SSE `runBus` drops events." You haven't checked it, so it is not a fact. Write
  it as an Open Question:
  ```
  - **2026-11-19** — Unverified: run progress sometimes stops updating in the UI; maybe
    `runBus` drops events on reconnect. Ref: `server/src/modules/reviews/`
  ```

## One shape per section

```
## What Doesn't Work
- **DATE** — Mocking `LLMProvider` with `vi.mock` on its module path does nothing, because
  the engine receives it by injection; pass a stub instead. Ref: …

## Recurring Errors & Fixes
- **DATE** — `EADDRINUSE :::3001` on `pnpm dev` after a crash: the `tsx watch` child outlives
  its parent; run `pkill -f "tsx watch"`. Ref: …

## Session Notes
- **DATE** — Added a `callers` slot to the review prompt; it is omitted when empty, as the
  prompt contract requires.
```
