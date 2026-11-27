import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../../messages/en/settings.json";
import { FEATURE_MODELS } from "@/lib/feature-models";
import { SettingsModels } from "./SettingsModels";

/** Settings → Feature Models (M3): the Intent classifier row shows its registry
    default, and picking a model PUTs only `feature_models.review_intent`. */

const intentDef = FEATURE_MODELS.find((f) => f.id === "review_intent")!;

function stubFetch() {
  const puts: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const path = new URL(url).pathname;
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      if (method === "GET" && path === "/settings") return json({ feature_models: {} });
      if (method === "GET" && path === "/providers/openrouter/models")
        return json([{ id: "deepseek/deepseek-v4-flash" }, { id: "openai/gpt-5-mini" }]);
      if (method === "PUT" && path === "/settings") {
        const body = JSON.parse(String(init?.body));
        puts.push(body);
        return json(body);
      }
      return new Response("{}", { status: 404 });
    }),
  );
  return puts;
}

function renderModels() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ settings: messages }}>
        <SettingsModels />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** The FormField of one feature: the element holding its label, picker and hint. */
function featureRow(description: string): HTMLElement {
  return screen.getByText(description).parentElement as HTMLElement;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SettingsModels", () => {
  it("shows the Intent classifier on its default and saves only review_intent when a model is picked", async () => {
    const puts = stubFetch();
    renderModels();

    expect(await screen.findByText("Intent classifier")).toBeInTheDocument();
    const row = featureRow(intentDef.description);
    expect(within(row).getByText(messages.models.usingDefault)).toBeInTheDocument();
    // The trigger shows the current (default) model; open it once the live list arrived.
    await waitFor(() => expect(screen.queryByText(messages.models.noKeyNote)).not.toBeInTheDocument());
    fireEvent.click(within(row).getByText("deepseek/deepseek-v4-flash"));
    fireEvent.click(await within(row).findByRole("button", { name: "openai/gpt-5-mini" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      feature_models: { review_intent: { provider: "openrouter", model: "openai/gpt-5-mini" } },
    });
  });
});
