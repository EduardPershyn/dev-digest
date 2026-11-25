import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionList } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ApiError } from "@/lib/api";
import { ConventionsView } from "./ConventionsView";

/** M2 conventions page — empty state offers Run extraction; a failed scan shows
    an inline error with the server message and Retry. */

const state = vi.hoisted(() => ({
  list: undefined as ConventionList | undefined,
  extractError: null as unknown,
  extractMutate: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <div>not found</div> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/sandbox" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ data: state.list, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useExtractConventions: () => ({ mutate: state.extractMutate, isPending: false, error: state.extractError }),
  useUpdateConvention: () => ({ mutate: vi.fn() }),
  useConventionSkillDraft: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

afterEach(() => {
  cleanup();
  state.list = undefined;
  state.extractError = null;
  state.extractMutate.mockReset();
});

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsView />
    </NextIntlClientProvider>,
  );
}

describe("ConventionsView", () => {
  it("shows the empty state with Run extraction before the first scan", () => {
    state.list = { candidates: [], last_scan_at: null };
    renderView();
    expect(screen.getByText(messages.page.empty.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: messages.page.empty.cta }));
    expect(state.extractMutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: messages.page.createSkill })).not.toBeInTheDocument();
  });

  it("shows the server message and Retry when extraction fails", () => {
    state.list = { candidates: [], last_scan_at: null };
    state.extractError = new ApiError("Conventions model call failed: upstream 500", 502, "external_service_error");
    renderView();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(`${messages.page.extractionFailed}: Conventions model call failed: upstream 500`);
    fireEvent.click(screen.getByRole("button", { name: messages.page.retry }));
    expect(state.extractMutate).toHaveBeenCalledTimes(1);
  });

  it("disables Create skill until a convention is accepted", () => {
    state.list = {
      last_scan_at: "2026-11-25T10:00:00.000Z",
      candidates: [
        {
          id: "c1",
          rule: "Rule one",
          evidence_path: "src/a.ts",
          evidence_snippet: "export const a = 1;",
          confidence: 0.9,
          accepted: false,
          status: "pending",
          category: null,
          evidence_start_line: 1,
          evidence_end_line: 1,
          evidence_url: null,
          created_at: "2026-11-25T10:00:00.000Z",
          updated_at: "2026-11-25T10:00:00.000Z",
        },
      ],
    };
    renderView();
    expect(screen.getByText("0 of 1 accepted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.page.createSkill })).toBeDisabled();
  });
});
