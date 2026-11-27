import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider, type UseMutationResult } from "@tanstack/react-query";
import type { PrCommit, PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

// The live log streams over SSE (EventSource is absent in jsdom): stub only the
// stream hook; every other hook (incl. the intent hooks) runs for real over fetch.
vi.mock("@/lib/hooks/reviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hooks/reviews")>()),
  useRunEvents: () => ({ events: [], running: true }),
}));

import { FindingsTab } from "./FindingsTab";

/** M3 AC-8 — the intent card is the first thing in the Agent runs tab. */

const INTENT: PrIntentRecord = {
  pr_id: "pr1",
  summary: "Adds per-IP rate limiting.",
  in_scope: ["Rate limiter"],
  out_of_scope: ["Billing"],
  confidence: "medium",
  sources: [],
  missing_context: [],
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  head_sha: "abc",
  input_hash: "h",
  usage: { tokens_in: 100, tokens_out: 20, cost_usd: 0.0001 },
  status: "ok",
  error: null,
  classified_at: "2026-06-01T03:05:00Z",
  updated_at: "2026-06-01T03:05:00Z",
  stale: false,
};

const COMMITS: PrCommit[] = [{ sha: "abc1234", message: "Add limiter", author: "dev", committed_at: "2026-06-01T03:00:00Z" }];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FindingsTab", () => {
  it("renders the intent card before the Live review, Timeline and Review runs sections", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        new URL(url).pathname === "/pulls/pr1/intent"
          ? new Response(JSON.stringify({ intent: INTENT }), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          : new Response("{}", { status: 404 }),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const cancelMutation = { mutate: vi.fn(), isPending: false } as unknown as UseMutationResult<
      unknown,
      unknown,
      string,
      unknown
    >;
    render(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ prReview: messages }} now={new Date("2026-06-02T03:05:00Z")}>
          <FindingsTab
            prId="pr1"
            liveRunIds={["run1"]}
            reviewRunning={false}
            lethalTrifecta={[]}
            runs={[]}
            prRuns={[]}
            prCommits={COMMITS}
            cancelMutation={cancelMutation}
            onOpenTrace={vi.fn()}
            onDelete={vi.fn()}
            onRunDone={vi.fn()}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(INTENT.summary)).toBeInTheDocument();
    const card = screen.getByRole("region", { name: messages.intent.title });
    const later = [screen.getByText("Live review"), screen.getByText("Timeline"), screen.getByText("Review runs")];
    for (const el of later) {
      expect(card.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(card.contains(el)).toBe(false);
    }
  });
});
