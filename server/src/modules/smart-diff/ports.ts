import type {
  FindingRecord,
  PrFileRecord,
  PullRecord,
  ReviewRecord,
} from '../_shared/records.js';

/**
 * M3 — Smart Diff application port. Read-only view of a PR, its files and its
 * persisted reviews. Implemented by the shared `ReviewRepository`
 * (`container.reviewRepo`), wired in `routes.ts`, so this module never reaches
 * into the reviews module.
 */
export interface SmartDiffSource {
  /** Workspace-scoped PR lookup; undefined when the PR is not in the workspace. */
  getPull(workspaceId: string, prId: string): Promise<PullRecord | undefined>;
  /** PR files in GitHub order. */
  getPrFiles(prId: string): Promise<PrFileRecord[]>;
  /** Every persisted review of the PR with its findings (any order). */
  reviewsForPull(prId: string): Promise<{ review: ReviewRecord; findings: FindingRecord[] }[]>;
}
