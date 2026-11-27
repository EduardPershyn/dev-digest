import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { parsePatch } from "./helpers";
import { keysForLine } from "./comments";
import { findingKey, lineMark, partitionFindings } from "./findings";

function finding(
  id: string,
  start_line: number,
  severity: FindingRecord["severity"] = "WARNING",
  dismissed = false,
): FindingRecord {
  return {
    id,
    review_id: "r1",
    severity,
    category: "bug",
    title: id,
    file: "src/a.ts",
    start_line,
    end_line: start_line,
    rationale: "why",
    confidence: 0.9,
    kind: "finding",
    accepted_at: null,
    dismissed_at: dismissed ? "2026-11-27T00:00:00Z" : null,
  } as FindingRecord;
}

// old 10..12 → new 10..12: ctx 10, del old 11, add new 11, ctx new 12
const PATCH = "@@ -10,3 +10,3 @@\n a\n-b\n+B\n c";

function renderedKeys(patch: string): Set<string> {
  const keys = new Set<string>();
  for (const ln of parsePatch(patch)) for (const k of keysForLine(ln)) keys.add(k);
  return keys;
}

describe("partitionFindings", () => {
  it("anchors a finding on a rendered RIGHT line and sends the rest out of the patch", () => {
    const { matched, outOfPatch } = partitionFindings(
      [finding("on-add", 11), finding("on-ctx", 12), finding("far", 999)],
      renderedKeys(PATCH),
    );
    expect(matched.get("RIGHT:11")?.map((f) => f.id)).toEqual(["on-add"]);
    expect(matched.get("RIGHT:12")?.map((f) => f.id)).toEqual(["on-ctx"]);
    expect(outOfPatch.map((f) => f.id)).toEqual(["far"]);
  });

  it("does not anchor to a LEFT-only (deleted) line", () => {
    // Only the deleted old line 2 is rendered (new side has no line 2).
    const keys = renderedKeys("@@ -1,2 +1,1 @@\n a\n-b");
    expect(keys.has("LEFT:2")).toBe(true);
    const { matched, outOfPatch } = partitionFindings([finding("del", 2)], keys);
    expect(matched.size).toBe(0);
    expect(outOfPatch.map((f) => f.id)).toEqual(["del"]);
  });

  it("findingKey is RIGHT:start_line", () => {
    expect(findingKey(finding("x", 7))).toBe("RIGHT:7");
  });
});

describe("lineMark", () => {
  it("picks the highest severity among non-dismissed findings", () => {
    expect(lineMark([finding("w", 1, "WARNING"), finding("c", 1, "CRITICAL")])).toBe("CRITICAL");
    expect(lineMark([finding("s", 1, "SUGGESTION"), finding("w", 1, "WARNING")])).toBe("WARNING");
  });

  it("ignores dismissed findings and returns null when only dismissed remain", () => {
    expect(lineMark([finding("c", 1, "CRITICAL", true), finding("s", 1, "SUGGESTION")])).toBe("SUGGESTION");
    expect(lineMark([finding("c", 1, "CRITICAL", true)])).toBeNull();
    expect(lineMark([])).toBeNull();
  });
});
