import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

/** M2 conventions — a card toggles accept/reject (active → back to pending),
    edits the rule inline, and links the evidence to GitHub in a new tab. */

vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

const BASE: ConventionCandidate = {
  id: "c1",
  rule: "Parse path params with a Params Zod schema.",
  evidence_path: "src/routes/invoices.ts",
  evidence_snippet: "const Params = z.object({ id: z.string().uuid() });",
  confidence: 0.82,
  accepted: false,
  status: "pending",
  category: "api layer",
  evidence_start_line: 3,
  evidence_end_line: 5,
  evidence_url: "https://github.com/acme/sandbox/blob/abc/src/routes/invoices.ts#L3-L5",
  created_at: "2026-11-25T10:00:00.000Z",
  updated_at: "2026-11-25T10:00:00.000Z",
};

afterEach(cleanup);

function renderCard(over: Partial<ConventionCandidate> = {}) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard convention={{ ...BASE, ...over }} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe("ConventionCard", () => {
  it("accepts and rejects a pending convention", () => {
    const onChange = renderCard();
    fireEvent.click(screen.getByRole("button", { name: messages.card.accept }));
    expect(onChange).toHaveBeenLastCalledWith({ status: "accepted" });
    fireEvent.click(screen.getByRole("button", { name: messages.card.reject }));
    expect(onChange).toHaveBeenLastCalledWith({ status: "rejected" });
  });

  it("clicking the active toggle returns the card to pending", () => {
    const onChange = renderCard({ status: "accepted", accepted: true });
    expect(screen.getByText(messages.card.accepted)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: messages.card.accept }));
    expect(onChange).toHaveBeenCalledWith({ status: "pending" });
  });

  it("edits the rule inline: Save sends the trimmed text, Cancel sends nothing", () => {
    const onChange = renderCard();
    fireEvent.click(screen.getByRole("button", { name: messages.card.edit }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Validate :id with Params.  " } });
    fireEvent.click(screen.getByRole("button", { name: messages.card.save }));
    expect(onChange).toHaveBeenCalledWith({ rule: "Validate :id with Params." });

    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: messages.card.edit }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: messages.card.cancel }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("cannot save an empty rule; Ctrl+Enter saves", () => {
    const onChange = renderCard();
    fireEvent.click(screen.getByRole("button", { name: messages.card.edit }));
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: messages.card.save })).toBeDisabled();
    fireEvent.change(box, { target: { value: "New rule" } });
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith({ rule: "New rule" });
  });

  it("links the evidence to GitHub at the cited lines in a new tab", () => {
    renderCard();
    const link = screen.getByRole("link", { name: /src\/routes\/invoices\.ts:3-5/ });
    expect(link).toHaveAttribute("href", BASE.evidence_url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(BASE.evidence_snippet)).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
  });
});
