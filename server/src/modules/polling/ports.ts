import type { PrMeta } from '@devdigest/shared';
import type { RepoRecord } from '../_shared/records.js';

/**
 * F1 — polling application ports. `PollingService` depends on these; the
 * Drizzle implementation is `PollingRepository` (./repository.ts).
 */
export interface PollingStore {
  /** Repo in the workspace (tenancy-scoped). */
  getRepo(workspaceId: string, repoId: string): Promise<RepoRecord | undefined>;
  /** Idempotent import of one GitHub PR (unique repo_id + number). */
  upsertPull(workspaceId: string, repoId: string, pr: PrMeta): Promise<void>;
  /** Bump `last_polled_at` after a sync. */
  markPolled(repoId: string): Promise<void>;
}
