# Zod — parse at every boundary, trust types inside

"Parse, don't validate": at the edge, turn untrusted data into a typed value or fail;
inside the onion, never re-check shape.

## Boundaries in DevDigest and who parses

| Boundary | Parse with | Where |
|---|---|---|
| HTTP params/body/query | route `schema: { params, body, querystring }` | `routes.ts` |
| Job payload (`JobHandler(payload: unknown)`) | `XPayload.parse(payload)` | job registration in `routes.ts` (or first line of the handler) |
| LLM structured output | `parseWithRepair` / `completeStructured` with a zod schema | `reviewer-core/src/llm/*` |
| GitHub / git / external JSON | zod or explicit mapping in the adapter | `src/adapters/*` |
| Env / config | `platform/config.ts` | composition root |
| DB rows | not zod — the typed mapper in the repository | `repository.ts` |

## Where schemas live

- Contracts used by API + client: `@devdigest/shared/contracts/*`. There are **two copies**
  (`server/src/vendor/shared`, `client/src/vendor/shared`); a contract change updates both.
- Module-internal boundary schemas (job payloads, adapter responses): module `types.ts`
  or the adapter file.
- Zod is allowed in the domain ring (team decision): contracts double as domain types.
  Keep schemas free of I/O (no async refinements that hit the DB).

## Shape vs. invariant

Zod checks **shape and format** (UUID, URL, enum, length). **Business invariants**
("a review score is recomputed from surviving findings", "a repo can't be added twice per
workspace", "findings must cite lines in the diff") need state or context, so they live in
domain/application code (`groundFindings`, service checks that throw `ValidationError`/`AppError`).
Don't encode them as `.refine()` on a boundary schema, and don't rely on a DB constraint
alone — the constraint is a backstop, the service is the rule.

## Sources
- https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/
- https://jagreehal.github.io/jagreehal-typescript-patterns/patterns/validation
- https://dev.to/gabrielanhaia/runtime-validation-in-typescript-where-zod-ends-and-the-type-system-begins-4e9e
- https://dev.to/paradane/parse-dont-validate-in-typescript-a-practical-tutorial-1ahc
