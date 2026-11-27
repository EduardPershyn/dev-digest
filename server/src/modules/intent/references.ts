import type { IntentMissingContext } from '@devdigest/shared';
import { IMAGE_EXTENSIONS, MAX_MISSING, MAX_REFS, MAX_URL_CHARS } from './constants.js';
import type { IntentRef } from './types.js';

/**
 * M3 — reference extraction from a PR body (pure, domain ring).
 *
 * Only SAME-REPO GitHub references become fetchable refs (decision 1: GitHub
 * only, through the authenticated API). Everything else becomes a
 * `missing_context` entry with a reason; its content is never fetched, so there
 * is no generic HTTP fetcher and no SSRF surface.
 */

export interface RepoName {
  owner: string;
  name: string;
}

export interface ExtractedReferences {
  refs: IntentRef[];
  missing: IntentMissingContext[];
}

/** http(s) URLs; trailing sentence punctuation is trimmed afterwards. */
const URL_RE = /https?:\/\/[^\s<>()[\]{}"'`]+/gi;
/** `#12` or `owner/repo#12`, not preceded by a word char, `/`, `&` or `#`. */
const SHORT_REF_RE = /(?<![\w/&#])(?:([A-Za-z0-9][\w.-]*)\/([\w.-]+))?#(\d+)\b/g;
const TRAILING_PUNCT_RE = /[.,;:!?*_~]+$/;
const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
/** Same-repo GitHub pages that are noise, not context (CI, badges). */
const GITHUB_IGNORED_SECTIONS = new Set(['actions', 'workflows']);

/** Strip query string and fragment (they can carry tokens) and cap the length. */
export function redactUrl(url: string): string {
  let out: string;
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    out = u.toString();
  } catch {
    out = url.split(/[?#]/, 1)[0] ?? '';
  }
  return out.length > MAX_URL_CHARS ? out.slice(0, MAX_URL_CHARS) : out;
}

function sameRepo(owner: string, name: string, repo: RepoName): boolean {
  return owner.toLowerCase() === repo.owner.toLowerCase() && name.toLowerCase() === repo.name.toLowerCase();
}

function isImagePath(pathname: string): boolean {
  const last = pathname.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  return dot > 0 && IMAGE_EXTENSIONS.has(last.slice(dot + 1).toLowerCase());
}

function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

type Classified =
  | { type: 'ref'; ref: IntentRef }
  | { type: 'missing'; entry: IntentMissingContext }
  | { type: 'ignore' };

function issueUrl(owner: string, name: string, n: number, kind: 'issues' | 'pull' = 'issues'): string {
  return `https://github.com/${owner}/${name}/${kind}/${n}`;
}

function classifyUrl(raw: string, repo: RepoName): Classified {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { type: 'ignore' };
  }
  if (isImagePath(u.pathname)) return { type: 'ignore' };
  const url = redactUrl(raw);
  const host = u.hostname.toLowerCase();
  if (!GITHUB_HOSTS.has(host)) {
    return { type: 'missing', entry: { url, kind: 'external', reason: 'unsupported_host' } };
  }

  const parts = u.pathname.split('/').filter(Boolean);
  const [owner, name, section, ...rest] = parts;
  if (!owner || !name) {
    return { type: 'missing', entry: { url, kind: 'external', reason: 'unsupported_host' } };
  }
  if (section && GITHUB_IGNORED_SECTIONS.has(section)) return { type: 'ignore' };
  if (parts.some((p) => p.toLowerCase().includes('badge'))) return { type: 'ignore' };
  if (!sameRepo(owner, name, repo)) {
    return { type: 'missing', entry: { url, kind: 'cross_repo', reason: 'cross_repo' } };
  }

  if ((section === 'issues' || section === 'pull') && rest[0] && /^\d+$/.test(rest[0])) {
    const n = Number(rest[0]);
    const kind = section === 'pull' ? 'pr' : 'issue';
    return { type: 'ref', ref: { kind, number: n, url: issueUrl(repo.owner, repo.name, n, section) } };
  }
  if (section === 'blob' && rest.length >= 2) {
    const segments = rest.map(safeDecode);
    if (segments.some((s) => s === null)) {
      return { type: 'missing', entry: { url, kind: 'file', reason: 'not_found' } };
    }
    return { type: 'ref', ref: { kind: 'file', segments: segments as string[], url } };
  }
  // Other same-repo pages (tree, commit, wiki, …) are not readable sources.
  return { type: 'missing', entry: { url, kind: 'external', reason: 'unsupported_host' } };
}

function refKey(ref: IntentRef): string {
  // Issues and PRs share one number space on GitHub.
  return ref.kind === 'file' ? `file:${ref.segments.join('/')}` : `num:${ref.number}`;
}

/**
 * Find references in `body`, in body order, deduped. Self-references to the
 * PR itself (`selfNumber`) are skipped. Refs beyond MAX_REFS become `limit`
 * missing entries; at most MAX_MISSING missing entries are kept.
 */
export function extractReferences(
  body: string,
  repo: RepoName,
  selfNumber?: number,
): ExtractedReferences {
  const found: { index: number; item: Classified }[] = [];

  // 1. URLs — then blank them out so `#123` inside a URL isn't re-matched.
  let masked = body;
  for (const m of body.matchAll(URL_RE)) {
    const text = m[0].replace(TRAILING_PUNCT_RE, '');
    found.push({ index: m.index ?? 0, item: classifyUrl(text, repo) });
    masked = masked.slice(0, m.index) + ' '.repeat(m[0].length) + masked.slice((m.index ?? 0) + m[0].length);
  }

  // 2. `#n` / `owner/repo#n` (closing keywords need no special case).
  for (const m of masked.matchAll(SHORT_REF_RE)) {
    const [, owner, name, num] = m;
    const n = Number(num);
    if (!Number.isSafeInteger(n) || n <= 0) continue;
    if (owner && name && !sameRepo(owner, name, repo)) {
      found.push({
        index: m.index ?? 0,
        item: { type: 'missing', entry: { url: issueUrl(owner, name, n), kind: 'cross_repo', reason: 'cross_repo' } },
      });
      continue;
    }
    found.push({
      index: m.index ?? 0,
      item: { type: 'ref', ref: { kind: 'issue', number: n, url: issueUrl(repo.owner, repo.name, n) } },
    });
  }

  found.sort((a, b) => a.index - b.index);

  const refs: IntentRef[] = [];
  const missing: IntentMissingContext[] = [];
  const seenRefs = new Set<string>();
  const seenMissing = new Set<string>();
  const addMissing = (entry: IntentMissingContext) => {
    if (seenMissing.has(entry.url) || missing.length >= MAX_MISSING) return;
    seenMissing.add(entry.url);
    missing.push(entry);
  };

  for (const { item } of found) {
    if (item.type === 'ignore') continue;
    if (item.type === 'missing') {
      addMissing(item.entry);
      continue;
    }
    const ref = item.ref;
    if (ref.kind !== 'file' && ref.number === selfNumber) continue;
    const key = refKey(ref);
    if (seenRefs.has(key)) continue;
    seenRefs.add(key);
    if (refs.length >= MAX_REFS) {
      addMissing({ url: ref.url, kind: ref.kind, reason: 'limit' });
      continue;
    }
    refs.push(ref);
  }
  return { refs, missing };
}

/**
 * Split the `/blob/` URL tail into `{ ref, path }`. Branch names may contain
 * `/`, so the LONGEST prefix that equals a known ref wins; otherwise the first
 * segment is the ref. A ref equal to the PR branch is pinned to `headSha` so
 * the doc is read at the reviewed commit. Returns null for an unusable path
 * (empty, or with `.`/`..` segments — never let a path walk the API).
 */
export function splitBlobRef(
  segments: string[],
  knownRefs: string[],
  pr: { branch: string; headSha: string },
): { ref: string; path: string } | null {
  if (segments.length < 2) return null;
  const known = new Set(knownRefs.filter(Boolean));
  let cut = 1;
  for (let i = segments.length - 1; i >= 1; i--) {
    if (known.has(segments.slice(0, i).join('/'))) {
      cut = i;
      break;
    }
  }
  const ref = segments.slice(0, cut).join('/');
  const pathSegments = segments.slice(cut);
  // Segments are already percent-decoded, so an encoded `%2F` / `%5C` would smuggle a
  // separator (and thus a `..`) inside one segment — reject any segment that holds one.
  if (
    pathSegments.length === 0 ||
    pathSegments.some((s) => s === '' || s === '.' || s === '..' || /[\\/]/.test(s))
  ) {
    return null;
  }
  return { ref: ref === pr.branch ? pr.headSha : ref, path: pathSegments.join('/') };
}
