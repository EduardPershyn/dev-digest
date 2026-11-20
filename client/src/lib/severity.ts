import type { Severity } from "@devdigest/shared";

/**
 * Contract severities in display order — exactly the Zod `Severity` enum.
 * Listed by hand because `@devdigest/shared` may only be imported as TYPES in the
 * client (Next's webpack can't resolve the barrel's `.js` specifiers at runtime).
 * Kept in sync by the type guard below (compile time) and a Vitest test against
 * `Severity.options` (FindingsPanel/helpers.test.ts).
 */
export const SEVERITY_LEVELS = ["CRITICAL", "WARNING", "SUGGESTION"] as const satisfies readonly Severity[];

/** Fails typecheck if the contract gains a severity that SEVERITY_LEVELS doesn't list. */
type AssertNever<T extends never> = T;
export type SeverityLevelsAreExhaustive = AssertNever<Exclude<Severity, (typeof SEVERITY_LEVELS)[number]>>;
