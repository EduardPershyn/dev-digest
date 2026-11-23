# Background jobs and SSE

## Jobs: the handler is a driving adapter

`JobRunner` (`platform/jobs.ts`) persists jobs in Postgres and calls
`handler(payload: unknown, { jobId })`. Treat a job exactly like an HTTP request:

```ts
// routes.ts — registration + parsing (delivery)
const CloneJobPayload = z.object({ repoId: z.string().uuid(), owner: z.string(), name: z.string(), url: z.string().url() });

app.container.jobs.register(CLONE_JOB_KIND, async (payload) => {
  await service.clone(CloneJobPayload.parse(payload));
});

// service.ts — the use case (application)
async clone(job: CloneJob): Promise<void> { /* ports only */ }

// enqueueing from a use case — through a narrow type, not the concrete runner
export interface RepoServiceDeps {
  store: RepoStore;
  git: GitClient;
  jobs: Pick<JobRunner, 'enqueue'>;   // type-only import of platform/jobs
  secrets: SecretsProvider;
}
```

- Services don't register themselves on the runner (today's `registerCloneJobHandler()` is
  legacy) — registration is wiring, so it belongs in `routes.ts`.
- Job payloads are `unknown`: parse with zod before calling the service.
- Payload types live in `types.ts`/`constants.ts` (domain), so the enqueuer and handler share them.

## SSE / runBus: a driven port for progress events

The review run publishes progress; the SSE route streams it. Keep the direction:

- Application code publishes through a port: `events: { publish(runId: string, e: RunEvent): void }`
  (structurally satisfied by `runBus`). `RunEvent` is a domain type.
- `routes.ts` subscribes to `app.container.runBus` and writes SSE frames.
- reviewer-core emits `ReviewEvent`s through a callback argument; the executor maps them to run events.

Fire-and-forget after `POST /pulls/:id/review` stays as is; the executor is an
application orchestrator and must follow the application-ring rules (no schema/rows/`Container`).
