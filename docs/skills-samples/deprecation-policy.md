---
name: deprecation-policy
description: Use when a PR removes, renames or changes the meaning of a public route, parameter or response field. Flag every removal that skips deprecation and name the missing step - a working alias, a deprecation marker, or a sunset date. Do not flag removal of something that was already deprecated for at least one release.
type: convention
---
# Deprecation policy

Public routes are consumed by clients that ship on their own schedule (the web app, the
mobile app, partner integrations). Nothing they use disappears in one PR. It is
deprecated first, kept working, and removed only in a later major release.

## The three steps
A rename or removal is compliant only if the diff does all three:

1. **Keep it working.** The old route, parameter or field stays, as an alias of the new
   one. A route forwards to the new handler; a response returns both `amount` and the
   new field; a request still accepts the old parameter name.
2. **Mark it.** The old element is marked deprecated where callers and tooling see it:
   - code: a `/** @deprecated use X. Removed in vN. */` comment on the handler, field
     or schema key;
   - HTTP: `Deprecation: true` and `Sunset: <date>` response headers on the old route
     (RFC 8594), plus a `Link: <new-url>; rel="successor-version"` when there is one;
   - docs: OpenAPI `deprecated: true` and a CHANGELOG line under "Deprecated".
3. **Name the end.** The marker states when it goes away: a version (`Removed in v3`) or
   a date. A deprecation with no end never gets removed.

## Changes that need a new name, not a deprecation
- A field whose **unit or meaning** changes gets a new name (`amount` in major units
  stays; add `amount_minor`). Never change what an existing name means. Callers can't
  detect that, so no deprecation window helps them.
- A parameter that becomes **required** belongs on a new versioned route, or keeps a
  default that preserves today's behaviour.

## Removing something already deprecated
Removal is fine when the element was marked deprecated in an earlier release and the
PR is the major release its marker named. Check the `-` lines for the `@deprecated`
marker. If it is not there, treat the removal as unannounced.

## Good / Bad

**Bad**: the field is renamed in place, the route path changes, and nothing is marked:

```diff
- app.get('/payments/:id', async (req) => {
+ app.get('/payments/:paymentId/details', async (req) => {
    const p = await payments.get(req.params.paymentId);
-   return { id: p.id, total: p.total };
+   return { id: p.id, total_minor: p.total * 100 };
```

Report: "`GET /payments/:id` removed and `total` replaced by `total_minor` in one PR,
with no alias, no `@deprecated` marker and no sunset. Missing: keep `/payments/:id`
and `total` working, mark both deprecated with `Removed in v3`, and send `Deprecation` /
`Sunset` headers from the old route."

**Good**: old route and field kept and marked, new ones added beside them:

```diff
+ app.get('/payments/:id/details', detailsHandler);
+ /** @deprecated use GET /payments/:id/details. Removed in v3 (2027-06-01). */
  app.get('/payments/:id', async (req, reply) => {
+   reply.header('Deprecation', 'true').header('Sunset', 'Tue, 01 Jun 2027 00:00:00 GMT');
    const p = await payments.get(req.params.id);
-   return { id: p.id, total: p.total };
+   return { id: p.id, total: p.total /* @deprecated use total_minor */, total_minor: p.total * 100 };
```

No finding.

## How to report
For each violation, cite the changed line, say what an existing client sees ("the mobile
app reads `total` and gets `undefined`") and name the missing step: alias, marker or end
date. A removal with no alias is CRITICAL. An alias kept but not marked, or marked with
no end, is WARNING.
