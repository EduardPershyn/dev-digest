import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { SkillConfigTab } from "./SkillConfigTab";

/** M2 — the skill form: directive helper text, slug validation, create payload. */

const createMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createMutate, isPending: false, error: null }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  createMutate.mockReset();
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillConfigTab />
    </NextIntlClientProvider>,
  );
}

describe("SkillConfigTab (create)", () => {
  it("tells the user the description is the interface and should be a directive", () => {
    renderTab();
    expect(screen.getByText(messages.editor.config.descriptionHint)).toBeInTheDocument();
  });

  it("blocks an invalid slug and empty fields, then sends a text-only payload", () => {
    renderTab();
    const [name] = screen.getAllByRole("textbox");
    fireEvent.change(name!, { target: { value: "Bad Name" } });
    fireEvent.click(screen.getByRole("button", { name: messages.editor.config.create }));
    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getByText(messages.editor.config.nameErrors.format)).toBeInTheDocument();
    expect(screen.getByText(messages.editor.config.descriptionRequired)).toBeInTheDocument();

    const [nameInput, description, body] = screen.getAllByRole("textbox");
    fireEvent.change(nameInput!, { target: { value: "boundary-cases" } });
    fireEvent.change(description!, { target: { value: "  Use when tests take numbers.  " } });
    fireEvent.change(body!, { target: { value: "# Boundaries\n- 0, -1" } });
    fireEvent.click(screen.getByRole("button", { name: messages.editor.config.create }));
    expect(createMutate).toHaveBeenCalledWith(
      {
        name: "boundary-cases",
        description: "Use when tests take numbers.",
        type: "rubric",
        body: "# Boundaries\n- 0, -1",
        enabled: true,
      },
      expect.anything(),
    );
  });
});
