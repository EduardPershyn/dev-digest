import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "branch-coverage-gaps",
  description: "Use when a PR adds conditional logic.",
  type: "rubric",
  source: "imported_file",
  body: "# Branch coverage",
  enabled: true,
  version: 3,
  agent_count: 2,
};

function renderCard(onOpen = vi.fn(), onToggle = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillCard skill={SKILL} onOpen={onOpen} onToggle={onToggle} />
    </NextIntlClientProvider>,
  );
  return { onOpen, onToggle };
}

describe("SkillCard", () => {
  it("shows name, type, description, source and usage", () => {
    renderCard();
    expect(screen.getByText("branch-coverage-gaps")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText(SKILL.description)).toBeInTheDocument();
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
  });

  it("opens the preview on click, but the toggle only toggles", () => {
    const { onOpen, onToggle } = renderCard();
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: SKILL.name }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
