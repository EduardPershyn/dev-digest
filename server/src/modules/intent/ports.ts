import type { GitHubClient, LLMProvider, UnifiedDiff } from '@devdigest/shared';
import type { IntentRecord, PullRecord, RepoRecord } from '../_shared/records.js';

/**
 * M3 — intent application ports (specs/M3-intent-layer.md). Drizzle implements
 * `IntentStore` (./repository.ts); routes.ts / the container wire the rest.
 */

/** Values written by a successful classification. */
export type IntentOkValues = Omit<IntentRecord, 'prId' | 'status' | 'error' | 'createdAt' | 'updatedAt'>;

export interface IntentStore {
  /** The PR and its repo, if the PR belongs to the workspace. */
  getPullWithRepo(
    workspaceId: string,
    prId: string,
  ): Promise<{ pull: PullRecord; repo: RepoRecord } | undefined>;
  get(prId: string): Promise<IntentRecord | undefined>;
  /** Insert or replace the row with `status: 'ok'`, `error: null`, bumping `updated_at`. */
  upsertOk(prId: string, values: IntentOkValues): Promise<IntentRecord>;
  /**
   * Record a failed classification. Inserts an empty `failed` row when none
   * exists; otherwise updates ONLY status / error / updated_at so the previous
   * content stays readable.
   */
  recordFailure(prId: string, error: string): Promise<IntentRecord>;
}

/** The PR's unified diff (the reviews `loadDiff`, wired by the container). */
export interface ChangedFilesSource {
  diff(pull: PullRecord, repo: RepoRecord): Promise<UnifiedDiff>;
}

/** Authenticated GitHub reads. `github()` rejects with ConfigError when no token is set. */
export interface IntentDocs {
  github(): Promise<Pick<GitHubClient, 'getIssue' | 'getFileContent'>>;
}

/** The workspace's `review_intent` feature model, resolved to a live provider. */
export interface IntentModel {
  resolve(workspaceId: string): Promise<{ llm: LLMProvider; provider: string; model: string }>;
}

/** Token estimate for the log line (tiktoken cl100k in the studio). */
export interface TokenCounter {
  count(text: string): number;
}

/** pino-compatible `(obj, msg)` logger. */
export interface IntentLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}
