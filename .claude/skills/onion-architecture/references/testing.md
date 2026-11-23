# Testing by ring

Read `TESTING.md` (repo root) before adding tests — it owns naming, CI split and Docker rules.
This file only says *which kind of test* each ring gets.

| Ring | Test type | Dependencies | File naming |
|---|---|---|---|
| Domain (`helpers.ts`, reviewer-core) | plain unit tests, input → output | none | `*.test.ts` |
| Application (`service.ts`, executors) | unit tests with **fakes** of the ports | in-memory fakes, stub `LLMProvider` | `*.test.ts` |
| Infrastructure (repositories) | integration against real Postgres (testcontainers) | `test/helpers/pg.ts` | `*.it.test.ts` (mandatory) |
| Adapters (Octokit, git, LLM) | adapter tests with recorded/stubbed transport | no real network | `*.test.ts` |
| Delivery (`routes.ts`) | `app.inject()` with `ContainerOverrides` | mocks from `adapters/mocks.ts` | `*.test.ts` / `*.it.test.ts` |

## Fakes over mocks for ports

A fake is a small working implementation of the port (a `Map`-backed `RepoStore`). It keeps
the port's promise across many tests, unlike per-test `vi.fn()` call expectations.

```ts
class InMemoryRepoStore implements RepoStore {
  private rows = new Map<string, Repo>();
  async findByFullName(ws: string, full: string) { return [...this.rows.values()].find(r => r.workspace_id === ws && r.full_name === full); }
  // …
}

const service = new RepoService({ store: new InMemoryRepoStore(), git: fakeGit, jobs: { enqueue: vi.fn() }, secrets: fakeSecrets });
```

With constructor-injected ports, a service test needs no `Container`, no app, no Docker.

## Contract tests keep fakes honest

When a fake is reused widely, write one shared suite `describeRepoStoreContract(make)`
and run it against both the fake (`*.test.ts`) and the Drizzle repository (`*.it.test.ts`).
Fakes tend to be more forgiving than Postgres (uniqueness, ordering, tenancy filters) — the
contract suite catches that.

## Smell

If a test of business logic needs testcontainers, the logic is in the wrong ring.

## Sources
- https://dzone.com/articles/testing-repository-adapters-with-hexagonal-architecture
- https://github.com/Maltcommunity/repository-test-example
- https://dev.to/tacoda/hexagonal-architecture-in-practice-ports-adapters-and-tests-that-skip-the-database-5b19
- https://dev.to/gabrielanhaia/testing-use-cases-without-a-database-and-why-your-tests-are-slow-3403
