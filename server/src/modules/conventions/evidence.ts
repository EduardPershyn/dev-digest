import type { ExtractedConvention } from '@devdigest/shared';
import { CONVENTION_RULE_MAX } from '@devdigest/shared';
import { MAX_CATEGORY_CHARS, MAX_SNIPPET_LINES, MIN_SNIPPET_CHARS } from './constants.js';

/**
 * M2 — evidence validation (pure: no I/O, no LLM). Every candidate the model
 * proposes must quote a file we SENT it, verbatim modulo whitespace. Survivors
 * get their snippet re-sliced from the file (original indentation) and a
 * 1-based line range, so what the UI shows is real code.
 */

export type EvidenceRejectReason =
  | 'path-not-sampled'
  | 'snippet-placeholder'
  | 'snippet-too-short'
  | 'snippet-too-long'
  | 'snippet-not-found';

export interface ValidConvention {
  rule: string;
  category: string | null;
  evidencePath: string;
  evidenceSnippet: string;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
  confidence: number;
}

export interface RejectedConvention {
  path: string;
  reason: EvidenceRejectReason;
}

export interface SnippetLocation {
  start: number;
  end: number;
  verbatim: string;
}

const splitLines = (text: string) => text.split(/\r?\n/);
/** Comparison key for one line: trimmed, inner whitespace collapsed. */
const lineKey = (line: string) => line.trim().replace(/\s+/g, ' ');

/** Strip a leading `./` (the model sometimes adds it) and surrounding spaces. */
export function normalizeEvidencePath(path: string): string {
  return path.trim().replace(/^(\.\/)+/, '');
}

/**
 * Find the snippet's non-blank lines, contiguous and in order, among the file's
 * non-blank lines (whitespace-tolerant). Returns the file's ORIGINAL lines
 * `start..end` (1-based), or null when there is no match.
 */
export function locateSnippet(fileText: string, snippet: string): SnippetLocation | null {
  const want = splitLines(snippet).map(lineKey).filter((l) => l.length > 0);
  if (want.length === 0) return null;

  const fileLines = splitLines(fileText);
  const have: { idx: number; key: string }[] = [];
  fileLines.forEach((line, idx) => {
    const key = lineKey(line);
    if (key.length > 0) have.push({ idx, key });
  });

  outer: for (let i = 0; i + want.length <= have.length; i++) {
    for (let j = 0; j < want.length; j++) {
      if (have[i + j]!.key !== want[j]) continue outer;
    }
    const startIdx = have[i]!.idx;
    const endIdx = have[i + want.length - 1]!.idx;
    return {
      start: startIdx + 1,
      end: endIdx + 1,
      verbatim: fileLines.slice(startIdx, endIdx + 1).join('\n'),
    };
  }
  return null;
}

/** `...` / `…` as a whole line or a line ending → the model elided code. */
function hasPlaceholder(snippet: string): boolean {
  return splitLines(snippet).some((line) => {
    const t = line.trim();
    return t === '...' || t === '…' || t.endsWith('...') || t.endsWith('…');
  });
}

function snippetLineCount(snippet: string): number {
  return splitLines(snippet.replace(/^\s*\n|\n\s*$/g, '')).length;
}

export function cleanCategory(category: string | null | undefined): string | null {
  const c = (category ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return c ? c.slice(0, MAX_CATEGORY_CHARS) : null;
}

/** Why `c` is rejected, or the located snippet when it is valid. */
function check(
  c: ExtractedConvention,
  filesByPath: ReadonlyMap<string, string>,
): { reason: EvidenceRejectReason } | { path: string; loc: SnippetLocation } {
  const path = normalizeEvidencePath(c.evidence_path);
  const file = filesByPath.get(path);
  if (file === undefined) return { reason: 'path-not-sampled' };
  const snippet = c.evidence_snippet;
  if (hasPlaceholder(snippet)) return { reason: 'snippet-placeholder' };
  if (snippet.replace(/\s/g, '').length < MIN_SNIPPET_CHARS) return { reason: 'snippet-too-short' };
  if (snippetLineCount(snippet) > MAX_SNIPPET_LINES) return { reason: 'snippet-too-long' };
  const loc = locateSnippet(file, snippet);
  if (!loc) return { reason: 'snippet-not-found' };
  return { path, loc };
}

/**
 * Validate the model's candidates against exactly the file text that was sent
 * (`filesByPath`: path → citable text). The first failing check rejects.
 */
export function validateCandidates(
  candidates: readonly ExtractedConvention[],
  filesByPath: ReadonlyMap<string, string>,
): { valid: ValidConvention[]; rejected: RejectedConvention[] } {
  const valid: ValidConvention[] = [];
  const rejected: RejectedConvention[] = [];
  for (const c of candidates) {
    const result = check(c, filesByPath);
    if ('reason' in result) {
      rejected.push({ path: c.evidence_path, reason: result.reason });
      continue;
    }
    const rule = c.rule.trim().slice(0, CONVENTION_RULE_MAX);
    if (!rule) continue;
    valid.push({
      rule,
      category: cleanCategory(c.category),
      evidencePath: result.path,
      evidenceSnippet: result.loc.verbatim,
      startLine: result.loc.start,
      endLine: result.loc.end,
      confidence: Math.min(1, Math.max(0, Number.isFinite(c.confidence) ? c.confidence : 0)),
    });
  }
  return { valid, rejected };
}
