import type { PrDetail, PrMeta } from '@devdigest/shared';
import type { PrFileRecord, PullRecord, RepoRecord } from '../_shared/records.js';
import type { FindingRow, ReviewRef } from './findings-summary.js';

/**
 * F1 — pulls application ports. `PullsService` depends on these; the Drizzle
 * implementation is `PullsRepository` (./repository.ts).
 */

export interface PrDiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

export interface PrCommitRecord {
  sha: string;
  message: string;
  author: string;
  committedAt: Date | null;
}

export interface PullsStore {
  /** Repo in the workspace (tenancy-scoped). */
  getRepo(workspaceId: string, repoId: string): Promise<RepoRecord | undefined>;
  /** Repo by id (the caller already scoped the PR that points at it). */
  getRepoById(repoId: string): Promise<RepoRecord | undefined>;
  /** PR in the workspace (tenancy-scoped). */
  getPull(workspaceId: string, prId: string): Promise<PullRecord | undefined>;
  /** Idempotent import of one GitHub PR (unique repo_id + number). */
  upsertFromGitHub(workspaceId: string, repoId: string, pr: PrMeta): Promise<void>;
  listByRepo(repoId: string): Promise<PullRecord[]>;
  updateDiffStats(prId: string, stats: PrDiffStats): Promise<void>;
  /** Latest-first `review`-kind scores for the PRs. */
  reviewScoresNewestFirst(prIds: string[]): Promise<{ prId: string; score: number | null }[]>;
  /** Latest-first `review`-kind review refs for the PRs. */
  reviewRefsNewestFirst(prIds: string[]): Promise<ReviewRef[]>;
  /** Non-dismissed findings of the given reviews. */
  openFindingsForReviews(reviewIds: string[]): Promise<(FindingRow & { reviewId: string })[]>;
  /** Summed run cost per PR (null when no run of the PR has cost data). */
  costByPr(workspaceId: string, prIds: string[]): Promise<{ prId: string | null; costUsd: number | null }[]>;
  /** Persist a fresh GitHub detail: replace files + commits, update body + diff stats. */
  saveDetail(prId: string, detail: PrDetail): Promise<void>;
  listFiles(prId: string): Promise<PrFileRecord[]>;
  listCommits(prId: string): Promise<PrCommitRecord[]>;
}
