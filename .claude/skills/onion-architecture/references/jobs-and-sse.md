# Background jobs and SSE

## Jobs: the handler is a driving adapter

`JobRunner` (`platform/jobs.ts`) persists jobs in Postgres and calls
`handler(payload: unknown, { jobId })`. Treat a job exactly like an HTTP request:

```ts
// constants.ts — the payload contract (domain), shared by enqueuer and handler
export const CloneJobPayload = z.object({ repoId: z.string(), owner: z.string(), name: z.string(), url: z.string().optional() });
export type CloneJobPayload = z.infer<typeof CloneJobPayload>;

// routes.ts — registration + parsing (delivery)
app.container.jobs.register(CLONE_JOB_KIND, async (payload) => {
  await service.runCloneJob(CloneJobPayload.parse(payload));
});

// service.ts — the use case (application); enqueues through the JobQueue port
export interface RepoServiceDeps {
  store: RepoStore;
  git: Pick<GitClient, 'clone'>;
  jobs: JobQueue;                     // modules/_shared/ports.ts
}
```

- Services don't register themselves on the runner — registration is wiring, so it
  belongs in `routes.ts` (repos: clone; repo-intel: index/refresh/resync with `IndexJobPayload`).
- Job payloads are `unknown`: parse with zod before calling the service.
- Payload types live in `types.ts`/`constants.ts` (domain), so the enqueuer and handler share them.

## SSE / runBus: a driven port for progress events

The review run publishes progress; the SSE route streams it. Keep the direction:

- Application code receives the bus as an injected dependency (`ReviewRunDeps.runBus`,
  typed with the `RunBus` type from `platform/sse.ts`) — never via `Container`.
- `routes.ts` subscribes to `app.container.runBus` and writes SSE frames.
- reviewer-core emits `ReviewEvent`s through a callback argument; the executor maps them to run events.

Fire-and-forget after `POST /pulls/:id/review` stays as is; the executor is an
application orchestrator and must follow the application-ring rules (no schema/rows/`Container`).
