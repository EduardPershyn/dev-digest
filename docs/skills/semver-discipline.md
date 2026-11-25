---
name: semver-discipline
description: Use when a PR changes a public contract in a project that versions its API - a package.json version, an API path prefix (/v1), an OpenAPI info.version, or a CHANGELOG. Decide which bump the change requires (major, minor or patch) and flag a breaking change that ships without a major bump or a new versioned route. Do not demand a bump for internal refactors.
type: rubric
---
# Semver discipline

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
- **Path versioning** (`/v1/...`): a breaking change goes into a new `/v2` route, and
  `/v1` keeps its behaviour. Changing a `/v1` handler in place is the violation, even if
  `package.json` is bumped.
- **Package version** (`package.json`, `pyproject.toml`, an `API_VERSION` constant,
  OpenAPI `info.version`): the major part goes up for a breaking change.
- **CHANGELOG / release notes**: a breaking change has an entry under the new major,
  marked breaking, with a migration note.

If the project shows no versioning at all, do not invent one. Report the breaking change
(as the `breaking-change` skill describes) and suggest versioning in one sentence.

## Good / Bad

**Bad**: the route renames a response field in place and the version stays minor:

```diff
  // src/routes/v1/invoices.ts
-   return { id, amount, currency };
+   return { id, amount_cents: amount * 100, currency };
  // package.json
-   "version": "2.3.1",
+   "version": "2.4.0",
```

Report a CRITICAL finding: "`amount` → `amount_cents` in a `/v1` route is a breaking
change, but the release is `2.4.0` (minor). Either keep `amount` in `/v1` and add
`amount_cents` in `/v2`, or bump to `3.0.0` and record it as breaking in the CHANGELOG."

**Good**: the change goes into a new version and the old one is untouched:

```diff
+ // src/routes/v2/invoices.ts
+   return { id, amount_cents: Math.round(amount * 100), currency };
  // package.json
-   "version": "2.3.1",
+   "version": "2.4.0",
+ // CHANGELOG.md: 2.4.0 - Added GET /v2/invoices/:id (amount in cents). /v1 unchanged.
```

This is additive (a new route), so minor is correct. No finding.

## How to report
- One finding per release, not per change. List the breaking changes that force the
  major bump and cite the version line, or the `/v1` handler changed in place.
- CRITICAL: breaking change with no major bump and no new versioned route. WARNING:
  major bump present but no CHANGELOG / migration note. SUGGESTION: bump larger than
  needed (major for an additive change).
