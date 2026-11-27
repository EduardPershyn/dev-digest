import { createHash } from 'node:crypto';
import type {
  ChatMessage,
  IntentConfidence,
  IntentMissingContext,
  IntentSource,
  PrIntentRecord,
} from '@devdigest/shared';
import { wrapUntrusted, type IntentBlockInput } from '@devdigest/reviewer-core';
import type { IntentRecord, PullRecord } from '../_shared/records.js';
import {
  CLASSIFIER_VERSION,
  MAX_BODY_CHARS,
  MAX_CHANGED_FILES,
  MAX_DOC_CHARS,
  MAX_ERROR_CHARS,
  MAX_HEADER_CHARS,
  MAX_HEADERS_PER_FILE,
  MAX_TITLE_CHARS,
  MAX_TOTAL_DOC_CHARS,
  MIN_BODY_CHARS,
} from './constants.js';
import type { ChangedFile, ClassifierInput, PromptComponent } from './types.js';

/**
 * M3 — intent domain rules (pure). Prompt building, confidence capping,
 * staleness and DTO mapping. No I/O; `node:crypto` only for the input hash.
 */

// ---- changed files (paths + hunk headers ONLY) ------------------------------

/**
 * Changed paths and their `@@ … @@ <section>` header lines from a raw unified
 * diff. Content lines (`+`, `-`, ` `, `\`) are never read, so no added or
 * removed code can reach the classifier. `+++ b/` is only honoured in a file's
 * header (before its first hunk), where it cannot be an added line.
 */
export function hunkHeadersFromRaw(raw: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  let current: ChangedFile | null = null;
  let inHeader = false;
  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (files.length >= MAX_CHANGED_FILES) break;
      const m = line.match(/^diff --git a\/.+ b\/(.+)$/);
      current = { path: m?.[1] ?? line.slice('diff --git '.length), headers: [] };
      files.push(current);
      inHeader = true;
      continue;
    }
    if (!current) continue;
    if (inHeader && line.startsWith('+++ ')) {
      const p = line.slice(4).trim();
      if (p.startsWith('b/')) current.path = p.slice(2);
      continue;
    }
    if (/^@@ .* @@/.test(line)) {
      inHeader = false;
      if (current.headers.length < MAX_HEADERS_PER_FILE) {
        current.headers.push(line.slice(0, MAX_HEADER_CHARS));
      }
    }
  }
  return files;
}

// ---- prompt ------------------------------------------------------------------

function cap(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

function blockName(kind: string, ref: string): string {
  return kind === 'file' ? `file-${ref}` : `${kind}-${ref.replace(/^#/, '')}`;
}

export interface ClassifierMessages {
  messages: ChatMessage[];
  /** One entry per prompt block (system first), with the exact text sent. */
  components: PromptComponent[];
  /** What the classifier read (stored on the record). */
  sources: IntentSource[];
  /** Input missing list plus docs dropped by the total doc cap. */
  missing: IntentMissingContext[];
}

/**
 * Build the classifier messages. Every author-controlled source gets its OWN
 * untrusted block; only the framing lines are trusted. Missing documents add
 * their URL and reason, never content.
 */
export function buildClassifierMessages(input: ClassifierInput): ClassifierMessages {
  const components: PromptComponent[] = [
    { name: 'system', chars: input.system.length, truncated: false, text: input.system },
  ];
  const sources: IntentSource[] = [];
  const missing = [...input.missing];
  const sections: string[] = [
    `Classify the intent of pull request #${input.prNumber}. Answer with the schema fields only.`,
  ];
  const push = (name: string, framing: string, text: string, truncated: boolean) => {
    const block = wrapUntrusted(name, text);
    components.push({ name, chars: text.length, truncated, text: block });
    sections.push(`${framing}\n${block}`);
  };

  const title = cap(input.title.trim(), MAX_TITLE_CHARS);
  if (title.text) {
    push('pr-title', '## PR title', title.text, title.truncated);
    sources.push({ kind: 'pr_title', ref: 'pr_title', chars: title.text.length, truncated: title.truncated, status: 'used' });
  } else {
    sources.push({ kind: 'pr_title', ref: 'pr_title', chars: 0, truncated: false, status: 'empty' });
  }

  const body = cap((input.body ?? '').trim(), MAX_BODY_CHARS);
  if (body.text) {
    push('pr-body', '## PR description', body.text, body.truncated);
    sources.push({ kind: 'pr_body', ref: 'pr_body', chars: body.text.length, truncated: body.truncated, status: 'used' });
  } else {
    sections.push('## PR description\n(The author wrote no description.)');
    sources.push({ kind: 'pr_body', ref: 'pr_body', chars: 0, truncated: false, status: 'empty' });
  }

  let budget = MAX_TOTAL_DOC_CHARS;
  const docSections: string[] = [];
  for (const doc of input.docs) {
    if (budget <= 0) {
      missing.push({ url: doc.url, kind: doc.kind, reason: 'limit' });
      continue;
    }
    const raw = doc.title ? `Title: ${doc.title}\n\n${doc.text}` : doc.text;
    const capped = cap(raw.trim(), Math.min(MAX_DOC_CHARS, budget));
    budget -= capped.text.length;
    const label = doc.kind === 'file' ? `File ${doc.ref}` : `${doc.kind === 'pr' ? 'Pull request' : 'Issue'} ${doc.ref}`;
    const name = blockName(doc.kind, doc.ref);
    const block = wrapUntrusted(name, capped.text);
    components.push({ name, chars: capped.text.length, truncated: capped.truncated, text: block });
    docSections.push(`### ${label}\n${block}`);
    sources.push({
      kind: doc.kind,
      ref: doc.ref,
      title: doc.title ?? null,
      chars: capped.text.length,
      truncated: capped.truncated,
      status: capped.text ? 'used' : 'empty',
    });
  }
  if (docSections.length > 0) sections.push(`## Linked documents\n${docSections.join('\n\n')}`);

  const files = input.changedFiles.slice(0, MAX_CHANGED_FILES);
  if (files.length > 0) {
    const text = files
      .map((f) => [f.path, ...f.headers.map((h) => `  ${h}`)].join('\n'))
      .join('\n');
    push('changed-files', '## Changed files (paths and hunk headers only)', text, input.changedFiles.length > files.length);
    sources.push({
      kind: 'changed_files',
      ref: 'changed_files',
      chars: text.length,
      truncated: input.changedFiles.length > files.length,
      status: 'used',
    });
  }

  if (missing.length > 0) {
    // URLs come from the author's body, so the list itself is data; only the
    // instruction around it is trusted.
    const list = missing.map((m) => `- ${m.url} (${m.reason})`).join('\n');
    const block = wrapUntrusted('missing-context', list);
    components.push({ name: 'missing-context', chars: list.length, truncated: false, text: block });
    sections.push(
      '## Missing context\nThese linked documents could not be read. Do not guess their content; ' +
        `you may only note that they are missing.\n${block}`,
    );
  }

  const user = sections.join('\n\n');
  return {
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: user },
    ],
    components,
    sources,
    missing,
  };
}

// ---- confidence --------------------------------------------------------------

const CONFIDENCE_RANK: Record<IntentConfidence, number> = { low: 0, medium: 1, high: 2 };
/** Missing reasons that mean a referenced doc existed but could not be read. */
const BLOCKING_MISSING = new Set(['not_found', 'forbidden', 'github_unavailable']);

/**
 * Upper bound for the confidence, from the evidence alone (never the model):
 * a body under MIN_BODY_CHARS → low; ≥1 linked doc read and no referenced doc
 * unreadable → high; otherwise medium.
 */
export function confidenceCap(input: {
  body: string | null;
  sources: IntentSource[];
  missing: IntentMissingContext[];
}): IntentConfidence {
  if ((input.body ?? '').trim().length < MIN_BODY_CHARS) return 'low';
  const docsUsed = input.sources.some(
    (s) => (s.kind === 'issue' || s.kind === 'pr' || s.kind === 'file') && s.status === 'used',
  );
  const blocked = input.missing.some((m) => BLOCKING_MISSING.has(m.reason));
  return docsUsed && !blocked ? 'high' : 'medium';
}

/** The lower of the model's confidence and the evidence cap. */
export function capConfidence(model: IntentConfidence, capValue: IntentConfidence): IntentConfidence {
  return CONFIDENCE_RANK[model] <= CONFIDENCE_RANK[capValue] ? model : capValue;
}

// ---- staleness ---------------------------------------------------------------

/** sha256 over the classifier inputs that live on the PR row (+ classifier version). */
export function intentInputHash(pull: {
  title: string;
  body: string | null;
  base: string;
  headSha: string;
}): string {
  return createHash('sha256')
    .update(JSON.stringify([CLASSIFIER_VERSION, pull.title, pull.body ?? '', pull.base, pull.headSha]))
    .digest('hex');
}

/** The PR changed since classification (head moved, or title/body/base/version differ). */
export function isStale(record: Pick<IntentRecord, 'headSha' | 'inputHash'>, pull: PullRecord): boolean {
  return record.headSha !== pull.headSha || record.inputHash !== intentInputHash(pull);
}

/** A record the review can reuse without reclassifying. */
export function isReusable(record: IntentRecord | undefined, pull: PullRecord): record is IntentRecord {
  return !!record && record.status === 'ok' && !isStale(record, pull);
}

export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > MAX_ERROR_CHARS ? `${msg.slice(0, MAX_ERROR_CHARS)}…` : msg;
}

// ---- mapping -----------------------------------------------------------------

export function toPrIntentDto(record: IntentRecord, pull: PullRecord): PrIntentRecord {
  return {
    pr_id: record.prId,
    summary: record.summary,
    in_scope: record.inScope,
    out_of_scope: record.outOfScope,
    confidence: record.confidence,
    sources: record.sources,
    missing_context: record.missingContext,
    provider: record.provider,
    model: record.model,
    head_sha: record.headSha,
    input_hash: record.inputHash,
    usage: { tokens_in: record.tokensIn, tokens_out: record.tokensOut, cost_usd: record.costUsd },
    status: record.status,
    error: record.error,
    classified_at: record.classifiedAt ? record.classifiedAt.toISOString() : null,
    updated_at: record.updatedAt.toISOString(),
    stale: isStale(record, pull),
  };
}

/** The reviewer-core prompt slot for a stored intent. */
export function toIntentBlockInput(record: IntentRecord): IntentBlockInput {
  return {
    summary: record.summary,
    in_scope: record.inScope,
    out_of_scope: record.outOfScope,
    confidence: record.confidence,
    missing_context: record.missingContext.map((m) => `${m.url} (${m.reason})`),
  };
}

/** Linked docs + title/body/changed files actually read. */
export function sourcesUsed(record: Pick<IntentRecord, 'sources'>): number {
  return record.sources.filter((s) => s.status === 'used').length;
}
