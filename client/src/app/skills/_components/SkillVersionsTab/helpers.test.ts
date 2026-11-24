import { describe, it, expect } from "vitest";
import type { SkillVersion } from "@devdigest/shared";
import { changedFields, diffLines, diffStats, diffWords, previousVersion, withContext } from "./helpers";

/** M2 — version diff: line LCS diff, context folding, metadata changes. */

const v = (version: number, over: Partial<SkillVersion> = {}): SkillVersion => ({
  skill_id: "s1",
  version,
  name: "branch-coverage-gaps",
  description: "Use when …",
  type: "rubric",
  body: "# A",
  created_at: "2026-11-24T10:00:00.000Z",
  ...over,
});

describe("diffLines", () => {
  it("marks a changed line as removed + added and keeps line numbers on both sides", () => {
    const d = diffLines("a\nb\nc", "a\nB\nc");
    expect(d.map((l) => `${l.kind}:${l.text}`)).toEqual(["same:a", "del:b", "add:B", "same:c"]);
    expect(d[1]).toMatchObject({ oldNo: 2, newNo: null });
    expect(d[2]).toMatchObject({ oldNo: null, newNo: 2 });
    expect(d[3]).toMatchObject({ oldNo: 3, newNo: 3 });
  });

  it("finds insertions in the middle without touching the surrounding lines", () => {
    const d = diffLines("x\ny\nz", "x\nnew1\nnew2\ny\nz");
    expect(diffStats(d)).toEqual({ added: 2, removed: 0 });
    expect(d.filter((l) => l.kind === "same").map((l) => l.text)).toEqual(["x", "y", "z"]);
    expect(d.at(-1)).toMatchObject({ oldNo: 3, newNo: 5 });
  });

  it("treats the empty text as nothing (the first version is all additions)", () => {
    expect(diffStats(diffLines("", "a\nb"))).toEqual({ added: 2, removed: 0 });
    expect(diffLines("same", "same").every((l) => l.kind === "same")).toBe(true);
  });

  it("ignores CRLF vs LF", () => {
    expect(diffStats(diffLines("a\r\nb", "a\nb"))).toEqual({ added: 0, removed: 0 });
  });
});

describe("withContext", () => {
  it("folds long unchanged runs and keeps 3 lines around each change", () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const after = before.replace("l10", "L10");
    const rows = withContext(diffLines(before, after));
    expect(rows[0]).toEqual({ kind: "skip", count: 7 });
    expect(rows.at(-1)).toEqual({ kind: "skip", count: 6 });
    expect(rows.filter((r) => r.kind !== "skip")).toHaveLength(3 + 2 + 3);
  });
});

describe("changedFields", () => {
  it("lists only fields both snapshots recorded and that differ", () => {
    expect(changedFields(v(1), v(2, { type: "convention", description: null }))).toEqual([
      { field: "type", before: "rubric", after: "convention" },
    ]);
    expect(changedFields(null, v(1))).toEqual([]);
  });
});

describe("previousVersion", () => {
  it("returns the closest older snapshot, or null for the first", () => {
    const list = [v(4), v(2), v(1)];
    expect(previousVersion(list, 4)?.version).toBe(2);
    expect(previousVersion(list, 1)).toBeNull();
  });
});

describe("diffWords", () => {
  it("highlights only the words that changed and rejoins to both strings", () => {
    const w = diffWords("Flag each branch.", "Flag each untested branch.");
    expect(w.filter((x) => x.kind === "add").map((x) => x.text).join("").trim()).toBe("untested");
    expect(w.filter((x) => x.kind !== "add").map((x) => x.text).join("")).toBe("Flag each branch.");
    expect(w.filter((x) => x.kind !== "del").map((x) => x.text).join("")).toBe("Flag each untested branch.");
  });
});
