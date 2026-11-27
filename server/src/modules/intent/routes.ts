import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrIntentRecord, PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * M3 — Intent layer (specs/M3-intent-layer.md).
 *   GET  /pulls/:id/intent           → { intent: PrIntentRecord | null } (no GitHub / LLM call)
 *   POST /pulls/:id/intent/classify  → ONE cheap model call + ≤10 same-repo GitHub reads
 * The service is the container's shared `intentService`, so a manual classify
 * and a review's pre-work share one in-flight call per PR.
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return { intent: await container.intentService.get(workspaceId, req.params.id) };
    },
  );

  // Tight per-route limit: each call is a paid model call plus GitHub reads.
  app.post(
    '/pulls/:id/intent/classify',
    {
      schema: { params: IdParams, response: { 200: PrIntentRecord } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.intentService.classify(workspaceId, req.params.id, {
        trigger: 'manual',
        log: req.log,
      });
    },
  );
}
