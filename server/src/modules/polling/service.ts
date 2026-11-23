import type { GitHubClient } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { PollingStore } from './ports.js';

/**
 * F1 — polling service. MANUAL refresh that ONLY syncs the PR list
 * (new/updated PRs appear, head_sha updates). It does NOT trigger any review —
 * review is manual (user presses Run Review, owned by A2).
 */

/** Ports the polling use case needs — wired in routes.ts. */
export interface PollingServiceDeps {
  store: PollingStore;
  /** Resolve the GitHub client (throws when no token is configured). */
  github: () => Promise<GitHubClient>;
}

export class PollingService {
  constructor(private readonly deps: PollingServiceDeps) {}

  async poll(workspaceId: string, repoId: string): Promise<{ synced: number; reviewTriggered: false }> {
    const { store } = this.deps;
    const repo = await store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.deps.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    let synced = 0;
    for (const pr of pulls) {
      await store.upsertPull(workspaceId, repo.id, pr);
      synced++;
    }
    await store.markPolled(repo.id);

    // NOTE: no review is triggered here — manual trigger only.
    return { synced, reviewTriggered: false };
  }
}
