/* conventions.ts — pure rules for the Conventions page and its skill modal
   (M2, specs/M2-conventions.md). No React, no fetch [L1]. */
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";

/** Accept / Reject are toggles: clicking the active one returns the card to pending. */
export function nextStatus(current: ConventionStatus, clicked: "accepted" | "rejected"): ConventionStatus {
  return current === clicked ? "pending" : clicked;
}

export function acceptedConventions<T extends Pick<ConventionCandidate, "status">>(list: readonly T[]): T[] {
  return list.filter((c) => c.status === "accepted");
}

/** Confidence (0–1) as a whole percent. */
export function confidencePct(confidence: number): number {
  return Math.round(Math.min(1, Math.max(0, confidence)) * 100);
}

/** Bar colour: ≥ 75 green, ≥ 50 amber, else grey. */
export function confidenceColor(pct: number): string {
  if (pct >= 75) return "var(--ok)";
  if (pct >= 50) return "var(--warn)";
  return "var(--text-muted)";
}

/** `path:start-end` (or `path:start`, or just the path when there is no range). */
export function evidenceLabel(
  c: Pick<ConventionCandidate, "evidence_path" | "evidence_start_line" | "evidence_end_line">,
): string {
  if (c.evidence_start_line == null) return c.evidence_path;
  const end = c.evidence_end_line ?? c.evidence_start_line;
  return end === c.evidence_start_line
    ? `${c.evidence_path}:${c.evidence_start_line}`
    : `${c.evidence_path}:${c.evidence_start_line}-${end}`;
}

/** Same members regardless of order. */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}
