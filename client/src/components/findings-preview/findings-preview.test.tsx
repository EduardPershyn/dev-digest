import { describe, it, expect } from "vitest";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { popoverPosition, summarizeFindings, POPOVER_MAX_HEIGHT, POPOVER_WIDTH } from "./helpers";

function finding(id: string, severity: Severity, confidence = 0.9, o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: id,
    file: "src/a.ts",
    start_line: 3,
    end_line: 4,
    rationale: "because",
    confidence,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

describe("summarizeFindings", () => {
  it("counts every contract level, zeros included", () => {
    expect(summarizeFindings([])).toEqual({
      counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
      total: 0,
      top: [],
    });
  });

  it("sorts by severity then confidence desc, caps the preview, keeps the full total", () => {
    const s = summarizeFindings(
      [
        finding("s1", "SUGGESTION", 0.99),
        finding("w-lo", "WARNING", 0.6),
        finding("c1", "CRITICAL", 0.7),
        finding("w-hi", "WARNING", 0.95),
      ],
      3,
    );
    expect(s.counts).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 1 });
    expect(s.total).toBe(4);
    expect(s.top.map((f) => f.id)).toEqual(["c1", "w-hi", "w-lo"]);
    expect(s.top[0]).toEqual({
      id: "c1",
      severity: "CRITICAL",
      category: "bug",
      title: "c1",
      file: "src/a.ts",
      start_line: 3,
      end_line: 4,
      confidence: 0.7,
      rationale: "because",
    });
  });

  it("defaults to the top 5 and counts dismissed findings (the caller filters, not this)", () => {
    const list = Array.from({ length: 7 }, (_, i) =>
      finding(`w${i}`, "WARNING", 0.5, i === 0 ? { dismissed_at: "2026-11-20T00:00:00Z" } : {}),
    );
    const s = summarizeFindings(list);
    expect(s.total).toBe(7);
    expect(s.counts.WARNING).toBe(7);
    expect(s.top).toHaveLength(5);
  });

  it("does not truncate the rationale (the popover clamps it)", () => {
    const long = "x".repeat(500);
    expect(summarizeFindings([finding("w", "WARNING", 0.9, { rationale: long })]).top[0]!.rationale).toBe(long);
  });
});

describe("popoverPosition", () => {
  const vp = { width: 1400, height: 900 };

  it("opens below the trigger when it fits", () => {
    expect(popoverPosition({ left: 600, top: 100, bottom: 120 }, vp)).toEqual({
      left: 592,
      top: 126,
      maxHeight: POPOVER_MAX_HEIGHT,
    });
  });

  it("flips above when there is more room above and it doesn't fit below", () => {
    const p = popoverPosition({ left: 600, top: 800, bottom: 820 }, vp);
    expect(p.top).toBeUndefined();
    expect(p.bottom).toBe(900 - 800 + 6);
  });

  it("clamps to the right edge of the viewport", () => {
    expect(popoverPosition({ left: 1350, top: 100, bottom: 120 }, vp).left).toBe(1400 - POPOVER_WIDTH - 8);
  });
});
