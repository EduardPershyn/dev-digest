import type { GitClient, Repo } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { JobQueue } from '../_shared/ports.js';
import type { RepoStore } from './ports.js';
import { parseRepoUrl, canonicalCloneUrl, isValidRepoRef, toRepoDto } from './helpers.js';
import { CLONE_JOB_KIND, CLONE_DEPTH, type CloneJobPayload } from './constants.js';
import {
  INDEX_JOB_KIND,
  REFRESH_JOB_KIND,
} from '../repo-intel/constants.js';

/**
 * F1 — repos service. Business logic for the Repositories feature:
 *   - add / list / refresh / remove
 *   - the asynchronous `clone` job (real `git clone` via the GitClient adapter)
 *
 * No HTTP and no raw SQL live here — persistence goes through the RepoStore
 * port, pure transforms through helpers.ts, literals through constants.ts.
 * The clone job handler is registered (and its payload parsed) in routes.ts.
 */

export type { CloneJobPayload } from './constants.js';

/** Ports the repos use cases need — wired in routes.ts. */
export interface RepoServiceDeps {
  store: RepoStore;
  git: Pick<GitClient, 'clone'>;
  jobs: JobQueue;
}

export class RepoService {
  private readonly repo: RepoStore;

  constructor(private readonly deps: RepoServiceDeps) {
    this.repo = deps.store;
  }

  /**
   * The `clone` job body: clones via the GitClient port (which authenticates
   * with the stored GitHub PAT, so private repos work), then persists the
   * resulting path + last_polled_at.
   */
  async runCloneJob(payload: CloneJobPayload): Promise<void> {
    const { repoId, owner, name } = payload;
    // Never clone `payload.url`: jobs persist in the DB, and rows enqueued
    // earlier may carry an arbitrary user-supplied URL. Rebuild it from the
    // validated owner/name instead. Auth is the GitClient adapter's concern —
    // the token is never embedded in the URL (it would land in .git/config).
    if (!isValidRepoRef(owner, name)) {
      throw new AppError('invalid_repo_url', `Refusing to clone invalid repo '${owner}/${name}'`, 400);
    }
    const { path } = await this.deps.git.clone({ owner, name }, canonicalCloneUrl(owner, name), {
      depth: CLONE_DEPTH,
    });
    await this.repo.updateClonePath(repoId, path);

    // T2.2 — kick off the indexer in the background. ENQUEUE (not call) so the
    // clone job closes immediately and the (heavier) index runs as its own
    // job under JobRunner's timeout/retry. If the handler isn't registered
    // (e.g. repo-intel disabled at module wiring), enqueue() throws — log and
    // continue so the clone result is preserved either way.
    const workspaceId = await this.repo.workspaceIdFor(repoId);
    if (workspaceId) {
      try {
        await this.deps.jobs.enqueue(workspaceId, INDEX_JOB_KIND, {
          repoId,
          owner,
          name,
        });
      } catch {
        // No handler registered or transient enqueue failure — clone has
        // already succeeded, so we don't fail the job for an index-followup
        // miss. The user can hit POST /repos/:id/reindex to retry.
      }
    }
  }

  /**
   * Add a repo: parse the URL, dedupe within the workspace, persist, and enqueue
   * the real clone (non-blocking). `created` is false when the repo already
   * existed (the caller returns 200 instead of 201).
   */
  async add(
    workspaceId: string,
    userId: string,
    url: string,
  ): Promise<{ repo: Repo; created: boolean }> {
    const { owner, name, cloneUrl } = parseRepoUrl(url);
    const fullName = `${owner}/${name}`;

    const existing = await this.repo.findByFullName(workspaceId, fullName);
    if (existing) return { repo: toRepoDto(existing), created: false };

    const row = await this.repo.insert({ workspaceId, owner, name, fullName, createdBy: userId });
    await this.deps.jobs.enqueue(workspaceId, CLONE_JOB_KIND, {
      repoId: row.id,
      owner,
      name,
      url: cloneUrl,
    } satisfies CloneJobPayload);

    return { repo: toRepoDto(row), created: true };
  }

  async list(workspaceId: string): Promise<Repo[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toRepoDto);
  }

  /** Re-fetch the clone for an existing repo (enqueues a fresh `clone` job). */
  async refresh(workspaceId: string, id: string): Promise<{ status: 'refreshing' }> {
    const repo = await this.repo.getById(workspaceId, id);
    if (!repo) throw new NotFoundError('Repo not found');
    await this.deps.jobs.enqueue(workspaceId, CLONE_JOB_KIND, {
      repoId: repo.id,
      owner: repo.owner,
      name: repo.name,
      url: canonicalCloneUrl(repo.owner, repo.name),
    } satisfies CloneJobPayload);
    // T2.2 — also enqueue an incremental refresh. The two queue positions are
    // independent (p-queue doesn't FIFO across kinds), but `runIncremental` is
    // a no-op when `currentHead === lastIndexedSha`, so ordering is safe: if
    // refresh fires before the new clone settles, it cheaply exits; if after,
    // it picks up the new HEAD.
    try {
      await this.deps.jobs.enqueue(workspaceId, REFRESH_JOB_KIND, {
        repoId: repo.id,
        owner: repo.owner,
        name: repo.name,
      });
    } catch {
      // No handler / transient enqueue failure — refresh button is best-effort.
    }
    return { status: 'refreshing' };
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const ok = await this.repo.remove(workspaceId, id);
    if (!ok) throw new NotFoundError('Repo not found');
  }
}
