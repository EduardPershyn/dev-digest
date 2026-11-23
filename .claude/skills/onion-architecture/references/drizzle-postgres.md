# Drizzle + Postgres — the persistence adapter

Drizzle, the schema (`src/db/schema/*`), row types (`src/db/rows.ts`, `$inferSelect`),
`sql\`\`` fragments and pgvector operators are **infrastructure**. They live only in
`modules/<f>/repository.ts` (or `repository/*.repo.ts`) and `src/db/`.

## Port in the module, implementation in the repository

```ts
// modules/repos/ports.ts — application ring, domain language, no Drizzle
import type { Repo } from '@devdigest/shared';

export interface NewRepo { workspaceId: string; owner: string; name: string; createdBy: string }

export interface RepoStore {
  findByFullName(workspaceId: string, fullName: string): Promise<Repo | undefined>;
  list(workspaceId: string): Promise<Repo[]>;
  insert(input: NewRepo): Promise<Repo>;
  markCloned(workspaceId: string, repoId: string, path: string): Promise<void>;
}
```

```ts
// modules/repos/repository.ts — infrastructure ring
import { and, eq } from 'drizzle-orm';
import type { Repo } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { NewRepo, RepoStore } from './ports.js';

type RepoRow = typeof t.repos.$inferSelect;          // never exported

const toRepo = (row: RepoRow): Repo => ({            // mapper: row (camelCase) → contract (snake_case)
  id: row.id,
  workspace_id: row.workspaceId,
  owner: row.owner,
  name: row.name,
  full_name: row.fullName,
  // …
});

export class RepoRepository implements RepoStore {
  constructor(private db: Db) {}

  async findByFullName(workspaceId: string, fullName: string) {
    const [row] = await this.db.select().from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)));
    return row ? toRepo(row) : undefined;
  }
  // …
}
```

Rules:
- **Repositories return domain types.** Row types never cross the port. This is the line
  that today's `helpers.ts` files cross (they import row types to build DTOs) — move that
  mapping into the repository.
- **Name ports for the domain**: `RepoStore.findOpenPulls(...)`, not `query(where)`.
  Don't expose a generic `BaseRepository<T>` with query builders; that leaks Drizzle by another name.
- **Tenancy stays in the repository signature**: every method takes `workspaceId`
  and filters by it, as today.
- **One repository per aggregate/table cluster**, owned by one module. Other modules
  reach it through a port (via a `Container` getter for genuinely shared ones), not by
  importing the file.
- pgvector / full-text / `sql\`\`` stay in the adapter; the port says
  `findSimilarChunks(repoId, embedding, k)`.

## Transactions — the service owns the unit of work

A use case that writes more than once must be atomic, and the *service* decides that,
not each repository. Pattern:

```ts
// ports.ts
export interface ReviewStores { runs: RunStore; findings: FindingStore }
export interface UnitOfWork { run<T>(work: (stores: ReviewStores) => Promise<T>): Promise<T> }

// repository.ts
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private db: Db) {}
  run<T>(work: (s: ReviewStores) => Promise<T>) {
    return this.db.transaction((tx: Tx) =>
      work({ runs: new RunRepository(tx), findings: new FindingRepository(tx) }));
  }
}
// repositories accept `Db | Tx` in their constructor so they work inside and outside a tx.

// service.ts
await this.deps.uow.run(async ({ runs, findings }) => {
  await runs.complete(runId, summary);
  await findings.insertMany(runId, grounded);
});
```

- Never open a transaction inside a repository method that a service composes with others.
- Don't hold a transaction across an LLM or GitHub call — read, release, call, then write
  in a fresh unit of work (impureim sandwich).

## Migrations and schema

Schema changes follow `server/CLAUDE.md` (`db:generate` → `db:migrate`, never edit old
migrations). Domain types are **not** derived from the Drizzle schema; when a column is
added, update the mapper and, if exposed, the shared contract.

## Sources
- https://orm.drizzle.team/docs/transactions
- https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript
- https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901
- https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae
- https://github.com/cosmicpython/book/blob/667b2fd80e09251871dc4e20e645eae3ecb42442/chapter_02_repository.asciidoc
