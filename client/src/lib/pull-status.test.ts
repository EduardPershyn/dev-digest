import { describe, expect, it } from "vitest";
import type { PrStatus } from "@devdigest/shared";
import { countNeedsReview, countOpenPulls, OPEN_PR_STATUSES } from "./pull-status";

const pr = (status: PrStatus) => ({ status });

describe("pull-status", () => {
  it("treats needs_review, reviewed and stale as open; merged/closed/open as not", () => {
    expect([...OPEN_PR_STATUSES].sort()).toEqual(["needs_review", "reviewed", "stale"]);
  });

  it("counts open PRs", () => {
    expect(countOpenPulls([pr("needs_review"), pr("reviewed"), pr("stale"), pr("merged"), pr("closed")])).toBe(3);
  });

  it("counts PRs that need review", () => {
    expect(countNeedsReview([pr("needs_review"), pr("needs_review"), pr("reviewed")])).toBe(2);
  });

  it("returns 0 while the list is not loaded", () => {
    expect(countOpenPulls(undefined)).toBe(0);
    expect(countNeedsReview(null)).toBe(0);
  });
});
