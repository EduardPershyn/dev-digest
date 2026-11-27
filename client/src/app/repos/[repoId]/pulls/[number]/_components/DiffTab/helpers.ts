/* Pure rules for the Files changed tab (M3 Smart Diff) — tested without render(). */
import type {
  FindingRecord,
  PrFile,
  ReviewRecord,
  SmartDiffResponse,
  SmartDiffRole,
} from "@devdigest/shared";

/**
 * Findings shown in the diff — client mirror of the server rule
 * (server/src/modules/smart-diff/helpers.ts): for each agent (null agent = one
 * legacy group) keep its LATEST `kind: 'review'` review by `created_at`, then
 * union their findings. Dismissed findings are kept (rendered dimmed).
 */
export function latestReviewFindings(reviews: readonly ReviewRecord[]): FindingRecord[] {
  const latest = new Map<string | null, ReviewRecord>();
  for (const r of reviews) {
    if (r.kind !== "review") continue;
    const current = latest.get(r.agent_id);
    if (!current || Date.parse(r.created_at) > Date.parse(current.created_at)) {
      latest.set(r.agent_id, r);
    }
  }
  return [...latest.values()].flatMap((r) => r.findings);
}

/** Whether any review (kind `review`) has run on the PR yet. */
export function hasReviews(reviews: readonly ReviewRecord[] | undefined): boolean {
  return (reviews ?? []).some((r) => r.kind === "review");
}

export interface OrderedGroup {
  role: SmartDiffRole;
  files: PrFile[];
  /** Files in the group with ≥1 counted finding. */
  flaggedCount: number;
}

/**
 * Server groups mapped onto the PR's `PrFile`s (which carry the patches), in
 * the server's role order. Paths the PR detail doesn't list are dropped, and
 * so are groups left empty.
 */
export function orderedGroups(
  smart: SmartDiffResponse,
  files: readonly PrFile[],
): OrderedGroup[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const out: OrderedGroup[] = [];
  for (const g of smart.groups) {
    const groupFiles: PrFile[] = [];
    let flaggedCount = 0;
    for (const sf of g.files) {
      const file = byPath.get(sf.path);
      if (!file) continue;
      groupFiles.push(file);
      if (sf.finding_lines.length > 0) flaggedCount += 1;
    }
    if (groupFiles.length > 0) out.push({ role: g.role, files: groupFiles, flaggedCount });
  }
  return out;
}

/** Paths with ≥1 counted finding (they get the dot on their file card). */
export function flaggedPaths(smart: SmartDiffResponse | undefined): Set<string> {
  const out = new Set<string>();
  for (const g of smart?.groups ?? []) {
    for (const f of g.files) if (f.finding_lines.length > 0) out.add(f.path);
  }
  return out;
}

/** Header totals over the rendered files. */
export function diffTotals(files: readonly PrFile[]): {
  count: number;
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    additions += f.additions ?? 0;
    deletions += f.deletions ?? 0;
  }
  return { count: files.length, additions, deletions };
}
