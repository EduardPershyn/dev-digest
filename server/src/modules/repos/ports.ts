import type { RepoRecord } from '../_shared/records.js';

/**
 * F1 — repos application ports. `RepoService` depends on these; the Drizzle
 * implementation is `RepoRepository` (./repository.ts).
 */

export interface NewRepo {
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  createdBy: string;
}

/** Persistence of the `repos` aggregate. Every read is workspace-scoped except the job follow-ups. */
export interface RepoStore {
  findByFullName(workspaceId: string, fullName: string): Promise<RepoRecord | undefined>;
  list(workspaceId: string): Promise<RepoRecord[]>;
  getById(workspaceId: string, id: string): Promise<RepoRecord | undefined>;
  insert(values: NewRepo): Promise<RepoRecord>;
  /** Owning workspace of a repo (unscoped — only the clone job uses it); null if deleted. */
  workspaceIdFor(repoId: string): Promise<string | null>;
  /** Persist the clone path and bump `last_polled_at` once a clone completes. */
  updateClonePath(repoId: string, clonePath: string): Promise<void>;
  remove(workspaceId: string, id: string): Promise<boolean>;
}
