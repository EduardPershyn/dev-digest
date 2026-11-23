import type { WorkspaceStore } from './ports.js';

/**
 * F1 — workspace manager: where clones live + a summary of cloned repos.
 * Cleanup/re-pull of individual repos is handled by the repos module
 * (refresh/delete); this gives the UI an overview.
 */

/** Ports the workspace use case needs — wired in routes.ts. */
export interface WorkspaceServiceDeps {
  store: WorkspaceStore;
  /** Absolute directory clones live under (from config). */
  cloneDir: string;
}

export interface WorkspaceOverview {
  workspaceId: string;
  cloneDir: string;
  repos: {
    id: string;
    full_name: string;
    clone_path: string | null;
    last_polled_at: string | null;
    cloned: boolean;
  }[];
}

export class WorkspaceService {
  constructor(private readonly deps: WorkspaceServiceDeps) {}

  async overview(workspaceId: string): Promise<WorkspaceOverview> {
    const repos = await this.deps.store.listRepos(workspaceId);
    return {
      workspaceId,
      cloneDir: this.deps.cloneDir,
      repos: repos.map((r) => ({
        id: r.id,
        full_name: r.fullName,
        clone_path: r.clonePath,
        last_polled_at: r.lastPolledAt?.toISOString() ?? null,
        cloned: Boolean(r.clonePath),
      })),
    };
  }
}
