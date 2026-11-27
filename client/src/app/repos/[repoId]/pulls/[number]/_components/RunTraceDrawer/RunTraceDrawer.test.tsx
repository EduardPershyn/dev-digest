import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

vi.mock("@/lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: TRACE, isLoading: false }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
    // M1: Cost tile beside Duration/Tokens/Findings; this trace predates cost
    // tracking (no stats.cost_usd) → "—".
    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the run cost when the trace has one", () => {
    TRACE.stats.cost_usd = 0.06;
    try {
      renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
      expect(screen.getByText("$0.060")).toBeInTheDocument();
    } finally {
      delete TRACE.stats.cost_usd;
    }
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });

  it("M2: renders each skill as its own prompt block with its token count", () => {
    const original = TRACE.prompt_assembly;
    TRACE.prompt_assembly = {
      ...original,
      skills: "joined section",
      skill_blocks: [
        { skill_id: "a", name: "branch-coverage-gaps", version: 2, type: "rubric", source: "manual", text: "<skill a>", tokens: 1200 },
        { skill_id: "b", name: "mocking-and-flakiness", version: 1, type: "convention", source: "imported_file", text: "<skill b>", tokens: 340 },
      ],
    };
    try {
      renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
      fireEvent.click(screen.getByText("Prompt assembly"));
      expect(screen.getByText("Skills — 2 blocks · +1,540 tokens")).toBeInTheDocument();
      expect(screen.getByText("Skill · branch-coverage-gaps · v2")).toBeInTheDocument();
      expect(screen.getByText("Skill · mocking-and-flakiness · v1")).toBeInTheDocument();
      expect(screen.getByText("+1,200 tok")).toBeInTheDocument();
      expect(screen.getByText("+340 tok")).toBeInTheDocument();
      // the old single joined block is not shown when per-skill blocks exist
      expect(screen.queryByText("Skills (dynamic)")).not.toBeInTheDocument();
    } finally {
      TRACE.prompt_assembly = original;
    }
  });

  it("M2: falls back to the single Skills block for traces recorded before skill blocks", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("Skills (dynamic)")).toBeInTheDocument();
    expect(screen.queryByTestId("skill-blocks")).not.toBeInTheDocument();
  });

  it("M3: shows the intent prompt block with its token count and the scope-filter line", () => {
    const original = { prompt_assembly: TRACE.prompt_assembly, scope_filter: TRACE.scope_filter };
    TRACE.prompt_assembly = {
      ...original.prompt_assembly,
      intent_block: {
        text: '<untrusted source="pr-intent">Adds rate limiting</untrusted>',
        tokens: 1234,
        confidence: "medium",
        model: "deepseek/deepseek-v4-flash",
        sources_used: 3,
        missing: 1,
      },
    };
    TRACE.scope_filter = {
      hidden: [{ title: "Unrelated nit", file: "src/billing.ts", start_line: 4, severity: "SUGGESTION" }],
      hidden_count: 1,
      collapsed_count: 2,
    };
    try {
      renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
      expect(screen.getByText("1 finding hidden as out of scope · 2 collapsed")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Prompt assembly"));
      expect(screen.getByText("Intent (1,234 tokens)")).toBeInTheDocument();
      expect(screen.getByText("medium · 3 sources · 1 missing")).toBeInTheDocument();
    } finally {
      TRACE.prompt_assembly = original.prompt_assembly;
      TRACE.scope_filter = original.scope_filter;
    }
  });

  it("M3: shows neither the intent block nor the scope line for a run without intent", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText(/^Intent \(/)).not.toBeInTheDocument();
    expect(screen.queryByText(/hidden as out of scope/)).not.toBeInTheDocument();
  });
});
