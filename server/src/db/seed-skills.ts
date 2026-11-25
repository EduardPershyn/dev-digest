/**
 * M2 — built-in skills seeded for the two M2 agents (specs/M2-skills.md).
 *
 * Mirrors the importable originals in `docs/skills/*.md` (frontmatter = name /
 * description / type, body = the rest). Keep the two in sync. The DB is the
 * source of truth at run time; this only affects freshly seeded workspaces.
 *
 * Deliberately NOT here, because each is imported through the UI to demo the
 * import flow: `mocking-and-flakiness` (Test Quality Reviewer) from
 * `docs/skills-samples/test-smells-skill.zip`, and `deprecation-policy`
 * (API Contract Reviewer) from `docs/skills-samples/deprecation-policy.md`.
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
}

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'branch-coverage-gaps',
    description:
      'Use when a PR adds or changes production code with conditional logic. Map every new branch to a test that reaches it and flag each branch no test in the diff exercises.',
    type: 'rubric',
    body: `# Branch coverage gaps

Coverage percentages hide the problem; branches show it. For each production
function the PR adds or changes:

1. **List the branches.** Every \`if\` / \`else\`, ternary, \`switch\` case, \`??\` / \`||\`
   fallback, early \`return\`, \`throw\`, \`catch\` block, loop that can run zero times, and
   guard clause (\`if (!x) return\`).
2. **Find the test that reaches each branch.** A test "reaches" a branch only if its
   input makes that branch run AND it asserts the branch's observable result (return
   value, thrown error, side effect). Calling the function on the happy path does not
   cover its error branches.
3. **Flag every unreached branch** as its own finding, citing the production line of
   the branch. Name the input that would reach it, e.g. "no test calls
   \`applyDiscount\` with an unknown code, so the \`throw\` on line 14 is untested".

Rules:
- A happy-path-only test for a function with error handling is a gap, not "basic
  coverage". Say which branches it leaves out.
- An error branch that is tested only with \`expect(...).toThrow()\` and no message or
  type check is weak: a different error would also pass. WARNING at most.
- Branches whose only effect is logging are SUGGESTION at most.
- If the PR changes a branch condition (\`>\` → \`>=\`), the test must pin the value at
  the boundary; otherwise flag it.
`,
  },
  {
    name: 'boundary-and-corner-cases',
    description:
      'Use when a PR adds tests for code that takes numbers, strings, collections, dates or optional values. Check that the tests pin the boundaries and corner cases where that code typically breaks.',
    type: 'rubric',
    body: `# Boundary and corner cases

For each input of the code under test, check the tests in the diff for the values
below. Flag the missing ones that the production code actually treats differently
(name the input and what would go wrong). Do not demand cases the code cannot
receive.

| Input kind | Values a test should pin |
|---|---|
| Numbers | \`0\`, \`-1\` / negatives, the exact limit and limit ± 1 (\`100\`, \`101\` for a percentage), \`NaN\`, very large values, non-integers where integers are assumed |
| Money / rounding | values that round differently (\`0.005\`), totals that go below zero, currency with no minor unit |
| Strings | \`''\`, whitespace only, mixed case when matching is case-sensitive, Unicode / emoji, very long input |
| Collections | empty, one element, duplicates, unsorted input when order matters |
| Optional / nullable | \`undefined\` vs \`null\` vs missing key, and the default that applies |
| Dates / time | month and year ends, leap day, DST change, time zones other than UTC |
| Async / I/O | the call rejects, times out, or resolves empty |

Rules:
- One finding per function, listing its missing boundaries, not one finding per
  missing value.
- A boundary the production code explicitly handles (a clamp, a guard, a special
  case) but no test pins is WARNING. A boundary the code does not handle and that
  can occur in production is a bug: flag it and say what the code does today.
- Table-driven tests (\`it.each\`) are the preferred fix; suggest one.
`,
  },
  {
    name: 'breaking-change',
    description:
      "Use when a PR changes or removes a public contract - an HTTP route's path, method, parameters, headers or status codes, or a function/type another package imports. Flag every change an existing caller would notice without changing its own code. Do not flag purely additive changes.",
    type: 'rubric',
    body: `# Breaking change

A public contract is anything a caller outside this PR relies on: an HTTP route, its
inputs and status codes, and exported functions or types other packages import. Compare
the old interface (\`-\` lines) with the new one (\`+\` lines) and ask: does every existing
caller still work, unchanged, after this ships?

## Breaking unless the diff keeps the old form working

**Route**
- Path or path segment renamed (\`/orders/:id/items\` → \`/orders/:id/lines\`),
  route removed, moved behind a new prefix, or its HTTP method changed.

**Request**
- A query parameter, header or body field becomes required, or a new required one is
  added. A default that used to apply is dropped.
- A field's type, format or allowed values narrow (string → enum, number → integer,
  lower max length). Input that used to return 200 now returns 400 / 422.

**Behaviour callers see**
- A status code changes for the same situation (404 ↔ 200 with \`null\`, 201 → 200).
- An exported function's parameters are reordered, removed or made required, or it now
  throws where it used to return.

Response *field* changes (rename, type, nullability) are covered in detail by
\`response-schema\`; still report them here if no other skill is attached.

## Not breaking
- New optional input, new route, new optional response field.
- The old form still works next to the new one: an alias route, \`/v2\` beside \`/v1\`, an
  optional parameter with today's default.
- Renames of internal names callers never see (a local variable, a private helper).

## Good / Bad

**Bad**: the path changes, \`page\` becomes required, and nothing keeps the old call
working:

\`\`\`diff
- app.get('/orders/:id/items', { schema: { params: IdParams } }, async (req) => {
-   return orders.listItems(req.params.id);
+ app.get('/orders/:id/lines', { schema: { params: IdParams, querystring: z.object({ page: z.coerce.number() }) } }, async (req) => {
+   return orders.listItems(req.params.id, req.query.page);
\`\`\`

Report two CRITICAL findings, each citing its \`+\` line. First: "\`GET /orders/:id/items\`
is gone; the mobile app calls it and now gets 404". Second: "\`page\` is required;
requests without it now get 400".

**Good**: the new route is added and the old one keeps working:

\`\`\`diff
+ const Query = z.object({ page: z.coerce.number().int().positive().default(1) });
+ app.get('/orders/:id/lines', { schema: { params: IdParams, querystring: Query } }, handler);
+ /** @deprecated use GET /orders/:id/lines. Removed in v3. */
  app.get('/orders/:id/items', { schema: { params: IdParams } }, handler);
\`\`\`

Nothing breaks. At most a SUGGESTION to add a contract test for the alias.

## How to report
- One finding per breaking change, citing the changed line. Name who breaks and how
  ("old request now fails with 404", "old parser now reads \`undefined\`").
- CRITICAL when nothing in the diff aliases, versions or migrates the change. Name the
  non-breaking alternative (keep the old form and deprecate it, or add \`/v2\`).
- Do not repeat the same change once per caller.
`,
  },
  {
    name: 'response-schema',
    description:
      "Use when a PR changes what a route or exported function returns - a response DTO, the mapper that builds it, or a Zod/TypeScript response schema. Flag renamed, removed or re-typed fields, required fields that became optional or nullable, and producers and consumers that no longer agree. Do not flag a new optional field.",
    type: 'rubric',
    body: `# Response schema

A response is a contract with every parser of it: the web client, other services, generated
SDKs, stored snapshots. For each response shape the PR touches, compare the old and new
shape field by field.

## Flag
- **Renamed or removed field**: \`display_name\` → \`name\`. Old parsers read
  \`undefined\`; a Zod schema with the old required key fails to parse.
- **Type change**: \`number\` → \`string\`, \`string\` → \`string[]\`, an ISO date → epoch
  number, an object flattened or nested differently.
- **Unit or meaning change under the same name**: \`amount\` switches from major units to
  cents. The parser accepts it, and the displayed values are silently wrong. Treat this
  as a breaking change too.
- **Required → optional / nullable**: a field that was always present may now be missing
  or \`null\`. Callers that do \`x.name.length\` crash.
- **Envelope or collection shape**: \`[...]\` → \`{ items: [...] }\`; pagination added to a
  list that used to return everything.
- **Enum widened in a response**: a new \`status\` value that old clients' exhaustive
  \`switch\` or \`z.enum\` rejects. WARNING unless clients are known to ignore unknown values.

## Producer and consumer must move together
- If the code that builds the response changes a field, the schema that types it, and
  every consumer in the diff that parses it, must change the same way. A server that emits
  \`name\` while a client schema still requires \`display_name\` fails at runtime, even
  though both packages compile.
- When the same contract exists in more than one place (a vendored or generated copy), a
  change to one copy only is a finding. Cite the copy that changed and name the stale one.
- Schemas that parse **stored** JSON (snapshots, cached payloads) must still accept rows
  written before the change. A new required field there is CRITICAL.

## Good / Bad

**Bad**: the DTO mapper renames a field and the server's contract follows, but the
client copy and its consumers still expect the old name:

\`\`\`diff
  // api/src/users/dto.ts
-   display_name: user.displayName,
+   name: user.displayName,
  // api/src/contracts/user.ts
-   display_name: z.string(),
+   name: z.string(),
\`\`\`

Report a CRITICAL finding: "\`display_name\` renamed to \`name\` with no alias. The web
app's copy of the contract (\`web/src/contracts/user.ts\`) still requires \`display_name\`,
so \`User.parse\` fails for every user and the profile page shows nothing."

**Good**: the new field is added and the old one is kept, marked deprecated:

\`\`\`diff
    display_name: user.displayName, // @deprecated use name; removed in v3
+   name: user.displayName,
  // both contract copies
    display_name: z.string(),
+   name: z.string().optional(),
\`\`\`

Old and new clients both parse it. No finding.

## How to report
- One finding per changed field or shape, citing the \`+\` line. State the old and new
  shape and the consumer that breaks.
- CRITICAL: a field old callers read is renamed, removed, re-typed or changes unit, with
  no alias. WARNING: newly optional / nullable, or a widened enum.
`,
  },
  {
    name: 'semver-discipline',
    description:
      "Use when a PR changes a public contract in a project that versions its API - a package.json version, an API path prefix (/v1), an OpenAPI info.version, or a CHANGELOG. Decide which bump the change requires (major, minor or patch) and flag a breaking change that ships without a major bump or a new versioned route. Do not demand a bump for internal refactors.",
    type: 'rubric',
    body: `# Semver discipline

The version number is a promise to callers: same major means "your code keeps working".
For each contract change in the diff, decide the bump it requires, then check the diff
makes that bump.

## Which bump
| Change | Bump |
|---|---|
| Removed or renamed route, field, parameter or export; new required input; type or unit change; status code change; narrower validation | **major** |
| New route, new optional input, new optional response field, new export; deprecating something (it still works) | **minor** |
| Bug fix that keeps the documented contract; docs; internal refactor | **patch** |

The biggest change in the PR decides the bump. One breaking change makes the whole
release major.

## How the bump shows up
Look for whichever versioning this project uses, and check the change matches it:
- **Path versioning** (\`/v1/...\`): a breaking change goes into a new \`/v2\` route, and
  \`/v1\` keeps its behaviour. Changing a \`/v1\` handler in place is the violation, even if
  \`package.json\` is bumped.
- **Package version** (\`package.json\`, \`pyproject.toml\`, an \`API_VERSION\` constant,
  OpenAPI \`info.version\`): the major part goes up for a breaking change.
- **CHANGELOG / release notes**: a breaking change has an entry under the new major,
  marked breaking, with a migration note.

If the project shows no versioning at all, do not invent one. Report the breaking change
(as the \`breaking-change\` skill describes) and suggest versioning in one sentence.

## Good / Bad

**Bad**: the route renames a response field in place and the version stays minor:

\`\`\`diff
  // src/routes/v1/invoices.ts
-   return { id, amount, currency };
+   return { id, amount_cents: amount * 100, currency };
  // package.json
-   "version": "2.3.1",
+   "version": "2.4.0",
\`\`\`

Report a CRITICAL finding: "\`amount\` → \`amount_cents\` in a \`/v1\` route is a breaking
change, but the release is \`2.4.0\` (minor). Either keep \`amount\` in \`/v1\` and add
\`amount_cents\` in \`/v2\`, or bump to \`3.0.0\` and record it as breaking in the CHANGELOG."

**Good**: the change goes into a new version and the old one is untouched:

\`\`\`diff
+ // src/routes/v2/invoices.ts
+   return { id, amount_cents: Math.round(amount * 100), currency };
  // package.json
-   "version": "2.3.1",
+   "version": "2.4.0",
+ // CHANGELOG.md: 2.4.0 - Added GET /v2/invoices/:id (amount in cents). /v1 unchanged.
\`\`\`

This is additive (a new route), so minor is correct. No finding.

## How to report
- One finding per release, not per change. List the breaking changes that force the
  major bump and cite the version line, or the \`/v1\` handler changed in place.
- CRITICAL: breaking change with no major bump and no new versioned route. WARNING:
  major bump present but no CHANGELOG / migration note. SUGGESTION: bump larger than
  needed (major for an additive change).
`,
  },
];

/** Which seeded skills each M2 agent gets, in prompt order. */
export const SEED_AGENT_SKILLS: Record<string, string[]> = {
  'Test Quality Reviewer': ['branch-coverage-gaps', 'boundary-and-corner-cases'],
  'API Contract Reviewer': ['breaking-change', 'response-schema', 'semver-discipline'],
};
