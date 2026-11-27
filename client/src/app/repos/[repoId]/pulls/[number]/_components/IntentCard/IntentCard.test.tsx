import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { IntentCard } from "./IntentCard";
import { cardState, externalHref } from "./helpers";

/** M3 intent card — real hooks over a stubbed fetch, so the GET/POST paths and
    the cache update after Reclassify are exercised, not mocked away. */

const m = messages.intent;
const NOW = new Date("2026-06-02T03:05:00Z");

const RECORD: PrIntentRecord = {
  pr_id: "pr1",
  summary: "Adds per-IP rate limiting to the public API endpoints.",
  in_scope: ["Rate limiter middleware", "Public API route config"],
  out_of_scope: ["Authentication", "Billing"],
  confidence: "medium",
  sources: [
    { kind: "pr_title", ref: "pr_title", chars: 30, truncated: false, status: "used" },
    { kind: "pr_body", ref: "pr_body", chars: 0, truncated: false, status: "empty" },
    { kind: "issue", ref: "#12", title: "Rate limit", chars: 400, truncated: false, status: "used" },
  ],
  missing_context: [{ url: "https://linear.app/acme/issue/PAY-12", kind: "external", reason: "unsupported_host" }],
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  head_sha: "abc",
  input_hash: "h",
  usage: { tokens_in: 812, tokens_out: 96, cost_usd: 0.0002 },
  status: "ok",
  error: null,
  classified_at: "2026-06-01T03:05:00Z",
  updated_at: "2026-06-01T03:05:00Z",
  stale: false,
};

type Route = { method: string; path: string; status?: number; body: unknown };

function stubFetch(routes: Route[]) {
  const calls: Array<{ method: string; path: string }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = new URL(url).pathname;
    calls.push({ method, path });
    const r = routes.find((x) => x.method === method && x.path === path);
    if (!r) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }} now={NOW}>
        <IntentCard prId="pr1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("IntentCard", () => {
  it("shows the classified intent: summary, scope, confidence, sources, missing links and model", async () => {
    stubFetch([{ method: "GET", path: "/pulls/pr1/intent", body: { intent: RECORD } }]);
    renderCard();

    expect(await screen.findByText(RECORD.summary)).toBeInTheDocument();
    expect(screen.getByText("Rate limiter middleware")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText(m.confidence.medium)).toBeInTheDocument();
    expect(screen.getByText("PR title")).toBeInTheDocument();
    expect(screen.getByText("PR description (empty)")).toBeInTheDocument();
    expect(screen.getByText("Issue #12")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "https://linear.app/acme/issue/PAY-12" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(m.reason.unsupported_host)).toBeInTheDocument();
    expect(screen.getByText("Classified with deepseek/deepseek-v4-flash · 1 day ago")).toBeInTheDocument();
    expect(screen.queryByText(m.stale)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.reclassify })).toBeEnabled();
  });

  it("flags an outdated intent with the stale badge", async () => {
    stubFetch([{ method: "GET", path: "/pulls/pr1/intent", body: { intent: { ...RECORD, stale: true } } }]);
    renderCard();
    expect(await screen.findByText(m.stale)).toBeInTheDocument();
  });

  it("offers Classify when the PR was never classified, and shows the result after the POST", async () => {
    const calls = stubFetch([
      { method: "GET", path: "/pulls/pr1/intent", body: { intent: null } },
      { method: "POST", path: "/pulls/pr1/intent/classify", body: { ...RECORD, summary: "Fresh summary." } },
    ]);
    renderCard();

    expect(await screen.findByText(m.emptyTitle)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: m.classify }));

    expect(await screen.findByText("Fresh summary.")).toBeInTheDocument();
    expect(calls).toContainEqual({ method: "POST", path: "/pulls/pr1/intent/classify" });
    expect(screen.getByRole("button", { name: m.reclassify })).toBeInTheDocument();
  });

  it("disables Reclassify while the POST is pending and re-enables it with the new result", async () => {
    let resolvePost: (r: Response) => void = () => undefined;
    const pendingPost = new Promise<Response>((r) => {
      resolvePost = r;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        const path = new URL(url).pathname;
        if (method === "GET" && path === "/pulls/pr1/intent") {
          return new Response(JSON.stringify({ intent: RECORD }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (method === "POST" && path === "/pulls/pr1/intent/classify") return pendingPost;
        return new Response("{}", { status: 404 });
      }),
    );
    renderCard();

    const button = await screen.findByRole("button", { name: m.reclassify });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    // While the model call is in flight the button cannot be pressed again.
    await waitFor(() => expect(screen.getByRole("button", { name: m.reclassify })).toBeDisabled());
    expect(screen.getByText(RECORD.summary)).toBeInTheDocument();

    resolvePost(
      new Response(JSON.stringify({ ...RECORD, summary: "Reclassified summary." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await screen.findByText("Reclassified summary.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.reclassify })).toBeEnabled();
  });

  it("shows a failed classification and the error of a failed Reclassify", async () => {
    const failed: PrIntentRecord = { ...RECORD, summary: "", status: "failed", error: "model returned invalid JSON" };
    const calls = stubFetch([
      { method: "GET", path: "/pulls/pr1/intent", body: { intent: failed } },
      {
        method: "POST",
        path: "/pulls/pr1/intent/classify",
        status: 502,
        body: { error: { code: "external_service_error", message: "Intent model call failed" } },
      },
    ]);
    renderCard();

    expect(await screen.findByText(/model returned invalid JSON/)).toBeInTheDocument();
    expect(screen.getByText(m.failedNoIntent)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: m.reclassify }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Classification failed: Intent model call failed")).toBeInTheDocument();
    // onError refetches the stored record (the server recorded the failure).
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(2);
  });
});

describe("IntentCard helpers", () => {
  it("cardState keeps a previous intent visible after a failed reclassification", () => {
    expect(cardState(null)).toBe("empty");
    expect(cardState({ ...RECORD, status: "failed", summary: "" })).toBe("failed");
    expect(cardState({ ...RECORD, status: "failed" })).toBe("ok");
    expect(cardState(RECORD)).toBe("ok");
  });

  it("externalHref only links plain http(s) URLs", () => {
    expect(externalHref("https://linear.app/x")).toBe("https://linear.app/x");
    expect(externalHref("javascript:alert(1)")).toBeNull();
  });
});
