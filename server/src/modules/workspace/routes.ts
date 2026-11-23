import type { FastifyInstance } from 'fastify';
import type { Container } from '../../platform/container.js';
import { getContext } from '../_shared/context.js';
import { WorkspaceRepository } from './repository.js';
import { WorkspaceService } from './service.js';

/**
 * F1 — workspace module (HTTP adapter).
 *   GET /workspace        → workspace info + cloneDir + cloned repos summary
 */

/** Module wiring — the only place the workspace module turns the Container into ports. */
export function buildWorkspaceService(c: Container): WorkspaceService {
  return new WorkspaceService({ store: new WorkspaceRepository(c.db), cloneDir: c.config.cloneDir });
}

export default async function workspaceRoutes(app: FastifyInstance) {
  const { container } = app;
  const service = buildWorkspaceService(container);

  app.get('/workspace', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.overview(workspaceId);
  });
}
