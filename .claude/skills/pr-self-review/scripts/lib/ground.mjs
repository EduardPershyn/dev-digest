// Grounding + dedup of reviewer findings (same idea as reviewer-core/src/grounding.ts):
// a finding survives only if its file is in the diff, its line is inside (or right next to)
// a changed hunk, and its quoted evidence appears in the new-side text around that line.
import { createHash } from 'node:crypto';
import { newSideLines } from './diff.mjs';

export const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'];
export const RANK = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };
const LINE_TOLERANCE = 3;
const EVIDENCE_WINDOW = 6;

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function findingId(f) {
  return createHash('sha1').update([f.skill, f.rule, f.file, norm(f.evidence)].join('|')).digest('hex').slice(0, 12);
}

export function normalizePath(p, repoRoot) {
  let s = String(p ?? '').replace(/\\/g, '/');
  if (repoRoot && s.startsWith(`${repoRoot}/`)) s = s.slice(repoRoot.length + 1);
  return s.replace(/^\.\//, '');
}

/** Returns an error string, or null when the raw finding has the required shape. */
export function validateFinding(f) {
  if (!f || typeof f !== 'object') return 'not an object';
  for (const k of ['skill', 'rule', 'file', 'evidence', 'message']) {
    if (typeof f[k] !== 'string' || !f[k].trim()) return `missing ${k}`;
  }
  if (!SEVERITIES.includes(String(f.severity).toUpperCase())) return `bad severity ${f.severity}`;
  if (!Number.isInteger(f.line) || f.line < 1) return 'line must be a positive integer';
  return null;
}

/** Why the finding is not grounded, or null when it is. */
export function groundingError(f, file) {
  if (!file) return 'file not in diff';
  if (file.status === 'D') return 'file deleted';
  const inHunk = file.hunks.some((h) => f.line >= h.newStart - LINE_TOLERANCE && f.line <= h.newStart + Math.max(h.newLines, 1) - 1 + LINE_TOLERANCE);
  if (!inHunk) return `line ${f.line} outside changed hunks`;
  const window = newSideLines(file).filter((l) => Math.abs(l.n - f.line) <= EVIDENCE_WINDOW);
  const ev = norm(f.evidence);
  const hay = norm(window.map((l) => l.text).join('\n'));
  if (!ev || !hay.includes(ev)) return 'evidence not found near the cited line';
  return null;
}

/**
 * @param scopeFiles   parsed diff files
 * @param rawFindings  [{ ...finding, sliceId }] from reviewer subagents
 * @param checkFindings findings from repo checks (exempt from grounding)
 */
export function groundFindings({ scopeFiles, rawFindings, checkFindings = [], repoRoot, maxRecheck = 10 }) {
  const byPath = new Map(scopeFiles.map((f) => [f.path, f]));
  const kept = [];
  const dropped = [];

  for (const raw of rawFindings) {
    const err = validateFinding(raw);
    if (err) { dropped.push({ reason: `invalid: ${err}`, finding: raw }); continue; }
    const f = {
      skill: raw.skill.trim(), rule: raw.rule.trim(), severity: raw.severity.toUpperCase(),
      file: normalizePath(raw.file, repoRoot), line: raw.line, evidence: String(raw.evidence),
      message: raw.message.trim(), fix: raw.fix ? String(raw.fix).trim() : '', source: 'llm', sliceId: raw.sliceId,
    };
    const gErr = groundingError(f, byPath.get(f.file));
    if (gErr) { dropped.push({ reason: gErr, finding: f }); continue; }
    kept.push(f);
  }

  // Dedup: same file:line from several skills/slices → one finding with the highest severity.
  const groups = new Map();
  for (const f of kept) {
    const key = `${f.file}:${f.line}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const merged = [];
  for (const group of groups.values()) {
    group.sort((a, b) => RANK[b.severity] - RANK[a.severity]);
    const [primary, ...rest] = group;
    const others = rest.filter((o) => !(o.skill === primary.skill && o.rule === primary.rule));
    merged.push({
      ...primary,
      id: findingId(primary),
      skills: [...new Set(group.map((g) => g.skill))],
      alsoReported: others.map(({ skill, rule, severity, message }) => ({ skill, rule, severity, message })),
    });
  }
  for (const c of checkFindings) merged.push({ ...c, id: findingId(c), skills: [c.skill], alsoReported: [] });

  merged.sort((a, b) => RANK[b.severity] - RANK[a.severity] || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));

  const criticalLlm = merged.filter((f) => f.severity === 'CRITICAL' && f.source === 'llm');
  const recheck = criticalLlm.slice(0, maxRecheck).map((f) => f.id);
  for (const f of criticalLlm.slice(maxRecheck)) f.recheck = 'not re-checked (cap reached)';

  return { findings: merged, dropped, recheck };
}
