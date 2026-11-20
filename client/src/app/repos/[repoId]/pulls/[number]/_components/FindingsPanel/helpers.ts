import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_LEVELS, SEVERITY_ORDER } from "./constants";

/** Drop low-confidence findings when hideLow is on. */
export function applyConfidence(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  return hideLow ? findings.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD) : findings;
}

/** Per-severity counts after the confidence filter. Every contract level is present (0 if none). */
export function countBySeverity(findings: FindingRecord[], hideLow: boolean): Record<Severity, number> {
  const counts = Object.fromEntries(SEVERITY_LEVELS.map((s) => [s, 0])) as Record<Severity, number>;
  for (const f of applyConfidence(findings, hideLow)) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}

/** Confidence filter → optional severity filter → sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = applyConfidence(findings, hideLow);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}
