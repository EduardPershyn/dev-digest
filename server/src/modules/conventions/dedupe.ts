import type { ValidConvention } from './evidence.js';

/**
 * M2 — re-scan de-duplication (pure). A new candidate is skipped when it
 * repeats a decided (accepted/rejected) convention or one already kept from
 * the same batch:
 *  - same normalized rule text, or
 *  - same evidence path with an overlapping line range AND the same category
 *    (a rephrased rule about the same code). Different categories citing the
 *    same lines are distinct conventions (one handler can show several).
 */

export interface DecidedConvention {
  rule: string;
  category: string | null;
  evidencePath: string | null;
  evidenceStartLine: number | null;
  evidenceEndLine: number | null;
}

/** Lower-case, collapsed whitespace, no trailing punctuation. */
export function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.!?;:,]+$/, '');
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function isDuplicate(c: ValidConvention, other: DecidedConvention): boolean {
  if (normalizeRule(c.rule) === normalizeRule(other.rule)) return true;
  if (
    other.evidencePath !== c.evidencePath ||
    other.evidenceStartLine === null ||
    other.evidenceEndLine === null
  ) {
    return false;
  }
  const sameCategory = (c.category ?? null) === (other.category ?? null);
  return (
    sameCategory &&
    overlaps(c.startLine, c.endLine, other.evidenceStartLine, other.evidenceEndLine)
  );
}

const asDecided = (c: ValidConvention): DecidedConvention => ({
  rule: c.rule,
  category: c.category,
  evidencePath: c.evidencePath,
  evidenceStartLine: c.startLine,
  evidenceEndLine: c.endLine,
});

export function dropDuplicates(
  candidates: readonly ValidConvention[],
  decided: readonly DecidedConvention[],
): { kept: ValidConvention[]; skipped: number } {
  const kept: ValidConvention[] = [];
  let skipped = 0;
  for (const c of candidates) {
    const dup =
      decided.some((d) => isDuplicate(c, d)) || kept.some((k) => isDuplicate(c, asDecided(k)));
    if (dup) skipped++;
    else kept.push(c);
  }
  return { kept, skipped };
}
