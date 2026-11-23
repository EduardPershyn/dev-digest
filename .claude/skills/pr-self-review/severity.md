# Severity rubric

One rubric for every skill reviewer, the CRITICAL re-check and the repo checks. The verdict
depends only on CRITICAL, so the bar for it is high and concrete.

## CRITICAL — the PR should not merge as is
At least one of these, caused by the change on this branch:
- **Broken build or contract.** Doesn't compile; a type error; a shared contract
  (`@devdigest/shared`, an API route's request/response) changed in a way that breaks a
  consumer in this repo.
- **Architecture rule the repo enforces.** A rule the skill marks as MUST / NEVER / forbidden
  *and* that tooling enforces or the skill calls a hard rule, e.g. an onion-architecture
  dependency pointing outward (domain importing Drizzle/Fastify/an SDK), a `pnpm lint:arch`
  violation, a Server Component boundary broken so that server-only code (DB client,
  secrets) reaches a `'use client'` module.
- **Security.** An exploitable issue: injection (SQL, command, path), missing
  authorization on a mutating route, a hard-coded secret, user input rendered as HTML
  unsanitized, SSRF to user-supplied URLs.
- **Data loss or corruption.** Schema change without a migration, a destructive migration
  without a safe path, a write that can silently drop or overwrite user data.
- **Certain runtime failure** on a main path: an unhandled rejection that crashes the
  server, an infinite render loop, a hook called conditionally.

Not CRITICAL, even if the skill says "avoid": naming, file placement that still respects
dependency direction, missing memoization, a missing test, verbose code, a library feature
not used.

## WARNING — should be fixed, but merging is defensible
- Breaks a stated rule of the skill with a real maintainability or correctness cost:
  logic in the wrong layer, duplicated business rule, god component, prop drilling the
  skill names, unvalidated input on a read-only path, an `any` that hides a contract.
- A likely bug that needs a specific condition to show.

## SUGGESTION — nice to have
- Style, naming, small simplifications, alternative idioms the skill prefers.
- Anything you are unsure about.

## Tie-breakers
- Unsure between two levels → pick the lower one.
- Same problem in many places → one finding at the first place, mention the others in
  `message`.
