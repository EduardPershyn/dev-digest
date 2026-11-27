import type {
  IntentConfidence,
  IntentMissingContext,
  IntentSource,
  IntentSourceKind,
} from '@devdigest/shared';
import type { IntentBlockInput } from '@devdigest/reviewer-core';

/** M3 — intent module internal types (domain ring). */

/** Who asked for the classification. */
export type ClassifyTrigger = 'manual' | 'review';

/** A same-repo reference found in the PR body, fetched through the GitHub API. */
export type IntentRef =
  | { kind: 'issue' | 'pr'; number: number; url: string }
  /** `segments` = the URL path after `/blob/` (ref + path, not yet split). */
  | { kind: 'file'; segments: string[]; url: string };

/** A linked document that was read (text already decoded, not yet capped). */
export interface FetchedDoc {
  kind: Extract<IntentSourceKind, 'issue' | 'pr' | 'file'>;
  /** `#12` or the repo path. */
  ref: string;
  /** The (redacted) URL it was linked by. */
  url: string;
  title?: string | null;
  text: string;
}

/** One changed file with its `@@ … @@` hunk header lines (never content lines). */
export interface ChangedFile {
  path: string;
  headers: string[];
}

/** One block of the classifier prompt, measured for the log line. */
export interface PromptComponent {
  name: string;
  chars: number;
  truncated: boolean;
  text: string;
}

export interface ClassifierInput {
  system: string;
  repoFullName: string;
  prNumber: number;
  title: string;
  body: string | null;
  docs: FetchedDoc[];
  changedFiles: ChangedFile[];
  missing: IntentMissingContext[];
}

/** Intent handed to a review run (structurally `reviews/ports.ts` `ReviewIntent`). */
export interface IntentForReview {
  status: 'reused' | 'classified' | 'failed';
  reason: string | null;
  intent: {
    block: IntentBlockInput;
    confidence: IntentConfidence;
    provider: string | null;
    model: string | null;
    sourcesUsed: number;
    missing: number;
    costUsd: number | null;
    tokensIn: number | null;
  } | null;
}

export type { IntentConfidence, IntentMissingContext, IntentSource };
