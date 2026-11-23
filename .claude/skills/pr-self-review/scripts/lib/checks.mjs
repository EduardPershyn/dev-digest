// Deterministic repo-rule checks (no LLM). Static checks are pure; command checks spawn
// the packages' own scripts (lint:arch, typecheck) and only run for touched packages.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, join, posix } from 'node:path';
import { makeMatcher } from './glob.mjs';

const SKILL = 'repo-checks';
const MAX_PER_CHECK = 20;

function finding(rule, severity, file, line, evidence, message, fix) {
  return { skill: SKILL, rule, severity, file, line, evidence, message, fix, source: 'check' };
}

// ── static ──────────────────────────────────────────────────────────────────

const isSchema = makeMatcher(['server/src/db/schema.ts', 'server/src/db/schema/**']);
const isMigrationSql = makeMatcher(['server/src/db/migrations/*.sql']);

export function checkSchemaMigration(files) {
  const schema = files.filter((f) => isSchema(f.path) && (f.added + f.removed > 0 || f.status !== 'M'));
  if (!schema.length) return [];
  const newMigration = files.some((f) => isMigrationSql(f.path) && f.status === 'A');
  if (newMigration) return [];
  return [finding(
    'schema-without-migration', 'CRITICAL', schema[0].path, null,
    schema.map((f) => f.path).join(', '),
    'Drizzle schema changed but no new migration was added under server/src/db/migrations/. Migrations are not applied on boot, so the DB and the code will disagree.',
    'cd server && pnpm db:generate (or write the migration by hand), then commit the new .sql file.',
  )];
}

const SECRET_PATTERNS = [
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/, severity: 'CRITICAL' },
  { name: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, severity: 'CRITICAL' },
  { name: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/, severity: 'CRITICAL' },
  { name: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/, severity: 'CRITICAL' },
  { name: 'github-token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/, severity: 'CRITICAL' },
  { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, severity: 'CRITICAL' },
  { name: 'generic-secret', re: /(?:api[_-]?key|secret|passw(?:or)?d|token)["']?\s*[:=]\s*["'][^"'\s]{16,}["']/i, severity: 'WARNING' },
];
const ENV_FILE = /^\.env(\..+)?$/;
const ENV_TEMPLATE = /\.(example|sample|template)$/;

function mask(s) {
  return s.length <= 8 ? '****' : `${s.slice(0, 6)}…(${s.length} chars)`;
}

export function checkSecrets(files, isExcluded = () => false) {
  const out = [];
  for (const f of files) {
    if (f.status === 'D') continue;
    const name = basename(f.path);
    if (ENV_FILE.test(name) && !ENV_TEMPLATE.test(name)) {
      out.push(finding('committed-env-file', 'CRITICAL', f.path, null, f.path,
        `\`${f.path}\` would be part of the PR. Env files hold secrets and must stay local.`,
        'Remove it from the branch (git rm --cached) and keep only a .env.example.'));
    }
    if (f.binary || isExcluded(f.path)) continue;
    for (const h of f.hunks) {
      for (const l of h.lines) {
        if (l.t !== '+') continue;
        for (const p of SECRET_PATTERNS) {
          const m = p.re.exec(l.text);
          if (!m) continue;
          out.push(finding(`secret/${p.name}`, p.severity, f.path, l.new, mask(m[0]),
            `Added line looks like a hard-coded ${p.name.replace('-', ' ')}.`,
            'Read it from the environment (validated config) and rotate the value if it was real.'));
          break;
        }
      }
    }
  }
  return out;
}

export function checkSharedDrift(files, repoRoot) {
  const changed = new Set(files.map((f) => f.path));
  const sides = [['server/src/vendor/shared/', 'client/src/vendor/shared/'], ['client/src/vendor/shared/', 'server/src/vendor/shared/']];
  const out = [];
  for (const f of files) {
    for (const [from, to] of sides) {
      if (!f.path.startsWith(from)) continue;
      const twin = to + f.path.slice(from.length);
      if (!changed.has(twin) && existsSync(join(repoRoot, twin))) {
        out.push(finding('shared-contract-drift', 'WARNING', f.path, null, f.path,
          `\`@devdigest/shared\` is vendored twice; this file changed but its twin \`${twin}\` did not.`,
          `Apply the same change to ${twin}, unless the divergence is intentional.`));
      }
    }
  }
  return out;
}

// ── command checks ──────────────────────────────────────────────────────────

const TYPECHECK_TRIGGER = makeMatcher(['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}', '**/package.json', '**/tsconfig*.json', '**/pnpm-lock.yaml', '**/package-lock.json']);
const ARCH_TRIGGER = makeMatcher(['server/src/**', 'reviewer-core/src/**', 'server/.dependency-cruiser*']);

// `needs`: package dirs whose node_modules must exist (server compiles reviewer-core's sources
// through path aliases, so it also needs reviewer-core's deps).
const PACKAGES = {
  server: { cmd: 'pnpm', args: ['typecheck'], needs: ['server', 'reviewer-core'] },
  client: { cmd: 'pnpm', args: ['typecheck'] },
  'reviewer-core': { cmd: 'npm', args: ['run', 'typecheck'] },
  e2e: { cmd: 'npm', args: ['run', 'typecheck'] },
};

/** Which command checks apply to this change set. */
export function planCommandChecks(files) {
  const touched = new Set();
  for (const f of files) {
    const pkg = f.path.split('/')[0];
    if (pkg in PACKAGES && TYPECHECK_TRIGGER(f.path)) touched.add(pkg);
    if (f.path.startsWith('server/src/vendor/shared/') && TYPECHECK_TRIGGER(f.path)) touched.add('reviewer-core');
  }
  if (touched.has('reviewer-core')) touched.add('server'); // server compiles reviewer-core via path aliases
  const checks = [];
  if (files.some((f) => ARCH_TRIGGER(f.path))) {
    checks.push({ name: 'lint:arch', cwd: 'server', cmd: 'pnpm', args: ['-s', 'lint:arch'], parse: 'depcruise', needs: ['server'] });
  }
  for (const pkg of Object.keys(PACKAGES)) {
    if (touched.has(pkg)) checks.push({ name: `typecheck:${pkg}`, cwd: pkg, needs: [pkg], ...PACKAGES[pkg], parse: 'tsc' });
  }
  return checks;
}

function run(cmd, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
    } catch (e) {
      resolve({ code: null, out: '', error: e.message });
      return;
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: null, out, error: e.message }); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, out, timedOut: signal === 'SIGKILL' }); });
  });
}

const toRepoPath = (pkgDir, p) => posix.normalize(posix.join(pkgDir, p.replace(/\\/g, '/')));

export function parseTsc(output, pkgDir) {
  const re = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
  return output.split('\n').map((l) => re.exec(l.trim())).filter(Boolean)
    .map((m) => ({ file: toRepoPath(pkgDir, m[1]), line: Number(m[2]), code: m[4], msg: m[5] }));
}

export function parseDepcruise(output, pkgDir) {
  const re = /^\s*(error|warn)\s+([\w-]+):\s+(\S+)(?:\s+→\s+(\S+))?/;
  return output.split('\n').map((l) => re.exec(l)).filter(Boolean)
    .map((m) => ({ level: m[1], rule: m[2], from: toRepoPath(pkgDir, m[3]), to: m[4] ? toRepoPath(pkgDir, m[4]) : null }));
}

function tail(s, n = 1500) {
  const t = s.trim();
  return t.length > n ? `…${t.slice(-n)}` : t;
}

function findingsFromRun(check, res, changed) {
  const out = [];
  if (check.parse === 'tsc') {
    const errs = parseTsc(res.out, check.cwd);
    for (const e of errs.slice(0, MAX_PER_CHECK)) {
      const note = changed.has(e.file) ? '' : ' (file not changed on this branch — caused by a change elsewhere, or pre-existing)';
      out.push(finding(`${check.name}/${e.code}`, 'CRITICAL', e.file, e.line, e.msg, `Type error: ${e.msg}${note}`, 'Fix the type error; the package does not compile.'));
    }
    if (errs.length > MAX_PER_CHECK) {
      out.push(finding(check.name, 'CRITICAL', check.cwd, null, `${errs.length - MAX_PER_CHECK} more errors`, `${errs.length} type errors in total; only the first ${MAX_PER_CHECK} are listed.`, `cd ${check.cwd} && ${check.cmd} ${check.args.join(' ')}`));
    }
  } else if (check.parse === 'depcruise') {
    for (const v of parseDepcruise(res.out, check.cwd).slice(0, MAX_PER_CHECK)) {
      out.push(finding(`lint:arch/${v.rule}`, v.level === 'error' ? 'CRITICAL' : 'WARNING', v.from, null,
        v.to ? `${v.from} → ${v.to}` : v.from,
        `dependency-cruiser rule \`${v.rule}\` violated${v.to ? ` by the import of ${v.to}` : ''}.`,
        'See .claude/skills/onion-architecture/references/enforcement.md for how to fix each rule. Never re-baseline to hide it.'));
    }
  }
  if (res.code !== 0 && !out.some((f) => f.severity === 'CRITICAL')) {
    out.push(finding(check.name, 'CRITICAL', check.cwd, null, tail(res.out, 400),
      `\`${check.cmd} ${check.args.join(' ')}\` failed (exit ${res.code}${res.timedOut ? ', timed out' : ''}).`,
      `Run it in ${check.cwd}/ and fix the output.`));
  }
  return out;
}

export async function runCommandChecks(files, repoRoot, { timeoutMs = 300_000 } = {}) {
  const changed = new Set(files.map((f) => f.path));
  const plans = planCommandChecks(files);
  const results = await Promise.all(plans.map(async (check) => {
    const cwd = join(repoRoot, check.cwd);
    const missing = check.needs.filter((d) => !existsSync(join(repoRoot, d, 'node_modules')));
    if (missing.length) {
      return { check, status: 'skipped', detail: `${missing.map((d) => `${d}/node_modules`).join(', ')} missing — install deps to run it`, findings: [] };
    }
    const res = await run(check.cmd, check.args, cwd, timeoutMs);
    if (res.code === null && res.error) {
      return { check, status: 'skipped', detail: `could not start ${check.cmd}: ${res.error}`, findings: [] };
    }
    const findings = findingsFromRun(check, res, changed);
    const status = res.code === 0 && !findings.some((f) => f.severity === 'CRITICAL') ? 'pass' : 'fail';
    return { check, status, detail: status === 'pass' ? 'ok' : tail(res.out, 600), findings };
  }));
  return results.map(({ check, status, detail, findings }) => ({
    name: check.name, command: `cd ${check.cwd} && ${check.cmd} ${check.args.join(' ')}`, status, detail, findings,
  }));
}

export function runStaticChecks(files, repoRoot, isExcluded) {
  return [
    { name: 'schema-migration', status: 'pass', findings: checkSchemaMigration(files) },
    { name: 'secrets', status: 'pass', findings: checkSecrets(files, isExcluded) },
    { name: 'shared-drift', status: 'pass', findings: checkSharedDrift(files, repoRoot) },
  ].map((c) => ({
    ...c,
    command: '(static)',
    status: c.findings.some((f) => f.severity === 'CRITICAL') ? 'fail' : c.findings.length ? 'warn' : 'pass',
    detail: c.findings.length ? `${c.findings.length} finding(s)` : 'ok',
  }));
}
