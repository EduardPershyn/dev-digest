import type {
  ConnTestRequest,
  ConnTestResult,
  GitHubClient,
  LLMProvider,
  Provider,
  SecretsProvider,
  SecretsStatus,
  Settings,
  SettingsUpdate,
} from '@devdigest/shared';
import type { SettingsStore } from './ports.js';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';
import { rowsToSettings } from './helpers.js';

/**
 * F1 — settings service: non-secret prefs, which secrets are configured, and
 * the provider connection test. Secrets are NOT stored in the DB — only via the
 * SecretsProvider port.
 */

/** Ports the settings use cases need — wired in routes.ts. */
export interface SettingsServiceDeps {
  store: SettingsStore;
  secrets: SecretsProvider;
  /** Stored-token GitHub client (throws when not configured). */
  github: () => Promise<GitHubClient>;
  /** Throwaway GitHub client for a candidate token (never cached/persisted). */
  githubWithToken: (token: string) => GitHubClient;
  /** Stored-key LLM provider (throws when not configured). */
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** Throwaway LLM provider for a candidate key (never cached/persisted). */
  llmWithKey: (provider: Provider, key: string) => Promise<LLMProvider>;
  /** Drop clients cached with the previous key after a key is saved. */
  invalidateSecretCaches: () => void;
}

export class SettingsService {
  constructor(private readonly deps: SettingsServiceDeps) {}

  async get(workspaceId: string): Promise<Settings> {
    return rowsToSettings(await this.deps.store.list(workspaceId));
  }

  async update(workspaceId: string, userId: string, patch: SettingsUpdate): Promise<Settings> {
    for (const [key, value] of Object.entries(patch)) {
      await this.deps.store.upsert(workspaceId, userId, key, value);
    }
    return this.get(workspaceId);
  }

  /** Which provider keys are configured (booleans only — values are NEVER returned). */
  async secretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) => [provider, Boolean(await this.deps.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  /**
   * Test a provider connection. S11 (security hardening): a candidate key is
   * verified with a throwaway client FIRST and persisted only if the check
   * passes — a typo must never overwrite the working key.
   */
  async testConnection({ provider, key }: ConnTestRequest): Promise<ConnTestResult> {
    const { secrets } = this.deps;
    if (key && !secrets.set) {
      return { provider, ok: false, message: 'Secrets backend is read-only' };
    }
    let message: string;
    try {
      if (provider === GITHUB_PROVIDER) {
        const gh = key ? this.deps.githubWithToken(key) : await this.deps.github();
        const login = await gh.currentLogin();
        message = `Connected as @${login}`;
      } else {
        const llm = key ? await this.deps.llmWithKey(provider, key) : await this.deps.llm(provider);
        const models = await llm.listModels();
        message = `OK — ${models.length} models available`;
      }
    } catch (err) {
      const raw = (err as Error).message;
      // Provider SDK errors can echo the key back; never return it.
      const safe = key ? raw.split(key).join('[redacted]') : raw;
      return { provider, ok: false, message: key ? `${safe} — key not saved` : safe };
    }
    if (key) {
      try {
        await secrets.set!(SECRET_KEY_BY_PROVIDER[provider], key);
        this.deps.invalidateSecretCaches();
      } catch (err) {
        return { provider, ok: false, message: `Key verified but could not be saved: ${(err as Error).message}` };
      }
    }
    return { provider, ok: true, message };
  }
}
