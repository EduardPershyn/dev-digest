import type { FindingActionKind, Severity } from "@devdigest/shared";

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/** Confidence below this is hidden when "hide low confidence" is on. */
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

/** Keyboard shortcut → finding action. */
export const KEY_TO_ACTION: Record<string, FindingActionKind> = {
  a: "accept",
  d: "dismiss",
};

/**
 * Severities that get a counter, in display order — exactly the Zod `Severity` contract.
 * Listed by hand because `@devdigest/shared` may only be imported as TYPES in the client
 * (Next's webpack can't resolve the barrel's `.js` specifiers at runtime). Kept in sync by
 * the type guard below (compile time) and `helpers.test.ts` (vs `Severity.options`).
 */
export const SEVERITY_LEVELS = ["CRITICAL", "WARNING", "SUGGESTION"] as const satisfies readonly Severity[];

/** Fails typecheck if the contract gains a severity that SEVERITY_LEVELS doesn't list. */
type AssertNever<T extends never> = T;
export type SeverityLevelsAreExhaustive = AssertNever<Exclude<Severity, (typeof SEVERITY_LEVELS)[number]>>;
