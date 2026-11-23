# Examples — bad (real DevDigest code) vs. good

## 1. Route doing persistence + orchestration

**Bad** — `modules/polling/routes.ts` (today):

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

**Good:**

```ts
// polling/ports.ts
export interface PollingStore {
  findRepo(workspaceId: string, repoId: string): Promise<RepoRef & { id: string } | undefined>;
  upsertPulls(workspaceId: string, repoId: string, pulls: RemotePull[]): Promise<number>;
}

// polling/service.ts
export interface PollingServiceDeps { store: PollingStore; github: () => Promise<GitHubClient> }
export class PollingService {
  constructor(private deps: PollingServiceDeps) {}
  async poll(workspaceId: string, repoId: string): Promise<{ synced: number }> {
    const repo = await this.deps.store.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const gh = await this.deps.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    return { synced: await this.deps.store.upsertPulls(workspaceId, repo.id, pulls) };
  }
}

// polling/routes.ts
const buildPollingService = (c: Container) =>
  new PollingService({ store: new PollingRepository(c.db), github: () => c.github() });

app.post('/repos/:id/poll', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.poll(workspaceId, req.params.id);
});
```

## 2. Service pulling its own dependencies from the Container

**Bad** — `modules/repos/service.ts` (today):

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

**Good:**

```ts
export interface RepoServiceDeps {
  store: RepoStore;                       // port from ./ports.ts
  git: GitClient;                         // port from @devdigest/shared
  jobs: Pick<JobRunner, 'enqueue'>;
  secrets: SecretsProvider;
}
export class RepoService {
  constructor(private deps: RepoServiceDeps) {}
}
```

## 3. Domain helper typed against DB rows

**Bad** — `modules/repos/helpers.ts` (today) imports `* as t from '../../db/schema.js'` to
type `toRepoDto(row)`; `reviews/helpers.ts` imports `FindingRow, PullRow` from `./repository.js`.

**Good:** the repository maps `row → Repo` (the shared contract type) with a private
`toRepo()`; helpers operate on `Repo`/`Finding` only. The domain ring then has no idea
what a row is.

## 4. reviewer-core staying pure

**Good** (today) — the engine takes everything as arguments:

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

**Bad:** `service.registerCloneJobHandler()` — the use case registers itself on the runner
and receives `payload: unknown` unchecked.

**Good:** `routes.ts` registers and parses; the service method takes a typed `CloneJob`
(see `references/jobs-and-sse.md`).

## 6. Multi-write use case

**Bad:** `await runRepo.complete(...)` then `await findingRepo.insertMany(...)` as two
independent auto-committed writes — a crash between them leaves a "completed" run with
no findings.

**Good:** `await deps.uow.run(async ({ runs, findings }) => { … })`
(see `references/drizzle-postgres.md`).
