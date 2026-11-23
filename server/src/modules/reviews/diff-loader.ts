import type { GitClient, UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../platform/diff-parser.js';
import type { PullRecord, RepoRecord } from '../_shared/records.js';
import type { ReviewStore } from './ports.js';

/**
 * Load the unified diff for a PR. Prefers a real `git diff base...head`; falls
 * back to assembling a synthetic unified diff from the persisted pr_files
 * patches (so the reviewer works even before a clone completes / in tests).
 */
export async function loadDiff(
  git: Pick<GitClient, 'diff'>,
  store: Pick<ReviewStore, 'getPrFiles'>,
  pull: PullRecord,
  repo: RepoRecord,
): Promise<UnifiedDiff> {
  try {
    const diff = await git.diff({ owner: repo.owner, name: repo.name }, pull.base, pull.headSha);
    if (diff.files.length > 0) return diff;
  } catch {
    /* fall through to pr_files reconstruction */
  }
  return diffFromPrFiles(store, pull.id);
}

/** Reconstruct a UnifiedDiff from persisted pr_files patches. */
export async function diffFromPrFiles(
  store: Pick<ReviewStore, 'getPrFiles'>,
  prId: string,
): Promise<UnifiedDiff> {
  const files = await store.getPrFiles(prId);
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parseUnifiedDiff(parts.join('\n'));
}
