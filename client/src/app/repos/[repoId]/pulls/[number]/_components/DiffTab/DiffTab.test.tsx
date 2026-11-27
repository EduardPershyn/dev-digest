import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";

const state = vi.hoisted(() => ({
  reviews: [] as unknown[],
  smart: undefined as unknown,
  mutate: vi.fn(),
}));

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  usePrReviews: () => ({ data: state.reviews }),
  useSmartDiff: () => ({ data: state.smart }),
  useFindingAction: () => ({ mutate: state.mutate, isPending: false, variables: undefined }),
}));

import { DiffTab } from "./DiffTab";

afterEach(cleanup);

// GitHub order — deliberately not role order.
const FILES: PrFile[] = [
  { path: "pnpm-lock.yaml", additions: 10, deletions: 2, patch: "@@ -1,1 +1,1 @@\n-lock: 1\n+lock: 2" },
  { path: "src/a.ts", additions: 1, deletions: 0, patch: "@@ -1,2 +1,3 @@\n const a = 1;\n+const b = a.c;\n const d = 2;" },
  { path: "docs/guide.md", additions: 2, deletions: 0, patch: "@@ -0,0 +1,2 @@\n+# Guide\n+text" },
  { path: "src/a.test.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n it();\n+expect();" },
  { path: "src/b.ts", additions: 1, deletions: 1, patch: "@@ -1,1 +1,1 @@\n-old\n+new" },
];

const SMART: SmartDiffResponse = {
  groups: [
    {
      role: "core",
      files: [
        { path: "src/a.ts", additions: 1, deletions: 0, finding_lines: [2, 50] },
        { path: "src/b.ts", additions: 1, deletions: 1, finding_lines: [] },
      ],
    },
    // The dismissed finding on src/a.test.ts is NOT in finding_lines (server rule).
    { role: "tests", files: [{ path: "src/a.test.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "docs", files: [{ path: "docs/guide.md", additions: 2, deletions: 0, finding_lines: [] }] },
    { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 10, deletions: 2, finding_lines: [] }] },
  ],
  split_suggestion: { too_big: false, total_lines: 17, proposed_splits: [] },
};

function finding(id: string, over: Partial<FindingRecord>): FindingRecord {
  return {
    id,
    review_id: "r-new",
    severity: "WARNING",
    category: "bug",
    title: id,
    file: "src/a.ts",
    start_line: 2,
    end_line: 2,
    rationale: `Rationale for ${id}.`,
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

function review(id: string, created_at: string, findings: FindingRecord[], kind: "review" | "summary" = "review"): ReviewRecord {
  return {
    id,
    pr_id: "pr1",
    agent_id: "agent-a",
    run_id: null,
    kind,
    verdict: "comment",
    summary: null,
    score: null,
    model: null,
    created_at,
    findings,
  };
}

const REVIEWS: ReviewRecord[] = [
  review("r-new", "2026-11-27T12:05:00Z", [
    finding("f-line", { title: "Possible undefined access", start_line: 2 }),
    finding("f-out", { title: "Unrelated helper is slow", severity: "SUGGESTION", start_line: 50 }),
    finding("f-dis", {
      title: "Dismissed test smell",
      severity: "CRITICAL",
      file: "src/a.test.ts",
      start_line: 2,
      dismissed_at: "2026-11-27T12:10:00Z",
    }),
  ]),
  // An older run of the same agent — replaced by r-new, so never shown.
  review("r-old", "2026-11-27T12:00:00Z", [finding("f-old", { title: "Stale finding" })]),
  // A summary review never contributes findings.
  review("r-sum", "2026-11-27T12:20:00Z", [finding("f-sum", { title: "Summary finding" })], "summary"),
];

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <DiffTab prId="pr1" files={FILES} canComment={false} />
    </NextIntlClientProvider>,
  );
}

/** The group <section> for a role, found through its header toggle button. */
function group(label: string): HTMLElement {
  const btn = screen.getByRole("button", { name: new RegExp(`^(Expand|Collapse) ${label}$`) });
  return btn.closest("section") as HTMLElement;
}

beforeEach(() => {
  state.reviews = REVIEWS;
  state.smart = SMART;
  state.mutate.mockReset();
});

describe("DiffTab — Smart order", () => {
  it("renders role groups in order with counts; docs/boilerplate collapsed; toggle expands; Original order restores the flat list", () => {
    renderTab();
    expect(screen.getByText("Reviewer-ordered diff")).toBeInTheDocument();
    expect(screen.getByText("5 files · +15 −3")).toBeInTheDocument();

    const toggles = screen.getAllByRole("button", { name: /^(Expand|Collapse) / });
    expect(toggles.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Collapse Core",
      "Collapse Tests",
      "Expand Docs",
      "Expand Boilerplate",
    ]);
    expect(within(group("Core")).getByText("2 files")).toBeInTheDocument();
    expect(within(group("Tests")).getByText("1 files")).toBeInTheDocument();

    // Expanded groups show their files; collapsed ones don't.
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("src/a.test.ts")).toBeInTheDocument();
    expect(screen.queryByText("docs/guide.md")).not.toBeInTheDocument();
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand Docs" }));
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse Docs" })).toHaveAttribute("aria-expanded", "true");

    // Original order = the flat GitHub list (all files, in GitHub order, no group headers).
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.getByRole("button", { name: "Original order" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /^(Expand|Collapse) / })).not.toBeInTheDocument();
    const paths = screen.getAllByText(/^(pnpm-lock\.yaml|src\/a\.ts|docs\/guide\.md|src\/a\.test\.ts|src\/b\.ts)$/);
    expect(paths.map((p) => p.textContent)).toEqual(FILES.map((f) => f.path));

    fireEvent.click(screen.getByRole("button", { name: "Smart order" }));
    expect(screen.getByRole("button", { name: "Collapse Core" })).toBeInTheDocument();
  });

  it("counts flagged files per group and dots only flagged files (dismissed findings never count)", () => {
    renderTab();
    expect(within(group("Core")).getByLabelText("1 file with findings")).toHaveTextContent("● 1");
    expect(within(group("Tests")).queryByLabelText(/with findings/)).not.toBeInTheDocument();

    const dots = screen.getAllByRole("img", { name: "Has review findings" });
    expect(dots).toHaveLength(1);
    expect(dots[0]!.parentElement).toHaveTextContent("src/a.ts");
  });

  it("shows finding cards under their line with a severity label, out-of-patch block, dimmed dismissed card; toggle hides them; Accept calls the mutation", () => {
    renderTab();
    // Visible by default (owner decision); the same switch as GitHub comments hides them.
    expect(screen.getByText("Possible undefined access")).toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument(); // line label for WARNING
    expect(screen.getByText("1 finding outside this diff")).toBeInTheDocument();
    expect(screen.getByText("Unrelated helper is slow")).toBeInTheDocument();
    // Dismissed: rendered (dimmed) but no line label for it (only dismissed on that line).
    expect(screen.getByText("Dismissed test smell")).toBeInTheDocument();
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
    // Latest-per-agent + kind:review only.
    expect(screen.queryByText("Stale finding")).not.toBeInTheDocument();
    expect(screen.queryByText("Summary finding")).not.toBeInTheDocument();

    const card = screen.getByText("Possible undefined access").closest("[data-finding-id]") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Accept" }));
    expect(state.mutate).toHaveBeenCalledWith({ findingId: "f-line", action: "accept", prId: "pr1" });

    fireEvent.click(screen.getByRole("button", { name: /Hide comments & findings/ }));
    expect(screen.queryByText("Possible undefined access")).not.toBeInTheDocument();
    expect(screen.queryByText("1 finding outside this diff")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Show comments & findings/ }));
    expect(screen.getByText("Possible undefined access")).toBeInTheDocument();
  });

  it("before any review: empty-state note and no counters", () => {
    state.reviews = [];
    state.smart = {
      ...SMART,
      groups: SMART.groups.map((g) => ({ ...g, files: g.files.map((f) => ({ ...f, finding_lines: [] })) })),
    };
    renderTab();
    expect(screen.getByText("Review has not been run yet")).toBeInTheDocument();
    expect(screen.queryByLabelText(/with findings/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^● /)).not.toBeInTheDocument();
  });

  it("visibly marks the selected order: Smart order pressed and highlighted on load, then Original order", () => {
    renderTab();
    const smart = screen.getByRole("button", { name: "Smart order" });
    const original = screen.getByRole("button", { name: "Original order" });
    // Highlight = the kit's `active` style (only `kind="tertiary"` renders it), not just aria.
    expect(smart).toHaveAttribute("aria-pressed", "true");
    expect(smart.style.background).toBe("var(--bg-hover)");
    expect(original).toHaveAttribute("aria-pressed", "false");
    expect(original.style.background).toBe("transparent");

    fireEvent.click(original);
    expect(screen.getByRole("button", { name: "Original order" }).style.background).toBe("var(--bg-hover)");
    expect(screen.getByRole("button", { name: "Smart order" }).style.background).toBe("transparent");
  });

  it("Original order keeps findings in the flat list: dot on the flagged file, card and label under its line", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    const dots = screen.getAllByRole("img", { name: "Has review findings" });
    expect(dots).toHaveLength(1);
    expect(dots[0]!.parentElement).toHaveTextContent("src/a.ts");
    expect(screen.getByText("Possible undefined access")).toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument();
    expect(screen.getByText("1 finding outside this diff")).toBeInTheDocument();
  });

  it("shows no empty-state note while reviews are still loading", () => {
    state.reviews = undefined as unknown as unknown[];
    renderTab();
    expect(screen.getByRole("button", { name: "Collapse Core" })).toBeInTheDocument();
    expect(screen.queryByText("Review has not been run yet")).not.toBeInTheDocument();
  });

  it("shows no empty-state note in the flat fallback or in Original order", () => {
    state.reviews = [];
    state.smart = undefined;
    const { unmount } = renderTab();
    expect(screen.queryByText("Review has not been run yet")).not.toBeInTheDocument();
    unmount();

    state.smart = SMART;
    renderTab();
    expect(screen.getByText("Review has not been run yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.queryByText("Review has not been run yet")).not.toBeInTheDocument();
  });

  it("falls back to the flat list while the smart-diff query has no data", () => {
    state.smart = undefined;
    renderTab();
    expect(screen.queryByRole("button", { name: /^(Expand|Collapse) / })).not.toBeInTheDocument();
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
  });
});
