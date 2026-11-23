// node --test .claude/skills/pr-self-review/scripts/
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkSchemaMigration, checkSecrets, checkSharedDrift, parseDepcruise, parseTsc, planCommandChecks } from './lib/checks.mjs';
import { makeAddedFile, parseUnifiedDiff, renderFile } from './lib/diff.mjs';
import { expandBraces, makeMatcher } from './lib/glob.mjs';
import { groundFindings } from './lib/ground.mjs';
import { buildReport, VERDICT } from './lib/report.mjs';
import { findUnrouted, listSkills, loadRouting, routeFiles, sliceEntries } from './lib/route.mjs';
import { collectScope } from './lib/scope.mjs';
import { buildPlan, fill } from './gate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(HERE, '..');
const SKILLS_DIR = resolve(SKILL_DIR, '..');
const GATE = join(HERE, 'gate.mjs');
const routing = loadRouting(join(SKILL_DIR, 'routing.json'));

const added = (path, content) => makeAddedFile(path, content);
const modified = (path, content) => ({ ...makeAddedFile(path, content), status: 'M', origin: 'committed' });
const skillsFor = (files, opts) => [...routeFiles(files, routing, opts).bySkill.keys()].sort();

const tmpDirs = [];
const mkTmp = () => { const d = mkdtempSync(join(tmpdir(), 'pr-self-review-')); tmpDirs.push(d); return d; };
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

// ── glob ────────────────────────────────────────────────────────────────────
describe('glob', () => {
  test('braces expand, nested too', () => {
    assert.deepEqual(expandBraces('a.{ts,tsx}'), ['a.ts', 'a.tsx']);
    assert.deepEqual(expandBraces('{a,b{c,d}}'), ['a', 'bc', 'bd']);
  });
  test('*, ** and **/ semantics', () => {
    const m = makeMatcher(['client/src/**/*.{ts,tsx}']);
    assert.ok(m('client/src/a.ts'));
    assert.ok(m('client/src/x/y/b.tsx'));
    assert.ok(!m('client/src/a.css'));
    assert.ok(!m('server/src/a.ts'));
    assert.ok(makeMatcher(['server/src/**'])('server/src/modules/a/routes.ts'));
    assert.ok(makeMatcher(['server/src/modules/*/routes.ts'])('server/src/modules/pulls/routes.ts'));
    assert.ok(!makeMatcher(['server/src/modules/*/routes.ts'])('server/src/modules/a/b/routes.ts'));
    assert.ok(makeMatcher(['**/*.env*'])('.env'));
    assert.ok(makeMatcher(['**/vendor/shared/contracts/**'])('client/src/vendor/shared/contracts/x.ts'));
  });
});

// ── diff parsing ────────────────────────────────────────────────────────────
describe('parseUnifiedDiff', () => {
  const text = [
    'diff --git a/src/a.ts b/src/a.ts',
    'index 1..2 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,3 +1,4 @@',
    ' one',
    '-two',
    '+TWO',
    '+three',
    ' four',
    'diff --git a/old.ts b/new.ts',
    'similarity index 90%',
    'rename from old.ts',
    'rename to new.ts',
    '@@ -5 +5 @@',
    '-x',
    '+y',
    'diff --git a/gone.ts b/gone.ts',
    'deleted file mode 100644',
    '--- a/gone.ts',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-bye',
    'diff --git a/img.png b/img.png',
    'Binary files a/img.png and b/img.png differ',
    '',
  ].join('\n');
  const files = parseUnifiedDiff(text);

  test('statuses, paths and counts', () => {
    assert.deepEqual(files.map((f) => [f.path, f.status, f.added, f.removed, f.binary]), [
      ['src/a.ts', 'M', 2, 1, false],
      ['new.ts', 'R', 1, 1, false],
      ['gone.ts', 'D', 0, 1, false],
      ['img.png', 'M', 0, 0, true],
    ]);
    assert.equal(files[1].oldPath, 'old.ts');
  });
  test('new-side line numbers', () => {
    const lines = files[0].hunks[0].lines.filter((l) => l.t !== '-').map((l) => [l.new, l.text]);
    assert.deepEqual(lines, [[1, 'one'], [2, 'TWO'], [3, 'three'], [4, 'four']]);
  });
  test('render shows new line numbers, blank for removed', () => {
    const r = renderFile(files[0]);
    assert.match(r, /^\s+2 \+ TWO$/m);
    assert.match(r, /^\s+- two$/m);
  });
});

// ── routing ─────────────────────────────────────────────────────────────────
describe('routing', () => {
  test('every skill in .claude/skills is routed or marked review:false', () => {
    const names = listSkills(SKILLS_DIR).map((s) => s.name);
    assert.ok(names.includes('onion-architecture'));
    assert.deepEqual(findUnrouted(names, routing), []);
  });
  test('a new skill missing from routing.json is reported', () => {
    assert.deepEqual(findUnrouted(['onion-architecture', 'brand-new-skill'], routing), ['brand-new-skill']);
  });
  test('client-only diff → only frontend skills', () => {
    const files = [
      added('client/src/app/repos/page.tsx', 'export default function Page() { return <div/>; }'),
      modified('client/src/components/diff-viewer/DiffViewer.tsx', 'export const X = 1;'),
    ];
    assert.deepEqual(skillsFor(files), ['frontend-ui-architecture', 'next-best-practices', 'react-best-practices']);
  });
  test('server-only diff → backend skills only', () => {
    const files = [
      modified('server/src/modules/pulls/routes.ts', 'app.get("/x", h);'),
      modified('server/src/modules/pulls/service.ts', 'export const s = 1;'),
    ];
    const s = skillsFor(files);
    assert.deepEqual(s, ['fastify-best-practices', 'onion-architecture', 'security']);
    assert.ok(!s.some((n) => /react|next|frontend/.test(n)));
  });
  test('docs-only diff → no skill', () => {
    const files = [modified('docs/architecture.md', 'uses process.env and fetch( in prose'), modified('README.md', 'x')];
    const r = routeFiles(files, routing);
    assert.equal(r.bySkill.size, 0);
    assert.deepEqual(r.unmatched, ['docs/architecture.md', 'README.md']);
  });
  test('client tests go to react-testing-library, not to UI architecture', () => {
    assert.deepEqual(skillsFor([added('client/src/components/x/X.test.tsx', 'it("x", () => {});')]), ['react-testing-library']);
  });
  test('content trigger sends only matching hunks', () => {
    const f = parseUnifiedDiff([
      'diff --git a/e2e/src/util.ts b/e2e/src/util.ts',
      '--- a/e2e/src/util.ts', '+++ b/e2e/src/util.ts',
      '@@ -1,1 +1,2 @@', ' a', '+const z = 1;',
      '@@ -50,1 +51,2 @@', ' b', "+import { z } from 'zod';",
      '',
    ].join('\n'));
    const entries = routeFiles(f, routing).bySkill.get('zod');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].reason, 'content');
    assert.equal(entries[0].hunks.length, 1);
    assert.equal(entries[0].hunks[0].newStart, 51);
  });
  test('refetch( does not trigger security; fetch( does', () => {
    assert.ok(!skillsFor([modified('e2e/src/a.ts', 'q.refetch();')]).includes('security'));
    assert.ok(skillsFor([modified('e2e/src/a.ts', 'await fetch(url);')]).includes('security'));
  });
  test('lockfiles, binaries and deleted files are never reviewed', () => {
    const files = [
      modified('client/pnpm-lock.yaml', 'x'),
      { ...added('client/src/a.tsx', 'x'), status: 'D' },
      { path: 'client/src/logo.tsx', status: 'M', binary: true, hunks: [], added: 0, removed: 0 },
    ];
    assert.equal(routeFiles(files, routing).bySkill.size, 0);
  });
  test('--skills limits routing', () => {
    const files = [modified('client/src/app/page.tsx', 'x'), modified('server/src/app.ts', 'x')];
    assert.deepEqual(skillsFor(files, { only: ['onion-architecture'] }), ['onion-architecture']);
  });
});

describe('sliceEntries', () => {
  const e = (lines) => ({ lines });
  test('packs up to the limit, oversized file alone', () => {
    const slices = sliceEntries([e(300), e(400), e(200), e(900), e(50)], 800);
    assert.deepEqual(slices.map((s) => s.map((x) => x.lines)), [[300, 400], [900], [200, 50]]);
  });
});

// ── repo checks ─────────────────────────────────────────────────────────────
describe('repo checks', () => {
  test('schema change without a migration is CRITICAL', () => {
    const f = checkSchemaMigration([modified('server/src/db/schema/reviews.ts', 'x')]);
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'CRITICAL');
  });
  test('schema change with a new migration passes', () => {
    assert.deepEqual(checkSchemaMigration([
      modified('server/src/db/schema/reviews.ts', 'x'),
      added('server/src/db/migrations/0010_new.sql', 'ALTER TABLE x;'),
    ]), []);
  });
  test('secrets: specific patterns CRITICAL and masked, .env CRITICAL, .env.example ok', () => {
    const key = 'AKIA' + 'Q'.repeat(16); // built at runtime so this file doesn't trip the check
    const out = checkSecrets([
      added('server/src/a.ts', `const k = "${key}";`),
      added('server/.env', 'X=1'),
      added('server/.env.example', 'X='),
    ]);
    assert.deepEqual(out.map((f) => [f.rule, f.severity]), [['secret/aws-access-key', 'CRITICAL'], ['committed-env-file', 'CRITICAL']]);
    assert.ok(!out[0].evidence.includes(key));
  });
  test('shared drift: twin exists and unchanged → WARNING', () => {
    const root = mkTmp();
    mkdirSync(join(root, 'client/src/vendor/shared/contracts'), { recursive: true });
    writeFileSync(join(root, 'client/src/vendor/shared/contracts/x.ts'), '');
    const out = checkSharedDrift([modified('server/src/vendor/shared/contracts/x.ts', 'a'), modified('server/src/vendor/shared/contracts/only-server.ts', 'a')], root);
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'WARNING');
    assert.deepEqual(checkSharedDrift([modified('server/src/vendor/shared/contracts/x.ts', 'a'), modified('client/src/vendor/shared/contracts/x.ts', 'a')], root), []);
  });
  test('command checks only for touched packages', () => {
    assert.deepEqual(planCommandChecks([modified('client/src/a.tsx', 'x')]).map((c) => c.name), ['typecheck:client']);
    assert.deepEqual(planCommandChecks([modified('reviewer-core/src/a.ts', 'x')]).map((c) => c.name), ['lint:arch', 'typecheck:server', 'typecheck:reviewer-core']);
    assert.deepEqual(planCommandChecks([modified('docs/a.md', 'x'), modified('client/README.md', 'x')]), []);
  });
  test('tsc and depcruise output parsing maps paths to the repo', () => {
    assert.deepEqual(parseTsc("../reviewer-core/src/x.ts(3,5): error TS2322: Type 'a' is not assignable.", 'server'),
      [{ file: 'reviewer-core/src/x.ts', line: 3, code: 'TS2322', msg: "Type 'a' is not assignable." }]);
    assert.deepEqual(parseDepcruise('  error db-only-in-repositories: src/modules/a/service.ts → src/db/client.ts', 'server'),
      [{ level: 'error', rule: 'db-only-in-repositories', from: 'server/src/modules/a/service.ts', to: 'server/src/db/client.ts' }]);
  });
});

// ── grounding + verdict ─────────────────────────────────────────────────────
describe('grounding and verdict', () => {
  const file = parseUnifiedDiff([
    'diff --git a/server/src/modules/a/helpers.ts b/server/src/modules/a/helpers.ts',
    '--- a/server/src/modules/a/helpers.ts', '+++ b/server/src/modules/a/helpers.ts',
    '@@ -10,2 +10,3 @@', ' const a = 1;', "+import { db } from '../../db/client';", ' export {};', '',
  ].join('\n'));
  const base = { skill: 'onion-architecture', rule: 'domain-is-pure', file: 'server/src/modules/a/helpers.ts', message: 'Domain imports the DB client.' };
  const raw = [
    { ...base, severity: 'CRITICAL', line: 11, evidence: "import { db } from '../../db/client'" },
    { ...base, skill: 'drizzle-orm-patterns', rule: 'repo-only', severity: 'WARNING', line: 11, evidence: 'db } from' },
    { ...base, severity: 'WARNING', line: 200, evidence: 'const a = 1;' },
    { ...base, severity: 'WARNING', line: 11, evidence: 'something that is not there' },
    { ...base, file: 'client/src/x.ts', severity: 'WARNING', line: 1, evidence: 'x' },
    { ...base, severity: 'BLOCKER', line: 11, evidence: 'db' },
  ];
  const check = { skill: 'repo-checks', rule: 'typecheck:server/TS2304', severity: 'CRITICAL', file: 'server/src/x.ts', line: 4, evidence: 'Cannot find name', message: 'Type error', source: 'check' };
  const g = groundFindings({ scopeFiles: file, rawFindings: raw, checkFindings: [check], maxRecheck: 10 });

  test('ungrounded and invalid findings are dropped with a reason', () => {
    assert.deepEqual(g.dropped.map((d) => d.reason).sort(), [
      'evidence not found near the cited line', 'file not in diff', 'invalid: bad severity BLOCKER', 'line 200 outside changed hunks',
    ]);
  });
  test('same file:line from two skills is merged at the highest severity', () => {
    const llm = g.findings.filter((f) => f.source === 'llm');
    assert.equal(llm.length, 1);
    assert.equal(llm[0].severity, 'CRITICAL');
    assert.deepEqual(llm[0].skills, ['onion-architecture', 'drizzle-orm-patterns']);
    assert.equal(llm[0].alsoReported.length, 1);
  });
  test('check findings bypass grounding; only LLM CRITICALs are re-checked', () => {
    assert.ok(g.findings.some((f) => f.source === 'check'));
    assert.equal(g.recheck.length, 1);
  });
  test('recheck cap marks the rest', () => {
    const g0 = groundFindings({ scopeFiles: file, rawFindings: raw.slice(0, 1), maxRecheck: 0 });
    assert.equal(g0.recheck.length, 0);
    assert.match(g0.findings[0].recheck, /cap/);
  });

  const plan = { base: 'main', baseRef: 'main', baseSha: 'b'.repeat(40), headSha: 'h'.repeat(40), branch: 'feat', fingerprint: 'f',
    dirty: false, uncommitted: [], unrouted: [], unmatched: [], localBaseAhead: 0, only: null,
    skills: [{ skill: 'onion-architecture', files: 1, lines: 1 }] };
  const llmOnly = groundFindings({ scopeFiles: file, rawFindings: raw.slice(0, 2) });

  test('a CRITICAL → NOT READY', () => {
    const r = buildReport({ plan, grounded: llmOnly, rechecks: [], checks: [], missingSlices: [] });
    assert.equal(r.verdict, VERDICT.NOT_READY);
    assert.match(r.findings[0].recheck, /no verifier result/);
  });
  test('verifier DOWNGRADE → READY TO MERGE', () => {
    const id = llmOnly.recheck[0];
    const r = buildReport({ plan, grounded: llmOnly, rechecks: [{ id, verdict: 'DOWNGRADE', severity: 'WARNING', reason: 'type-only import' }], checks: [], missingSlices: [] });
    assert.equal(r.verdict, VERDICT.READY);
    assert.equal(r.counts.WARNING, 1);
  });
  test('missing reviewer output and no CRITICAL → INCOMPLETE', () => {
    const r = buildReport({ plan, grounded: { findings: [], dropped: [], recheck: [] }, rechecks: [], checks: [], missingSlices: ['x--1'] });
    assert.equal(r.verdict, VERDICT.INCOMPLETE);
  });
  test('template fill leaves unknown placeholders and does not re-expand values', () => {
    assert.equal(fill('{{a}} {{b}}', { a: '{{b}}' }), '{{b}} {{b}}');
  });
});

// ── git integration ─────────────────────────────────────────────────────────
describe('git integration', () => {
  const sh = (cwd, ...args) => {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  const write = (root, p, s) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), s); };

  function fixtureRepo() {
    const root = mkTmp();
    sh(root, 'init', '-q');
    write(root, 'client/src/app/page.tsx', 'export default function P() {\n  return null;\n}\n');
    write(root, 'server/src/modules/a/service.ts', 'export const a = 1;\n');
    write(root, 'docs/x.md', 'doc\n');
    sh(root, 'add', '.');
    sh(root, 'commit', '-q', '-m', 'base');
    sh(root, 'checkout', '-q', '-b', 'feature');
    write(root, 'client/src/app/page.tsx', "'use client';\nexport default function P() {\n  return null;\n}\n");
    sh(root, 'commit', '-qam', 'client change');
    write(root, 'server/src/modules/a/service.ts', "import { db } from '../../db/client';\nexport const a = 1;\n");
    write(root, 'server/src/modules/a/helpers.ts', 'export const h = 2;\n');
    return root;
  }

  test('scope: base falls back to local main; committed / uncommitted / untracked', () => {
    const root = fixtureRepo();
    const s = collectScope({ repoRoot: root, base: 'main', fetch: false });
    assert.equal(s.baseRef, 'main');
    assert.equal(s.dirty, true);
    const byPath = Object.fromEntries(s.files.map((f) => [f.path, f.origin]));
    assert.deepEqual(byPath, {
      'client/src/app/page.tsx': 'committed',
      'server/src/modules/a/service.ts': 'uncommitted',
      'server/src/modules/a/helpers.ts': 'uncommitted',
    });
    const plan = buildPlan({ scope: s, routing, skills: listSkills(SKILLS_DIR), repoRoot: root, runDir: join(root, 'run') });
    assert.deepEqual(plan.skills.map((x) => x.skill).sort(), ['frontend-ui-architecture', 'next-best-practices', 'onion-architecture', 'react-best-practices']);
    assert.equal(plan.overLimit, false);
  });

  test('CLI end to end: route → check-repo → ground → report', () => {
    const root = fixtureRepo();
    const node = (...args) => {
      const r = spawnSync(process.execPath, [GATE, ...args], { cwd: root, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout;
    };
    const plan = JSON.parse(node('route', '--no-fetch'));
    assert.equal(plan.cached, false);
    const onion = plan.slices.find((s) => s.skill === 'onion-architecture');
    const prompt = readFileSync(onion.promptPath, 'utf8');
    assert.match(prompt, /import \{ db \} from '\.\.\/\.\.\/db\/client'/);
    assert.ok(!prompt.includes('{{'), 'all placeholders filled');

    node('check-repo', '--run', plan.runDir);
    writeFileSync(onion.findingsPath, JSON.stringify([{
      skill: 'onion-architecture', rule: 'application must not import infrastructure', severity: 'CRITICAL',
      file: 'server/src/modules/a/service.ts', line: 1, evidence: "from '../../db/client'", message: 'Service imports the DB client.', fix: 'Go through a repository port.',
    }]));
    for (const s of plan.slices) if (s.id !== onion.id) writeFileSync(s.findingsPath, '[]');

    const g = JSON.parse(node('ground', '--run', plan.runDir));
    assert.deepEqual(g.missingSlices, []);
    assert.equal(g.recheck.length, 1);
    const md = node('report', '--run', plan.runDir);
    assert.match(md, /NOT READY/);
    assert.match(md, /server\/src\/modules\/a\/service.ts:1/);

    const again = JSON.parse(node('route', '--no-fetch'));
    assert.equal(again.cached, true);
    assert.equal(again.verdict, VERDICT.NOT_READY);
  });
});
