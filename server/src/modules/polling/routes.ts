import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Container } from '../../platform/container.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PollingRepository } from './repository.js';
import { PollingService } from './service.js';

/**
 * F1 — polling module (HTTP adapter). MANUAL refresh that ONLY syncs the PR
 * list; it does NOT trigger any review.
 *
 *   POST /repos/:id/poll  → sync PR list from GitHub, bump last_polled_at
 */

/** Module wiring — the only place the polling module turns the Container into ports. */
export function buildPollingService(c: Container): PollingService {
  return new PollingService({ store: new PollingRepository(c.db), github: () => c.github() });
}

export default async function pollingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = buildPollingService(container);

  app.post('/repos/:id/poll', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.poll(workspaceId, req.params.id);
  });
}
