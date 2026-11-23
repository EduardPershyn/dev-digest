import type {
  CreateReviewCommentInput,
  GitHubClient,
  PrCommentInput,
  PrDetail,
  PrMeta,
  PrReviewComment,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { WarnLogger } from '../_shared/ports.js';
import type { PullsStore } from './ports.js';
import { deriveReviewStatus } from './status.js';
import { latestReviewIdsPerAgent, summarizeFindings, type FindingRow } from './findings-summary.js';
import { DIFF_STAT_BACKFILL_LIMIT } from './constants.js';

/**
 * F1 — pulls service. PR import via the GitHub port (list + per-PR detail),
 * local-first: every read degrades to persisted data when GitHub is
 * unavailable. Import is idempotent (unique repo_id+number). Review trigger is
 * MANUAL and owned by A2 — this module only imports/reads.
 */

/** Ports the pulls use cases need — wired in routes.ts. */
export interface PullsServiceDeps {
  store: PullsStore;
  /** Resolve the GitHub client (throws when no token is configured). */
  github: () => Promise<GitHubClient>;
  log: WarnLogger;
}

export class PullsService {
  private readonly store: PullsStore;

  constructor(private readonly deps: PullsServiceDeps) {
    this.store = deps.store;
  }

  /**
   * PR list for a repo: sync from GitHub when possible, backfill missing diff
   * stats, then enrich with the latest score, open findings and summed cost.
   */
  async listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const { log } = this.deps;
    const repo = await this.store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    let gh: GitHubClient | null = null;
    try {
      gh = await this.deps.github();
    } catch (err) {
      log.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    }

    // Local-first: sync from GitHub when a token is configured, but never
    // fail the read — already-imported/seeded PRs stay viewable offline.
    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        for (const pr of pulls) {
          await this.store.upsertFromGitHub(workspaceId, repo.id, pr);
        }
      } catch (err) {
        log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await this.store.listByRepo(repo.id);

    // Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs
    // land with zeroed size/diff. Backfill them once from the detail endpoint
    // so the list shows real S/M/L + ± counts. Capped per request (each backfill
    // is a detail fetch) — the periodic refetch chips away at any remainder.
    if (gh) {
      const needStats = rows
        .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
        .slice(0, DIFF_STAT_BACKFILL_LIMIT);
      for (const r of needStats) {
        try {
          const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
          await this.store.updateDiffStats(r.id, {
            additions: detail.additions,
            deletions: detail.deletions,
            filesCount: detail.files_count,
          });
          r.additions = detail.additions;
          r.deletions = detail.deletions;
          r.filesCount = detail.files_count;
        } catch (err) {
          log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
        }
      }
    }

    // Latest-review SCORE per PR for the list's score ring. Computed on read
    // from reviews (no FK denorm); the list is small, so one IN-query + JS
    // grouping is cheap.
    const prIds = rows.map((r) => r.id);
    const latestReviewByPr = new Map<string, { score: number | null }>();
    if (prIds.length > 0) {
      // Rows are newest-first → first seen per PR is the latest review.
      for (const rv of await this.store.reviewScoresNewestFirst(prIds)) {
        if (!latestReviewByPr.has(rv.prId)) latestReviewByPr.set(rv.prId, { score: rv.score });
      }
    }

    // FINDINGS column (specs/pr-list-findings.md): open findings from the LATEST
    // review of each agent — re-running an agent replaces its old findings, other
    // agents add up. Dismissed findings are excluded. No entry ⇒ never reviewed.
    const findingsByPr = new Map<string, ReturnType<typeof summarizeFindings>>();
    if (prIds.length > 0) {
      const latest = latestReviewIdsPerAgent(await this.store.reviewRefsNewestFirst(prIds));
      const rowsByPr = new Map<string, FindingRow[]>();
      for (const prId of latest.values()) rowsByPr.set(prId, []);
      if (latest.size > 0) {
        const findingRows = await this.store.openFindingsForReviews([...latest.keys()]);
        for (const { reviewId, ...f } of findingRows) {
          rowsByPr.get(latest.get(reviewId)!)!.push(f);
        }
      }
      for (const [prId, fRows] of rowsByPr) findingsByPr.set(prId, summarizeFindings(fRows));
    }

    // Cost column: total USD over ALL review runs of each PR (lifetime spend);
    // null when none of the PR's runs has cost data → "—" in the UI.
    const costByPr = new Map<string, number | null>();
    if (prIds.length > 0) {
      for (const row of await this.store.costByPr(workspaceId, prIds)) {
        if (row.prId) costByPr.set(row.prId, row.costUsd);
      }
    }

    const now = Date.now();
    return rows.map((r) => {
      const review = latestReviewByPr.get(r.id);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: review ? review.score : null,
        cost_usd: costByPr.get(r.id) ?? null,
        findings: findingsByPr.get(r.id) ?? null,
      };
    });
  }

  /**
   * Full PR detail. Refreshes from GitHub when a token is configured;
   * otherwise (or on any GitHub/persist error) serves the persisted
   * files/commits/body so PR detail works offline.
   */
  async detail(workspaceId: string, prId: string): Promise<PrDetail> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    try {
      const gh = await this.deps.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.store.saveDetail(pr.id, detail);
      return { ...detail, id: pr.id };
    } catch (err) {
      this.deps.log.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      const files = await this.store.listFiles(pr.id);
      const commits = await this.store.listCommits(pr.id);
      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        head_sha: pr.headSha,
        additions: pr.additions,
        deletions: pr.deletions,
        files_count: pr.filesCount,
        status: pr.status as PrDetail['status'],
        opened_at: pr.openedAt?.toISOString() ?? null,
        updated_at: pr.updatedAt?.toISOString() ?? null,
        body: pr.body ?? null,
        files: files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committed_at: c.committedAt?.toISOString() ?? null,
        })),
      };
    }
  }

  // ---- Inline review comments (Files changed tab) -------------------------
  // Proxied live to GitHub (no local persistence): list reflects existing PR
  // comments; create posts one immediately.

  async listComments(workspaceId: string, prId: string): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub client unavailable; serving no PR comments');
      return [];
    }
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async createComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    const comment: CreateReviewCommentInput = {
      commitId: pr.headSha,
      path: input.path,
      line: input.line,
      ...(input.side ? { side: input.side } : {}),
      body: input.body,
      ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
    };
    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, comment);
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }

  private async resolvePrAndRepo(workspaceId: string, prId: string) {
    const pr = await this.store.getPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.store.getRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }
}
