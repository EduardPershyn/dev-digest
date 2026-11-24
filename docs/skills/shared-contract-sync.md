---
name: shared-contract-sync
description: Use when a PR changes a Zod schema, a shared type, or any contract file that more than one package consumes. Check that every copy and every consumer moves together, and that the change stays backwards compatible.
type: convention
---
# Shared contract sync

Contracts in this codebase are vendored, not published: the same Zod schema can live
in more than one place (for DevDigest, `server/src/vendor/shared` and
`client/src/vendor/shared`). A change that lands in one copy only compiles fine and
breaks at runtime.

Check:
1. **Every copy changed.** If a contract file changes, the same change must appear in
   each vendored copy in the diff. Flag the copy that was not updated, citing the
   changed line in the other copy.
2. **Producer and consumer agree.** If a response schema changes, the code that builds
   the response and the code that parses it must both change. A server that emits
   `amount_cents` while the client schema still requires `amount` fails parsing.
3. **Backwards compatible Zod changes.** Adding a field: make it `.optional()` or give
   it a `.default()` so payloads from older producers still parse. Removing or
   renaming a field: keep the old one (optional, deprecated) for a release.
   A `.strict()` input schema rejects unknown keys, so a newer client that sends a
   new field to an older server fails; the server change must ship first.
4. **Persisted JSON.** Schemas used to parse stored JSON (jsonb snapshots, traces)
   must still accept rows written before the change. A new required field there is
   CRITICAL.

Report one finding per contract, not per file.
