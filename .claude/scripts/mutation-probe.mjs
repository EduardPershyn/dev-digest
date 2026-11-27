#!/usr/bin/env node
// Red proof for a test that leaves no change behind (used by the test-writer agent).
//
//   node .claude/scripts/mutation-probe.mjs --file <repo-relative src path> \
//        --find <literal> --replace <literal> --test <vitest filter> [--occurrence <n>]
//
// 1. Runs the test unmutated: it must pass (otherwise the probe proves nothing).
// 2. Replaces one literal occurrence of --find with --replace in one production file under
//    {server,client,reviewer-core}/src/, runs the same test, and restores the original bytes
//    (verified by sha256) on success, failure, exception or signal.
// 3. Prints one JSON line and exits 0 = killed (the test caught the mutation),
//    1 = survived (the test is too weak), 2 = refused / usage error / baseline failing,
//    3 = restore failed (stderr names the backup to copy back by hand).
//
// A backup + manifest is written to <tmpdir>/devdigest-mutation-probe/ before the edit; a
// later run restores any file a killed run left mutated. Note: a running `next dev` or
// `tsx watch` may reload the mutated file for the length of the test run.
// No shell: the runner is built here from the package (pnpm for server/client, npm for
// reviewer-core), never from user input. Tests: node --test .claude/scripts/mutation-probe.test.mjs
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const EXIT = { KILLED: 0, SURVIVED: 1, REFUSED: 2, RESTORE_FAILED: 3 };
export const PACKAGES = ['server', 'client', 'reviewer-core'];
const FILTER_RE = /^[A-Za-z0-9._/-]+$/;
const DEFAULT_BACKUP_DIR = join(tmpdir(), 'devdigest-mutation-probe');

export class ProbeError extends Error {
  constructor(message, code = EXIT.REFUSED) { super(message); this.code = code; }
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const tail = (text, n = 15) => String(text ?? '').trimEnd().split('\n').slice(-n).join('\n');
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/** Validates the request and returns the resolved target. Throws ProbeError (exit 2). */
export function resolveTarget({ root, file, find, replace, test, occurrence }) {
  if (!file || typeof find !== 'string' || typeof replace !== 'string' || !test) {
    throw new ProbeError('usage: --file <path> --find <literal> --replace <literal> --test <filter> [--occurrence n]');
  }
  if (find === '') throw new ProbeError('--find must not be empty');
  if (find === replace) throw new ProbeError('--find and --replace are identical, nothing would change');
  if (!FILTER_RE.test(test)) throw new ProbeError(`--test '${test}' must be a plain name or path fragment (no globs, brackets, spaces or leading dash)`);
  if (test.startsWith('-')) throw new ProbeError('--test must not start with a dash');

  const rootReal = realpathSync(root);
  const candidate = resolve(rootReal, file);
  if (!existsSync(candidate)) throw new ProbeError(`'${file}' does not exist`);
  const abs = realpathSync(candidate);
  const rel = relative(rootReal, abs);
  const [pkg, srcDir] = rel.split(sep);
  if (rel.startsWith('..') || !PACKAGES.includes(pkg) || srcDir !== 'src') {
    throw new ProbeError(`'${file}' is not production code under ${PACKAGES.map((p) => `${p}/src/`).join(', ')}`);
  }
  if (/\.test\.[cm]?[jt]sx?$/.test(basename(abs)) || rel.split(sep).includes('vendor')) {
    throw new ProbeError(`'${rel}' is a test or vendored file; mutate the code under test instead`);
  }

  const original = readFileSync(abs);
  const text = original.toString('utf8');
  const positions = [];
  for (let i = text.indexOf(find); i !== -1; i = text.indexOf(find, i + find.length)) positions.push(i);
  if (positions.length === 0) throw new ProbeError(`--find text not found in '${rel}'`);
  let index;
  if (occurrence === undefined) {
    if (positions.length > 1) throw new ProbeError(`--find matches ${positions.length} times in '${rel}'; make it unique or pass --occurrence <1..${positions.length}>`);
    index = positions[0];
  } else {
    const n = Number(occurrence);
    if (!Number.isInteger(n) || n < 1 || n > positions.length) throw new ProbeError(`--occurrence must be 1..${positions.length}`);
    index = positions[n - 1];
  }
  const mutated = text.slice(0, index) + replace + text.slice(index + find.length);
  const line = text.slice(0, index).split('\n').length;
  return { rootReal, abs, rel, pkg, original, mutated: Buffer.from(mutated, 'utf8'), line };
}

/** Restores files that an interrupted run left mutated. Returns the repo-relative paths restored. */
export function recoverStale(root, backupDir = DEFAULT_BACKUP_DIR) {
  if (!existsSync(backupDir)) return [];
  const rootReal = realpathSync(root);
  const restored = [];
  for (const name of readdirSync(backupDir).filter((n) => n.endsWith('.json'))) {
    const manifestPath = join(backupDir, name);
    let m;
    try { m = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { continue; }
    if (!m.file?.startsWith(rootReal + sep)) continue;           // another checkout's backup
    if (m.pid && m.pid !== process.pid && pidAlive(m.pid)) {
      throw new ProbeError(`another probe (pid ${m.pid}) is running on '${relative(rootReal, m.file)}'`);
    }
    const backup = readFileSync(m.backup);
    if (sha256(backup) !== m.sha256) throw new ProbeError(`backup ${m.backup} is corrupt; restore '${m.file}' by hand`, EXIT.RESTORE_FAILED);
    if (!existsSync(m.file) || sha256(readFileSync(m.file)) !== m.sha256) {
      writeFileSync(m.file, backup);
      restored.push(relative(rootReal, m.file));
    }
    rmSync(m.backup, { force: true });
    rmSync(manifestPath, { force: true });
  }
  return restored;
}

/** Default runner: the package's vitest, no shell, argv only. */
export function defaultRun({ rootReal, pkg, test }) {
  const cwd = join(rootReal, pkg);
  const [cmd, args] = pkg === 'reviewer-core'
    ? ['npm', ['test', '--', test]]
    : ['pnpm', ['exec', 'vitest', 'run', test]];
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, CI: '1' }, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new ProbeError(`could not start ${cmd}: ${r.error.message}`);
  return { status: r.status ?? 1, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/**
 * Runs one probe. `run` is injectable for tests. Returns { exitCode, result }.
 * Always restores the file; a failed restore becomes exit 3.
 */
export function probe({ root, file, find, replace, test, occurrence, run = defaultRun, backupDir = DEFAULT_BACKUP_DIR, onArm, onDisarm }) {
  recoverStale(root, backupDir);
  const t = resolveTarget({ root, file, find, replace, test, occurrence });

  const baseline = run({ rootReal: t.rootReal, pkg: t.pkg, test });
  if (baseline.status !== 0) {
    throw new ProbeError(`the test does not pass before mutation (exit ${baseline.status}); a probe would prove nothing.\n${tail(baseline.output)}`);
  }

  mkdirSync(backupDir, { recursive: true });
  const id = sha256(Buffer.from(t.abs)).slice(0, 16);
  const backup = join(backupDir, `${id}.bak`);
  const manifest = join(backupDir, `${id}.json`);
  const digest = sha256(t.original);
  writeFileSync(backup, t.original);
  writeFileSync(manifest, JSON.stringify({ file: t.abs, sha256: digest, backup, pid: process.pid }));

  let restoredOk = false;
  const restore = () => {
    if (restoredOk) return true;
    writeFileSync(t.abs, t.original);
    restoredOk = sha256(readFileSync(t.abs)) === digest;
    if (restoredOk) { rmSync(backup, { force: true }); rmSync(manifest, { force: true }); }
    return restoredOk;
  };
  onArm?.(restore);

  let mutatedRun;
  try {
    writeFileSync(t.abs, t.mutated);
    mutatedRun = run({ rootReal: t.rootReal, pkg: t.pkg, test });
  } finally {
    let ok = false;
    try { ok = restore(); } catch { ok = false; }
    onDisarm?.();
    if (!ok) {
      // eslint-disable-next-line no-unsafe-finally
      throw new ProbeError(`RESTORE FAILED for '${t.rel}'. Copy the backup back by hand: cp '${backup}' '${t.abs}'`, EXIT.RESTORE_FAILED);
    }
  }

  const killed = mutatedRun.status !== 0;
  return {
    exitCode: killed ? EXIT.KILLED : EXIT.SURVIVED,
    result: {
      file: t.rel, line: t.line, find, replace, test,
      testExit: mutatedRun.status,
      result: killed ? 'killed' : 'survived',
      restored: true,
      outputTail: tail(mutatedRun.output),
    },
  };
}

function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        file: { type: 'string' }, find: { type: 'string' }, replace: { type: 'string' },
        test: { type: 'string' }, occurrence: { type: 'string' },
      },
      strict: true,
    }));
  } catch (e) {
    process.stderr.write(`mutation-probe: ${e.message} (use --find=<value> for values starting with '-')\n`);
    return EXIT.REFUSED;
  }
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let armed = null;
  const onSignal = (sig) => {
    try { armed?.(); } finally { process.exit(sig === 'SIGINT' ? 130 : 143); }
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  try {
    const { exitCode, result } = probe({
      root, ...values,
      onArm: (restore) => { armed = restore; process.on('exit', restore); },
      onDisarm: () => { armed = null; },
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return exitCode;
  } catch (e) {
    process.stderr.write(`mutation-probe: ${e.message}\n`);
    return e instanceof ProbeError ? e.code : EXIT.REFUSED;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
