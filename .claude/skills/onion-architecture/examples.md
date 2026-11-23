# Examples — bad (DevDigest code before the 2026-11-23 refactor) vs. good (current code)

## 1. Route doing persistence + orchestration

**Bad** — `modules/polling/routes.ts` (before):

```ts
app.post('/repos/:id/poll', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(container, req);
  const [repo] = await container.db.select().from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
  if (!repo) throw new NotFoundError('Repo not found');
  const gh = await container.github();
  const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
  for (const pr of pulls) {
    await container.db.insert(t.pullRequests).values({ /* … */ });
  }
});
```

The HTTP adapter knows the schema, the GitHub client and the sync algorithm; none of it is
testable without Postgres + Fastify.

**Good** (current `polling/*`):

```ts
// polling/ports.ts
export interface PollingStore {
  getRepo(workspaceId: string, repoId: string): Promise<RepoRecord | undefined>;
  upsertPull(workspaceId: string, repoId: string, pr: PrMeta): Promise<void>;
  markPolled(repoId: string): Promise<void>;
}

// polling/service.ts
export interface PollingServiceDeps { store: PollingStore; github: () => Promise<GitHubClient> }
export class PollingService {
  constructor(private readonly deps: PollingServiceDeps) {}
  async poll(workspaceId: string, repoId: string) {
    const { store } = this.deps;
    const repo = await store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const gh = await this.deps.github();
    let synced = 0;
    for (const pr of await gh.listPullRequests({ owner: repo.owner, name: repo.name })) {
      await store.upsertPull(workspaceId, repo.id, pr);
      synced++;
    }
    await store.markPolled(repo.id);
    return { synced, reviewTriggered: false as const };
  }
}

// polling/routes.ts
export function buildPollingService(c: Container): PollingService {
  return new PollingService({ store: new PollingRepository(c.db), github: () => c.github() });
}

app.post('/repos/:id/poll', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(container, req);
  return service.poll(workspaceId, req.params.id);
});
```

## 2. Service pulling its own dependencies from the Container

**Bad** — `modules/repos/service.ts` (before):

```ts
export class RepoService {
  private repo: RepoRepository;
  constructor(private container: Container) {
    this.repo = new RepoRepository(container.db);   // concrete infra, built inside the use case
  }
}
```

Hidden dependencies (it can reach *anything* in the container), concrete Drizzle class,
an import cycle risk through `container.ts`.

**Good** (current):

```ts
export interface RepoServiceDeps {
  store: RepoStore;                       // port from ./ports.ts
  git: Pick<GitClient, 'clone'>;          // only what the use case calls
  jobs: JobQueue;                         // modules/_shared/ports.ts
}
export class RepoService {
  constructor(private readonly deps: RepoServiceDeps) {}
}
```

## 3. Domain helper typed against DB rows

**Bad** (before) — `modules/repos/helpers.ts` imported `* as t from '../../db/schema.js'` to
type `toRepoDto(row)`; `reviews/helpers.ts` imported `FindingRow, PullRow` from `./repository.js`.

**Good** (current): helpers take records — `toRepoDto(row: RepoRecord)`,
`findingRowToDto(row: FindingRecord)`, `taskLine(pull: PullRecord)` — from
`modules/_shared/records.ts`. The domain ring has no idea Drizzle exists; `db/rows.ts`
asserts at compile time that each row type still equals its record.

## 4. reviewer-core staying pure

**Good** (current) — the engine takes everything as arguments:

```ts
const outcome = await reviewPullRequest(
  { diff, agent, repoMap, callers, specs },   // data loaded by the server
  llm,                                         // LLMProvider port, injected
);
```

**Bad** — anything like this inside `reviewer-core/src/review/`:

```ts
import { readFileSync } from 'node:fs';                     // core-no-io-builtins
import { OpenRouterProvider } from '../llm/openrouter.js';  // core-openrouter-only-exported
const llm = new OpenRouterProvider(process.env.KEY!);        // engine choosing its own vendor
```

## 5. Job handler

**Bad** (before): `service.registerCloneJobHandler()` — the use case registered itself on
the runner and cast `payload as CloneJobPayload` unchecked.

**Good:** `routes.ts` registers and parses; the service method takes a typed `CloneJob`
(see `references/jobs-and-sse.md`).

## 6. Multi-write use case

**Bad:** `await runRepo.complete(...)` then `await findingRepo.insertMany(...)` as two
independent auto-committed writes — a crash between them leaves a "completed" run with
no findings.

**Good:** `await deps.uow.run(async ({ runs, findings }) => { … })`
(see `references/drizzle-postgres.md`).
