import type { SettingsRow } from './helpers.js';

/**
 * F1 — settings application ports. The Drizzle implementation is
 * `SettingsRepository` (./repository.ts); the Container exposes one shared
 * instance (`container.settingsRepo`) for feature-model resolution in other modules.
 */
export interface SettingsStore {
  /** All non-secret pref rows of a workspace. */
  list(workspaceId: string): Promise<SettingsRow[]>;
  /** Insert or overwrite one pref for (workspace, user, key). */
  upsert(workspaceId: string, userId: string, key: string, value: unknown): Promise<void>;
}

/** Read-only view used by feature-model resolution. */
export type SettingsReader = Pick<SettingsStore, 'list'>;
