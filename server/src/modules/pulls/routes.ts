import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrMeta, PrDetail, PrReviewComment } from '@devdigest/shared';
import { PrCommentInput } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import type { WarnLogger } from '../_shared/ports.js';
import { PullsRepository } from './repository.js';
import { PullsService } from './service.js';

/**
 * F1 — pulls module (HTTP adapter). PR import via Octokit (list + per-PR detail).
 *   GET  /repos/:id/pulls     → list PRs for a repo (open + recently merged/closed,
 *                               synced from GitHub, persisted). `status` is GitHub's
 *                               merge state (open/merged/closed).
 *   GET  /pulls/:id           → full PR detail (diff/files, commits, body, linked issue)
 *   GET  /pulls/:id/comments  → inline review comments (proxied live to GitHub)
 *   POST /pulls/:id/comments  → post an inline review comment to GitHub
 *
 * All logic lives in PullsService; this file only parses, resolves the
 * request context and delegates.
 */

/** Module wiring — the only place the pulls module turns the Container into ports. */
export function buildPullsService(c: Container, log: WarnLogger): PullsService {
  return new PullsService({ store: new PullsRepository(c.db), github: () => c.github(), log });
}

export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = buildPullsService(container, app.log);

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(container, req);
    return service.listForRepo(workspaceId, req.params.id);
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
    const { workspaceId } = await getContext(container, req);
    return service.detail(workspaceId, req.params.id);
  });

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listComments(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await getContext(container, req);
      return service.createComment(workspaceId, req.params.id, req.body);
    },
  );
}
