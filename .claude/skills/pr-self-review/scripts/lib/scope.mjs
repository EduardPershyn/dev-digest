// Collects "pending changes": merge-base(<base>, HEAD) → working tree, plus untracked files.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { makeAddedFile, parseUnifiedDiff } from './diff.mjs';

const MAX_UNTRACKED_BYTES = 1024 * 1024;

export function git(repoRoot, args, { allowFail = false, timeout = 60_000 } = {}) {
  const r = spawnSync('git', ['-c', 'core.quotepath=off', ...args], {
    cwd: repoRoot, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, timeout,
  });
  if (r.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || r.error?.message || '').trim()}`);
  }
  return r;
}

export function repoRootFrom(cwd) {
  return git(cwd, ['rev-parse', '--show-toplevel']).stdout.trim();
}

function lines(s) {
  return s.split('\n').map((l) => l.trim()).filter(Boolean);
}

function resolveBaseRef(repoRoot, base) {
  for (const ref of [`origin/${base}`, base]) {
    if (git(repoRoot, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { allowFail: true }).status === 0) return ref;
  }
  throw new Error(`base branch "${base}" not found (tried origin/${base} and ${base})`);
}

function countCommits(repoRoot, range) {
  const r = git(repoRoot, ['rev-list', '--count', range], { allowFail: true });
  return r.status === 0 ? Number(r.stdout.trim()) : 0;
}

/**
 * @param base     branch the PR will target; resolved as origin/<base>, then <base>
 * @param baseRef  exact ref to diff against (overrides `base` resolution)
 */
export function collectScope({ repoRoot, base = 'main', baseRef: baseRefOpt, fetch = true }) {
  if (fetch && !baseRefOpt) git(repoRoot, ['fetch', '--quiet', 'origin', base], { allowFail: true, timeout: 20_000 });

  const headSha = git(repoRoot, ['rev-parse', 'HEAD']).stdout.trim();
  const branch = git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  const baseRef = baseRefOpt ?? resolveBaseRef(repoRoot, base);
  const baseSha = git(repoRoot, ['merge-base', baseRef, 'HEAD']).stdout.trim();
  // Local <base> ahead of origin/<base>: those unpushed commits will show up in the PR too.
  const localBaseAhead = baseRef === `origin/${base}` ? countCommits(repoRoot, `${baseRef}..${base}`) : 0;

  const diffText = git(repoRoot, ['diff', '--no-color', '--no-ext-diff', '-M', '--unified=3', baseSha]).stdout;
  const committed = new Set(lines(git(repoRoot, ['diff', '--name-only', '-M', baseSha, 'HEAD']).stdout));
  const uncommitted = new Set(lines(git(repoRoot, ['diff', '--name-only', '-M', 'HEAD']).stdout));
  // Our own run output never counts as a change, even where .gitignore doesn't cover it.
  const untracked = git(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z']).stdout.split('\0')
    .filter((p) => p && !p.startsWith('.devdigest/self-review/'));

  const files = parseUnifiedDiff(diffText);
  for (const f of files) {
    const c = committed.has(f.path) || committed.has(f.oldPath);
    const u = uncommitted.has(f.path) || uncommitted.has(f.oldPath);
    f.origin = c && u ? 'committed+uncommitted' : u ? 'uncommitted' : 'committed';
  }

  const hash = createHash('sha256').update(baseSha).update('\0').update(diffText);
  for (const path of untracked) {
    const abs = join(repoRoot, path);
    let size = 0;
    try { size = statSync(abs).size; } catch { continue; }
    if (size > MAX_UNTRACKED_BYTES) {
      files.push({ path, oldPath: null, status: 'A', binary: true, origin: 'uncommitted', added: 0, removed: 0, hunks: [] });
      hash.update(`\0${path}\0${size}`);
      continue;
    }
    const buf = readFileSync(abs);
    hash.update(`\0${path}\0`).update(buf);
    if (buf.includes(0)) {
      files.push({ path, oldPath: null, status: 'A', binary: true, origin: 'uncommitted', added: 0, removed: 0, hunks: [] });
    } else {
      files.push(makeAddedFile(path, buf.toString('utf8')));
    }
  }

  return {
    base, baseRef, baseSha, headSha, branch, localBaseAhead,
    dirty: uncommitted.size > 0 || untracked.length > 0,
    uncommitted: [...new Set([...uncommitted, ...untracked])].sort(),
    fingerprint: hash.digest('hex'),
    files,
  };
}
