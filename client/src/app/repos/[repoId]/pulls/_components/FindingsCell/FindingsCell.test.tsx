import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFindingsSummary, PrFindingPreview, Severity } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { FindingsCell } from "./FindingsCell";
import { popoverPosition, POPOVER_MAX_HEIGHT, POPOVER_WIDTH } from "./helpers";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function preview(id: string, severity: Severity, title: string): PrFindingPreview {
  return {
    id,
    severity,
    category: "security",
    title,
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    confidence: 0.98,
    rationale: "Line 12 contains a live Stripe key.",
  };
}

const SUMMARY: PrFindingsSummary = {
  counts: { CRITICAL: 2, WARNING: 0, SUGGESTION: 4 },
  total: 6,
  top: [
    preview("c1", "CRITICAL", "Hardcoded Stripe secret key in commit"),
    preview("c2", "CRITICAL", "Lethal trifecta: untrusted input reaches exfil path"),
    preview("s1", "SUGGESTION", "Extract magic number 3600"),
  ],
};

function renderCell(findings: PrFindingsSummary | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsCell findings={findings} />
    </NextIntlClientProvider>,
  );
}

const trigger = () => screen.getByLabelText(/^Open findings:/);

describe("FindingsCell", () => {
  it("shows — when the PR was never reviewed, and a muted 0 when nothing is open", () => {
    renderCell(null);
    expect(screen.getByText("—")).toHaveAttribute("title", "Not reviewed yet");
    cleanup();
    renderCell({ counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }, total: 0, top: [] });
    expect(screen.getByText("0")).toHaveAttribute("title", "No open findings");
  });

  it("shows a count per non-zero severity only, with an accessible summary", () => {
    renderCell(SUMMARY);
    expect(trigger()).toHaveAccessibleName(
      "Open findings: 2 critical, 4 suggestion. Focus or hover for details.",
    );
    expect(trigger()).toHaveTextContent(/^24$/); // "2" + "4"; the zero WARNING level is omitted
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens the popover on hover with total, previews and '+N more'; closes after leaving", () => {
    vi.useFakeTimers();
    renderCell(SUMMARY);
    fireEvent.mouseEnter(trigger());
    const pop = screen.getByRole("tooltip");
    expect(pop).toHaveTextContent("6 findings");
    expect(pop).toHaveTextContent("Hardcoded Stripe secret key in commit");
    expect(pop).toHaveTextContent("src/config.ts:12");
    expect(pop).toHaveTextContent("98% conf");
    expect(pop).toHaveTextContent("+3 more — open the PR to see all");
    expect(trigger()).toHaveAttribute("aria-describedby", pop.id);
    expect(pop.parentElement).toBe(document.body); // portalled out of the overflow:hidden table

    fireEvent.mouseLeave(trigger());
    fireEvent.mouseEnter(pop); // cursor reaches the popover within the grace period
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.mouseLeave(pop);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens on keyboard focus and closes on Escape", () => {
    renderCell(SUMMARY);
    fireEvent.focus(trigger());
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(trigger(), { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("omits '+N more' when every finding is previewed", () => {
    renderCell({ ...SUMMARY, total: 3 });
    fireEvent.mouseEnter(trigger());
    expect(screen.getByRole("tooltip")).not.toHaveTextContent(/more/);
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
