import type { SmartDiff, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import type { FindingRecord, PrFileRecord, ReviewRecord } from '../_shared/records.js';
import { DEFAULT_ROLE, ROLE_RULES, SMART_DIFF_ROLE_ORDER } from './constants.js';

/**
 * M3 — Smart Diff domain rules (pure; no I/O). Spec: specs/M3-smart-diff.md.
 * HTTP-free on purpose so later milestones (L08) can reuse the classifier.
 */

/** Role of a changed file. First matching rule wins; no match → `core`. */
export function classifyFile(path: string): SmartDiffRole {
  const p = path.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const rule of ROLE_RULES) {
    if (rule.patterns.some((re) => re.test(p))) return rule.role;
  }
  return DEFAULT_ROLE;
}

export interface ReviewWithFindings {
  review: ReviewRecord;
  findings: FindingRecord[];
}

/**
 * Findings that count for the PR right now: for each agent (null agent = one
 * legacy group) keep only its LATEST `kind: 'review'` review by `createdAt`,
 * then union their findings. Independent of input order. Dismissed findings are
 * still returned — callers decide whether they count (`isCountedFinding`).
 */
export function latestReviewFindings(rows: readonly ReviewWithFindings[]): FindingRecord[] {
  const latest = new Map<string | null, ReviewWithFindings>();
  for (const row of rows) {
    if (row.review.kind !== 'review') continue;
    const key = row.review.agentId;
    const current = latest.get(key);
    if (!current || row.review.createdAt.getTime() > current.review.createdAt.getTime()) {
      latest.set(key, row);
    }
  }
  return [...latest.values()].flatMap((r) => r.findings);
}

/** A dismissed finding is shown (dimmed) but never counted. */
export function isCountedFinding(f: Pick<FindingRecord, 'dismissedAt'>): boolean {
  return f.dismissedAt === null;
}

/**
 * Group files by role in display order (empty groups omitted, files keep the
 * input = GitHub order). `finding_lines` = sorted unique start lines of the
 * counted findings on that file. `pseudocode_summary` and a real split
 * suggestion are out of scope for M3.
 */
export function buildSmartDiff(
  files: readonly PrFileRecord[],
  findings: readonly FindingRecord[],
): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const f of findings) {
    if (!isCountedFinding(f)) continue;
    let set = linesByFile.get(f.file);
    if (!set) linesByFile.set(f.file, (set = new Set()));
    set.add(f.startLine);
  }

  const byRole = new Map<SmartDiffRole, SmartDiffGroup['files']>();
  let totalLines = 0;
  for (const file of files) {
    totalLines += file.additions + file.deletions;
    const role = classifyFile(file.path);
    let list = byRole.get(role);
    if (!list) byRole.set(role, (list = []));
    list.push({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: [...(linesByFile.get(file.path) ?? [])].sort((a, b) => a - b),
    });
  }

  const groups: SmartDiffGroup[] = [];
  for (const role of SMART_DIFF_ROLE_ORDER) {
    const list = byRole.get(role);
    if (list && list.length > 0) groups.push({ role, files: list });
  }

  return {
    groups,
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
