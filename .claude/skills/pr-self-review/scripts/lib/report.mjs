// Applies CRITICAL re-check results, computes the verdict and renders report.md.
import { RANK } from './ground.mjs';

export const VERDICT = {
  READY: 'READY TO MERGE',
  NOT_READY: 'NOT READY',
  INCOMPLETE: 'INCOMPLETE',
};

const SUGGESTION_SHOWN = 15;

export function applyRechecks(findings, rechecks, recheckIds = []) {
  const byId = new Map(rechecks.map((r) => [r.id, r]));
  const wanted = new Set(recheckIds);
  return findings.map((f) => {
    if (!wanted.has(f.id)) return f;
    const r = byId.get(f.id);
    if (!r) return { ...f, recheck: 'not re-checked (no verifier result)' };
    if (String(r.verdict).toUpperCase() === 'DOWNGRADE') {
      const sev = ['WARNING', 'SUGGESTION'].includes(String(r.severity).toUpperCase()) ? String(r.severity).toUpperCase() : 'WARNING';
      return { ...f, severity: sev, recheck: `downgraded from CRITICAL: ${r.reason ?? ''}`.trim() };
    }
    return { ...f, recheck: `confirmed${r.reason ? `: ${r.reason}` : ''}` };
  }).sort((a, b) => RANK[b.severity] - RANK[a.severity]);
}

export function countBySeverity(findings) {
  const c = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}

export function decideVerdict(counts, missingSlices = []) {
  if (counts.CRITICAL > 0) return VERDICT.NOT_READY;
  if (missingSlices.length) return VERDICT.INCOMPLETE;
  return VERDICT.READY;
}

export function buildReport({ plan, grounded, rechecks, checks, missingSlices }) {
  const findings = applyRechecks(grounded.findings, rechecks, grounded.recheck);
  const counts = countBySeverity(findings);
  const verdict = decideVerdict(counts, missingSlices);

  const notes = [];
  if (plan.only) notes.push(`Partial run: only ${plan.only.join(', ')} (--skills). The verdict covers those skills and the repo checks only.`);
  if (plan.dirty) {
    notes.push(`Includes ${plan.uncommitted.length} uncommitted file(s) — commit them or the PR will differ from what was reviewed.`);
  }
  if (plan.localBaseAhead > 0) {
    notes.push(`Local \`${plan.base}\` is ${plan.localBaseAhead} commit(s) ahead of \`${plan.baseRef}\`; those commits are reviewed too because the PR would contain them. Push \`${plan.base}\` first, or rerun with \`--base-ref ${plan.base}\`.`);
  }
  if (plan.unrouted.length) notes.push(`Unrouted skill(s), not used: ${plan.unrouted.join(', ')} — add them to routing.json.`);
  if (missingSlices.length) notes.push(`${missingSlices.length} reviewer slice(s) produced no output: ${missingSlices.join(', ')}.`);
  if (!checks) notes.push('Repo checks did not run.');
  for (const c of checks ?? []) if (c.status === 'skipped') notes.push(`Check \`${c.name}\` skipped: ${c.detail}.`);
  if (grounded.dropped.length) notes.push(`${grounded.dropped.length} ungrounded/invalid finding(s) dropped (see report.json → dropped).`);
  if (plan.unmatched.length) notes.push(`${plan.unmatched.length} changed file(s) matched no skill (repo checks still cover them).`);

  const perSkill = plan.skills.map((s) => {
    const mine = findings.filter((f) => f.skills.includes(s.skill));
    return { skill: s.skill, files: s.files, ...countBySeverity(mine) };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    verdict,
    counts,
    base: plan.base, baseRef: plan.baseRef, baseSha: plan.baseSha, headSha: plan.headSha, branch: plan.branch,
    fingerprint: plan.fingerprint, dirty: plan.dirty, uncommitted: plan.uncommitted,
    notes, perSkill,
    checks: (checks ?? []).map(({ name, command, status, detail }) => ({ name, command, status, detail })),
    findings,
    dropped: grounded.dropped,
  };
}

const shortRef = (r) => (/^[0-9a-f]{40}$/.test(r) ? r.slice(0, 10) : r);

function loc(f) {
  return f.line ? `${f.file}:${f.line}` : f.file;
}

function renderFinding(f) {
  const out = [`- **${loc(f)}** — ${f.message}`];
  out.push(`  - skill: \`${f.skills.join('`, `')}\` · rule: ${f.rule.replace(/`/g, '')}`);
  if (f.evidence && f.source === 'llm') out.push(`  - evidence: \`${f.evidence.replace(/`/g, "'").slice(0, 200)}\``);
  if (f.fix) out.push(`  - fix: ${f.fix}`);
  if (f.recheck) out.push(`  - re-check: ${f.recheck}`);
  for (const o of f.alsoReported ?? []) out.push(`  - also: \`${o.skill}\` ${o.severity} — ${o.message}`);
  return out.join('\n');
}

export function renderMarkdown(report, reportPath) {
  const { counts } = report;
  const icon = { [VERDICT.READY]: '✅', [VERDICT.NOT_READY]: '⛔', [VERDICT.INCOMPLETE]: '⚠️' }[report.verdict];
  const out = [];
  out.push(`# PR self-review: ${icon} ${report.verdict}`);
  out.push('');
  out.push(`\`${report.branch}\` @ \`${report.headSha.slice(0, 10)}\` vs \`${shortRef(report.baseRef ?? report.base)}\` (merge-base \`${report.baseSha.slice(0, 10)}\`) · ${counts.CRITICAL} critical · ${counts.WARNING} warning · ${counts.SUGGESTION} suggestion`);
  if (report.notes.length) {
    out.push('');
    for (const n of report.notes) out.push(`> ${n}`);
  }

  out.push('', '## Coverage', '', '| Skill | Files | C | W | S |', '|---|---|---|---|---|');
  for (const s of report.perSkill) out.push(`| ${s.skill} | ${s.files} | ${s.CRITICAL} | ${s.WARNING} | ${s.SUGGESTION} |`);
  if (!report.perSkill.length) out.push('| _no skill matched the diff_ | – | – | – | – |');

  if (report.checks.length) {
    const mark = { pass: '✅', fail: '❌', warn: '⚠️', skipped: '⏭️' };
    out.push('', '**Repo checks:** ' + report.checks.map((c) => `${mark[c.status] ?? ''} ${c.name}`).join(' · '));
  }

  const sections = [['CRITICAL', 'Critical'], ['WARNING', 'Warnings'], ['SUGGESTION', 'Suggestions']];
  for (const [sev, title] of sections) {
    const list = report.findings.filter((f) => f.severity === sev);
    if (!list.length) continue;
    out.push('', `## ${title} (${list.length})`, '');
    const shown = sev === 'SUGGESTION' ? list.slice(0, SUGGESTION_SHOWN) : list;
    for (const f of shown) out.push(renderFinding(f));
    if (shown.length < list.length) out.push(`- …${list.length - shown.length} more in report.json`);
  }
  if (!report.findings.length) out.push('', '_No findings._');

  out.push('', `Full report: \`${reportPath}\``);
  return out.join('\n') + '\n';
}
