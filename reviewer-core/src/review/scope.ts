import type { Finding, Severity } from '@devdigest/shared';

/**
 * M3 — intent scope filter. Pure; runs in `reviewPullRequest` AFTER citation
 * grounding and only when the prompt carried a PR intent.
 *
 * - `in_scope !== false` (true or untagged) → kept.
 * - out-of-scope WARNING / SUGGESTION → hidden (reported in the trace, not persisted).
 * - out-of-scope CRITICAL → collapsed into ONE `scope_notice` CRITICAL finding,
 *   so a serious defect is never dropped by a (possibly injected) scope claim.
 */

/** Severity that is collapsed into the notice instead of being hidden. */
export const SCOPE_COLLAPSE_SEVERITY: Severity = 'CRITICAL';

/** Id of the synthetic notice finding. */
export const SCOPE_NOTICE_ID = 'scope-notice';

const RATIONALE_EXCERPT_CHARS = 200;

export interface IntentScopeResult {
  /** Findings to persist (in-scope + untagged + at most one notice, last). */
  kept: Finding[];
  /** Out-of-scope WARNING / SUGGESTION findings removed from the review. */
  hidden: Finding[];
  /** Out-of-scope CRITICAL findings folded into the notice. */
  collapsed: Finding[];
  /** The notice (also the last element of `kept`), or null when nothing collapsed. */
  notice: Finding | null;
}

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > RATIONALE_EXCERPT_CHARS ? `${flat.slice(0, RATIONALE_EXCERPT_CHARS)}…` : flat;
}

function buildNotice(collapsed: Finding[]): Finding {
  // Cite the highest-confidence collapsed finding: it is already grounded, so
  // the notice's location passes any later citation check too.
  const anchor = collapsed.reduce((best, f) => (f.confidence > best.confidence ? f : best));
  const n = collapsed.length;
  const rationale = [
    `The PR's derived intent marks ${n === 1 ? 'this issue' : 'these issues'} as outside its scope. ` +
      'They are reported at full severity because scope never waives a critical defect.',
    '',
    ...collapsed.map(
      (f) => `- **${f.title}** — ${f.file}:${f.start_line}-${f.end_line} — ${excerpt(f.rationale)}`,
    ),
  ].join('\n');
  return {
    id: SCOPE_NOTICE_ID,
    severity: SCOPE_COLLAPSE_SEVERITY,
    category: anchor.category,
    title: `${n} critical issue${n === 1 ? '' : 's'} outside this PR's stated scope`,
    file: anchor.file,
    start_line: anchor.start_line,
    end_line: anchor.end_line,
    rationale,
    suggestion: null,
    confidence: Math.max(...collapsed.map((f) => f.confidence)),
    kind: 'scope_notice',
    in_scope: false,
  };
}

export function applyIntentScope(findings: Finding[]): IntentScopeResult {
  const kept: Finding[] = [];
  const hidden: Finding[] = [];
  const collapsed: Finding[] = [];

  for (const raw of findings) {
    // Only this function may produce a notice — a model-emitted one is reset.
    const f: Finding = raw.kind === 'scope_notice' ? { ...raw, kind: 'finding' } : raw;
    if (f.in_scope !== false) kept.push(f);
    else if (f.severity === SCOPE_COLLAPSE_SEVERITY) collapsed.push(f);
    else hidden.push(f);
  }

  const notice = collapsed.length > 0 ? buildNotice(collapsed) : null;
  if (notice) kept.push(notice);
  return { kept, hidden, collapsed, notice };
}
