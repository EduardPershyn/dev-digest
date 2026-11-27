import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import type { Container } from '../../platform/container.js';
import { SmartDiffService } from './service.js';

/**
 * smart-diff module (M3, specs/M3-smart-diff.md).
 *   GET /pulls/:id/smart-diff → SmartDiffResponse: PR files grouped by role
 *                               (core → tests → wiring → docs → boilerplate) with the
 *                               counted finding lines per file. No model call.
 */

/** Module wiring — the only place the smart-diff module turns the Container into ports. */
export function buildSmartDiffService(c: Container): SmartDiffService {
  return new SmartDiffService({ source: c.reviewRepo });
}

export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = buildSmartDiffService(container);

  app.get('/pulls/:id/smart-diff', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.forPull(workspaceId, req.params.id);
  });
}
