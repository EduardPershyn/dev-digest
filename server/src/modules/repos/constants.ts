/**
 * F1 — repos module constants (extracted from routes.ts; no behaviour change).
 */

import { z } from 'zod';

/** JobRunner kind for the asynchronous `git clone` job. */
export const CLONE_JOB_KIND = 'clone';

/**
 * Payload enqueued for (and consumed by) the `clone` job. Job payloads come
 * back out of the DB as `unknown`, so the handler parses with this schema.
 * `url` is informational only — the clone URL is always rebuilt from owner/name.
 */
export const CloneJobPayload = z.object({
  repoId: z.string(),
  owner: z.string(),
  name: z.string(),
  url: z.string().optional(),
});
export type CloneJobPayload = z.infer<typeof CloneJobPayload>;

/** Clone depth — shallow clone (latest commit only) keeps imports fast. */
export const CLONE_DEPTH = 1;

/** Secret name (via the Secrets adapter) holding the GitHub PAT for private clones. */
export const GITHUB_TOKEN_SECRET = 'GITHUB_TOKEN';

/** The only host a repo may be imported from (S1, security hardening). */
export const GITHUB_HOST = 'github.com';

/**
 * GitHub login rules: alphanumerics and single hyphens, no leading hyphen,
 * max 39 chars. Deliberately rejects `.`/`..` — the owner becomes a directory
 * under `cloneDir`, so a dot-segment here is a path traversal.
 */
export const GITHUB_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** GitHub repository name rules: `[A-Za-z0-9._-]`, max 100 chars. `.`/`..` are rejected separately. */
export const GITHUB_REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

/** Strict scp-like SSH form: `git@github.com:owner/repo(.git)`. */
export const GITHUB_SSH_RE = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/;
