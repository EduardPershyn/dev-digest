// node --test .claude/hooks/hooks.test.mjs
// Pipes sample PreToolUse JSON into each hook and checks the exit code (0 = allow, 2 = block).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const hook = (name) => join(HERE, name);

const tmpDirs = [];
const mkTmp = () => { const d = mkdtempSync(join(tmpdir(), 'devdigest-hooks-')); tmpDirs.push(d); return d; };
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

function run(name, args, payload, env = {}) {
  const r = spawnSync('bash', [hook(name), ...args], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, ...env },
    encoding: 'utf8',
  });
  return { code: r.status, stderr: r.stderr };
}
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const write = (file_path, content = 'x') => ({ tool_name: 'Write', tool_input: { file_path, content } });
const edit = (file_path, old_string, new_string, extra = {}) =>
  ({ tool_name: 'Edit', tool_input: { file_path, old_string, new_string, ...extra } });
const multiEdit = (file_path, edits) => ({ tool_name: 'MultiEdit', tool_input: { file_path, edits } });

function expectCodes(name, args, cases, code) {
  for (const [label, payload] of cases) {
    test(`${code === 0 ? 'allows' : 'blocks'} ${label}`, () => {
      const r = run(name, args, payload);
      assert.equal(r.code, code, `exit ${r.code}, stderr: ${r.stderr}`);
    });
  }
}
const cmds = (list) => list.map((c) => [c, bash(c)]);

// A PATH with the tools the hooks need, except jq.
function pathWithoutJq() {
  const bin = join(mkTmp(), 'bin');
  mkdirSync(bin);
  for (const tool of ['bash', 'cat', 'awk', 'sed', 'grep', 'realpath', 'printf']) {
    const found = spawnSync('bash', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).stdout.trim();
    if (found.startsWith('/')) symlinkSync(found, join(bin, tool));
  }
  return bin;
}

// ── readonly-bash.sh ────────────────────────────────────────────────────────
describe('readonly-bash.sh — default profile (planner, doc-writer): unchanged behaviour', () => {
  const H = 'readonly-bash.sh';
  expectCodes(H, [], cmds([
    'git log -5', 'git --no-pager diff', "rg 'a|b' src", "rg '=>' x", 'cat f 2>/dev/null',
    'ls | head', 'diff -rq a b', 'find . -name "*.ts"', 'cd server && git status',
  ]), 0);
  expectCodes(H, [], cmds([
    'rm x', 'echo a > f', 'cat $(ls)', "rg '`x`'", 'find . -delete', 'find . -exec rm {} \\;',
    'git -c a=b log', 'git commit -m x', 'sort -o f x', 'rg --pre x y', 'for i in 1; do ls; done',
    'sed -i s/a/b/ f', 'pnpm test', 'pnpm lint:arch', 'node --test .claude/hooks/hooks.test.mjs',
    'cat <(ls)',
  ]), 2);
  test('the block message names the profile', () => {
    assert.match(run(H, [], bash('rm x')).stderr, /readonly-bash\[readonly\]/);
  });
  test('an explicit readonly profile behaves like the default', () => {
    assert.equal(run(H, ['--profile', 'readonly'], bash('git log')).code, 0);
    assert.equal(run(H, ['--profile', 'readonly'], bash('pnpm test')).code, 2);
  });
});

describe('readonly-bash.sh — arch profile (architecture-reviewer)', () => {
  const A = ['--profile', 'arch'];
  expectCodes('readonly-bash.sh', A, cmds([
    'cd server && pnpm lint:arch',
    'cd client && pnpm exec vitest run src/test/architecture.test.ts',
    'git diff --name-status main...HEAD',
  ]), 0);
  expectCodes('readonly-bash.sh', A, cmds([
    'pnpm test', 'pnpm lint:arch:baseline', 'pnpm typecheck', 'pnpm lint:arch --fix',
    'pnpm exec vitest run', 'npx depcruise src', 'rm -rf x',
  ]), 2);
});

describe('readonly-bash.sh — checks profile (plan-verifier)', () => {
  const C = ['--profile', 'checks'];
  expectCodes('readonly-bash.sh', C, cmds([
    'cd server && pnpm typecheck', 'cd client && pnpm test', 'cd client && pnpm exec vitest run FindingsPanel',
    "cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'", 'cd server && pnpm exec vitest run .it.test',
    "cd client && pnpm exec vitest run FindingsPanel -t 'renders the badge'",
    'cd reviewer-core && npm test', 'cd reviewer-core && npm test -- prompt', 'cd e2e && npm run typecheck',
    'node --test .claude/hooks/hooks.test.mjs .claude/scripts/agents.test.mjs', './scripts/e2e.sh',
    'cd server && pnpm lint:arch', 'git status --short',
  ]), 0);
  expectCodes('readonly-bash.sh', C, cmds([
    'pnpm exec vitest run -u', 'pnpm test -- -u', 'pnpm exec vitest run --update', 'pnpm exec vitest run --coverage',
    'pnpm exec vitest run --outputFile=x', 'pnpm exec vitest run --config evil.ts', 'pnpm exec vitest run --watch',
    "pnpm exec vitest run '-u'", 'pnpm exec vitest run \\-u', 'pnpm exec vitest run "[repoId]"',
    'pnpm exec vitest run *', 'pnpm install', 'pnpm add left-pad', 'npm ci', 'npm install', 'pnpm db:migrate',
    'npx vitest', 'pnpm dlx vitest', 'node x.js', 'node --test server/x.mjs', 'node --test .claude/../x.test.mjs',
    'CI=1 pnpm test', './scripts/e2e.sh --foo', './scripts/dev.sh', 'npm test prompt', 'pnpm test $X',
    'node .claude/scripts/mutation-probe.mjs --file server/src/a.ts --find a --replace b --test a',
    'pnpm lint:arch:baseline', 'docker compose down -v',
  ]), 2);
});

describe('readonly-bash.sh — tests profile (test-writer)', () => {
  const T = ['--profile', 'tests'];
  expectCodes('readonly-bash.sh', T, cmds([
    'node .claude/scripts/mutation-probe.mjs --file server/src/a.ts --find a --replace b --test a',
    "node .claude/scripts/mutation-probe.mjs --file server/src/a.ts --find 'x > 1' --replace 'x >= 1' --test helpers",
    'cd client && pnpm exec vitest run FindingsPanel',
  ]), 0);
  expectCodes('readonly-bash.sh', T, cmds([
    'node .claude/scripts/other.mjs', 'pnpm exec vitest run -u', 'sed -i s/a/b/ server/src/a.ts',
    "node .claude/scripts/mutation-probe.mjs --find 'a$b'",
  ]), 2);
});

describe('readonly-bash.sh — fails closed', () => {
  test('unknown profile', () => assert.equal(run('readonly-bash.sh', ['--profile', 'admin'], bash('ls')).code, 2));
  test('jq missing', () => {
    assert.equal(run('readonly-bash.sh', [], bash('ls'), { PATH: pathWithoutJq() }).code, 2);
  });
});

// ── write-scope-guard.sh ────────────────────────────────────────────────────
describe('write-scope-guard.sh — test-writer', () => {
  const H = 'write-scope-guard.sh';
  const T = ['--profile', 'test-writer'];
  expectCodes(H, T, [
    ['server/test/x.test.ts', write('server/test/x.test.ts')],
    ['server/test/helpers/y.ts', write('server/test/helpers/y.ts')],
    ['an absolute path inside the repo', write(join(ROOT, 'server/test/x.test.ts'))],
    ['a colocated client component test', write('client/src/app/a/_components/B/B.test.tsx')],
    ['reviewer-core/test/z.test.ts', write('reviewer-core/test/z.test.ts')],
    ['an e2e flow', write('e2e/specs/10-foo.flow.json', '{}')],
    ['an append-only INSIGHTS edit', edit('server/INSIGHTS.md', '- a', '- a\n- b')],
    ['replacing the INSIGHTS placeholder', edit('INSIGHTS.md', '_None yet._', '- **2026-11-27** — x')],
  ], 0);
  expectCodes(H, T, [
    ['production code', write('server/src/modules/repos/service.ts')],
    ['the shared mocks adapter', write('server/src/adapters/mocks.ts')],
    ['the client architecture test', write('client/src/test/architecture.test.ts')],
    ['the client test setup', write('client/src/test/setup.ts')],
    ['package.json', write('client/package.json')],
    ['vitest config', write('server/vitest.config.ts')],
    ['a snapshot file', write('client/src/a/__snapshots__/x.test.tsx.snap')],
    ['a path escaping through ..', write('server/test/../src/app.ts')],
    ['a path outside the repo', write('/tmp/x.test.ts')],
    ['a hook', write('.claude/hooks/x.sh')],
    ['CLAUDE.md', write('CLAUDE.md')],
    ['it.only in content', write('server/test/x.test.ts', "it.only('a', () => {})")],
    ['describe.skip in content', write('server/test/x.test.ts', "describe.skip('a', () => {})")],
    ['xit in content', write('server/test/x.test.ts', "xit('a', () => {})")],
    ['.skip inside a MultiEdit edit', multiEdit('server/test/x.test.ts', [
      { old_string: 'a', new_string: 'b' }, { old_string: "it('c'", new_string: "it.skip('c'" }])],
    ['a Write on an existing INSIGHTS.md', write('server/INSIGHTS.md')],
    ['rewording an INSIGHTS entry', edit('INSIGHTS.md', '- old fact', '- new fact')],
    ['replace_all on INSIGHTS.md', edit('INSIGHTS.md', '- a', '- a b', { replace_all: true })],
    ['a notebook', { tool_name: 'NotebookEdit', tool_input: { notebook_path: 'server/test/x.ipynb' } }],
  ], 2);
});

describe('write-scope-guard.sh — doc-writer', () => {
  const H = 'write-scope-guard.sh';
  const D = ['--profile', 'doc-writer'];
  expectCodes(H, D, [
    ['docs/architecture.md', write('docs/architecture.md')],
    ['docs/agent-prompts/README.md', write('docs/agent-prompts/README.md')],
    ['a module doc', write('server/docs/hooks.md')],
    ['a sub-area README', write('server/src/modules/repo-intel/README.md')],
    ['TESTING.md', write('TESTING.md')],
    ['a module README', write('client/README.md')],
    ['an append-only INSIGHTS edit', edit('client/INSIGHTS.md', '- a', '- a\n- b')],
  ], 0);
  expectCodes(H, D, [
    ['a seeded skill doc', write('docs/skills/breaking-change.md')],
    ['a skills sample', write('docs/skills-samples/deprecation-policy.md')],
    ['a seeded reviewer prompt', write('docs/agent-prompts/general-reviewer.md')],
    ['vendored UI docs', write('client/src/vendor/ui/README.md')],
    ['a module CLAUDE.md', write('server/CLAUDE.md')],
    ['a spec', write('specs/x.md')],
    ['the e2e flow catalogue', write('e2e/specs/README.md')],
    ['the agents README', write('.claude/agents/README.md')],
    ['a non-Markdown file under docs/', write('docs/x.ts')],
    ['production code', write('server/src/app.ts')],
    ['a Write on an existing INSIGHTS.md', write('INSIGHTS.md')],
  ], 2);
});

describe('write-scope-guard.sh — fails closed', () => {
  const H = 'write-scope-guard.sh';
  test('missing profile', () => assert.equal(run(H, [], write('docs/x.md')).code, 2));
  test('unknown profile', () => assert.equal(run(H, ['--profile', 'admin'], write('docs/x.md')).code, 2));
  test('jq missing', () => {
    assert.equal(run(H, ['--profile', 'doc-writer'], write('docs/x.md'), { PATH: pathWithoutJq() }).code, 2);
  });
  test('the block message points to the report section', () => {
    assert.match(run(H, ['--profile', 'test-writer'], write('server/src/app.ts')).stderr, /Needed production changes/);
  });
});

// ── implementer-guard.sh ────────────────────────────────────────────────────
describe('implementer-guard.sh — regression + .claude/scripts', () => {
  const H = 'implementer-guard.sh';
  expectCodes(H, [], [
    ['a vendored UI file', write('client/src/vendor/ui/x.tsx')],
    ['an existing migration', write('server/src/db/migrations/0000_init.sql')],
    ['the dependency-cruiser baseline', write('server/.dependency-cruiser-known-violations.json')],
    ['.env', write('server/.env')],
    ['.claude/settings.json', write('.claude/settings.json')],
    ['.claude/scripts (new)', write('.claude/scripts/mutation-probe.mjs')],
    ...cmds([
      'docker compose down -v', 'pnpm lint:arch:baseline', 'git commit -m x', 'git push', 'git stash',
      'git commit --no-verify -m x', 'rm .claude/hooks/x', 'sed -i s/a/b/ .claude/scripts/x.mjs',
    ]),
  ], 2);
  expectCodes(H, [], [
    ['a new migration', write('server/src/db/migrations/9999_x.sql')],
    ['production code', write('server/src/modules/repos/service.ts')],
    ...cmds(['git status', 'pnpm test']),
  ], 0);
});
