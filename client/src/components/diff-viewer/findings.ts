/* Review-finding support for the DiffViewer (M3 Smart Diff, Files changed tab).
   Pure helpers + the API shape the viewer needs. The finding card itself is a
   slot passed in by the caller, so this shared component never imports `app/`
   [S4]; all wording comes from the caller too. */
import type { ComponentType } from "react";
import type { FindingActionKind, FindingRecord, Severity } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "@/lib/severity";
import { lineKey } from "./comments";

/** Props the viewer passes to the caller's finding card. */
export interface DiffFindingCardProps {
  f: FindingRecord;
  defaultExpanded?: boolean;
  pending?: boolean;
  onAction?: (action: FindingActionKind) => void;
}

/** What the viewer needs to render review findings inside the diff. */
export interface DiffFindingApi {
  /** Already-selected findings for the PR (dismissed included — rendered dimmed). */
  findings: FindingRecord[];
  /** When false, finding cards and line marks are hidden (same switch as comments). */
  show: boolean;
  /** Files that get the "has findings" dot (counted findings only). */
  flaggedPaths: ReadonlySet<string>;
  /** The finding card component (PascalCase slot, not a render factory). */
  Card: ComponentType<DiffFindingCardProps>;
  onAction: (f: FindingRecord, action: FindingActionKind) => void;
  /** Finding whose action is in flight, if any. */
  pendingId: string | null;
  labels: {
    severity: Record<Severity, string>;
    /** Title of the "not in this diff" block; receives the count. */
    outOfPatch: (count: number) => string;
    findingDot: string;
  };
}

/** Findings anchor to the NEW side of the diff at their start line. */
export function findingKey(f: Pick<FindingRecord, "start_line">): string | null {
  return lineKey("RIGHT", f.start_line);
}

/**
 * Split a file's findings into those whose `RIGHT:start_line` is a rendered
 * line and the rest ("outside this diff"), so nothing is silently dropped.
 */
export function partitionFindings(
  fileFindings: FindingRecord[],
  renderedKeys: ReadonlySet<string>,
): { matched: Map<string, FindingRecord[]>; outOfPatch: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const outOfPatch: FindingRecord[] = [];
  for (const f of fileFindings) {
    const key = findingKey(f);
    if (key && renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      outOfPatch.push(f);
    }
  }
  return { matched, outOfPatch };
}

/**
 * Severity a line is marked with: the highest severity among its NON-dismissed
 * findings. Null when there are none (a line with only dismissed findings gets
 * no strip or label; its dimmed card still renders).
 */
export function lineMark(findings: readonly FindingRecord[]): Severity | null {
  let best: number | null = null;
  for (const f of findings) {
    if (f.dismissed_at) continue;
    const rank = SEVERITY_LEVELS.indexOf(f.severity as (typeof SEVERITY_LEVELS)[number]);
    if (rank < 0) continue;
    if (best === null || rank < best) best = rank;
  }
  return best === null ? null : SEVERITY_LEVELS[best]!;
}
