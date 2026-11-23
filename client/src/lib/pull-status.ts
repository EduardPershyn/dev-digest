/* pull-status.ts — business rules about a PR's review status, shared by the PR
   list page (header counts) and the app shell (sidebar badge). Pure — no React,
   no fetch — so the rules are unit-tested once instead of re-derived per view. */
import type { PrStatus } from "@devdigest/shared";

/** Open PRs carry a derived review status; every other status is merged/closed. */
export const OPEN_PR_STATUSES: ReadonlySet<PrStatus> = new Set<PrStatus>(["needs_review", "reviewed", "stale"]);

type WithStatus = { status: PrStatus };

/** Number of PRs that are still open (needs review, reviewed or stale). */
export function countOpenPulls(pulls: readonly WithStatus[] | null | undefined): number {
  return (pulls ?? []).filter((p) => OPEN_PR_STATUSES.has(p.status)).length;
}

/** Number of PRs that still need a review — the most actionable count. */
export function countNeedsReview(pulls: readonly WithStatus[] | null | undefined): number {
  return (pulls ?? []).filter((p) => p.status === "needs_review").length;
}
