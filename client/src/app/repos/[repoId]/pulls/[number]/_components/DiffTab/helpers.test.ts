import { describe, it, expect } from "vitest";
import { SmartDiffRole } from "@devdigest/shared";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import { ROLE_META } from "./constants";
import { diffTotals, flaggedPaths, hasReviews, latestReviewFindings, orderedGroups } from "./helpers";

function finding(id: string): FindingRecord {
  return {
    id,
    review_id: "r",
    severity: "WARNING",
    category: "bug",
    title: id,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "why",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    accepted_at: null,
    dismissed_at: null,
  } as FindingRecord;
}

function review(
  id: string,
  agent_id: string | null,
  created_at: string,
  findings: FindingRecord[],
  kind: "review" | "summary" = "review",
): ReviewRecord {
  return {
    id,
    pr_id: "p",
    agent_id,
    run_id: null,
    kind,
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at,
    findings,
  };
}

describe("latestReviewFindings (client mirror of the server rule)", () => {
  it("re-run replaces one agent only; other agent kept; summary ignored; null agent grouped", () => {
    const out = latestReviewFindings([
      review("a-new", "A", "2026-11-03T00:00:00Z", [finding("a-new")]),
      review("b", "B", "2026-11-02T00:00:00Z", [finding("b")]),
      review("a-old", "A", "2026-11-01T00:00:00Z", [finding("a-old")]),
      review("sum", "A", "2026-11-09T00:00:00Z", [finding("sum")], "summary"),
      review("l-old", null, "2026-10-01T00:00:00Z", [finding("l-old")]),
      review("l-new", null, "2026-10-02T00:00:00Z", [finding("l-new")]),
    ]);
    expect(out.map((f) => f.id).sort()).toEqual(["a-new", "b", "l-new"]);
  });

  it("hasReviews counts only kind:review", () => {
    expect(hasReviews(undefined)).toBe(false);
    expect(hasReviews([review("s", "A", "2026-11-01T00:00:00Z", [], "summary")])).toBe(false);
    expect(hasReviews([review("r", "A", "2026-11-01T00:00:00Z", [])])).toBe(true);
  });
});

describe("orderedGroups / flaggedPaths / diffTotals", () => {
  const files: PrFile[] = [
    { path: "README.md", additions: 1, deletions: 0, patch: null },
    { path: "src/a.ts", additions: 5, deletions: 2, patch: "@@ -1 +1 @@\n-a\n+b" },
    { path: "src/b.ts", additions: 1, deletions: 1, patch: null },
  ];
  const smart: SmartDiffResponse = {
    groups: [
      {
        role: "core",
        files: [
          { path: "src/a.ts", additions: 5, deletions: 2, finding_lines: [3] },
          { path: "src/b.ts", additions: 1, deletions: 1, finding_lines: [] },
          { path: "src/gone.ts", additions: 1, deletions: 0, finding_lines: [1] },
        ],
      },
      { role: "docs", files: [{ path: "README.md", additions: 1, deletions: 0, finding_lines: [] }] },
      { role: "boilerplate", files: [{ path: "only-on-server.lock", additions: 1, deletions: 0, finding_lines: [] }] },
    ],
    split_suggestion: { too_big: false, total_lines: 10, proposed_splits: [] },
  };

  it("keeps server role order, maps to PrFiles with patches, counts flagged files, drops missing paths", () => {
    const groups = orderedGroups(smart, files);
    expect(groups.map((g) => g.role)).toEqual(["core", "docs"]);
    expect(groups[0]!.files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(groups[0]!.files[0]!.patch).toContain("+b");
    expect(groups[0]!.flaggedCount).toBe(1);
    expect(groups[1]!.flaggedCount).toBe(0);
  });

  it("flaggedPaths lists files with counted finding lines", () => {
    expect([...flaggedPaths(smart)].sort()).toEqual(["src/a.ts", "src/gone.ts"]);
    expect(flaggedPaths(undefined).size).toBe(0);
  });

  it("diffTotals sums the rendered files", () => {
    expect(diffTotals(files)).toEqual({ count: 3, additions: 7, deletions: 3 });
  });

  it("flaggedCount counts files with findings, not finding lines", () => {
    const many: SmartDiffResponse = {
      groups: [
        {
          role: "core",
          files: [
            { path: "src/a.ts", additions: 5, deletions: 2, finding_lines: [1, 2, 3] },
            { path: "src/b.ts", additions: 1, deletions: 1, finding_lines: [7] },
          ],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 9, proposed_splits: [] },
    };
    expect(orderedGroups(many, files)[0]!.flaggedCount).toBe(2);
  });

  it("diffTotals treats missing additions/deletions as 0", () => {
    const partial = [
      { path: "bin.png", patch: null },
      { path: "src/a.ts", additions: 3, deletions: 1, patch: null },
    ] as unknown as PrFile[];
    expect(diffTotals(partial)).toEqual({ count: 2, additions: 3, deletions: 1 });
  });

  it("ROLE_META covers every contract role; docs and boilerplate start collapsed", () => {
    expect(Object.keys(ROLE_META).sort()).toEqual([...SmartDiffRole.options].sort());
    const collapsed = SmartDiffRole.options.filter((r) => ROLE_META[r].defaultCollapsed);
    expect(collapsed).toEqual(["docs", "boilerplate"]);
  });
});
