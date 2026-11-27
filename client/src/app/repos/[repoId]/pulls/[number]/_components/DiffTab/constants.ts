/* Constants for the Files changed tab (M3 Smart Diff). */
import type { Severity, SmartDiffRole } from "@devdigest/shared";

/** i18n keys (prReview.smartDiff.*) + look per role. `satisfies Record<SmartDiffRole, …>`
   makes a new contract role fail typecheck until it is described here. */
export const ROLE_META = {
  core: { labelKey: "coreLabel", descKey: "coreDesc", color: "var(--accent)", defaultCollapsed: false },
  tests: { labelKey: "testsLabel", descKey: "testsDesc", color: "var(--ok)", defaultCollapsed: false },
  wiring: { labelKey: "wiringLabel", descKey: "wiringDesc", color: "var(--warn)", defaultCollapsed: false },
  docs: { labelKey: "docsLabel", descKey: "docsDesc", color: "var(--info)", defaultCollapsed: true },
  boilerplate: {
    labelKey: "boilerplateLabel",
    descKey: "boilerplateDesc",
    color: "var(--text-muted)",
    defaultCollapsed: true,
  },
} as const satisfies Record<
  SmartDiffRole,
  { labelKey: string; descKey: string; color: string; defaultCollapsed: boolean }
>;

/** Line label per severity (prReview.smartDiff.*): CRITICAL → blocker, … */
export const SEVERITY_LABEL_KEY = {
  CRITICAL: "blockerLabel",
  WARNING: "warningLabel",
  SUGGESTION: "suggestionLabel",
} as const satisfies Record<Severity, string>;

export type DiffOrder = "smart" | "original";

/** Sticky offset of a group header: the height of the sticky PrDetailHeader above it
   (title row + meta row + tabs = 144px, measured in headless Chrome at 1400px). The
   group header has a lower zIndex, so a taller (wrapped) PR header just overlaps it. */
export const GROUP_HEADER_STICKY_TOP = 144;
