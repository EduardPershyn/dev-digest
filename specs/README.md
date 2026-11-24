# specs/ — cross-module specifications

Specs for features that touch more than one package (most roadmap milestones do).
A spec that touches a single package goes in `<package>/specs/`.

## Naming
`M<n>-<slug>.md` for roadmap milestones (e.g. `M1-cost-badge.md`), `<slug>.md` otherwise.

## Status legend
`draft` → `accepted` → `in-progress` → `done` (or `dropped`).
On `done`, move anything that stays true into the relevant README or `docs/`; the spec
remains as the historical record.

## Index
| Spec | Status | Packages |
|------|--------|----------|
| [M1-cost-badge](M1-cost-badge.md) | done | server, client |
| [pr-list-findings](pr-list-findings.md) | done | server, client |
| [pr-self-review](pr-self-review.md) | done | .claude (tooling) |
| [M2-skills](M2-skills.md) | in-progress | server, client, reviewer-core, e2e |

## Template
```markdown
# <Title>
- **Status:** draft
- **Milestone:** M<n> · **Packages:** server, client, …
- **Owner:** <name>

## Problem
## Scope / Non-goals
## Design (contracts, routes, DB tables, UI)
## Acceptance criteria
- [ ] …
## Open questions
```
