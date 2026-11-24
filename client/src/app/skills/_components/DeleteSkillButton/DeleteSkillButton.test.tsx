import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { DeleteSkillButton } from "./DeleteSkillButton";

/** M2 — delete asks first, names the agents that lose the skill, then reports back. */

const mutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({ useDeleteSkill: () => ({ mutate, isPending: false }) }));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

afterEach(() => {
  cleanup();
  mutate.mockReset();
  vi.restoreAllMocks();
});

function renderButton(onDeleted = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <DeleteSkillButton
        skill={{ id: "s1", name: "branch-coverage-gaps" }}
        agents={[{ name: "Test Quality Reviewer" }]}
        onDeleted={onDeleted}
      />
    </NextIntlClientProvider>,
  );
  return onDeleted;
}

describe("DeleteSkillButton", () => {
  it("does nothing when the confirm is cancelled", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: messages.drawer.delete }));
    expect(confirm.mock.calls[0]![0]).toContain("Test Quality Reviewer");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("deletes after confirm and calls onDeleted on success", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mutate.mockImplementation((_id: string, opts: { onSuccess: () => void }) => opts.onSuccess());
    const onDeleted = renderButton();
    fireEvent.click(screen.getByRole("button", { name: messages.drawer.delete }));
    expect(mutate).toHaveBeenCalledWith("s1", expect.any(Object));
    expect(onDeleted).toHaveBeenCalled();
  });
});
