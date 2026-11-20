import type { PrFindingPreview, PrFindingsSummary, Severity } from '@devdigest/shared';

/**
 * PR-list FINDINGS column (specs/pr-list-findings.md). Pure helpers so the
 * "latest review per agent" rule and the preview shaping are unit-testable
 * without a database.
 */

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

export const FINDINGS_PREVIEW_TOP_N = 5;
export const FINDINGS_PREVIEW_RATIONALE_MAX = 220;

export interface ReviewRef {
  id: string;
  prId: string;
  agentId: string | null;
}

/**
 * From reviews sorted NEWEST FIRST, keep the first (= latest) per (PR, agent).
 * Reviews without an agent (legacy rows) share one group per PR.
 * Returns reviewId → prId for the kept reviews.
 */
export function latestReviewIdsPerAgent(reviewsNewestFirst: ReviewRef[]): Map<string, string> {
  const seen = new Set<string>();
  const kept = new Map<string, string>();
  for (const r of reviewsNewestFirst) {
    const key = `${r.prId}:${r.agentId ?? '∅'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.set(r.id, r.prId);
  }
  return kept;
}

export interface FindingRow {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  confidence: number;
  rationale: string;
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

function isSeverity(s: string): s is Severity {
  return s in SEVERITY_RANK;
}

/**
 * Counts per contract severity + a preview of the most important findings
 * (severity, then confidence desc). Rows with a severity outside the contract
 * are ignored.
 */
export function summarizeFindings(
  rows: FindingRow[],
  { topN = FINDINGS_PREVIEW_TOP_N, rationaleMax = FINDINGS_PREVIEW_RATIONALE_MAX } = {},
): PrFindingsSummary {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  const valid: (FindingRow & { severity: Severity })[] = [];
  for (const r of rows) {
    if (!isSeverity(r.severity)) continue;
    counts[r.severity] += 1;
    valid.push(r as FindingRow & { severity: Severity });
  }
  valid.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.confidence - a.confidence,
  );
  const top: PrFindingPreview[] = valid.slice(0, topN).map((r) => ({
    id: r.id,
    severity: r.severity,
    category: r.category,
    title: r.title,
    file: r.file,
    start_line: r.startLine,
    end_line: r.endLine,
    confidence: r.confidence,
    rationale: truncate(r.rationale, rationaleMax),
  }));
  return { counts, total: valid.length, top };
}
