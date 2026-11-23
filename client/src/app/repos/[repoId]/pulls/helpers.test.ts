import { describe, expect, it } from "vitest";
import { filterAndSortPulls } from "./helpers";
import type { PrMeta } from "./constants";

const pr = (over: Partial<PrMeta>): PrMeta =>
  ({ number: 1, title: "Fix bug", status: "needs_review", updated_at: "2026-01-01T00:00:00Z", ...over }) as PrMeta;

describe("filterAndSortPulls", () => {
  const pulls = [
    pr({ number: 1, title: "Add login", status: "needs_review", updated_at: "2026-01-01T00:00:00Z" }),
    pr({ number: 2, title: "Refactor DB", status: "reviewed", updated_at: "2026-01-03T00:00:00Z" }),
    pr({ number: 3, title: "Login copy", status: "needs_review", updated_at: null as unknown as string }),
  ];

  it("filters by status unless status is 'all'", () => {
    expect(filterAndSortPulls(pulls, { status: "reviewed", query: "", sort: "newest" }).map((p) => p.number)).toEqual([2]);
    expect(filterAndSortPulls(pulls, { status: "all", query: "", sort: "newest" })).toHaveLength(3);
  });

  it("matches the query against title (case-insensitive) or PR number", () => {
    expect(filterAndSortPulls(pulls, { status: "all", query: " LOGIN ", sort: "newest" }).map((p) => p.number)).toEqual([1, 3]);
    expect(filterAndSortPulls(pulls, { status: "all", query: "2", sort: "newest" }).map((p) => p.number)).toEqual([2]);
  });

  it("sorts newest first by default, oldest first on 'oldest'; missing dates count as oldest", () => {
    expect(filterAndSortPulls(pulls, { status: "all", query: "", sort: "newest" }).map((p) => p.number)).toEqual([2, 1, 3]);
    expect(filterAndSortPulls(pulls, { status: "all", query: "", sort: "oldest" }).map((p) => p.number)).toEqual([3, 1, 2]);
  });

  it("does not mutate the input and tolerates an unloaded list", () => {
    const copy = [...pulls];
    filterAndSortPulls(pulls, { status: "all", query: "", sort: "oldest" });
    expect(pulls).toEqual(copy);
    expect(filterAndSortPulls(undefined, { status: "all", query: "", sort: "newest" })).toEqual([]);
  });
});
