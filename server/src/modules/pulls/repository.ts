import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { PrDetail, PrMeta } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow, RepoRow, PrFileRow } from '../../db/rows.js';
import type { FindingRow, ReviewRef } from './findings-summary.js';
import type { PrCommitRecord, PrDiffStats, PullsStore } from './ports.js';

/**
 * F1 — pulls data-access. The ONLY place the pulls module touches the DB:
 * PR import/upsert, PR files/commits, and the read-side aggregates the PR list
 * shows (latest scores, open findings, summed cost). Tenancy is enforced on the
 * repo/PR lookups that start every use case.
 */
export class PullsRepository implements PullsStore {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [repo] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return repo;
  }

  async getRepoById(repoId: string): Promise<RepoRow | undefined> {
    const [repo] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return repo;
  }

  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [pr] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return pr;
  }

  async upsertFromGitHub(workspaceId: string, repoId: string, pr: PrMeta): Promise<void> {
    await this.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        headSha: pr.head_sha,
        additions: pr.additions,
        deletions: pr.deletions,
        filesCount: pr.files_count,
        status: pr.status,
        openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
        updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
      })
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: {
          title: pr.title,
          headSha: pr.head_sha,
          status: pr.status,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        },
      });
  }

  async listByRepo(repoId: string): Promise<PullRow[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  async updateDiffStats(prId: string, stats: PrDiffStats): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ additions: stats.additions, deletions: stats.deletions, filesCount: stats.filesCount })
      .where(eq(t.pullRequests.id, prId));
  }

  async reviewScoresNewestFirst(prIds: string[]): Promise<{ prId: string; score: number | null }[]> {
    return this.db
      .select({ prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  async reviewRefsNewestFirst(prIds: string[]): Promise<ReviewRef[]> {
    return this.db
      .select({ id: t.reviews.id, prId: t.reviews.prId, agentId: t.reviews.agentId })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  async openFindingsForReviews(reviewIds: string[]): Promise<(FindingRow & { reviewId: string })[]> {
    return this.db
      .select({
        reviewId: t.findings.reviewId,
        id: t.findings.id,
        severity: t.findings.severity,
        category: t.findings.category,
        title: t.findings.title,
        file: t.findings.file,
        startLine: t.findings.startLine,
        endLine: t.findings.endLine,
        confidence: t.findings.confidence,
        rationale: t.findings.rationale,
      })
      .from(t.findings)
      .where(and(inArray(t.findings.reviewId, reviewIds), isNull(t.findings.dismissedAt)));
  }

  async costByPr(
    workspaceId: string,
    prIds: string[],
  ): Promise<{ prId: string | null; costUsd: number | null }[]> {
    // SQL sum() skips runs without cost data (failed/cancelled/unpriced/legacy)
    // and yields NULL when none of the PR's runs has any.
    return this.db
      .select({
        prId: t.agentRuns.prId,
        costUsd: sql<number | null>`sum(${t.agentRuns.costUsd})`.mapWith(Number),
      })
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), inArray(t.agentRuns.prId, prIds)))
      .groupBy(t.agentRuns.prId);
  }

  async saveDetail(prId: string, detail: PrDetail): Promise<void> {
    await this.db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    if (detail.files.length > 0) {
      await this.db.insert(t.prFiles).values(
        detail.files.map((f) => ({
          prId,
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
      );
    }
    await this.db.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
    if (detail.commits.length > 0) {
      await this.db.insert(t.prCommits).values(
        detail.commits.map((c) => ({
          prId,
          sha: c.sha,
          message: c.message,
          author: c.author,
          committedAt: c.committed_at ? new Date(c.committed_at) : null,
        })),
      );
    }
    await this.db
      .update(t.pullRequests)
      .set({
        body: detail.body ?? null,
        // Diff stats aren't on GitHub's PR-list payload — backfill them from
        // the detail fetch so the Pull Requests list shows real size/files.
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      })
      .where(eq(t.pullRequests.id, prId));
  }

  async listFiles(prId: string): Promise<PrFileRow[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  async listCommits(prId: string): Promise<PrCommitRecord[]> {
    return this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
  }
}
