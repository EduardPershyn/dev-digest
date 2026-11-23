#!/usr/bin/env node
// Deterministic half of the pr-self-review skill. The agent runs, in order:
//   gate.mjs route      [--base main] [--base-ref <ref>] [--skills a,b] [--force] [--no-fetch]
//                       [--max-parallel 6] [--slice-lines 800] [--max-lines 4000] [--max-recheck 10]
//   gate.mjs check-repo --run <dir>
//   (reviewer subagents write <dir>/findings/<sliceId>.json)
//   gate.mjs ground     --run <dir>
//   (verifier subagents write <dir>/recheck/<id>.result.json)
//   gate.mjs report     --run <dir>
// plus `gate.mjs scope` (diff summary, no side effects). Every command prints JSON except
// `report`, which prints the Markdown report. Nothing here pushes, posts or edits code.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderFile, renderWindow } from './lib/diff.mjs';
import { makeMatcher } from './lib/glob.mjs';
import { groundFindings } from './lib/ground.mjs';
import { buildReport, renderMarkdown } from './lib/report.mjs';
import { chunk, findUnrouted, listSkills, loadRouting, routeFiles, sliceEntries } from './lib/route.mjs';
import { runCommandChecks, runStaticChecks } from './lib/checks.mjs';
import { collectScope, repoRootFrom } from './lib/scope.mjs';

export const DEFAULTS = { maxParallel: 6, sliceLines: 800, maxLines: 4000, maxRecheck: 10 };

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = resolve(SKILL_DIR, '..');
const ROUTING_PATH = join(SKILL_DIR, 'routing.json');
const SEVERITY_PATH = join(SKILL_DIR, 'severity.md');
const SCHEMA_PATH = join(SKILL_DIR, 'finding.schema.json');
const REPORTS_DIR = '.devdigest/self-review';

// ── helpers ─────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) opts[key] = true;
    else { opts[key] = next; i++; }
  }
  return { cmd, opts };
}

function intOpt(v, def) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const print = (v) => process.stdout.write(JSON.stringify(v, null, 2) + '\n');

export function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function fenceFor(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((s) => s.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

function runDirFor(repoRoot, scope, skills) {
  const only = typeof skills === 'string' ? `-only-${skills.replace(/[^\w,-]/g, '').replace(/,/g, '+')}` : '';
  return join(repoRoot, REPORTS_DIR, `${scope.headSha.slice(0, 12)}-${scope.fingerprint.slice(0, 8)}${only}`);
}

function resolveRunDir(opts, repoRoot) {
  if (!opts.run || opts.run === true) throw new Error('--run <dir> is required (the runDir printed by `route`)');
  const dir = isAbsolute(opts.run) ? opts.run : resolve(repoRoot, opts.run);
  if (!existsSync(join(dir, 'plan.json'))) throw new Error(`no plan.json in ${dir} — run \`route\` first`);
  return dir;
}

function summarizeScope(scope) {
  return {
    base: scope.base, baseRef: scope.baseRef, baseSha: scope.baseSha, headSha: scope.headSha, branch: scope.branch,
    localBaseAhead: scope.localBaseAhead, dirty: scope.dirty, uncommitted: scope.uncommitted, fingerprint: scope.fingerprint,
    files: scope.files.map((f) => ({ path: f.path, status: f.status, origin: f.origin, binary: f.binary, added: f.added, removed: f.removed })),
  };
}

// ── commands ────────────────────────────────────────────────────────────────

function scopeOpts(opts, repoRoot) {
  return {
    repoRoot,
    base: typeof opts.base === 'string' ? opts.base : 'main',
    baseRef: typeof opts.baseRef === 'string' ? opts.baseRef : undefined,
    fetch: !opts.noFetch,
  };
}

function cmdScope(opts, repoRoot) {
  const scope = collectScope(scopeOpts(opts, repoRoot));
  print(summarizeScope(scope));
}

export function buildPlan({ scope, routing, skills, repoRoot, runDir, opts = {} }) {
  const limits = {
    maxParallel: intOpt(opts.maxParallel, DEFAULTS.maxParallel),
    sliceLines: intOpt(opts.sliceLines, DEFAULTS.sliceLines),
    maxLines: intOpt(opts.maxLines, DEFAULTS.maxLines),
    maxRecheck: intOpt(opts.maxRecheck, DEFAULTS.maxRecheck),
  };
  const only = typeof opts.skills === 'string' ? opts.skills.split(',').map((s) => s.trim()).filter(Boolean) : null;
  if (only) {
    const unknown = only.filter((s) => !routing.skills[s]?.review);
    if (unknown.length) throw new Error(`--skills: not a routed review skill: ${unknown.join(', ')}`);
  }
  const skillPathByName = new Map(skills.map((s) => [s.name, s.skillPath]));
  const unrouted = findUnrouted(skills.map((s) => s.name), routing);
  const { bySkill, unmatched, routedLines } = routeFiles(scope.files, routing, { only });

  const slices = [];
  const skillRows = [];
  for (const [skill, entries] of bySkill) {
    skillRows.push({ skill, files: entries.length, lines: entries.reduce((n, e) => n + e.lines, 0) });
    sliceEntries(entries, limits.sliceLines).forEach((group, i) => {
      const id = `${skill}--${i + 1}`;
      slices.push({
        id, skill, skillPath: skillPathByName.get(skill) ?? join(SKILLS_DIR, skill, 'SKILL.md'),
        files: group.map((e) => e.file.path),
        lines: group.reduce((n, e) => n + e.lines, 0),
        group,
        promptPath: join(runDir, 'slices', `${id}.md`),
        findingsPath: join(runDir, 'findings', `${id}.json`),
      });
    });
  }

  return {
    runDir, repoRoot,
    base: scope.base, baseRef: scope.baseRef, baseSha: scope.baseSha, headSha: scope.headSha, branch: scope.branch,
    localBaseAhead: scope.localBaseAhead ?? 0,
    dirty: scope.dirty, uncommitted: scope.uncommitted, fingerprint: scope.fingerprint,
    model: typeof opts.model === 'string' ? opts.model : null,
    only,
    limits,
    totals: { files: scope.files.length, routedFiles: scope.files.length - unmatched.length, routedLines },
    overLimit: routedLines > limits.maxLines,
    unrouted, unmatched,
    skills: skillRows,
    slices: slices.map(({ group, ...s }) => s),
    waves: chunk(slices.map((s) => s.id), limits.maxParallel),
    _groups: Object.fromEntries(slices.map((s) => [s.id, s.group])),
  };
}

function writeSlicePrompts(plan, repoRoot) {
  const template = readFileSync(join(SKILL_DIR, 'templates', 'reviewer.md'), 'utf8');
  for (const s of plan.slices) {
    const group = plan._groups[s.id];
    const diff = group.map((e) => renderFile(e.file, e.hunks)).join('\n\n');
    const fileList = group.map((e) => `- \`${e.file.path}\` (${e.lines} changed lines; matched by ${e.reason})`).join('\n');
    writeFileSync(s.promptPath, fill(template, {
      skill: s.skill, sliceId: s.id, skillPath: s.skillPath, severityPath: SEVERITY_PATH, schemaPath: SCHEMA_PATH,
      repoRoot, findingsPath: s.findingsPath, fileList, diff, fence: fenceFor(diff),
    }));
  }
}

function cmdRoute(opts, repoRoot) {
  const scope = collectScope(scopeOpts(opts, repoRoot));
  const runDir = runDirFor(repoRoot, scope, opts.skills);
  const reportJson = join(runDir, 'report.json');
  if (existsSync(reportJson) && !opts.force) {
    const r = readJson(reportJson);
    print({ cached: true, runDir, reportMd: join(runDir, 'report.md'), verdict: r.verdict, counts: r.counts });
    return;
  }

  rmSync(runDir, { recursive: true, force: true });
  for (const d of ['slices', 'findings', 'recheck']) mkdirSync(join(runDir, d), { recursive: true });

  const routing = loadRouting(ROUTING_PATH);
  const skills = listSkills(SKILLS_DIR);
  const plan = buildPlan({ scope, routing, skills, repoRoot, runDir, opts });
  writeSlicePrompts(plan, repoRoot);
  const { _groups, ...persisted } = plan;
  writeJson(join(runDir, 'scope.json'), scope);
  writeJson(join(runDir, 'plan.json'), persisted);
  print({ cached: false, ...persisted, unmatched: persisted.unmatched.length });
}

async function cmdCheckRepo(opts, repoRoot) {
  const runDir = resolveRunDir(opts, repoRoot);
  const scope = readJson(join(runDir, 'scope.json'));
  const routing = loadRouting(ROUTING_PATH);
  const excluded = makeMatcher(routing.exclude ?? []);
  const checks = [
    ...runStaticChecks(scope.files, repoRoot, excluded),
    ...(await runCommandChecks(scope.files, repoRoot, { timeoutMs: intOpt(opts.timeoutMs, 300_000) })),
  ];
  writeJson(join(runDir, 'checks.json'), checks);
  print(checks.map(({ name, status, detail, findings }) => ({ name, status, findings: findings.length, detail: status === 'pass' ? undefined : detail })));
}

function readFindingsFiles(plan) {
  const raw = [];
  const missing = [];
  const invalid = [];
  for (const s of plan.slices) {
    if (!existsSync(s.findingsPath)) { missing.push(s.id); continue; }
    try {
      const v = readJson(s.findingsPath);
      const arr = Array.isArray(v) ? v : Array.isArray(v?.findings) ? v.findings : null;
      if (!arr) { invalid.push(s.id); missing.push(s.id); continue; }
      for (const f of arr) raw.push({ ...f, skill: f?.skill ?? s.skill, sliceId: s.id });
    } catch {
      invalid.push(s.id);
      missing.push(s.id);
    }
  }
  return { raw, missing, invalid };
}

function cmdGround(opts, repoRoot) {
  const runDir = resolveRunDir(opts, repoRoot);
  const plan = readJson(join(runDir, 'plan.json'));
  const scope = readJson(join(runDir, 'scope.json'));
  const checksPath = join(runDir, 'checks.json');
  const checks = existsSync(checksPath) ? readJson(checksPath) : null;
  const { raw, missing, invalid } = readFindingsFiles(plan);

  const grounded = groundFindings({
    scopeFiles: scope.files, rawFindings: raw, checkFindings: (checks ?? []).flatMap((c) => c.findings),
    repoRoot, maxRecheck: plan.limits.maxRecheck,
  });

  const template = readFileSync(join(SKILL_DIR, 'templates', 'verifier.md'), 'utf8');
  const byPath = new Map(scope.files.map((f) => [f.path, f]));
  const skillPath = new Map(plan.slices.map((s) => [s.skill, s.skillPath]));
  const recheck = grounded.recheck.map((id) => {
    const f = grounded.findings.find((x) => x.id === id);
    const promptPath = join(runDir, 'recheck', `${id}.md`);
    const resultPath = join(runDir, 'recheck', `${id}.result.json`);
    writeFileSync(promptPath, fill(template, {
      id, skill: f.skill, skillPath: skillPath.get(f.skill) ?? join(SKILLS_DIR, f.skill, 'SKILL.md'),
      severityPath: SEVERITY_PATH, repoRoot, file: f.file, line: f.line, rule: f.rule,
      message: f.message, fix: f.fix || '—', evidence: f.evidence.replace(/`/g, "'"),
      context: renderWindow(byPath.get(f.file), f.line), resultPath,
    }));
    return { id, file: f.file, line: f.line, skill: f.skill, promptPath, resultPath };
  });

  writeJson(join(runDir, 'grounded.json'), { ...grounded, missingSlices: missing, invalidSlices: invalid, checksRan: !!checks });
  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of grounded.findings) counts[f.severity]++;
  print({ counts, kept: grounded.findings.length, dropped: grounded.dropped.length, missingSlices: missing, invalidSlices: invalid, checksRan: !!checks, recheck });
}

function cmdReport(opts, repoRoot) {
  const runDir = resolveRunDir(opts, repoRoot);
  const plan = readJson(join(runDir, 'plan.json'));
  const groundedPath = join(runDir, 'grounded.json');
  if (!existsSync(groundedPath)) throw new Error('no grounded.json — run `ground` first');
  const grounded = readJson(groundedPath);
  const checksPath = join(runDir, 'checks.json');
  const checks = existsSync(checksPath) ? readJson(checksPath) : null;
  const recheckDir = join(runDir, 'recheck');
  const rechecks = readdirSync(recheckDir).filter((n) => n.endsWith('.result.json')).flatMap((n) => {
    try { return [readJson(join(recheckDir, n))]; } catch { return []; }
  });

  const report = buildReport({ plan, grounded, rechecks, checks, missingSlices: grounded.missingSlices ?? [] });
  const reportMd = join(runDir, 'report.md');
  const md = renderMarkdown(report, reportMd);
  writeJson(join(runDir, 'report.json'), report);
  writeFileSync(reportMd, md);
  process.stdout.write(md);
}

export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const { cmd, opts } = parseArgs(argv);
  const repoRoot = repoRootFrom(cwd);
  switch (cmd) {
    case 'scope': return cmdScope(opts, repoRoot);
    case 'route': return cmdRoute(opts, repoRoot);
    case 'check-repo': return cmdCheckRepo(opts, repoRoot);
    case 'ground': return cmdGround(opts, repoRoot);
    case 'report': return cmdReport(opts, repoRoot);
    default:
      process.stderr.write('usage: gate.mjs scope|route|check-repo|ground|report [--run <dir>] [options]\n');
      process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    process.stderr.write(`pr-self-review: ${e.message}\n`);
    process.exitCode = 1;
  });
}
