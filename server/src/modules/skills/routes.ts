import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  SKILL_IMPORT_MAX_BYTES,
  SkillImportRequest,
  SkillInput,
  SkillPatch,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import type { Container } from '../../platform/container.js';
import { SkillsService } from './service.js';

/**
 * M2 — skills module (specs/M2-skills.md).
 *   GET    /skills                  → library (workspace-scoped, with agent_count)
 *   GET    /skills/:id              → one skill + the agents using it
 *   POST   /skills                  → create (manual, or a confirmed import)
 *   PUT    /skills/:id              → update / toggle enabled (versions text config)
 *   DELETE /skills/:id              → delete (links cascade)
 *   GET    /skills/:id/versions     → snapshots, newest first
 *   POST   /skills/import/preview   → parse an upload → draft. STORES NOTHING.
 *
 * Bodies are `.strict()` zod schemas: a skill has no tools/scripts fields and
 * unknown keys are rejected, not dropped.
 */

/** base64 inflates by 4/3; leave headroom for the JSON envelope. */
const IMPORT_BODY_LIMIT = Math.ceil((SKILL_IMPORT_MAX_BYTES * 4) / 3) + 64 * 1024;

export function buildSkillsService(c: Container): SkillsService {
  return new SkillsService({ store: c.skillsRepo, archive: c.archiveReader, tokens: c.tokenizer });
}

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = buildSkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: SkillInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: SkillPatch } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.post(
    '/skills/import/preview',
    { bodyLimit: IMPORT_BODY_LIMIT, schema: { body: SkillImportRequest } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.previewImport(workspaceId, req.body);
    },
  );
}
