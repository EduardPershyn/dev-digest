import type { FastifyInstance } from 'fastify';
import { buildApp, type BuildAppOptions } from '../../src/app.js';
import { MockSecretsProvider } from '../../src/adapters/mocks.js';

/**
 * Hermetic `buildApp` for tests.
 *
 * `loadConfig` imports `dotenv/config`, so `server/.env` (which may hold a REAL
 * `OPENROUTER_API_KEY`) lands in `process.env`; the production
 * `LocalSecretsProvider` falls back to `process.env` AND reads
 * `~/.devdigest/secrets.json`. Since M3 every review first asks the
 * `review_intent` model (default openrouter), so a test that did not override
 * `llm.openrouter` would make a real, paid call.
 *
 * This builder defaults `overrides.secrets` to an EMPTY in-memory provider, so
 * every provider/GitHub client a test did not inject fails fast with
 * `ConfigError` ("… is not configured") instead of reaching the network. A test
 * that needs a key passes its own `secrets`; a test that needs a model passes
 * `overrides.llm`.
 */
export function hermeticOverrides(
  overrides: BuildAppOptions['overrides'] = {},
): NonNullable<BuildAppOptions['overrides']> {
  return { ...overrides, secrets: overrides.secrets ?? new MockSecretsProvider({}) };
}

export function buildTestApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  return buildApp({ ...opts, overrides: hermeticOverrides(opts.overrides) });
}
