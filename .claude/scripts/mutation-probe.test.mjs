// node --test .claude/scripts/mutation-probe.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { EXIT, ProbeError, probe, recoverStale } from './mutation-probe.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'mutation-probe.mjs');
const ORIGINAL = 'export const isAdult = (age: number) => age >= 18;\n';

const tmpDirs = [];
const mkTmp = () => { const d = mkdtempSync(join(tmpdir(), 'devdigest-probe-test-')); tmpDirs.push(d); return d; };
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

let root, backupDir, target;
beforeEach(() => {
  root = mkTmp();
  backupDir = mkTmp();
  mkdirSync(join(root, 'server/src'), { recursive: true });
  mkdirSync(join(root, 'server/test'), { recursive: true });
  mkdirSync(join(root, 'client/src/vendor/ui'), { recursive: true });
  target = join(root, 'server/src/a.ts');
  writeFileSync(target, ORIGINAL);
  writeFileSync(join(root, 'server/src/a.test.ts'), 'test');
  writeFileSync(join(root, 'server/test/x.ts'), 'x');
  writeFileSync(join(root, 'client/src/vendor/ui/x.tsx'), 'x');
});

// A fake test runner: passes when the file still contains `>= 18`, i.e. a test that checks the boundary.
const boundaryTest = ({ rootReal }) => {
  const src = readFileSync(join(rootReal, 'server/src/a.ts'), 'utf8');
  return { status: src.includes('>= 18') ? 0 : 1, output: src.includes('>= 18') ? 'ok' : 'expected true, got false' };
};
const base = () => ({ root, backupDir, file: 'server/src/a.ts', find: '>= 18', replace: '> 18', test: 'helpers' });

describe('probe', () => {
  test('killed: the test fails on the mutant → exit 0, original bytes restored', () => {
    const { exitCode, result } = probe({ ...base(), run: boundaryTest });
    assert.equal(exitCode, EXIT.KILLED);
    assert.equal(result.result, 'killed');
    assert.equal(result.line, 1);
    assert.equal(readFileSync(target, 'utf8'), ORIGINAL);
  });

  test('survived: the test still passes on the mutant → exit 1, restored', () => {
    const { exitCode, result } = probe({ ...base(), run: () => ({ status: 0, output: '' }) });
    assert.equal(exitCode, EXIT.SURVIVED);
    assert.equal(result.result, 'survived');
    assert.equal(readFileSync(target, 'utf8'), ORIGINAL);
  });

  test('the runner throws during the mutant run → restored and the error re-thrown', () => {
    let calls = 0;
    const run = () => { calls += 1; if (calls === 2) throw new Error('boom'); return { status: 0, output: '' }; };
    assert.throws(() => probe({ ...base(), run }), /boom/);
    assert.equal(readFileSync(target, 'utf8'), ORIGINAL);
  });

  test('the mutant is really applied while the test runs', () => {
    let seen;
    probe({ ...base(), run: ({ rootReal }) => { seen = readFileSync(join(rootReal, 'server/src/a.ts'), 'utf8'); return { status: 0, output: '' }; } });
    assert.match(seen, /age > 18/);
  });

  test('refuses when the test fails before mutation (it would prove nothing)', () => {
    assert.throws(() => probe({ ...base(), run: () => ({ status: 1, output: 'red' }) }),
      (e) => e instanceof ProbeError && e.code === EXIT.REFUSED && /does not pass before mutation/.test(e.message));
  });

  test('--occurrence picks one of several matches', () => {
    writeFileSync(target, 'a; a; a;\n');
    let seen;
    probe({ ...base(), find: 'a;', replace: 'b;', occurrence: '2',
      run: ({ rootReal }) => { seen = readFileSync(join(rootReal, 'server/src/a.ts'), 'utf8'); return { status: 0, output: '' }; } });
    assert.equal(seen, 'a; b; a;\n');
  });

  for (const [label, override, pattern] of [
    ['a test file', { file: 'server/src/a.test.ts' }, /test or vendored/],
    ['a file outside src/', { file: 'server/test/x.ts' }, /not production code/],
    ['vendored UI', { file: 'client/src/vendor/ui/x.tsx' }, /test or vendored/],
    ['a path escaping the repo', { file: '../etc/passwd' }, /does not exist|not production code/],
    ['a non-unique find', { find: 'a' }, /matches \d+ times/],
    ['a missing find', { find: 'nope' }, /not found/],
    ['an empty find', { find: '' }, /must not be empty/],
    ['find equal to replace', { replace: '>= 18' }, /identical/],
    ['a bracketed filter', { test: '[repoId]' }, /plain name/],
    ['a filter with a leading dash', { test: '-u' }, /dash|plain name/],
    ['an out-of-range occurrence', { find: '1', occurrence: '5' }, /--occurrence/],
  ]) {
    test(`refuses ${label}`, () => {
      let ran = false;
      assert.throws(() => probe({ ...base(), ...override, run: () => { ran = true; return { status: 0, output: '' }; } }),
        (e) => e instanceof ProbeError && e.code === EXIT.REFUSED && pattern.test(e.message));
      assert.equal(ran, false, 'no test run on a refused probe');
      assert.equal(readFileSync(target, 'utf8'), ORIGINAL);
    });
  }
});

describe('recoverStale', () => {
  test('restores a file that a killed run left mutated, then removes the backup', () => {
    const backup = join(backupDir, 'x.bak');
    writeFileSync(backup, ORIGINAL);
    writeFileSync(join(backupDir, 'x.json'), JSON.stringify({
      file: target, backup, sha256: createHash('sha256').update(ORIGINAL).digest('hex'), pid: 999999999,
    }));
    writeFileSync(target, 'MUTATED');
    assert.deepEqual(recoverStale(root, backupDir), ['server/src/a.ts']);
    assert.equal(readFileSync(target, 'utf8'), ORIGINAL);
    assert.deepEqual(recoverStale(root, backupDir), []);
  });

  test('ignores manifests of other checkouts', () => {
    writeFileSync(join(backupDir, 'y.json'), JSON.stringify({ file: '/elsewhere/server/src/a.ts', backup: '/nope', sha256: 'x' }));
    assert.deepEqual(recoverStale(root, backupDir), []);
  });
});

describe('CLI', () => {
  test('bad arguments → exit 2, nothing changed', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--file', 'server/src/a.ts'], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8',
    });
    assert.equal(r.status, EXIT.REFUSED, r.stderr);
    assert.match(r.stderr, /usage/);
    assert.equal(readFileSync(target, 'utf8'), ORIGINAL);
  });
  test('unknown option → exit 2', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--cmd', 'rm -rf /'], { env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
    assert.equal(r.status, EXIT.REFUSED);
  });
});
