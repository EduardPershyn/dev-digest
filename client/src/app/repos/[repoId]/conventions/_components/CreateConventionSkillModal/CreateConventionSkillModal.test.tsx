import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionSkillDraft } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { CreateConventionSkillModal } from "./CreateConventionSkillModal";

/** M2 conventions — the modal shows the server draft (accepted rows only),
    blocks an invalid slug, stores nothing on Cancel, and saves as an
    extracted convention skill (disabled by default). */

const DRAFT: ConventionSkillDraft = {
  name: "repo-conventions",
  description: "Use when a PR changes code in acme/sandbox. Flag changes that break one of its 1 house convention and cite the file:line.",
  type: "convention",
  body: "# repo-conventions\n\n## api layer\n\n### Rule one\n",
  convention_ids: ["c1"],
};

const draftMutate = vi.fn();
const createMutate = vi.fn();
vi.mock("@/lib/hooks/conventions", () => ({
  useConventionSkillDraft: () => ({ mutate: draftMutate, isPending: false, isError: false, error: null }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createMutate, isPending: false, error: null }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

const ACCEPTED: ConventionCandidate = {
  id: "c1",
  rule: "Rule one",
  evidence_path: "src/a.ts",
  evidence_snippet: "export const a = 1;",
  confidence: 0.9,
  accepted: true,
  status: "accepted",
  category: "api layer",
  evidence_start_line: 1,
  evidence_end_line: 1,
  evidence_url: null,
  created_at: "2026-11-25T10:00:00.000Z",
  updated_at: "2026-11-25T10:00:00.000Z",
};

afterEach(() => {
  cleanup();
  draftMutate.mockReset();
  createMutate.mockReset();
});

function renderModal(onClose = vi.fn()) {
  draftMutate.mockImplementation((_req, opts) => opts.onSuccess(DRAFT));
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <CreateConventionSkillModal repoId="r1" repoFullName="acme/sandbox" accepted={[ACCEPTED]} onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

const createBtn = () => screen.getByRole("button", { name: messages.modal.create });

describe("CreateConventionSkillModal", () => {
  it("requests the draft for the accepted conventions and fills the form", () => {
    renderModal();
    expect(draftMutate).toHaveBeenCalledWith({ convention_ids: ["c1"] }, expect.anything());
    expect(screen.getByDisplayValue("repo-conventions")).toBeInTheDocument();
    expect(screen.getByText("convention")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("disables Create on an invalid slug", () => {
    renderModal();
    fireEvent.change(screen.getByDisplayValue("repo-conventions"), { target: { value: "Repo Conventions" } });
    expect(screen.getByText(messages.modal.nameErrors.format)).toBeInTheDocument();
    expect(createBtn()).toBeDisabled();
  });

  it("Cancel closes without storing anything", () => {
    const onClose = renderModal();
    fireEvent.click(screen.getByRole("button", { name: messages.modal.cancel }));
    expect(onClose).toHaveBeenCalled();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("saves as type convention + source extracted, disabled unless toggled", () => {
    renderModal();
    fireEvent.click(createBtn());
    expect(createMutate).toHaveBeenCalledWith(
      {
        name: "repo-conventions",
        description: DRAFT.description,
        type: "convention",
        source: "extracted",
        body: DRAFT.body,
        enabled: false,
      },
      expect.anything(),
    );
  });
});
