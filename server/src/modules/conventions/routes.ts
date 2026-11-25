import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionPatch, ConventionSkillDraftRequest } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import type { Container } from '../../platform/container.js';
import { listContainedDir, readContainedFile } from '../../platform/contained-read.js';
import { loadPromptTemplate } from '../../platform/prompts.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { SYSTEM_PROMPT_TEMPLATE } from './constants.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService, type ConventionsServiceDeps } from './service.js';

/**
 * M2 — Conventions Extractor (specs/M2-conventions.md).
 *   GET  /repos/:id/conventions                    → candidates + last scan
 *   POST /repos/:id/conventions/extract            → ONE model call, validated evidence
 *   PUT  /repos/:id/conventions/:conventionId      → status / rule
 *   POST /repos/:id/conventions/skill-draft        → draft from ACCEPTED rows (stores nothing)
 * Saving the skill is the existing POST /skills (source 'extracted').
 */

const ConventionParams = IdParams.extend({ conventionId: z.string().uuid() });

export function buildConventionsService(
  c: Container,
  log: ConventionsServiceDeps['log'],
): ConventionsService {
  return new ConventionsService({
    store: new ConventionsRepository(c.db),
    samples: c.repoIntel,
    checkout: {
      read: (clonePath, rel) => readContainedFile(clonePath, rel),
      list: (clonePath, rel) => listContainedDir(clonePath, rel),
      head: async (repo) => {
        try {
          return await c.git.currentHead(repo);
        } catch {
          return null;
        }
      },
    },
    model: {
      resolve: async (workspaceId) => {
        const choice = await resolveFeatureModel(c.settingsRepo, workspaceId, 'conventions');
        return { llm: await c.llm(choice.provider), model: choice.model };
      },
    },
    skillNames: c.skillsRepo,
    systemPrompt: () => loadPromptTemplate(SYSTEM_PROMPT_TEMPLATE),
    log,
  });
}

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = buildConventionsService(app.container, app.log);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.put(
    '/repos/:id/conventions/:conventionId',
    { schema: { params: ConventionParams, body: ConventionPatch } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.update(workspaceId, req.params.id, req.params.conventionId, req.body);
    },
  );

  app.post(
    '/repos/:id/conventions/skill-draft',
    { schema: { params: IdParams, body: ConventionSkillDraftRequest } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.skillDraft(workspaceId, req.params.id, req.body ?? {});
    },
  );
}
