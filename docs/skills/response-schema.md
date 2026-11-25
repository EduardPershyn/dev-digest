---
name: response-schema
description: Use when a PR changes what a route or exported function returns - a response DTO, the mapper that builds it, or a Zod/TypeScript response schema. Flag renamed, removed or re-typed fields, required fields that became optional or nullable, and producers and consumers that no longer agree. Do not flag a new optional field.
type: rubric
---
# Response schema

A response is a contract with every parser of it: the web client, other services, generated
SDKs, stored snapshots. For each response shape the PR touches, compare the old and new
shape field by field.

## Flag
- **Renamed or removed field**: `display_name` → `name`. Old parsers read
  `undefined`; a Zod schema with the old required key fails to parse.
- **Type change**: `number` → `string`, `string` → `string[]`, an ISO date → epoch
  number, an object flattened or nested differently.
- **Unit or meaning change under the same name**: `amount` switches from major units to
  cents. The parser accepts it, and the displayed values are silently wrong. Treat this
  as a breaking change too.
- **Required → optional / nullable**: a field that was always present may now be missing
  or `null`. Callers that do `x.name.length` crash.
- **Envelope or collection shape**: `[...]` → `{ items: [...] }`; pagination added to a
  list that used to return everything.
- **Enum widened in a response**: a new `status` value that old clients' exhaustive
  `switch` or `z.enum` rejects. WARNING unless clients are known to ignore unknown values.

## Producer and consumer must move together
- If the code that builds the response changes a field, the schema that types it, and
  every consumer in the diff that parses it, must change the same way. A server that emits
  `name` while a client schema still requires `display_name` fails at runtime, even
  though both packages compile.
- When the same contract exists in more than one place (a vendored or generated copy), a
  change to one copy only is a finding. Cite the copy that changed and name the stale one.
- Schemas that parse **stored** JSON (snapshots, cached payloads) must still accept rows
  written before the change. A new required field there is CRITICAL.

## Good / Bad

**Bad**: the DTO mapper renames a field and the server's contract follows, but the
client copy and its consumers still expect the old name:

```diff
  // api/src/users/dto.ts
-   display_name: user.displayName,
+   name: user.displayName,
  // api/src/contracts/user.ts
-   display_name: z.string(),
+   name: z.string(),
```

Report a CRITICAL finding: "`display_name` renamed to `name` with no alias. The web
app's copy of the contract (`web/src/contracts/user.ts`) still requires `display_name`,
so `User.parse` fails for every user and the profile page shows nothing."

**Good**: the new field is added and the old one is kept, marked deprecated:

```diff
    display_name: user.displayName, // @deprecated use name; removed in v3
+   name: user.displayName,
  // both contract copies
    display_name: z.string(),
+   name: z.string().optional(),
```

Old and new clients both parse it. No finding.

## How to report
- One finding per changed field or shape, citing the `+` line. State the old and new
  shape and the consumer that breaks.
- CRITICAL: a field old callers read is renamed, removed, re-typed or changes unit, with
  no alias. WARNING: newly optional / nullable, or a widened enum.
