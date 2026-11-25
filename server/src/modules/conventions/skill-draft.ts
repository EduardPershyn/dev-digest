import type { ConventionSkillDraft } from '@devdigest/shared';
import { SKILL_BODY_MAX, SKILL_DESCRIPTION_MAX } from '@devdigest/shared';
import type { ConventionRecord } from '../_shared/records.js';
import { DRAFT_BASE_NAME, DRAFT_FALLBACK_CATEGORY, DRAFT_SNIPPET_LINES } from './constants.js';

/**
 * M2 — merge accepted conventions into one editable skill draft (pure). The
 * caller passes ONLY accepted rows; the body cites each rule's evidence.
 */

export type DraftConvention = Pick<
  ConventionRecord,
  | 'id'
  | 'rule'
  | 'category'
  | 'confidence'
  | 'evidencePath'
  | 'evidenceSnippet'
  | 'evidenceStartLine'
  | 'evidenceEndLine'
>;

const LANG_BY_EXT: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  mts: 'ts',
  cts: 'ts',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  json: 'json',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  rb: 'ruby',
  php: 'php',
  cs: 'csharp',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  css: 'css',
  scss: 'scss',
  html: 'html',
  sh: 'bash',
};

export function langFor(path: string | null): string {
  const ext = path?.split('/').pop()?.split('.').slice(1).pop()?.toLowerCase() ?? '';
  return LANG_BY_EXT[ext] ?? '';
}

/** `repo-conventions`, or the first free `repo-conventions-N` (N ≥ 2). */
export function pickDraftName(taken: ReadonlySet<string>, base = DRAFT_BASE_NAME): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const name = `${base}-${n}`;
    if (!taken.has(name)) return name;
  }
}

/** A fence longer than any backtick run inside `code`, so it can't close early. */
function fenceFor(code: string): string {
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((m) => m.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

function location(c: DraftConvention): string {
  const path = c.evidencePath ?? '';
  if (c.evidenceStartLine === null) return path;
  return c.evidenceEndLine !== null && c.evidenceEndLine !== c.evidenceStartLine
    ? `${path}:${c.evidenceStartLine}-${c.evidenceEndLine}`
    : `${path}:${c.evidenceStartLine}`;
}

function renderRule(c: DraftConvention, withSnippet: boolean): string {
  const lines = [`### ${oneLine(c.rule)}`];
  if (c.evidencePath) {
    lines.push(`Detected in \`${location(c)}\`${withSnippet && c.evidenceSnippet ? ':' : '.'}`);
    if (withSnippet && c.evidenceSnippet) {
      const code = c.evidenceSnippet.split('\n').slice(0, DRAFT_SNIPPET_LINES).join('\n');
      const fence = fenceFor(code);
      lines.push(`${fence}${langFor(c.evidencePath)}`, code, fence);
    }
  }
  return lines.join('\n');
}

/** Group by category (alphabetical; null → `general`), confidence desc inside. */
function grouped(rows: readonly DraftConvention[]): [string, DraftConvention[]][] {
  const groups = new Map<string, DraftConvention[]>();
  for (const r of rows) {
    const key = r.category?.trim() || DRAFT_FALLBACK_CATEGORY;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, list]) => [k, [...list].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))]);
}

function renderBody(
  name: string,
  repoFullName: string,
  rows: readonly DraftConvention[],
  withSnippet: (c: DraftConvention) => boolean,
): string {
  const out = [
    `# ${name}`,
    '',
    `House conventions detected in \`${repoFullName}\`. Flag changes that violate any rule below and`,
    'cite the offending `file:line`. A rule is a team convention, not a law: if the PR',
    'deliberately changes one, say so instead of flagging it.',
  ];
  for (const [category, list] of grouped(rows)) {
    out.push('', `## ${category}`);
    for (const c of list) out.push('', renderRule(c, withSnippet(c)));
  }
  return out.join('\n') + '\n';
}

export function buildConventionSkillDraft(input: {
  repoFullName: string;
  accepted: readonly DraftConvention[];
  takenNames: ReadonlySet<string>;
  maxBody?: number;
}): ConventionSkillDraft {
  const maxBody = input.maxBody ?? SKILL_BODY_MAX;
  const name = pickDraftName(input.takenNames);

  // Over the cap: drop snippets first (lowest confidence first), then rules.
  let rows = [...input.accepted];
  const byConfidenceAsc = [...rows].sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0));
  const noSnippet = new Set<string>();
  let body = renderBody(name, input.repoFullName, rows, (c) => !noSnippet.has(c.id));
  for (const c of byConfidenceAsc) {
    if (body.length <= maxBody) break;
    noSnippet.add(c.id);
    body = renderBody(name, input.repoFullName, rows, (r) => !noSnippet.has(r.id));
  }
  while (body.length > maxBody && rows.length > 1) {
    const weakest = rows.reduce((w, r) => ((r.confidence ?? 0) < (w.confidence ?? 0) ? r : w));
    rows = rows.filter((r) => r.id !== weakest.id);
    body = renderBody(name, input.repoFullName, rows, () => false);
  }

  const description =
    `Use when a PR changes code in ${input.repoFullName}. Flag changes that break ` +
    (rows.length === 1
      ? 'its house convention'
      : `one of its ${rows.length} house conventions`) +
    ' and cite the file:line.';

  return {
    name,
    description: description.slice(0, SKILL_DESCRIPTION_MAX),
    type: 'convention',
    body: body.slice(0, maxBody),
    convention_ids: rows.map((r) => r.id),
  };
}
