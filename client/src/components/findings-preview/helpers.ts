import type { FindingRecord, PrFindingPreview, PrFindingsSummary, Severity } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "@/lib/severity";

/** Popover geometry shared by every findings-preview trigger (PR list, Timeline). */
export const POPOVER_WIDTH = 380;
export const POPOVER_MAX_HEIGHT = 420;
const GAP = 6;
const EDGE = 8;

export const FINDINGS_PREVIEW_TOP_N = 5;

export type PopoverPosition = { left: number; top?: number; bottom?: number; maxHeight: number };

/**
 * Place the popover under the trigger, left-aligned and clamped to the viewport.
 * Flips above the trigger when there's more room there than below and the
 * popover would not fit below.
 */
export function popoverPosition(
  rect: { left: number; top: number; bottom: number },
  viewport: { width: number; height: number },
): PopoverPosition {
  const left = Math.max(EDGE, Math.min(rect.left - EDGE, viewport.width - POPOVER_WIDTH - EDGE));
  const below = viewport.height - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  if (below >= POPOVER_MAX_HEIGHT || below >= above) {
    return { left, top: rect.bottom + GAP, maxHeight: Math.min(POPOVER_MAX_HEIGHT, below) };
  }
  return { left, bottom: viewport.height - rect.top + GAP, maxHeight: Math.min(POPOVER_MAX_HEIGHT, above) };
}

const SEVERITY_RANK = Object.fromEntries(SEVERITY_LEVELS.map((sev, i) => [sev, i])) as Record<Severity, number>;

/**
 * Client twin of the server's `summarizeFindings` (server/src/modules/pulls/findings-summary.ts):
 * counts per contract severity (zeros included) + the top N by severity, then
 * confidence desc. Counts every finding it is given — callers decide whether
 * dismissed ones belong (the Timeline keeps them). Rationale is not truncated:
 * the popover clamps it to 2 lines.
 */
export function summarizeFindings(
  findings: readonly FindingRecord[],
  topN = FINDINGS_PREVIEW_TOP_N,
): PrFindingsSummary {
  const counts = Object.fromEntries(SEVERITY_LEVELS.map((sev) => [sev, 0])) as Record<Severity, number>;
  const valid = findings.filter((f) => f.severity in SEVERITY_RANK);
  for (const f of valid) counts[f.severity] += 1;
  const top: PrFindingPreview[] = [...valid]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.confidence - a.confidence)
    .slice(0, topN)
    .map((f) => ({
      id: f.id,
      severity: f.severity,
      category: f.category,
      title: f.title,
      file: f.file,
      start_line: f.start_line,
      end_line: f.end_line,
      confidence: f.confidence,
      rationale: f.rationale,
    }));
  return { counts, total: valid.length, top };
}
