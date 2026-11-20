import { describe, it, expect } from "vitest";
import { Severity, type FindingRecord } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "./constants";
import { countBySeverity, visibleFindings } from "./helpers";

function mk(id: string, severity: Severity, confidence = 0.9): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: id,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "",
    suggestion: null,
    confidence,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const FINDINGS = [
  mk("s1", "SUGGESTION"),
  mk("w1", "WARNING"),
  mk("c1", "CRITICAL"),
  mk("w2", "WARNING", 0.5),
  mk("w3", "WARNING", 0.65),
];

describe("SEVERITY_LEVELS", () => {
  it("matches the Zod Severity contract exactly (no custom levels, same order)", () => {
    expect(SEVERITY_LEVELS).toEqual(Severity.options);
  });
});

describe("countBySeverity", () => {
  it("counts every contract level, including zeros", () => {
    expect(countBySeverity([mk("w", "WARNING")], false)).toEqual({
      CRITICAL: 0,
      WARNING: 1,
      SUGGESTION: 0,
    });
  });

  it("counts the raw run totals when hideLow is off", () => {
    expect(countBySeverity(FINDINGS, false)).toEqual({ CRITICAL: 1, WARNING: 3, SUGGESTION: 1 });
  });

  it("drops findings below the 0.65 threshold when hideLow is on (0.65 itself stays)", () => {
    expect(countBySeverity(FINDINGS, true)).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 1 });
  });
});

describe("visibleFindings", () => {
  const ids = (fs: FindingRecord[]) => fs.map((f) => f.id);

  it("without a severity keeps the old behaviour: all findings sorted by severity", () => {
    expect(ids(visibleFindings(FINDINGS, false))).toEqual(["c1", "w1", "w2", "w3", "s1"]);
    expect(ids(visibleFindings(FINDINGS, false, null))).toEqual(["c1", "w1", "w2", "w3", "s1"]);
  });

  it("keeps only the selected severity", () => {
    expect(ids(visibleFindings(FINDINGS, false, "WARNING"))).toEqual(["w1", "w2", "w3"]);
    expect(ids(visibleFindings(FINDINGS, false, "CRITICAL"))).toEqual(["c1"]);
  });

  it("combines the severity filter with hideLow (AND)", () => {
    expect(ids(visibleFindings(FINDINGS, true, "WARNING"))).toEqual(["w1", "w3"]);
  });

  it("returns the same length the counter predicts", () => {
    const counts = countBySeverity(FINDINGS, true);
    for (const sev of ["CRITICAL", "WARNING", "SUGGESTION"] as const) {
      expect(visibleFindings(FINDINGS, true, sev)).toHaveLength(counts[sev]);
    }
  });
});
