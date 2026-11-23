/**
 * repo-intel HTTP module.
 *
 *   GET  /repos/:id/index-state  → IndexState (always works; degraded on missing data)
 *   POST /repos/:id/resync       → enqueues a RESYNC_JOB_KIND job (202 + job id):
 *                                  fetch latest from origin + incremental reindex.
 *
 * Job-handler registration lives here (driving adapter): this plugin runs
 * once at app boot and registers the INDEX/REFRESH/RESYNC handlers so jobs
 * enqueued by `repos/service.ts` (after clone / on refresh) have a handler to
 * run against. Payloads come back from the DB as `unknown` and are parsed here.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RepoIntelService } from './service.js';
import { INDEX_JOB_KIND, IndexJobPayload, REFRESH_JOB_KIND, RESYNC_JOB_KIND } from './constants.js';
import type { IndexState } from './types.js';

export default async function repoIntelRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // Register the INDEX/REFRESH/RESYNC handlers exactly once at module load.
  // Using a local service here (instead of `container.repoIntel`) is fine — the
  // JobRunner stores the handler closure, not the service instance, and the
  // lazy `container.repoIntel` getter constructs its own service for read
  // calls. Both are built from the same ports, so behaviour is identical.
  // The handlers swallow the IndexResult on purpose — JobRunner expects
  // `Promise<void>`; progress is observable via `repo_index_state`.
  const service = new RepoIntelService(container.repoIntelDeps());
  container.jobs.register(INDEX_JOB_KIND, async (payload) => {
    await service.indexRepo(IndexJobPayload.parse(payload).repoId);
  });
  container.jobs.register(REFRESH_JOB_KIND, async (payload) => {
    await service.refreshIndex(IndexJobPayload.parse(payload).repoId);
  });
  container.jobs.register(RESYNC_JOB_KIND, async (payload) => {
    await service.resyncRepo(IndexJobPayload.parse(payload).repoId);
  });

  app.get(
    '/repos/:id/index-state',
    { schema: { params: IdParams } },
    async (req): Promise<IndexState> => {
      // Resolve tenancy so the request is workspace-scoped even though the
      // facade itself is tenant-agnostic (consistent with blast routes).
      await getContext(container, req);
      return container.repoIntel.getIndexState(req.params.id);
    },
  );

  app.post(
    '/repos/:id/resync',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      // 202 even when enqueue fails (no handler / DB hiccup) so the UI can
      // still poll /index-state without an inline error path. The actual
      // outcome shows up in `repo_index_state` once the worker runs.
      let jobId: string | null = null;
      try {
        const job = await container.jobs.enqueue(workspaceId, RESYNC_JOB_KIND, {
          repoId: req.params.id,
        });
        jobId = job.id;
      } catch {
        // swallow — degraded path
      }
      reply.code(202);
      return jobId
        ? { status: 'accepted', jobId }
        : { status: 'accepted', degraded: true, reason: 'no_handler' };
    },
  );
}
