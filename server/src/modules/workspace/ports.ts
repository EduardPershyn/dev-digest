import type { RepoRecord } from '../_shared/records.js';

/** F1 — workspace application ports (Drizzle implementation: ./repository.ts). */
export interface WorkspaceStore {
  listRepos(workspaceId: string): Promise<RepoRecord[]>;
}
