/* Pure display rules for IntentCard (L1/L10): no React, no fetch. */
import type {
  IntentConfidence,
  IntentMissingContext,
  IntentSourceKind,
  PrIntentRecord,
} from "@devdigest/shared";

export type IntentCardState = "empty" | "failed" | "ok";

/** Which body the card renders. A failed attempt that left no earlier content
   is `failed`; a failed reclassification keeps the previous intent (`ok`). */
export function cardState(intent: PrIntentRecord | null | undefined): IntentCardState {
  if (!intent) return "empty";
  if (intent.status === "failed" && intent.summary.trim() === "") return "failed";
  return "ok";
}

/** Badge colours per confidence level. */
export function confidenceTone(c: IntentConfidence): { color: string; bg: string } {
  switch (c) {
    case "high":
      return { color: "var(--ok)", bg: "var(--ok-bg)" };
    case "medium":
      return { color: "var(--warn)", bg: "var(--warn-bg)" };
    default:
      return { color: "var(--text-muted)", bg: "var(--bg-hover)" };
  }
}

/** i18n key (under `prReview.intent`) for a source kind; takes `{ref}`. */
export function sourceLabelKey(kind: IntentSourceKind): `source.${IntentSourceKind}` {
  return `source.${kind}`;
}

/** i18n key (under `prReview.intent`) for why a linked doc was not read. */
export function missingReasonKey(
  reason: IntentMissingContext["reason"],
): `reason.${IntentMissingContext["reason"]}` {
  return `reason.${reason}`;
}

/** The URL as a link target only when it is plain http(s); the URL comes from
   the PR body, so anything else (javascript:, data:) is rendered as text. */
export function externalHref(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}
