---
name: breaking-change
description: Use when a PR changes or removes a public contract - an HTTP route's path, method, parameters, headers or status codes, or a function/type another package imports. Flag every change an existing caller would notice without changing its own code. Do not flag purely additive changes.
type: rubric
---
# Breaking change

A public contract is anything a caller outside this PR relies on: an HTTP route, its
inputs and status codes, and exported functions or types other packages import. Compare
the old interface (`-` lines) with the new one (`+` lines) and ask: does every existing
caller still work, unchanged, after this ships?

## Breaking unless the diff keeps the old form working

**Route**
- Path or path segment renamed (`/orders/:id/items` → `/orders/:id/lines`),
  route removed, moved behind a new prefix, or its HTTP method changed.

**Request**
- A query parameter, header or body field becomes required, or a new required one is
  added. A default that used to apply is dropped.
- A field's type, format or allowed values narrow (string → enum, number → integer,
  lower max length). Input that used to return 200 now returns 400 / 422.

**Behaviour callers see**
- A status code changes for the same situation (404 ↔ 200 with `null`, 201 → 200).
- An exported function's parameters are reordered, removed or made required, or it now
  throws where it used to return.

Response *field* changes (rename, type, nullability) are covered in detail by
`response-schema`; still report them here if no other skill is attached.

## Not breaking
- New optional input, new route, new optional response field.
- The old form still works next to the new one: an alias route, `/v2` beside `/v1`, an
  optional parameter with today's default.
- Renames of internal names callers never see (a local variable, a private helper).

## Good / Bad

**Bad**: the path changes, `page` becomes required, and nothing keeps the old call
working:

```diff
- app.get('/orders/:id/items', { schema: { params: IdParams } }, async (req) => {
-   return orders.listItems(req.params.id);
+ app.get('/orders/:id/lines', { schema: { params: IdParams, querystring: z.object({ page: z.coerce.number() }) } }, async (req) => {
+   return orders.listItems(req.params.id, req.query.page);
```

Report two CRITICAL findings, each citing its `+` line. First: "`GET /orders/:id/items`
is gone; the mobile app calls it and now gets 404". Second: "`page` is required;
requests without it now get 400".

**Good**: the new route is added and the old one keeps working:

```diff
+ const Query = z.object({ page: z.coerce.number().int().positive().default(1) });
+ app.get('/orders/:id/lines', { schema: { params: IdParams, querystring: Query } }, handler);
+ /** @deprecated use GET /orders/:id/lines. Removed in v3. */
  app.get('/orders/:id/items', { schema: { params: IdParams } }, handler);
```

Nothing breaks. At most a SUGGESTION to add a contract test for the alias.

## How to report
- One finding per breaking change, citing the changed line. Name who breaks and how
  ("old request now fails with 404", "old parser now reads `undefined`").
- CRITICAL when nothing in the diff aliases, versions or migrates the change. Name the
  non-breaking alternative (keep the old form and deprecate it, or add `/v2`).
- Do not repeat the same change once per caller.
