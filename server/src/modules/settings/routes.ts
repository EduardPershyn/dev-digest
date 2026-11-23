import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  SettingsUpdate,
  ConnTestRequest,
  type ConnTestResult,
  type SecretsStatus,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { getContext } from '../_shared/context.js';
import { SettingsService } from './service.js';

/**
 * F1 — settings module (HTTP adapter).
 *   GET  /settings                 → current non-secret prefs
 *   GET  /settings/secrets-status  → which provider keys are configured (booleans)
 *   PUT  /settings                 → upsert prefs (key/value rows)
 *   POST /settings/test-connection → test a provider key (OpenAI/Anthropic/OpenRouter/GitHub)
 *
 * Secrets are NOT stored here — only non-secret prefs. test-connection reads
 * the key via SecretsProvider and does a cheap live call (listModels / GET user).
 */

/** Module wiring — the only place the settings module turns the Container into ports. */
export function buildSettingsService(c: Container): SettingsService {
  return new SettingsService({
    store: c.settingsRepo,
    secrets: c.secrets,
    github: () => c.github(),
    githubWithToken: (token) => c.githubWithToken(token),
    llm: (provider) => c.llm(provider),
    llmWithKey: (provider, key) => c.llmWithKey(provider, key),
    invalidateSecretCaches: () => c.invalidateSecretCaches(),
  });
}

export default async function settingsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = buildSettingsService(container);

  app.get('/settings', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId);
  });

  app.get('/settings/secrets-status', async (req): Promise<SecretsStatus> => {
    await getContext(container, req);
    return service.secretsStatus();
  });

  app.put('/settings', { schema: { body: SettingsUpdate } }, async (req) => {
    const { workspaceId, userId } = await getContext(container, req);
    return service.update(workspaceId, userId, req.body);
  });

  app.post(
    '/settings/test-connection',
    {
      schema: { body: ConnTestRequest },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req): Promise<ConnTestResult> => service.testConnection(req.body),
  );
}
