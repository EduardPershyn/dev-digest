import type { ConventionCandidate, ConventionList, ConventionStatus } from '@devdigest/shared';
import type { ConventionRecord } from '../_shared/records.js';

/**
 * M2 — conventions DTO mapping + ordering (pure, domain ring).
 */

export interface RepoLinkInfo {
  fullName: string;
  defaultBranch: string;
}

const STATUS_ORDER: Record<ConventionStatus, number> = { pending: 0, accepted: 1, rejected: 2 };

/**
 * GitHub blob link at the evidence lines, pinned to the commit the evidence
 * was read from (falls back to the default branch for rows without one).
 */
export function evidenceUrl(
  repo: RepoLinkInfo,
  row: Pick<ConventionRecord, 'evidencePath' | 'evidenceStartLine' | 'evidenceEndLine' | 'evidenceSha'>,
): string | null {
  if (!row.evidencePath || row.evidenceStartLine === null) return null;
  const path = row.evidencePath.split('/').map(encodeURIComponent).join('/');
  const ref = encodeURIComponent(row.evidenceSha ?? repo.defaultBranch);
  const end = row.evidenceEndLine ?? row.evidenceStartLine;
  const anchor =
    end === row.evidenceStartLine ? `#L${row.evidenceStartLine}` : `#L${row.evidenceStartLine}-L${end}`;
  return `https://github.com/${repo.fullName}/blob/${ref}/${path}${anchor}`;
}

export function toConventionDto(row: ConventionRecord, repo: RepoLinkInfo): ConventionCandidate {
  return {
    id: row.id,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: Math.min(1, Math.max(0, row.confidence ?? 0)),
    accepted: row.status === 'accepted',
    status: row.status,
    category: row.category,
    evidence_start_line: row.evidenceStartLine,
    evidence_end_line: row.evidenceEndLine,
    evidence_url: evidenceUrl(repo, row),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** pending → accepted → rejected; confidence desc; then rule for stability. */
export function sortConventions<T extends Pick<ConventionRecord, 'status' | 'confidence' | 'rule'>>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (b.confidence ?? 0) - (a.confidence ?? 0) ||
      a.rule.localeCompare(b.rule),
  );
}

export function toConventionList(rows: readonly ConventionRecord[], repo: RepoLinkInfo): ConventionList {
  const last = rows.reduce<Date | null>(
    (max, r) => (max === null || r.createdAt > max ? r.createdAt : max),
    null,
  );
  return {
    candidates: sortConventions(rows).map((r) => toConventionDto(r, repo)),
    last_scan_at: last ? last.toISOString() : null,
  };
}
