import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ImportSkillModal } from "./ImportSkillModal";

/** M2 — import: trust notice up front, preview lists what was NOT imported, and
    nothing is saved until the user explicitly confirms. */

const PREVIEW: SkillImportPreview = {
  draft: {
    name: "mocking-and-flakiness",
    description: "Use when tests mock.",
    type: "convention",
    body: "# Mocking and flakiness\n- no sleeps",
  },
  source_filename: "test-smells-skill.zip",
  core_file: "test-smells/SKILL.md",
  body_tokens: 420,
  ignored: [
    { path: "test-smells/scripts/detect-flaky.sh", reason: "executable" },
    { path: "test-smells/README.md", reason: "extra-markdown" },
  ],
  dropped_frontmatter: ["allowed-tools", "hooks"],
  warnings: ['The body references "scripts/detect-flaky.sh", which was not imported (executable).'],
  name_conflict: false,
};

const previewMutate = vi.fn();
const createMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutate: previewMutate, isPending: false }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false, error: null, reset: vi.fn() }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

afterEach(() => {
  cleanup();
  previewMutate.mockReset();
  createMutate.mockReset();
});

function renderModal() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ImportSkillModal onClose={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

async function upload() {
  previewMutate.mockImplementation((_req, opts) => opts.onSuccess(PREVIEW));
  const input = screen.getByLabelText(messages.import.chooseFile, { selector: "input" });
  const file = new File(["zip-bytes"], "test-smells-skill.zip", { type: "application/zip" });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText("test-smells/SKILL.md");
}

describe("ImportSkillModal", () => {
  it("warns up front that the skill is someone else's instructions", () => {
    renderModal();
    expect(screen.getByText(messages.import.trustTitle)).toBeInTheDocument();
  });

  it("sends the file for a preview, then lists what was not imported", async () => {
    renderModal();
    await upload();
    expect(previewMutate).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "test-smells-skill.zip", content_base64: expect.any(String) }),
      expect.anything(),
    );
    expect(screen.getByText(messages.import.ignoredTitle)).toBeInTheDocument();
    expect(screen.getByText("test-smells/scripts/detect-flaky.sh")).toBeInTheDocument();
    expect(screen.getByText("allowed-tools, hooks")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("keeps Save disabled until the user confirms, then saves as imported + disabled", async () => {
    renderModal();
    await upload();
    const save = screen.getByRole("button", { name: messages.import.save });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(createMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox", { name: messages.import.confirm }));
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(createMutate).toHaveBeenCalledWith(
      { ...PREVIEW.draft, source: "imported_file", enabled: false },
      expect.anything(),
    );
  });

  it("blocks saving under a name that already exists", async () => {
    previewMutate.mockImplementation((_req, opts) => opts.onSuccess({ ...PREVIEW, name_conflict: true }));
    renderModal();
    const input = screen.getByLabelText(messages.import.chooseFile, { selector: "input" });
    fireEvent.change(input, { target: { files: [new File(["x"], "a.md")] } });
    await screen.findByText(messages.import.nameConflict);
    fireEvent.click(screen.getByRole("checkbox", { name: messages.import.confirm }));
    expect(screen.getByRole("button", { name: messages.import.save })).toBeDisabled();
  });
});
