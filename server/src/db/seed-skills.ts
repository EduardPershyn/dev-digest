/**
 * M2 — built-in skills seeded for the two M2 agents (specs/M2-skills.md).
 *
 * Mirrors the importable originals in `docs/skills/*.md` (frontmatter = name /
 * description / type, body = the rest). Keep the two in sync. The DB is the
 * source of truth at run time; this only affects freshly seeded workspaces.
 *
 * `mocking-and-flakiness` is deliberately NOT here: it is imported through the
 * UI from `docs/skills-samples/test-smells-skill.zip` to demo the import flow.
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
    name: 'api-contract-breaking-changes',
    description:
      "Use when a PR changes an HTTP route, its handler's request or response, or a schema that describes them. Flag every change an existing client would notice without changing its own code.",
    type: 'rubric',
    body: `# API contract breaking changes

Compare the old interface (\`-\` lines) with the new one (\`+\` lines). Each item below
is a breaking change for existing clients unless the diff also keeps the old form
working (an alias route, a versioned path, an optional field with the old default):

**Route**
- Path renamed, or a path parameter renamed (\`/invoices/:id\` → \`/invoices/:invoiceId\`
  breaks every handler, test and client that reads \`params.id\`, and any generated
  client or OpenAPI doc).
- HTTP method changed; route removed; route moved behind a new prefix.

**Request**
- A query parameter, header or body field becomes required, or a new required one is
  added.
- A field's type, format or allowed values narrow (string → enum, number → integer,
  max length lowered).
- Validation that used to accept a value now rejects it (status 400 / 422 where it
  was 200).

**Response**
- A field is renamed or removed (\`amount\` → \`amount_cents\`), or its type or unit
  changes.
- A field becomes nullable or optional where it was always present.
- Status codes change for the same situation (404 ↔ 200 with \`null\`, 201 → 200).
- Ordering, pagination or envelope shape changes (\`[...]\` → \`{ items: [...] }\`).

How to report:
- One finding per breaking change, citing the changed line. Say which callers break
  and how (old request now fails, or old parsing now reads \`undefined\`).
- CRITICAL when nothing in the diff versions, aliases or migrates it. Mention the
  non-breaking alternative: keep the old field next to the new one and deprecate it,
  or add \`/v2\`.
- Purely additive changes (new optional field, new route) are not breaking. Do not
  flag them.
`,
  },
  {
    name: 'shared-contract-sync',
    description:
      'Use when a PR changes a Zod schema, a shared type, or any contract file that more than one package consumes. Check that every copy and every consumer moves together, and that the change stays backwards compatible.',
    type: 'convention',
    body: `# Shared contract sync

Contracts in this codebase are vendored, not published: the same Zod schema can live
in more than one place (for DevDigest, \`server/src/vendor/shared\` and
\`client/src/vendor/shared\`). A change that lands in one copy only compiles fine and
breaks at runtime.

Check:
1. **Every copy changed.** If a contract file changes, the same change must appear in
   each vendored copy in the diff. Flag the copy that was not updated, citing the
   changed line in the other copy.
2. **Producer and consumer agree.** If a response schema changes, the code that builds
   the response and the code that parses it must both change. A server that emits
   \`amount_cents\` while the client schema still requires \`amount\` fails parsing.
3. **Backwards compatible Zod changes.** Adding a field: make it \`.optional()\` or give
   it a \`.default()\` so payloads from older producers still parse. Removing or
   renaming a field: keep the old one (optional, deprecated) for a release.
   A \`.strict()\` input schema rejects unknown keys, so a newer client that sends a
   new field to an older server fails; the server change must ship first.
4. **Persisted JSON.** Schemas used to parse stored JSON (jsonb snapshots, traces)
   must still accept rows written before the change. A new required field there is
   CRITICAL.

Report one finding per contract, not per file.
`,
  },
];

/** Which seeded skills each M2 agent gets, in prompt order. */
export const SEED_AGENT_SKILLS: Record<string, string[]> = {
  'Test Quality Reviewer': ['branch-coverage-gaps', 'boundary-and-corner-cases'],
  'API Contract Reviewer': ['api-contract-breaking-changes', 'shared-contract-sync'],
};
