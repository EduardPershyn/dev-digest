import type { LLMProvider } from '@devdigest/shared';
import type { ConventionRecord, RepoRecord } from '../_shared/records.js';
import type { DirEntry } from './sampling.js';

/**
 * M2 — conventions application ports (specs/M2-conventions.md).
 * Drizzle implements `ConventionStore` (./repository.ts); routes.ts wires the
 * rest from the container (repo-intel, contained file reads, git, LLM).
 */

export interface NewConvention {
  rule: string;
  category: string | null;
  evidencePath: string;
  evidenceSnippet: string;
  evidenceStartLine: number;
  evidenceEndLine: number;
  evidenceSha: string | null;
  confidence: number;
}

export interface ConventionPatchValues {
  status?: ConventionRecord['status'];
  rule?: string;
}

/** Persistence of convention candidates. Always workspace-scoped. */
export interface ConventionStore {
  /** The repo, if it belongs to the workspace. */
  findRepo(workspaceId: string, repoId: string): Promise<RepoRecord | undefined>;
  listByRepo(workspaceId: string, repoId: string): Promise<ConventionRecord[]>;
  /** Writes `status`, the `accepted` mirror, `rule` and `updated_at` in one UPDATE. */
  update(
    workspaceId: string,
    repoId: string,
    id: string,
    patch: ConventionPatchValues,
  ): Promise<ConventionRecord | undefined>;
  /** One transaction: delete the repo's `pending` rows, insert `rows` as pending. */
  replacePending(workspaceId: string, repoId: string, rows: NewConvention[]): Promise<void>;
}

/** Ranked file sampling (structurally `RepoIntel['getConventionSamples']`). */
export interface SampleSource {
  getConventionSamples(repoId: string, n: number): Promise<string[]>;
}

/** Read-only access to a repo's clone. Every method degrades instead of throwing. */
export interface RepoCheckout {
  /** File text, or null when it can't be read safely (escape, missing, too big). */
  read(clonePath: string, rel: string): Promise<string | null>;
  /** Direct children of `rel` ('' = root); [] when unreadable. Symlinks are not dirs. */
  list(clonePath: string, rel: string): Promise<DirEntry[]>;
  /** HEAD commit of the clone, or null. */
  head(repo: { owner: string; name: string }): Promise<string | null>;
}

/** The workspace's Conventions feature model, resolved to a live provider. */
export interface ConventionModel {
  resolve(workspaceId: string): Promise<{ llm: LLMProvider; model: string }>;
}

/** Skill names already used in the workspace (structurally `SkillStore.list`). */
export interface SkillNameSource {
  list(workspaceId: string): Promise<{ name: string }[]>;
}

/** pino-compatible `(obj, msg)` logger; routes pass `app.log`. */
export interface ConventionsLogger {
  info(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}
