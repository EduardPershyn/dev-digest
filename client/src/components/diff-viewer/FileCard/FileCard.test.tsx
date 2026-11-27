import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SEV } from "@devdigest/ui";
import type { FindingRecord, PrReviewComment } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import shell from "../../../../messages/en/shell.json";
import type { DiffCommentApi } from "../comments";
import type { DiffFindingApi, DiffFindingCardProps } from "../findings";
import { FileCard } from "./FileCard";

/* The shared diff-viewer with review findings (M3 Smart Diff), rendered without the
   DiffTab: the finding card is the caller's slot, so a minimal card stands in for it. */

afterEach(cleanup);

// new lines: 1 ctx, 2 add, 3 ctx · old lines: 1 ctx, 2 del
const PATCH = "@@ -1,3 +1,3 @@\n const a = 1;\n-const old = 0;\n+const b = a.c;\n const d = 2;";

function file(path: string, patch: string | null = PATCH): PrFile {
  return { path, additions: 1, deletions: 1, patch } as PrFile;
}

function finding(id: string, over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id,
    review_id: "r1",
    severity: "WARNING",
    category: "bug",
    title: `Finding ${id}`,
    file: "src/a.ts",
    start_line: 2,
    end_line: 2,
    rationale: "why",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

function TestCard({ f, onAction }: DiffFindingCardProps) {
  return (
    <article aria-label={`card ${f.id}`}>
      {f.title}
      <button type="button" onClick={() => onAction?.("dismiss")}>
        Dismiss
      </button>
    </article>
  );
}

function findingApi(over: Partial<DiffFindingApi> = {}): DiffFindingApi {
  return {
    findings: [],
    show: true,
    flaggedPaths: new Set(),
    Card: TestCard,
    onAction: vi.fn(),
    pendingId: null,
    labels: {
      severity: { CRITICAL: "label-blocker", WARNING: "label-warning", SUGGESTION: "label-suggestion" },
      outOfPatch: (count) => `${count} outside this diff`,
      findingDot: "Has review findings",
    },
    ...over,
  };
}

function comment(id: number, over: Partial<PrReviewComment> = {}): PrReviewComment {
  return {
    id,
    path: "src/a.ts",
    line: 2,
    original_line: 2,
    side: "RIGHT",
    body: `GitHub comment ${id}`,
    user: "octo",
    created_at: "2026-11-27T12:00:00Z",
    html_url: `https://github.com/o/r/pull/1#discussion_r${id}`,
    in_reply_to_id: null,
    is_outdated: false,
    ...over,
  };
}

function commentApi(comments: PrReviewComment[], showComments = true): DiffCommentApi {
  return { comments, canComment: false, showComments, posting: false, onSubmit: vi.fn() };
}

function renderCards(files: PrFile[], findings?: DiffFindingApi, commenting?: DiffCommentApi) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell }}>
      {files.map((f) => (
        <FileCard key={f.path} file={f} findings={findings} commenting={commenting} />
      ))}
    </NextIntlClientProvider>,
  );
}

/** The rendered diff row (strip carrier) holding a line's code text. */
function row(text: string): HTMLElement {
  return screen.getByText(text).parentElement as HTMLElement;
}

describe("FileCard with review findings", () => {
  it("shows the findings dot only on files listed in flaggedPaths", () => {
    renderCards(
      [file("src/a.ts"), file("src/b.ts")],
      // src/b.ts has findings (e.g. only dismissed ones) but is not flagged → no dot.
      findingApi({
        findings: [finding("a1"), finding("b1", { file: "src/b.ts" })],
        flaggedPaths: new Set(["src/a.ts"]),
      }),
    );
    const dots = screen.getAllByRole("img", { name: "Has review findings" });
    expect(dots).toHaveLength(1);
    expect(dots[0]!.parentElement).toHaveTextContent("src/a.ts");
  });

  it("marks a finding line with the highest severity's strip and label and renders its cards under it, only while show is on", () => {
    const api = findingApi({
      findings: [
        finding("w", { severity: "WARNING" }),
        finding("c", { severity: "CRITICAL" }),
        finding("s", { severity: "SUGGESTION", start_line: 3 }),
      ],
      flaggedPaths: new Set(["src/a.ts"]),
    });
    const { rerender } = renderCards([file("src/a.ts")], api);

    // Line 2 carries a WARNING and a CRITICAL → marked as CRITICAL.
    const line2 = row("const b = a.c;");
    expect(within(line2).getByText("label-blocker")).toBeInTheDocument();
    expect(within(line2).queryByText("label-warning")).not.toBeInTheDocument();
    expect(line2.style.boxShadow).toContain(SEV.CRITICAL.c);
    // Line 3 (context) has its own SUGGESTION mark.
    const line3 = row("const d = 2;");
    expect(within(line3).getByText("label-suggestion")).toBeInTheDocument();
    expect(line3.style.boxShadow).toContain(SEV.SUGGESTION.c);
    // Line 1 has no finding → no strip, no label.
    const line1 = row("const a = 1;");
    expect(line1.style.boxShadow).toBe("");
    expect(within(line1).queryByText(/^label-/)).not.toBeInTheDocument();

    // Both cards of line 2 render right under it, before line 3.
    const wCard = screen.getByRole("article", { name: "card w" });
    const cCard = screen.getByRole("article", { name: "card c" });
    expect(line2.compareDocumentPosition(wCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cCard.compareDocumentPosition(line3) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // show off → no strip, no label, no card (the dot stays: it is a file-level counter).
    rerender(
      <NextIntlClientProvider locale="en" messages={{ shell }}>
        <FileCard file={file("src/a.ts")} findings={{ ...api, show: false }} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText(/^label-/)).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(row("const b = a.c;").style.boxShadow).toBe("");
    expect(screen.getByRole("img", { name: "Has review findings" })).toBeInTheDocument();
  });

  it("gives a line with only dismissed findings no strip or label, but still renders its card", () => {
    renderCards(
      [file("src/a.ts")],
      findingApi({ findings: [finding("d", { severity: "CRITICAL", dismissed_at: "2026-11-27T12:10:00Z" })] }),
    );
    const line2 = row("const b = a.c;");
    expect(within(line2).queryByText(/^label-/)).not.toBeInTheDocument();
    expect(line2.style.boxShadow).toBe("");
    expect(screen.getByRole("article", { name: "card d" })).toBeInTheDocument();
  });

  it("lists every finding of a file without a patch in the out-of-patch block, hidden with the switch", () => {
    const api = findingApi({
      findings: [finding("n1", { start_line: 2 }), finding("n2", { start_line: 40 })],
    });
    const { rerender } = renderCards([file("src/a.ts", null)], api);
    expect(screen.getByText(/No diff text available/)).toBeInTheDocument();
    expect(screen.getByText("2 outside this diff")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "card n1" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "card n2" })).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ shell }}>
        <FileCard file={file("src/a.ts", null)} findings={{ ...api, show: false }} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText("2 outside this diff")).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("routes the card's action to onAction with the finding", () => {
    const onAction = vi.fn();
    const f = finding("a1");
    renderCards([file("src/a.ts")], findingApi({ findings: [f], onAction }));
    fireEvent.click(within(screen.getByRole("article", { name: "card a1" })).getByRole("button", { name: "Dismiss" }));
    expect(onAction).toHaveBeenCalledWith(f, "dismiss");
  });

  it("keeps GitHub comment threads, the outdated block and the comment counter alongside findings on the same line", () => {
    const comments = [
      comment(1, { line: 2 }),
      comment(2, { line: null, is_outdated: true, body: "GitHub comment outdated" }),
    ];
    const api = findingApi({ findings: [finding("a1")], flaggedPaths: new Set(["src/a.ts"]) });
    const { rerender } = renderCards([file("src/a.ts")], api, commentApi(comments));

    expect(screen.getByText("GitHub comment 1")).toBeInTheDocument();
    expect(screen.getByText("GitHub comment outdated")).toBeInTheDocument();
    expect(screen.getByText("1 comment(s) on older revisions")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "card a1" })).toBeInTheDocument();
    expect(within(row("const b = a.c;")).getByText("label-warning")).toBeInTheDocument();
    // Header: comment counter (2) and the findings dot side by side.
    const header = screen.getByText("src/a.ts").parentElement as HTMLElement;
    expect(header).toHaveTextContent(/2$/);
    expect(within(header).getByRole("img", { name: "Has review findings" })).toBeInTheDocument();

    // One switch: hiding comments and findings hides both kinds of cards.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ shell }}>
        <FileCard file={file("src/a.ts")} findings={{ ...api, show: false }} commenting={commentApi(comments, false)} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText("GitHub comment 1")).not.toBeInTheDocument();
    expect(screen.queryByText("1 comment(s) on older revisions")).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});
