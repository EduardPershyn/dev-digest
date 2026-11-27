/**
 * Guard: no real LLM / GitHub provider is reachable from the app the tests build.
 *
 * `server/.env` can hold a real OPENROUTER_API_KEY (loaded by `dotenv/config` in
 * `loadConfig`), and since M3 every review asks the `review_intent` model first.
 * `test/helpers/app.ts` blanks the secrets; these tests prove it, and the last one
 * fails when a new test file goes back to the raw production `buildApp`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTestApp } from './helpers/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import { ConfigError } from '../src/platform/errors.js';

const PROVIDER_KEYS = ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'GITHUB_PAT'] as const;

describe('buildTestApp — hermetic provider resolution', () => {
  const saved: Partial<Record<string, string | undefined>> = {};

  beforeEach(() => {
    // Simulate a developer `server/.env` with real keys in the test process.
    for (const k of PROVIDER_KEYS) {
      saved[k] = process.env[k];
      process.env[k] = `real-${k}-must-not-be-used`;
    }
  });
  afterEach(() => {
    for (const k of PROVIDER_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

  it('does not read provider keys from process.env', async () => {
    const app = await buildTestApp({ config: config() });
    try {
      for (const k of PROVIDER_KEYS) {
        expect(await app.container.secrets.get(k)).toBeUndefined();
      }
    } finally {
      await app.close();
    }
  });

  it.each(['openrouter', 'openai', 'anthropic'] as const)(
    'an un-injected %s provider fails with ConfigError instead of being built from a real key',
    async (id) => {
      const app = await buildTestApp({ config: config() });
      try {
        await expect(app.container.llm(id)).rejects.toBeInstanceOf(ConfigError);
      } finally {
        await app.close();
      }
    },
  );

  it('the review_intent model (default openrouter) is not reachable without an override', async () => {
    const app = await buildTestApp({ config: config(), overrides: { llm: { openai: new MockLLMProvider('openai') } } });
    try {
      // Injecting only the reviewer model must not open a path to a real OpenRouter.
      await expect(app.container.llm('openrouter')).rejects.toThrow(/OPENROUTER_API_KEY is not configured/);
    } finally {
      await app.close();
    }
  });

  it('an un-injected GitHub client fails with ConfigError instead of using a real token', async () => {
    const app = await buildTestApp({ config: config() });
    try {
      await expect(app.container.github()).rejects.toBeInstanceOf(ConfigError);
    } finally {
      await app.close();
    }
  });

  it('a test that injects its own secrets or providers still gets them', async () => {
    const llm = new MockLLMProvider('openai');
    const app = await buildTestApp({
      config: config(),
      overrides: { secrets: new MockSecretsProvider({ OPENROUTER_API_KEY: 'fake' }), llm: { openrouter: llm } },
    });
    try {
      expect(await app.container.secrets.get('OPENROUTER_API_KEY')).toBe('fake');
      expect(await app.container.llm('openrouter')).toBe(llm);
    } finally {
      await app.close();
    }
  });
});

describe('test files build the app through the hermetic helper', () => {
  it('no test file imports the production buildApp directly', () => {
    const dir = __dirname;
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.test.ts'))
      .filter((f) => /from\s+['"]\.\.\/src\/app\.js['"]/.test(readFileSync(join(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
