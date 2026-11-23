import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, Severity } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

function mk(id: string, severity: Severity, confidence = 0.9): FindingRecord {
  return { ...FINDINGS[0]!, id, severity, title: `${severity} ${id}`, confidence };
}

/** 1 CRITICAL · 3 WARNING (one low-confidence) · 1 SUGGESTION. */
const MIXED: FindingRecord[] = [
  mk("c1", "CRITICAL"),
  mk("w1", "WARNING"),
  mk("w2", "WARNING", 0.5),
  mk("w3", "WARNING", 0.8),
  mk("s1", "SUGGESTION"),
];

const counter = (name: RegExp) =>
  within(screen.getByRole("group", { name: "Filter findings by severity" })).getByRole("button", { name });
const shownTitles = () => screen.queryAllByText(/^(CRITICAL|WARNING|SUGGESTION) \w+$/).map((n) => n.textContent);

describe("FindingsPanel severity counters + filter", () => {
  it("shows a counter per contract severity with the run's totals", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(counter(/critical/i)).toHaveTextContent("1 Critical");
    expect(counter(/warning/i)).toHaveTextContent("3 Warning");
    expect(counter(/suggestion/i)).toHaveTextContent("1 Suggestion");
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
    expect(shownTitles()).toHaveLength(5);
  });

  it("filters to one level, moves to another, and clears on a second click", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);

    fireEvent.click(counter(/warning/i));
    expect(shownTitles()).toEqual(["WARNING w1", "WARNING w2", "WARNING w3"]);
    expect(counter(/warning/i)).toHaveAttribute("aria-pressed", "true");
    expect(counter(/critical/i)).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(counter(/suggestion/i));
    expect(shownTitles()).toEqual(["SUGGESTION s1"]);
    expect(counter(/suggestion/i)).toHaveAttribute("aria-pressed", "true");
    expect(counter(/warning/i)).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(counter(/suggestion/i));
    expect(shownTitles()).toHaveLength(5);
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });

  it("combines with Hide low confidence and the counters follow it", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(counter(/warning/i));
    fireEvent.click(screen.getByRole("switch"));
    expect(counter(/warning/i)).toHaveTextContent("2 Warning");
    expect(shownTitles()).toEqual(["WARNING w1", "WARNING w3"]);
  });

  it("disables a zero-count level, but keeps the active one clearable", () => {
    const lowOnly = [mk("c1", "CRITICAL"), mk("s1", "SUGGESTION", 0.3)];
    renderWithIntl(<FindingsPanel findings={lowOnly} prId="pr1" />);
    expect(counter(/warning/i)).toBeDisabled();

    fireEvent.click(counter(/suggestion/i));
    fireEvent.click(screen.getByRole("switch")); // hides the only suggestion → count 0
    expect(counter(/suggestion/i)).toHaveTextContent("0 Suggestion");
    expect(counter(/suggestion/i)).toBeEnabled();
    expect(screen.getByText("No findings match")).toBeInTheDocument();

    fireEvent.click(counter(/suggestion/i));
    expect(shownTitles()).toEqual(["CRITICAL c1"]);
  });

  it("filters purely on the client — no network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(counter(/critical/i));
    fireEvent.click(counter(/critical/i));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
