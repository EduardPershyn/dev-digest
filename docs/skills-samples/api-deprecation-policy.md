---
name: api-deprecation-policy
description: Use when a PR renames, removes or re-types anything a public HTTP route accepts or returns. Flag changes that skip the deprecation policy below and say which step is missing.
type: rubric
---
# API deprecation policy

Public routes are consumed by the web app, the mobile app and partner integrations that
ship on their own schedule. A change that breaks them must go through deprecation, not land
in one PR.

## Renamed fields and parameters
- Keep the old name working as an **alias for at least one release**: accept both
  `:id` and the new path parameter, or return both `amount` and the new field.
- Mark the old name deprecated in the route's doc comment and send a
  `Deprecation: true` response header while the alias exists.
- Flag a rename that removes the old name in the same PR.

## New required inputs
- A query parameter, header or body field may only become **required behind a version
  bump** (`/v2/...`) or with a default that keeps today's behaviour.
- Flag `.optional()` being removed from a request schema, or a destructuring default
  being dropped, without a new versioned route.

## Unit or meaning changes
- A field whose unit or meaning changes needs a **new field name**
  (`amount` in major units → add `amount_minor`; never change what `amount` means).
- Flag a field that keeps its name but changes unit, scale, currency handling or type.

## What to report
For each violation, cite the changed line, name the client-visible effect ("mobile app
reads `amount` as dollars and will show 100× the price"), and state the missing step
(alias, version bump, or new field name).
